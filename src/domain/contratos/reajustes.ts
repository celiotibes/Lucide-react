import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { ContratoLocacao, ContratoReajuste, CriterioReajuste } from "../types";

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

function diferencaEmMeses(dataInicioIso: string, dataFimIso: string): number {
  const inicio = new Date(dataInicioIso + "T00:00:00");
  const fim = new Date(dataFimIso + "T00:00:00");
  return (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
}

export function listarReajustes(db: Database, contratoId: number): ContratoReajuste[] {
  return consultar<ContratoReajuste>(db, "SELECT * FROM contrato_reajustes WHERE contrato_id = ? ORDER BY data_vigencia", [contratoId]);
}

/** Valor efetivamente vigente numa data — o último reajuste com data_vigencia <= dataReferencia,
 * ou o valor original do contrato se nenhum reajuste ainda foi registrado. Isso é o que faz a
 * conciliação de competências (contratos.ts::gerarCompetencias) correta ao longo de vários anos
 * em vez de esperar sempre o valor do dia 1 do contrato. */
export function valorVigente(db: Database, contratoId: number, dataReferencia: string): number {
  const [ultimoReajuste] = consultar<{ valor_novo: number }>(
    db,
    "SELECT valor_novo FROM contrato_reajustes WHERE contrato_id = ? AND data_vigencia <= ? ORDER BY data_vigencia DESC LIMIT 1",
    [contratoId, dataReferencia],
  );
  if (ultimoReajuste) return ultimoReajuste.valor_novo;

  const [contrato] = consultar<{ valor_referencia: number }>(db, "SELECT valor_referencia FROM contratos_locacao WHERE id = ?", [contratoId]);
  return contrato?.valor_referencia ?? 0;
}

export function registrarReajuste(
  db: Database,
  contratoId: number,
  dataVigencia: string,
  valorNovo: number,
  criterio: CriterioReajuste,
  observacoes?: string,
): void {
  const valorAnterior = valorVigente(db, contratoId, somarMeses(dataVigencia, -1));
  const percentualAplicado = valorAnterior > 0 ? ((valorNovo - valorAnterior) / valorAnterior) * 100 : 0;
  executar(
    db,
    `INSERT INTO contrato_reajustes (contrato_id, data_vigencia, valor_anterior, valor_novo, percentual_aplicado, criterio, observacoes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contratoId, dataVigencia, valorAnterior, valorNovo, percentualAplicado, criterio, observacoes ?? null],
  );
}

export interface SugestaoReajuste {
  ehPrimeiraRenovacao: boolean;
  criterioSugerido: CriterioReajuste;
  percentualSugerido: number | null; // null = índice sem taxas cadastradas suficientes para compor
  valorAtual: number;
  valorSugerido: number | null;
}

/** Aplica a regra de reajuste não uniforme comum em contratos reais: 1ª renovação com
 * percentual fixo pré-acordado (se `percentual_reajuste_primeira_renovacao` estiver definido),
 * renovações seguintes pela variação acumulada do índice desde o último reajuste (ou desde
 * o início do contrato, se nenhum reajuste ainda foi registrado). */
export function sugerirProximoReajuste(db: Database, contrato: ContratoLocacao, dataReferencia: string): SugestaoReajuste {
  const reajustes = listarReajustes(db, contrato.id);
  const ehPrimeiraRenovacao = reajustes.length === 0;
  const valorAtual = valorVigente(db, contrato.id, dataReferencia);

  if (ehPrimeiraRenovacao && contrato.percentual_reajuste_primeira_renovacao !== undefined && contrato.percentual_reajuste_primeira_renovacao !== null) {
    const percentual = contrato.percentual_reajuste_primeira_renovacao;
    return { ehPrimeiraRenovacao, criterioSugerido: "fixo", percentualSugerido: percentual, valorAtual, valorSugerido: valorAtual * (1 + percentual / 100) };
  }

  const indice = contrato.indice_reajuste === "nenhum" ? null : contrato.indice_reajuste;
  if (!indice) return { ehPrimeiraRenovacao, criterioSugerido: "fixo", percentualSugerido: null, valorAtual, valorSugerido: null };

  const dataBase = reajustes.length > 0 ? reajustes[reajustes.length - 1].data_vigencia : contrato.data_inicio;
  const taxas = new Map(
    consultar<{ mes_referencia: string; taxa_mensal: number }>(
      db,
      "SELECT mes_referencia, taxa_mensal FROM indices_economicos WHERE indice = ? ORDER BY mes_referencia",
      [indice],
    ).map((r) => [r.mes_referencia.slice(0, 7), r.taxa_mensal]),
  );

  let fator = 1;
  let mesesSemTaxa = 0;
  let mes = dataBase.slice(0, 8) + "01";
  while (mes < dataReferencia) {
    const taxa = taxas.get(mes.slice(0, 7));
    if (taxa === undefined) mesesSemTaxa++;
    else fator *= 1 + taxa / 100;
    mes = somarMeses(mes, 1);
  }
  if (mesesSemTaxa > 0) return { ehPrimeiraRenovacao, criterioSugerido: indice, percentualSugerido: null, valorAtual, valorSugerido: null };

  const percentual = (fator - 1) * 100;
  return { ehPrimeiraRenovacao, criterioSugerido: indice, percentualSugerido: percentual, valorAtual, valorSugerido: valorAtual * fator };
}

export interface ResultadoMultaRescisoria {
  duracaoCicloMeses: number;
  mesesRestantes: number;
  tetoMulta: number;
  multaProporcional: number;
  valorVigenteNaData: number;
}

/** Multa rescisória por quebra antecipada do prazo determinado (art. 4º Lei 8.245/91):
 * teto de N meses do valor vigente, proporcional aos meses restantes do ciclo atual —
 * mesma fórmula do art. 11.2 de um contrato real: "dividindo-se o teto fixado pelo número
 * de meses totais do prazo determinado e multiplicando pelo número de meses restantes". */
export function calcularMultaRescisoria(db: Database, contrato: ContratoLocacao, dataRescisao: string): ResultadoMultaRescisoria {
  const reajustes = listarReajustes(db, contrato.id);
  const inicioCicloAtual = [...reajustes].reverse().find((r) => r.data_vigencia <= dataRescisao)?.data_vigencia ?? contrato.data_inicio;
  const duracaoCicloMeses = contrato.duracao_minima_meses;
  const fimCicloPrevisto = somarMeses(inicioCicloAtual, duracaoCicloMeses);

  const mesesRestantes = Math.max(0, diferencaEmMeses(dataRescisao, fimCicloPrevisto));
  const valorVigenteNaData = valorVigente(db, contrato.id, dataRescisao);
  const tetoMulta = valorVigenteNaData * contrato.multa_rescisoria_teto_meses;
  const multaProporcional = duracaoCicloMeses > 0 ? (tetoMulta / duracaoCicloMeses) * mesesRestantes : 0;

  return { duracaoCicloMeses, mesesRestantes, tetoMulta, multaProporcional, valorVigenteNaData };
}
