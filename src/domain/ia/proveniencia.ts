/** Registro de proveniência de toda chamada de IA — provedor, modelo, quando, custo estimado
 * e confiança. É o que permite responder "qual regra classificou este valor" com algo além de
 * "a IA achou": "o modelo claude-haiku-4-5, em 2026-09-20 14:03, com confiança média,
 * escalado por OCR ruim".
 *
 * LIMITAÇÃO CONHECIDA (ver relatório): isto vive só em memória do processo atual. O lugar
 * certo para persistir seria uma tabela própria (algo como `ia_chamadas`, com as mesmas
 * colunas de RegistroChamadaIA) em contabilidade-reconstituicao/schema.sql, gravada via
 * src/db/**. Esta tarefa não pode alterar nem schema.sql nem src/db/** (ver regras de posse
 * de arquivo), então o histórico abaixo é perdido ao recarregar a página — a tela de
 * configuração (ConfiguracaoIA.tsx) mostra exatamente essa limitação para quem for usá-la.
 * A estrutura de RegistroChamadaIA foi desenhada para ser gravável linha a linha assim que
 * essa tabela existir, sem precisar mudar o formato. */

import type { ConfiancaClassificacao, IdProvedorIA } from "./tipos";

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

class RegistroProveniencia {
  private registros: RegistroChamadaIA[] = [];

  registrar(dados: Omit<RegistroChamadaIA, "id" | "quando"> & { quando?: string }): RegistroChamadaIA {
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

/** Instância única do processo — a mesma tanto para o roteador registrar quanto para a tela
 * de configuração ler. Ver limitação de persistência no comentário do arquivo. */
export const registroProveniencia = new RegistroProveniencia();
