/** Roteador multi-provedor: escalonamento por confiança + rodízio com fallback automático.
 *
 * Este é o "coração" descrito na tarefa. Duas decisões independentes, deliberadamente
 * separadas para não misturar dois motivos de trocar de provedor:
 *
 *   1. ESCALONAMENTO POR QUALIDADE (qual "nível" começar): se o texto de origem (OCR local
 *      ou PDF) já foi avaliado como ruim (ver qualidadeOcr.ts), pula direto para um provedor
 *      pago — um modelo local pequeno dificilmente entende texto comprovadamente degradado
 *      melhor que a regex determinística já tentou. Se o texto está bom, tenta primeiro
 *      Ollama (local, sem custo), só indo para os pagos se Ollama não estiver disponível.
 *
 *   2. FALLBACK POR FALHA (o que fazer quando um provedor específico não responde): cota
 *      estourada, 429, rede fora — independe de qualidade de texto, é sobre disponibilidade
 *      do provedor. Percorre os provedores pagos ativos, na ordem de rodízio, até um
 *      responder ou todos falharem. Nunca retorna um resultado vazio em silêncio: falhar em
 *      todos lança erro explícito listando cada tentativa.
 *
 * O rodízio (`ordemDeTentativaPagos`) avança um índice em memória a cada chamada de nível
 * superior, para distribuir custo entre provedores em vez de sempre bater no mesmo primeiro
 * — sem isso, "rodízio" seria só um nome bonito para "sempre o preferido, com fallback".
 */

import type { Database } from "sql.js";
import { avaliarQualidadeTexto, type AvaliacaoQualidadeTexto } from "./qualidadeOcr";
import { carregarConfiguracaoIA, obterChaveEfetiva, type ConfiguracaoIA } from "./config";
import { estimarCustoUsd, registrarChamada, type RegistroChamadaIA } from "./proveniencia";
import { PROVEDORES_IA } from "./provedores";
import type { DefinicaoProvedorIA, IdProvedorIA, RespostaProvedorIA } from "./tipos";

export { avaliarQualidadeTexto, type AvaliacaoQualidadeTexto };

export interface ContextoEscalonamento {
  /** Avaliação de qualidade do texto de origem (ver qualidadeOcr.ts). Quando ausente, o
   * roteador assume texto bom (não escalona por qualidade) — é responsabilidade do chamador
   * (extrairCampos.ts) medir a qualidade do que o OCR/PDF produziu antes de rotear. */
  avaliacaoQualidade?: AvaliacaoQualidadeTexto;
}

export interface OpcoesRoteador {
  config?: ConfiguracaoIA;
  maxTokens?: number;
  /** Injeção de provedores para teste — nunca deve ser usada fora de teste, é o que permite
   * mockar `chamar()` sem tocar `fetch` global. */
  provedores?: Partial<Record<IdProvedorIA, DefinicaoProvedorIA>>;
  /** Quando informado, cada tentativa (sucesso ou falha) é gravada em `ia_chamadas` e
   * sobrevive a um F5 — ver src/domain/ia/proveniencia.ts. Ausente (contexto sem banco, ex:
   * um teste isolado do roteador) faz o registro cair para memória do processo, exatamente
   * o comportamento de antes desta tabela existir. */
  db?: Database;
}

export interface ResultadoRoteamentoIA {
  texto: string;
  provedor: IdProvedorIA;
  modelo: string;
  registro: RegistroChamadaIA;
}

let indiceRodizioAtual = 0;

/** Só para os testes tornarem a ordem de rodízio previsível entre `it()`s — nunca chamado em
 * produção. */
export function reiniciarRodizioIA(): void {
  indiceRodizioAtual = 0;
}

function provedoresPagosAtivos(config: ConfiguracaoIA): IdProvedorIA[] {
  return config.ordemRodizio.filter((id) => config.provedores[id]?.ativo);
}

/** Rotaciona a lista de provedores pagos ativos para começar no "da vez" (distribui custo
 * entre chamadas sucessivas) mas preserva todos os outros como fallback dentro da MESMA
 * chamada, na ordem configurada — uma chamada nunca perde uma tentativa por causa do
 * rodízio, só muda quem é tentado primeiro. */
function ordemDeTentativaPagos(config: ConfiguracaoIA): IdProvedorIA[] {
  const ativos = provedoresPagosAtivos(config);
  if (ativos.length === 0) return [];
  const partida = indiceRodizioAtual % ativos.length;
  indiceRodizioAtual++;
  return [...ativos.slice(partida), ...ativos.slice(0, partida)];
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Chama um provedor pago — via `config.enderecoBackend` quando configurado (caminho
 * seguro: ver aviso extenso em config.ts), ou direto (`def.chamar`) usando a chave efetiva
 * do navegador quando não há backend. Nunca chamado para Ollama, que já é local e não passa
 * por este dilema.
 *
 * Contrato do backend, definido aqui (não existe backend de referência nesta tarefa —
 * pertenceria a server/**, fora de escopo): `POST {enderecoBackend}` com
 * `{ provedor, modelo, prompt }`, resposta `{ texto, tokensEntrada?, tokensSaida? }`. */
async function chamarProvedorOuBackend(
  def: DefinicaoProvedorIA,
  id: IdProvedorIA,
  prompt: string,
  modelo: string,
  config: ConfiguracaoIA,
  maxTokens?: number,
): Promise<RespostaProvedorIA> {
  if (config.enderecoBackend) {
    const resposta = await fetch(config.enderecoBackend, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provedor: id, modelo, prompt }),
    });
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(
        `Backend de IA (${config.enderecoBackend}) retornou ${resposta.status} para ${id}: ${corpo.slice(0, 300)}`,
      );
    }
    return (await resposta.json()) as RespostaProvedorIA;
  }
  const chave = obterChaveEfetiva(config, id);
  return def.chamar(prompt, { modelo, apiKey: chave, maxTokens });
}

