import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarCronograma, type Financiamento } from "../financiamento/amortizacao";
import { calcularCaucao } from "../caucao/calculoCaucao";
import type { Caucao, DividaConsumo, Imovel } from "../types";

/** Saldo devedor de um financiamento numa data — última parcela do cronograma teórico
 * (SAC/Price) com data <= dataReferencia. Antes do início do contrato, o saldo é o valor
 * contratado; depois da última parcela, é zero (quitado). */
export function saldoDevedorFinanciamento(financiamento: Financiamento, dataReferencia: string): number {
  if (dataReferencia < financiamento.data_contrato) return financiamento.valor_contratado;
  const cronograma = gerarCronograma(financiamento);
  const ultimaVencida = [...cronograma].reverse().find((p) => p.data <= dataReferencia);
  return ultimaVencida ? Math.max(0, ultimaVencida.saldoDevedorFinal) : 0;
}

/** Parcela mensal teórica de um financiamento na data de referência (0 se já quitado ou
 * ainda não iniciado). */
export function parcelaMensalFinanciamento(financiamento: Financiamento, dataReferencia: string): number {
  if (dataReferencia < financiamento.data_contrato) return 0;
  const cronograma = gerarCronograma(financiamento);
  const parcelaAtual = cronograma.find((p) => p.data >= dataReferencia);
  return parcelaAtual?.parcela ?? 0;
}

function listarImoveis(db: Database): Imovel[] {
  return consultar<Imovel>(db, "SELECT * FROM imoveis");
}
function listarFinanciamentos(db: Database): Financiamento[] {
  return consultar<Financiamento>(db, "SELECT * FROM financiamentos");
}
function listarDividasConsumo(db: Database): DividaConsumo[] {
  return consultar<DividaConsumo>(db, "SELECT * FROM dividas_consumo");
}

export interface LinhaAlavancagemImovel {
  imovel: Imovel;
  valorVenal: number | null;
  saldoDevedor: number;
  percentualAlavancagem: number | null; // null quando não há valor_venal_atual cadastrado
}

/** Alavancagem por imóvel próprio: saldo devedor dos financiamentos vinculados sobre o
 * valor venal atual. Sem valor venal cadastrado, o percentual fica null (não estimamos —
 * é dado que só o usuário tem). */
export function calcularAlavancagemPorImovel(db: Database, dataReferencia: string): LinhaAlavancagemImovel[] {
  const imoveis = listarImoveis(db).filter((i) => i.regime_patrimonial === "proprio");
  const financiamentos = listarFinanciamentos(db);

  return imoveis.map((imovel) => {
    const saldoDevedor = financiamentos
      .filter((f) => f.imovel_id === imovel.id)
      .reduce((acc, f) => acc + saldoDevedorFinanciamento(f, dataReferencia), 0);
    const valorVenal = imovel.valor_venal_atual ?? null;
    return {
      imovel,
      valorVenal,
      saldoDevedor,
      percentualAlavancagem: valorVenal && valorVenal > 0 ? (saldoDevedor / valorVenal) * 100 : null,
    };
  });
}

export interface PatrimonioLiquido {
  ativoImobiliario: number;
  imoveisSemValorVenal: string[]; // apelidos dos imóveis próprios sem valor_venal_atual — não entraram na soma
  passivoFinanciamentos: number;
  passivoConsumo: number;
  patrimonioLiquido: number;
}

/** Patrimônio Líquido = Ativo imobiliário (valor venal dos imóveis próprios) - Passivo de
 * financiamentos - Passivo de dívidas de consumo. Imóveis em gestão de terceiros (ex: Avani)
 * ficam de fora do ativo — o usuário administra o fluxo, mas o bem não é dele. */
export function calcularPatrimonioLiquido(db: Database, dataReferencia: string): PatrimonioLiquido {
  const imoveisProprios = listarImoveis(db).filter((i) => i.regime_patrimonial === "proprio");
  const financiamentos = listarFinanciamentos(db);
  const dividas = listarDividasConsumo(db);

  const comValorVenal = imoveisProprios.filter((i) => i.valor_venal_atual !== undefined && i.valor_venal_atual !== null);
  const semValorVenal = imoveisProprios.filter((i) => i.valor_venal_atual === undefined || i.valor_venal_atual === null);
  const ativoImobiliario = comValorVenal.reduce((acc, i) => acc + (i.valor_venal_atual ?? 0), 0);

  const idsImoveisProprios = new Set(imoveisProprios.map((i) => i.id));
  const passivoFinanciamentos = financiamentos
    .filter((f) => idsImoveisProprios.has(f.imovel_id))
    .reduce((acc, f) => acc + saldoDevedorFinanciamento(f, dataReferencia), 0);
  const passivoConsumo = dividas.reduce((acc, d) => acc + d.saldo_devedor_atual, 0);

  return {
    ativoImobiliario,
    imoveisSemValorVenal: semValorVenal.map((i) => i.apelido),
    passivoFinanciamentos,
    passivoConsumo,
    patrimonioLiquido: ativoImobiliario - passivoFinanciamentos - passivoConsumo,
  };
}

/** Soma de todas as transações lançadas — aproximação do caixa disponível hoje, válida
 * enquanto o histórico importado cobrir o período inteiro desde a abertura das contas
 * (sem saldo inicial cadastrado, transações fora da janela importada não entram na soma). */
export function calcularSaldoCaixaAtual(db: Database): number {
  const [{ total }] = consultar<{ total: number | null }>(db, "SELECT SUM(valor) AS total FROM transacoes");
  return total ?? 0;
}

export interface ComprometimentoRenda {
  parcelasFinanciamentos: number;
  parcelasConsumo: number;
  totalParcelas: number;
  salarioMensal: number;
  percentualComprometido: number | null; // null se salarioMensal <= 0
}

