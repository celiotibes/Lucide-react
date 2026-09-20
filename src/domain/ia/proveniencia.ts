/** Registro de proveniência de toda chamada de IA — provedor, modelo, quando, custo estimado
 * e confiança. É o que permite responder "qual regra classificou este valor" com algo além de
 * "a IA achou": "o modelo claude-haiku-4-5, em 2026-09-20 14:03, com confiança média,
 * escalado por OCR ruim".
 *
 * PERSISTÊNCIA: grava em `ia_chamadas` (contabilidade-reconstituicao/schema.sql) quando um
 * `Database` é passado; sem ele, cai para o histórico em memória de sempre (perdido ao
 * recarregar a página). O roteador (roteador.ts) pode ser chamado de contexto sem `db` — por
 * isso as duas funções principais (`registrarChamada`, `atualizarConfiancaChamada`) aceitam
 * `db` como último argumento OPCIONAL: quem não passa continua funcionando exatamente como
 * antes, quem passa ganha um registro que sobrevive a F5. `chamadaId` no valor de retorno é
 * sempre uma string — o id numérico da linha (`ia_chamadas.id`) quando persistido, ou
 * `ia-<n>` quando só em memória.
 *
 * LIGAÇÃO DO VALOR ATÉ A CHAMADA: `ia_chamadas.documento_id`/`transacao_id` (nulos até serem
 * preenchidos) são o que permite, partindo de um documento ou transação classificado por IA,
 * chegar até a chamada exata que o produziu — ver `vincularChamadaADocumento`,
 * `vincularChamadaATransacao`, `chamadaDoDocumento` e `chamadaDaTransacao` abaixo. A chamada é
 * registrada assim que o provedor responde, antes de o chamador saber se o resultado vira um
 * documento/transação definitivo (ou é descartado na revisão manual) — por isso o vínculo é
 * sempre um UPDATE posterior, feito por quem cria o registro definitivo, nunca parte do
 * INSERT inicial.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { ConfiancaClassificacao, IdProvedorIA } from "./tipos";

/** Prompt gravado é sempre truncado a este tamanho antes de ir para o banco — cinto e
 * suspensório: o próprio chamador (classificarComIA.ts) já limita a 1000 caracteres o texto
 * de documento enviado ao provedor, mas este módulo é genérico (roteador.ts não sabe do que
 * se trata o prompt) e não deveria confiar cegamente em todo chamador presente e futuro. */
const LIMITE_PROMPT_TEXTO_GRAVADO = 4000;

export interface RegistroChamadaIA {
  id: string;
  provedor: IdProvedorIA;
  modelo: string;
  /** ISO 8601 — momento da chamada, não da resposta (relevante para depurar timeout/rede). */
  quando: string;
  tokensEntrada?: number;
  tokensSaida?: number;
  custoEstimadoUsd?: number;
  confianca?: ConfiancaClassificacao;
  /** Por que este provedor foi chamado nesta posição: "preferido", "rodizio",
   * "fallback_apos_falha:<provedor-anterior>", ou o motivo de escalonamento por qualidade
   * (ver qualidadeOcr.ts) — nunca fica vazio, é a resposta a "por que a IA foi chamada". */
  motivo: string;
  sucesso: boolean;
  erro?: string;
  /** Texto efetivamente enviado ao provedor (prompt completo, já truncado pelo chamador) —
   * é o que torna "como reproduzir o cálculo" respondível de verdade: sem a entrada exata,
   * nem o provedor original repete a mesma resposta. Ausente para chamadas registradas antes
   * desta coluna existir. */
  promptTexto?: string;
  /** Id do documento (tabela `documentos`) que este resultado ajudou a produzir, quando
   * aplicável — ver `vincularChamadaADocumento`. */
  documentoId?: number;
  /** Id da transação (tabela `transacoes`) que este resultado ajudou a categorizar, quando
   * aplicável — ver `vincularChamadaATransacao`. */
  transacaoId?: number;
}

// Preço aproximado por 1 milhão de tokens (entrada, saída), em USD, usado só para a
// estimativa grosseira de custo acumulado exibida em ConfiguracaoIA.tsx. Não é fatura real:
// cada provedor pode mudar preço sem aviso e a lista de modelos é configurável pelo usuário.
// Ollama é local — sem custo por token, por isso `null`.
const PRECO_USD_POR_MILHAO_TOKENS: Record<IdProvedorIA, { entrada: number; saida: number } | null> = {
  anthropic: { entrada: 1.0, saida: 5.0 }, // faixa do Claude Haiku, o modelo barato desta tarefa
  openai: { entrada: 0.15, saida: 0.6 }, // faixa de um modelo "mini" da OpenAI
  google: { entrada: 0.1, saida: 0.4 }, // faixa de um Gemini Flash
  ollama: null,
};