/** Chama IA para um `prompt` já preparado pelo chamador (ex: classificarComIA.ts monta o
 * prompt de classificação de documento — este módulo não sabe nada sobre documentos, só
 * roteia texto->texto entre provedores). Nunca lança silenciosamente um resultado vazio:
 * ou retorna um texto de algum provedor, ou lança erro explicando cada tentativa. */
export async function chamarComRoteamento(
  prompt: string,
  contexto: ContextoEscalonamento = {},
  opcoes: OpcoesRoteador = {},
): Promise<ResultadoRoteamentoIA> {
  const config = opcoes.config ?? carregarConfiguracaoIA();
  const provedores = { ...PROVEDORES_IA, ...(opcoes.provedores ?? {}) };
  const tentativas: string[] = [];
  const qualidadeRuim = contexto.avaliacaoQualidade?.ruim ?? false;

  // 1) Caminho barato: Ollama local — só quando o texto de origem não foi avaliado como
  // ruim. Texto já comprovadamente degradado é escalonado direto para um provedor pago,
  // sem gastar uma chamada local que dificilmente vai ajudar.
  if (!qualidadeRuim && config.provedores.ollama?.ativo) {
    const def = provedores.ollama;
    const modelo = config.provedores.ollama.modelo || def.modeloPadrao;
    try {
      const resp = await def.chamar(prompt, {
        modelo,
        baseUrl: config.provedores.ollama.baseUrl,
        maxTokens: opcoes.maxTokens,
      });
      const registro = registrarChamada(
        {
          provedor: "ollama",
          modelo,
          tokensEntrada: resp.tokensEntrada,
          tokensSaida: resp.tokensSaida,
          motivo: "caminho_barato_local",
          sucesso: true,
          promptTexto: prompt,
        },
        opcoes.db,
      );
      return { texto: resp.texto, provedor: "ollama", modelo, registro };
    } catch (erro) {
      const msg = mensagemErro(erro);
      registrarChamada(
        {
          provedor: "ollama",
          modelo,
          motivo: "caminho_barato_local",
          sucesso: false,
          erro: msg,
          promptTexto: prompt,
        },
        opcoes.db,
      );
      tentativas.push(`ollama: ${msg}`);
      // Segue para os pagos — isto é fallback por falha (Ollama pode estar desligado), não
      // escalonamento por qualidade.
    }
  }

  // 2) Provedores pagos, em rodízio, com fallback automático entre eles.
  const ordem = ordemDeTentativaPagos(config);
  if (ordem.length === 0) {
    throw new Error(
      tentativas.length > 0
        ? `Nenhum provedor de IA disponível: Ollama falhou (${tentativas.join("; ")}) e nenhum provedor pago está ativo. Configure ao menos um em Configuração de IA.`
        : "Nenhum provedor de IA está ativo. Configure ao menos um em Configuração de IA antes de usar classificação por IA.",
    );
  }

  for (let i = 0; i < ordem.length; i++) {
    const id = ordem[i];
    const def = provedores[id];
    const cfgProvedor = config.provedores[id];
    const modelo = cfgProvedor.modelo || def.modeloPadrao;
    const motivo =
      i === 0
        ? qualidadeRuim
          ? `escalonado_por_qualidade_baixa: ${contexto.avaliacaoQualidade?.motivos.join(" ") ?? ""}`.trim()
          : "rodizio"
        : `fallback_apos_falha:${ordem[i - 1]}`;

    try {
      const resp = await chamarProvedorOuBackend(def, id, prompt, modelo, config, opcoes.maxTokens);
      const custoEstimadoUsd = estimarCustoUsd(id, resp.tokensEntrada, resp.tokensSaida);
      const registro = registrarChamada(
        {
          provedor: id,
          modelo,
          tokensEntrada: resp.tokensEntrada,
          tokensSaida: resp.tokensSaida,
          custoEstimadoUsd,
          motivo,
          sucesso: true,
          promptTexto: prompt,
        },
        opcoes.db,
      );
      return { texto: resp.texto, provedor: id, modelo, registro };
    } catch (erro) {
      const msg = mensagemErro(erro);
      registrarChamada(
        { provedor: id, modelo, motivo, sucesso: false, erro: msg, promptTexto: prompt },
        opcoes.db,
      );
      tentativas.push(`${id}: ${msg}`);
    }
  }

  throw new Error(
    `Todos os provedores de IA configurados falharam — nenhuma classificação foi obtida. Tentativas: ${tentativas.join(" | ")}`,
  );
}
