import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarCronograma, type Financiamento, type ParcelaAmortizacao } from "../financiamento/amortizacao";
import { calcularCaucao } from "../caucao/calculoCaucao";
import type { Caucao, DividaConsumo, Imovel } from "../types";

/** Saldo devedor de um financiamento numa data — última parcela do cronograma teórico
 * (SAC/Price) com data <= dataReferencia. Antes do início do contrato, o saldo é o valor
 * contratado; depois da última parcela, é zero (quitado). Aceita um cronograma
 * já calculado (evita gerar o mesmo cronograma de novo quando o chamador também precisa
 * de parcelaMensalFinanciamento/parcelas futuras do mesmo financiamento). */
export function saldoDevedorFinanciamento(
  financiamento: Financiamento,
  dataReferencia: string,
  cronograma: ParcelaAmortizacao[] = gerarCronograma(financiamento),
): number {
  if (dataReferencia < financiamento.data_contrato) return financiamento.valor_contratado;
  const ultimaVencida = [...cronograma].reverse().find((p) => p.data <= dataReferencia);
  // Sem parcela vencida (dataReferencia cai entre a assinatura do contrato e o
  // vencimento da 1ª parcela — a 1ª parcela vence 1 mês após data_contrato) — nenhuma
  // amortização ainda ocorreu, saldo devedor é o valor integral contratado, não zero.
  if (!ultimaVencida) return financiamento.valor_contratado;
  return Math.max(0, ultimaVencida.saldoDevedorFinal);
}

/** Parcela mensal teórica de um financiamento na data de referência (0 se já quitado ou
 * ainda não iniciado). Aceita um cronograma já calculado, mesmo motivo de
 * saldoDevedorFinanciamento. */