/** % da renda mensal comprometida com parcelas de dívida (financiamentos + consignado/
 * empréstimo/cartão parcelado) — o "índice de comprometimento de renda" que evidencia
 * quanto do subsídio já está retido antes de chegar à conta. */
export function calcularComprometimentoRenda(db: Database, dataReferencia: string, salarioMensal: number): ComprometimentoRenda {
  const financiamentos = listarFinanciamentos(db);
  const dividas = listarDividasConsumo(db);

  const parcelasFinanciamentos = financiamentos.reduce((acc, f) => acc + parcelaMensalFinanciamento(f, dataReferencia), 0);
  const parcelasConsumo = dividas.reduce((acc, d) => acc + d.parcela_mensal, 0);
  const totalParcelas = parcelasFinanciamentos + parcelasConsumo;

  return {
    parcelasFinanciamentos,
    parcelasConsumo,
    totalParcelas,
    salarioMensal,
    percentualComprometido: salarioMensal > 0 ? (totalParcelas / salarioMensal) * 100 : null,
  };
}

export interface LinhaEndividamento {
  categoria: "financiamento" | "divida_consumo";
  descricao: string;
  saldoDevedor: number;
  parcelaMensal: number;
}

/** Demonstrativo de Endividamento Global: financiamentos imobiliários + dívidas de
 * consumo numa lista única, para mostrar o perfil de risco completo do CPF (não só o
 * imobiliário). */
export function gerarDemonstrativoEndividamentoGlobal(db: Database, dataReferencia: string): LinhaEndividamento[] {
  const imoveis = new Map(listarImoveis(db).map((i) => [i.id, i]));
  const financiamentos = listarFinanciamentos(db).map((f) => ({
    categoria: "financiamento" as const,
    descricao: `${f.instituicao} — ${imoveis.get(f.imovel_id)?.apelido ?? `imóvel ${f.imovel_id}`}`,
    saldoDevedor: saldoDevedorFinanciamento(f, dataReferencia),
    parcelaMensal: parcelaMensalFinanciamento(f, dataReferencia),
  }));
  const dividas = listarDividasConsumo(db).map((d) => ({
    categoria: "divida_consumo" as const,
    descricao: `${d.instituicao} — ${ROTULO_TIPO_DIVIDA[d.tipo]}`,
    saldoDevedor: d.saldo_devedor_atual,
    parcelaMensal: d.parcela_mensal,
  }));
  return [...financiamentos, ...dividas].sort((a, b) => b.saldoDevedor - a.saldoDevedor);
}

export const ROTULO_TIPO_DIVIDA: Record<DividaConsumo["tipo"], string> = {
  consignado: "Consignado",
  emprestimo_pessoal: "Empréstimo pessoal",
  cartao_parcelado: "Cartão parcelado",
  outro: "Outro",
};

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

export interface LiquidezCorrente {
  saldoCaixaAtual: number;
  cauçõesADevolverProximos12Meses: number;
  parcelasDividaProximos12Meses: number;
  passivoCirculante: number;
  indiceLiquidezCorrente: number | null; // null se passivoCirculante = 0 (indefinido, não "infinito")
}

/** Liquidez corrente = caixa disponível / (parcelas de dívida vencendo em 12 meses +
 * cauções ainda retidas, tratadas como exigíveis de curto prazo). Demonstra que o dinheiro
 * em conta pode estar consumido por compromissos de curto prazo mesmo com 9 imóveis no
 * ativo — o ativo imobilizado não é liquidez imediata. */
export function calcularLiquidezCorrente(db: Database, dataReferencia: string): LiquidezCorrente {
  const saldoCaixaAtual = calcularSaldoCaixaAtual(db);
  const dataLimite = somarMeses(dataReferencia, 12);

  const financiamentos = listarFinanciamentos(db);
  let parcelasFinanciamentos = 0;
  for (const f of financiamentos) {
    const cronograma = gerarCronograma(f);
    parcelasFinanciamentos += cronograma.filter((p) => p.data >= dataReferencia && p.data < dataLimite).reduce((acc, p) => acc + p.parcela, 0);
  }
  const dividas = listarDividasConsumo(db);
  const parcelasConsumo = dividas.reduce((acc, d) => acc + d.parcela_mensal * 12, 0);
  const parcelasDividaProximos12Meses = parcelasFinanciamentos + parcelasConsumo;

  const caucoesAtivas = consultar<Caucao>(db, "SELECT * FROM caucoes WHERE data_devolucao IS NULL");
  const cauçõesADevolverProximos12Meses = caucoesAtivas.reduce((acc, c) => acc + calcularCaucao(db, c.id, dataReferencia).valorADevolver, 0);

  const passivoCirculante = parcelasDividaProximos12Meses + cauçõesADevolverProximos12Meses;

  return {
    saldoCaixaAtual,
    cauçõesADevolverProximos12Meses,
    parcelasDividaProximos12Meses,
    passivoCirculante,
    indiceLiquidezCorrente: passivoCirculante > 0 ? saldoCaixaAtual / passivoCirculante : null,
  };
}

/** Valor Presente Líquido de um fluxo de parcelas mensais futuras, descontado pela taxa
 * mensal informada — mostra que uma dívida de consórcio/financiamento de longo prazo
 * "vale" menos em termos nominais hoje do que a soma simples das parcelas sugere, mas
 * ainda representa exigibilidade presente sobre o patrimônio. */
export function calcularVPLDivida(parcelasMensais: number[], taxaDescontoMensalPercentual: number): number {
  const taxa = taxaDescontoMensalPercentual / 100;
  return parcelasMensais.reduce((acc, parcela, indice) => acc + parcela / Math.pow(1 + taxa, indice + 1), 0);
}
