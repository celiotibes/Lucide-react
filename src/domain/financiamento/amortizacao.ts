import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface ParcelaAmortizacao {
  numero: number;
  data: string;
  saldoDevedorInicial: number;
  amortizacao: number;
  juros: number;
  parcela: number;
  saldoDevedorFinal: number;
}

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

/** SAC — Sistema de Amortização Constante: amortização fixa, juros decrescem
 * porque incidem sobre o saldo devedor que vai diminuindo. */
export function gerarCronogramaSAC(
  valorContratado: number,
  taxaJurosMensalPercentual: number,
  parcelasTotal: number,
  dataContrato: string,
): ParcelaAmortizacao[] {
  const taxa = taxaJurosMensalPercentual / 100;
  const amortizacaoConstante = valorContratado / parcelasTotal;
  const cronograma: ParcelaAmortizacao[] = [];
  let saldo = valorContratado;

  for (let numero = 1; numero <= parcelasTotal; numero++) {
    const juros = saldo * taxa;
    const saldoDevedorFinal = saldo - amortizacaoConstante;
    cronograma.push({
      numero,
      data: somarMeses(dataContrato, numero),
      saldoDevedorInicial: saldo,
      amortizacao: amortizacaoConstante,
      juros,
      parcela: amortizacaoConstante + juros,
      saldoDevedorFinal,
    });
    saldo = saldoDevedorFinal;
  }
  return cronograma;
}

/** Tabela Price — parcela fixa (juros + amortização), amortização crescente. */
export function gerarCronogramaPrice(
  valorContratado: number,
  taxaJurosMensalPercentual: number,
  parcelasTotal: number,
  dataContrato: string,
): ParcelaAmortizacao[] {
  const taxa = taxaJurosMensalPercentual / 100;
  const parcelaFixa =
    taxa === 0
      ? valorContratado / parcelasTotal
      : (valorContratado * (taxa * Math.pow(1 + taxa, parcelasTotal))) / (Math.pow(1 + taxa, parcelasTotal) - 1);

  const cronograma: ParcelaAmortizacao[] = [];
  let saldo = valorContratado;

  for (let numero = 1; numero <= parcelasTotal; numero++) {
    const juros = saldo * taxa;
    const amortizacao = parcelaFixa - juros;
    const saldoDevedorFinal = saldo - amortizacao;
    cronograma.push({
      numero,
      data: somarMeses(dataContrato, numero),
      saldoDevedorInicial: saldo,
      amortizacao,
      juros,
      parcela: parcelaFixa,
      saldoDevedorFinal,
    });
    saldo = saldoDevedorFinal;
  }
  return cronograma;
}

export interface Financiamento {
  id: number;
  imovel_id: number;
  instituicao: string;
  sistema: "SAC" | "PRICE" | "OUTRO";
  valor_contratado: number;
  taxa_juros_mensal: number;
  data_contrato: string;
  parcelas_total: number;
  saldo_devedor_manual: number | null;
  parcela_mensal_manual: number | null;
  data_referencia_saldo_manual: string | null;
}

/** SAC/Price pressupõem amortização por juros bancários compostos sobre saldo devedor —
 * fórmula que não se aplica a um financiamento 'OUTRO' (ex: hipoteca por consórcio, cuja
 * parcela e saldo dependem do extrato da administradora, não de uma taxa de juros
 * contratada). Para 'OUTRO', não há cronograma teórico a gerar — ver saldoDevedorFinanciamento
 * e parcelaMensalFinanciamento, que usam os campos manuais em vez deste cronograma. */
export function gerarCronograma(financiamento: Financiamento): ParcelaAmortizacao[] {
  if (financiamento.sistema === "OUTRO") return [];
  const gerador = financiamento.sistema === "PRICE" ? gerarCronogramaPrice : gerarCronogramaSAC;
  return gerador(financiamento.valor_contratado, financiamento.taxa_juros_mensal, financiamento.parcelas_total, financiamento.data_contrato);
}

export interface DivergenciaParcela {
  numero: number;
  mes: string;
  jurosTeorico: number;
  jurosCobrado: number;
  amortizacaoTeorica: number;
  amortizacaoCobrada: number;
  divergenciaJurosPercentual: number | null;
  possivelAnatocismo: boolean;
}

const TOLERANCIA_DIVERGENCIA = 0.05; // 5% acima do teórico já é sinalizado

/** Compara o cronograma teórico (SAC/Price, sem juros sobre juros) com o que
 * foi de fato lançado nas transações do imóvel financiado. Divergência de juros
 * acima da tolerância é o sintoma clássico de anatocismo (juros compostos
 * incidindo sobre parcela em atraso) ou de encargo não previsto em contrato —
 * o mesmo que Ábacus/Peritus fazem manualmente para reclamação judicial. */
export function compararComTransacoes(db: Database, financiamento: Financiamento): DivergenciaParcela[] {
  const cronograma = gerarCronograma(financiamento);

  const lancamentos = consultar<{ mes: string; juros: number; amortizacao: number }>(
    db,
    `SELECT substr(t.data, 1, 7) AS mes,
            SUM(CASE WHEN t.plano_conta_codigo = '2.1.05' THEN ABS(t.valor) ELSE 0 END) AS juros,
            SUM(CASE WHEN t.plano_conta_codigo = '2.1.06' THEN ABS(t.valor) ELSE 0 END) AS amortizacao
     FROM transacoes t
     WHERE t.imovel_id = ?
     GROUP BY mes`,
    [financiamento.imovel_id],
  );
  const porMes = new Map(lancamentos.map((l) => [l.mes, l]));

  return cronograma
    .map((parcela): DivergenciaParcela | null => {
      const mes = parcela.data.slice(0, 7);
      const lancamento = porMes.get(mes);
      if (!lancamento) return null; // sem lançamento no mês — nada a comparar (pode ser fora da janela importada)

      const divergenciaJurosPercentual = parcela.juros > 0 ? (lancamento.juros - parcela.juros) / parcela.juros : null;
      return {
        numero: parcela.numero,
        mes,
        jurosTeorico: parcela.juros,
        jurosCobrado: lancamento.juros,
        amortizacaoTeorica: parcela.amortizacao,
        amortizacaoCobrada: lancamento.amortizacao,
        divergenciaJurosPercentual,
        possivelAnatocismo: divergenciaJurosPercentual !== null && divergenciaJurosPercentual > TOLERANCIA_DIVERGENCIA,
      };
    })
    .filter((d): d is DivergenciaParcela => d !== null);
}