export function parcelaMensalFinanciamento(
  financiamento: Financiamento,
  dataReferencia: string,
  cronograma: ParcelaAmortizacao[] = gerarCronograma(financiamento),
): number {
  if (dataReferencia < financiamento.data_contrato) return 0;
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
 * quanto do subsídio já está retido antes de chegar à conta. Só considera financiamento
 * de imóvel próprio (regime_patrimonial = 'proprio') — a parcela de um financiamento em
 * gestão de terceiros não é obrigação pessoal do usuário, mesma regra de
 * calcularPatrimonioLiquido. */
export function calcularComprometimentoRenda(db: Database, dataReferencia: string, salarioMensal: number): ComprometimentoRenda {
  const idsImoveisProprios = new Set(listarImoveis(db).filter((i) => i.regime_patrimonial === "proprio").map((i) => i.id));
  const financiamentos = listarFinanciamentos(db).filter((f) => idsImoveisProprios.has(f.imovel_id));
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

/** Demonstrativo de Endividamento Global: financiamentos imobiliários + dívidas de
 * consumo numa lista única, para mostrar o perfil de risco completo do CPF (não só o
 * imobiliário). Ver calcularVPLDoEndividamento() abaixo, que gera esta mesma lista já
 * com o VPL de cada dívida — é a versão usada pela UI. */
export interface LinhaEndividamento {
  categoria: "financiamento" | "divida_consumo";
  descricao: string;
  saldoDevedor: number;
  parcelaMensal: number;
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
 * ativo — o ativo imobilizado não é liquidez imediata. Só considera financiamento de
 * imóvel próprio, mesma regra de calcularPatrimonioLiquido/calcularComprometimentoRenda. */
export function calcularLiquidezCorrente(db: Database, dataReferencia: string): LiquidezCorrente {
  const saldoCaixaAtual = calcularSaldoCaixaAtual(db);
  const dataLimite = somarMeses(dataReferencia, 12);

  const idsImoveisProprios = new Set(listarImoveis(db).filter((i) => i.regime_patrimonial === "proprio").map((i) => i.id));
  const financiamentos = listarFinanciamentos(db).filter((f) => idsImoveisProprios.has(f.imovel_id));
  let parcelasFinanciamentos = 0;
  for (const f of financiamentos) {
    const cronograma = gerarCronograma(f);
    parcelasFinanciamentos += cronograma.filter((p) => p.data >= dataReferencia && p.data < dataLimite).reduce((acc, p) => acc + p.parcela, 0);
  }
  // Dívida de consumo não tem prazo cadastrado (só saldo e parcela) — estima parcelas
  // restantes por saldo ÷ parcela (mesma aproximação de calcularVPLDoEndividamento) e
  // limita a 12: uma dívida a 2 meses de quitar não pode contar como 12 parcelas cheias
  // no passivo circulante de 12 meses, senão o índice de liquidez fica pior que a realidade.
  const dividas = listarDividasConsumo(db);
  const parcelasConsumo = dividas.reduce((acc, d) => {
    const parcelasRestantes = d.parcela_mensal > 0 ? Math.ceil(d.saldo_devedor_atual / d.parcela_mensal) : 0;
    return acc + d.parcela_mensal * Math.min(12, parcelasRestantes);
  }, 0);
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

export interface LinhaEndividamentoComVPL extends LinhaEndividamento {
  parcelasRestantesEstimadas: number;
  vpl: number;
}

/** VPL de cada dívida do demonstrativo de endividamento global — o "perfil de risco do
 * CPF" do usuário. Só considera financiamento de imóvel próprio (regime_patrimonial =
 * 'proprio'): a dívida de um financiamento em gestão de terceiros não é obrigação
 * pessoal do usuário, mesma regra de calcularPatrimonioLiquido/calcularComprometimentoRenda
 * — incluir aqui misturaria dívida de terceiro no risco do CPF do próprio usuário.
 * Financiamentos usam o cronograma teórico real (SAC/Price) — parcelas futuras exatas.
 * Dívidas de consumo não têm prazo cadastrado (só saldo e parcela), então o número de
 * parcelas restantes é estimado por saldo_devedor_atual / parcela_mensal — aproximação
 * simples que ignora a composição de juros dentro da própria estimativa de prazo;
 * sempre uma sub ou sobre-estimativa leve, nunca um valor "oficial" do contrato. */
export function calcularVPLDoEndividamento(db: Database, dataReferencia: string, taxaDescontoMensalPercentual: number): LinhaEndividamentoComVPL[] {
  const imoveis = new Map(listarImoveis(db).map((i) => [i.id, i]));
  const idsImoveisProprios = new Set(Array.from(imoveis.values()).filter((i) => i.regime_patrimonial === "proprio").map((i) => i.id));

  const financiamentos = listarFinanciamentos(db)
    .filter((f) => idsImoveisProprios.has(f.imovel_id))
    .map((f): LinhaEndividamentoComVPL => {
      // Cronograma calculado uma única vez e reaproveitado nas 3 derivações abaixo
      // (antes cada uma gerava o próprio cronograma do zero).
      const cronograma = gerarCronograma(f);
      const parcelasFuturas = cronograma.filter((p) => p.data >= dataReferencia).map((p) => p.parcela);
      return {
        categoria: "financiamento",
        descricao: `${f.instituicao} — ${imoveis.get(f.imovel_id)?.apelido ?? `imóvel ${f.imovel_id}`}`,
        saldoDevedor: saldoDevedorFinanciamento(f, dataReferencia, cronograma),
        parcelaMensal: parcelaMensalFinanciamento(f, dataReferencia, cronograma),
        parcelasRestantesEstimadas: parcelasFuturas.length,
        vpl: calcularVPLDivida(parcelasFuturas, taxaDescontoMensalPercentual),
      };
    });

  const dividas = listarDividasConsumo(db).map((d): LinhaEndividamentoComVPL => {
    const parcelasRestantesEstimadas = d.parcela_mensal > 0 ? Math.ceil(d.saldo_devedor_atual / d.parcela_mensal) : 0;
    const parcelasFuturas = Array(parcelasRestantesEstimadas).fill(d.parcela_mensal);
    return {
      categoria: "divida_consumo",
      descricao: `${d.instituicao} — ${ROTULO_TIPO_DIVIDA[d.tipo]}`,
      saldoDevedor: d.saldo_devedor_atual,
      parcelaMensal: d.parcela_mensal,
      parcelasRestantesEstimadas,
      vpl: calcularVPLDivida(parcelasFuturas, taxaDescontoMensalPercentual),
    };
  });

  return [...financiamentos, ...dividas].sort((a, b) => b.saldoDevedor - a.saldoDevedor);
}