export function estimarCustoUsd(
  provedor: IdProvedorIA,
  tokensEntrada: number | undefined,
  tokensSaida: number | undefined,
): number | undefined {
  const preco = PRECO_USD_POR_MILHAO_TOKENS[provedor];
  if (!preco || tokensEntrada === undefined || tokensSaida === undefined) return undefined;
  return (tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1_000_000;
}

let proximoId = 1;

/** Dados de uma nova chamada, tal como o roteador os produz — sem id nem `quando` (o
 * registro decide isso), mas já podendo trazer o prompt e, quando já souber, o vínculo com
 * documento/transação. */
export type DadosNovaChamada = Omit<RegistroChamadaIA, "id" | "quando"> & { quando?: string };

class RegistroProveniencia {
  private registros: RegistroChamadaIA[] = [];

  registrar(dados: DadosNovaChamada): RegistroChamadaIA {
    const registro: RegistroChamadaIA = {
      id: `ia-${proximoId++}`,
      quando: dados.quando ?? new Date().toISOString(),
      ...dados,
    };
    this.registros.push(registro);
    return registro;
  }

  listar(): readonly RegistroChamadaIA[] {
    return this.registros;
  }

  /** O roteador (roteador.ts) registra a chamada assim que o provedor responde, mas não
   * conhece o campo `confianca` — esse é um conceito da classificação de documento
   * (classificarComIA.ts), que só existe depois de parsear o JSON da resposta. Este método
   * deixa o chamador completar o registro já criado, em vez de duplicar a lógica de
   * registro em cada lugar que chama a IA — é o que garante que "confiança" nunca fica de
   * fora do registro quando ela existe (requisito: toda chamada registra provedor, modelo,
   * quando, custo e confiança). */
  atualizarConfianca(id: string, confianca: ConfiancaClassificacao | undefined): void {
    if (!confianca) return;
    const registro = this.registros.find((r) => r.id === id);
    if (registro) registro.confianca = confianca;
  }

  custoAcumuladoUsd(): number {
    return this.registros.reduce((soma, r) => soma + (r.custoEstimadoUsd ?? 0), 0);
  }

  limpar(): void {
    this.registros = [];
  }
}

/** Instância única do processo — o fallback em memória usado sempre que nenhum `db` é
 * passado às funções abaixo. Mantida por compatibilidade: código que já lia
 * `registroProveniencia.listar()` diretamente (testes existentes, por exemplo) continua
 * funcionando sem mudança. */
export const registroProveniencia = new RegistroProveniencia();

interface LinhaIaChamada {
  id: number;
  provedor: IdProvedorIA;
  modelo: string;
  quando: string;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  custo_estimado_usd: number | null;
  confianca: ConfiancaClassificacao | null;
  motivo: string;
  sucesso: number;
  erro: string | null;
  prompt_texto: string | null;
  documento_id: number | null;
  transacao_id: number | null;
}

function linhaParaRegistro(l: LinhaIaChamada): RegistroChamadaIA {
  return {
    id: String(l.id),
    provedor: l.provedor,
    modelo: l.modelo,
    quando: l.quando,
    tokensEntrada: l.tokens_entrada ?? undefined,
    tokensSaida: l.tokens_saida ?? undefined,
    custoEstimadoUsd: l.custo_estimado_usd ?? undefined,
    confianca: l.confianca ?? undefined,
    motivo: l.motivo,
    sucesso: !!l.sucesso,
    erro: l.erro ?? undefined,
    promptTexto: l.prompt_texto ?? undefined,
    documentoId: l.documento_id ?? undefined,
    transacaoId: l.transacao_id ?? undefined,
  };
}

function registrarChamadaNoBanco(db: Database, dados: DadosNovaChamada): RegistroChamadaIA {
  const quando = dados.quando ?? new Date().toISOString();
  const promptTexto = dados.promptTexto?.slice(0, LIMITE_PROMPT_TEXTO_GRAVADO);
  executar(
    db,
    `INSERT INTO ia_chamadas
       (provedor, modelo, quando, tokens_entrada, tokens_saida, custo_estimado_usd, confianca,
        motivo, sucesso, erro, prompt_texto, documento_id, transacao_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.provedor,
      dados.modelo,
      quando,
      dados.tokensEntrada ?? null,
      dados.tokensSaida ?? null,
      dados.custoEstimadoUsd ?? null,
      dados.confianca ?? null,
      dados.motivo,
      dados.sucesso ? 1 : 0,
      dados.erro ?? null,
      promptTexto ?? null,
      dados.documentoId ?? null,
      dados.transacaoId ?? null,
    ],
  );
  const id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
  return {
    id: String(id),
    provedor: dados.provedor,
    modelo: dados.modelo,
    quando,
    tokensEntrada: dados.tokensEntrada,
    tokensSaida: dados.tokensSaida,
    custoEstimadoUsd: dados.custoEstimadoUsd,
    confianca: dados.confianca,
    motivo: dados.motivo,
    sucesso: dados.sucesso,
    erro: dados.erro,
    promptTexto,
    documentoId: dados.documentoId,
    transacaoId: dados.transacaoId,
  };
}

/** Registra uma chamada de IA — em `ia_chamadas` quando `db` é informado, em memória (perdido
 * ao recarregar) caso contrário. É a função que roteador.ts chama a cada tentativa de
 * provedor, sucesso ou falha. */
export function registrarChamada(dados: DadosNovaChamada, db?: Database): RegistroChamadaIA {
  if (db) return registrarChamadaNoBanco(db, dados);
  return registroProveniencia.registrar(dados);
}

/** Completa a confiança de um registro já criado (ver o comentário de
 * `RegistroProveniencia.atualizarConfianca`), no banco ou em memória conforme onde o
 * registro original foi gravado. `db` precisa ser o mesmo passado a `registrarChamada` para
 * este `id` — passar um sem o outro simplesmente não encontra a linha (UPDATE afeta 0 linhas)
 * e não lança erro, mesma tolerância do caminho em memória (que também ignora id inexistente). */
export function atualizarConfiancaChamada(
  id: string,
  confianca: ConfiancaClassificacao | undefined,
  db?: Database,
): void {
  if (!confianca) return;
  if (db) {
    executar(db, "UPDATE ia_chamadas SET confianca = ? WHERE id = ?", [confianca, id]);
    return;
  }
  registroProveniencia.atualizarConfianca(id, confianca);
}

/** Histórico de chamadas — do banco (mais recentes primeiro) quando `db` é informado, da
 * memória do processo (ordem de inserção) caso contrário. `limite` só se aplica ao caminho
 * de banco; o caminho em memória sempre devolve tudo (é o mesmo comportamento de sempre de
 * `registroProveniencia.listar()`). */
export function listarChamadas(db?: Database, limite = 500): readonly RegistroChamadaIA[] {
  if (db) {
    return consultar<LinhaIaChamada>(
      db,
      "SELECT * FROM ia_chamadas ORDER BY quando DESC, id DESC LIMIT ?",
      [limite],
    ).map(linhaParaRegistro);
  }
  return registroProveniencia.listar();
}

/** Soma de `custo_estimado_usd` — do banco quando `db` é informado, da memória caso
 * contrário. Chamadas sem custo estimado (Ollama, ou falha antes de saber tokens) não
 * contribuem, mesmo comportamento nos dois caminhos. */
export function custoAcumuladoChamadas(db?: Database): number {
  if (db) {
    const linha = consultar<{ soma: number | null }>(
      db,
      "SELECT SUM(custo_estimado_usd) AS soma FROM ia_chamadas",
    )[0];
    return linha?.soma ?? 0;
  }
  return registroProveniencia.custoAcumuladoUsd();
}

/** Apaga o histórico — só faz sentido para o caminho em memória (limpar uma sessão de
 * testes/demonstração). O histórico em banco é dado de proveniência permanente: não existe
 * (de propósito) uma função equivalente para apagá-lo em massa — apagar prova de auditoria
 * em lote não é uma operação que este módulo oferece. */
export function limparHistoricoEmMemoria(): void {
  registroProveniencia.limpar();
}

/** Liga uma chamada já registrada ao documento que ela ajudou a produzir — é o que permite
 * chegar de `documentos.id` até "qual chamada de IA classificou este documento". Chamado
 * DEPOIS de o documento existir (a chamada acontece antes: o roteador responde primeiro, o
 * documento só é criado se/quando o usuário confirma na revisão manual). `chamadaId` vazio
 * ou não numérico (ex: id "ia-3" de um registro em memória, que não tem linha no banco para
 * ligar) é ignorado silenciosamente — não há o que vincular no banco. */
export function vincularChamadaADocumento(db: Database, chamadaId: string, documentoId: number): void {
  if (!/^\d+$/.test(chamadaId)) return;
  executar(db, "UPDATE ia_chamadas SET documento_id = ? WHERE id = ?", [documentoId, chamadaId]);
}

/** Mesma ideia de `vincularChamadaADocumento`, para uma transação categorizada por IA (ver
 * `transacoes.categorizado_por = 'ia'`). */
export function vincularChamadaATransacao(db: Database, chamadaId: string, transacaoId: number): void {
  if (!/^\d+$/.test(chamadaId)) return;
  executar(db, "UPDATE ia_chamadas SET transacao_id = ? WHERE id = ?", [transacaoId, chamadaId]);
}

/** A chamada de IA que produziu um documento, se houver — responde "qual regra classificou
 * este valor" partindo do documento. `null` quando o documento não foi classificado por IA
 * (heurística determinística bastou) ou quando o vínculo nunca foi gravado. */
export function chamadaDoDocumento(db: Database, documentoId: number): RegistroChamadaIA | null {
  const linha = consultar<LinhaIaChamada>(
    db,
    "SELECT * FROM ia_chamadas WHERE documento_id = ? ORDER BY id DESC LIMIT 1",
    [documentoId],
  )[0];
  return linha ? linhaParaRegistro(linha) : null;
}

/** Mesma ideia de `chamadaDoDocumento`, para uma transação. */
export function chamadaDaTransacao(db: Database, transacaoId: number): RegistroChamadaIA | null {
  const linha = consultar<LinhaIaChamada>(
    db,
    "SELECT * FROM ia_chamadas WHERE transacao_id = ? ORDER BY id DESC LIMIT 1",
    [transacaoId],
  )[0];
  return linha ? linhaParaRegistro(linha) : null;
}
