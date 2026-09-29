/**
 * MÓDULO: Reconstituição histórica de juros pagos — por contrato, mês a mês e ano a ano,
 * segregado por destino (pessoal × empresa de fato dos imóveis × advocacia × outro).
 *
 * "Juros pagos" aqui reúne QUATRO fontes de dado, cada uma com um grau de certeza diferente
 * — nunca escondido, sempre rotulado no campo `fonte` de cada `EventoJuros`:
 *
 *   'exato'      — financiamento SAC/PRICE: o cronograma de amortização
 *                  (`financiamento/amortizacao.ts::gerarCronograma`) decompõe cada parcela em
 *                  juros/amortização de forma matematicamente exata a partir da taxa
 *                  contratada — não depende de nenhum lançamento ter sido importado.
 *   'confirmado' — financiamento 'OUTRO' ou dívida de consumo: vem de
 *                  `divida_pagamentos_historico`, só linhas com `confirmado_por_usuario = 1`
 *                  (regra de ouro do sistema: IA só sugere, usuário decide) E
 *                  `valor_juros IS NOT NULL` (a tabela permite pagamento sem decomposição
 *                  juros/amortização — essas linhas não alimentam este relatório porque não
 *                  há como saber quanto do valor pago foi juros).
 *   'estimado'   — dívida de consumo SEM nenhuma linha 'confirmado' utilizável (ver acima)
 *                  mas COM `taxa_juros_mensal_estimada` preenchida: estimativa grosseira
 *                  `saldo_devedor_atual × taxa_juros_mensal_estimada`, repetida para cada mês
 *                  do período pedido — NUNCA um valor de pagamento real. LIMITAÇÃO DE DADO
 *                  conhecida e documentada (ver `eventosEstimadosDividasConsumo` abaixo):
 *                  `dividas_consumo` não guarda data de contratação, só a data em que o saldo
 *                  foi apurado (`data_referencia_saldo`) — não há como saber desde quando a
 *                  dívida existe, então a estimativa é gerada para TODO o intervalo pedido,
 *                  usando sempre o saldo mais recente conhecido (pode superestimar meses
 *                  antigos, quando o saldo devedor real era maior ou a dívida nem existia
 *                  ainda). Cabe ao usuário confirmar/descartar visualmente pelo rótulo
 *                  'estimado', nunca é apresentado como fato.
 *   'mora'       — juros/multa/correção monetária de contrato de locação em atraso, já
 *                  reconhecidos no razão por `provisarJurosMora`
 *                  (erp/integracao-inadimplencia.ts), lidos diretamente de `ledger_entries`
 *                  (`origem_modulo = 'inadimplencia_juros'`, perna de débito na conta 1104).
 *                  O valor reconhecido ali é `multa + juros pro-rata + correção monetária`
 *                  somados (não há coluna separada para cada componente em `ledger_entries`)
 *                  — rotulado 'mora' e não 'exato' por misturar os três componentes, mas o
 *                  cálculo em si (via `calcularInadimplencia`) é determinístico a partir das
 *                  regras do contrato, não uma estimativa solta.
 *
 * SEGREGAÇÃO POR DESTINO: cada evento aplica `aplicarRateio` (rateioDividas.ts) com o rateio
 * REAL já cadastrado para aquela dívida (`listarRateioDestinos`) — nunca presume destino. Duas
 * situações geram a fatia "não classificado":
 *   1) a dívida (`divida_consumo`/`financiamento`) não tem NENHUMA linha de rateio cadastrada,
 *      ou tem rateio PARCIAL (soma < 100%) — o resíduo não coberto por nenhum percentual
 *      cadastrado vira uma fatia "não classificado" explícita, nunca é descartado nem somado
 *      escondido em outro destino.
 *   2) juros de mora ('mora'): `divida_rateio_destinos.divida_tipo` só aceita
 *      'divida_consumo'/'financiamento' (CHECK do schema) — um contrato de locação não tem
 *      hoje nenhum mecanismo de rateio de destino, então TODO evento de mora aparece como
 *      "não classificado" por construção. Isto não é uma dívida sem classificar: é a UI de
 *      rateio ainda não cobrir contratos de locação — documentado aqui para quem for estender
 *      `divida_rateio_destinos` a `contrato_locacao` no futuro.
 *
 * Todas as funções de leitura deste módulo são PURAS quanto a efeito colateral: só executam
 * SELECT, nunca escrevem no banco nem lançam no razão (mesma garantia que
 * `compararComTransacoes`, em amortizacao.ts, já dá para financiamentos).
 *
 * `obterJurosPagosPeriodo` é a API central deste módulo — pensada para ser reaproveitada por
 * outros relatórios (indicadores ajustados por juros, priorização de quitação de dívida):
 * mudar sua assinatura ou o formato de `EventoJuros` quebra esses consumidores futuros.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarCronograma, type Financiamento } from "../financiamento/amortizacao";
import { listarRateioDestinos, aplicarRateio, type DividaTipo, type ValorRateado } from "./rateioDividas";
import { formatarMoeda } from "../formatarMoeda";

/** Tipo de "dívida" de origem de um evento de juros — estende `DividaTipo` (o escopo do
 * módulo de rateio) com `'contrato_locacao'`, a origem dos eventos de mora (ver comentário de
 * topo: contratos de locação não têm rateio de destino cadastrável hoje). */
export type OrigemJurosTipo = DividaTipo | "contrato_locacao";

export type FonteJuros = "exato" | "confirmado" | "estimado" | "mora";

export interface EventoJuros {
  data: string; // ISO yyyy-mm-dd
  ano: number;
  mes: number; // 1-12
  dividaTipo: OrigemJurosTipo;
  dividaId: number;
  descricaoDivida: string;
  valorJuros: number;
  fonte: FonteJuros;
  /** Explica COMO o valor foi calculado/obtido — texto para a legenda/tooltip da tela. */
  formula: string;
  /** De onde veio o dado (tabela/linha/módulo) — texto para a legenda/tooltip da tela. */
  fonteDados: string;
  /** Quebra de `valorJuros` pelos destinos cadastrados (`aplicarRateio`), com o resíduo não
   * coberto por nenhum rateio (ou 100% do valor, se não há rateio algum) sob o destino
   * "não classificado" — nunca omitido, nunca presumido. */
  quebraPorDestino: ValorRateado[];
}

const NAO_CLASSIFICADO = "não classificado";
const TOLERANCIA_CENTAVOS = 0.005;

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Quebra `valor` pelo rateio de destino real de uma dívida (`divida_consumo`/`financiamento`
 * — o único escopo que `divida_rateio_destinos` cobre), com o resíduo não coberto por nenhum
 * percentual cadastrado (dívida sem rateio, ou com rateio somando menos que 100%) sob
 * "não classificado". Nunca presume destino: uma dívida sem nenhuma linha de rateio retorna
 * `[{ destino: "não classificado", valor }]` por inteiro. */
function quebraPorDestinoCompleta(db: Database, dividaTipo: DividaTipo, dividaId: number, valor: number): ValorRateado[] {
  const rateios = listarRateioDestinos(db, dividaTipo, dividaId);
  if (rateios.length === 0) {
    return [{ destino: NAO_CLASSIFICADO, valor: arredondarCentavos(valor) }];
  }

  const fatias = aplicarRateio(valor, rateios);
  const somaClassificada = fatias.reduce((acc, f) => acc + f.valor, 0);
  const residuo = arredondarCentavos(valor - somaClassificada);

  return residuo > TOLERANCIA_CENTAVOS ? [...fatias, { destino: NAO_CLASSIFICADO, valor: residuo }] : fatias;
}

/** Quebra de mora: contratos de locação não têm mecanismo de rateio de destino cadastrável
 * hoje (ver comentário de topo do módulo) — todo evento de mora é 100% "não classificado" por
 * construção, não por falta de classificação do usuário. */
function quebraPorDestinoMora(valor: number): ValorRateado[] {
  return [{ destino: NAO_CLASSIFICADO, valor: arredondarCentavos(valor) }];
}

/** Componente de juros de UMA parcela do cronograma SAC/PRICE de um financiamento, para um
 * mês/ano específico — função pura (sem acesso a banco), reaproveitando o cronograma já
 * calculado por `amortizacao.ts::gerarCronograma` em vez de reimplementar a fórmula.
 * `null` quando o financiamento não tem parcela naquele mês/ano (fora do prazo contratado, ou
 * `sistema = 'OUTRO'`, sem cronograma teórico — ver `gerarCronograma`). */
export interface JurosMensalFinanciamentoSacPrice {
  financiamentoId: number;
  ano: number;
  mes: number;
  parcelaNumero: number;
  parcelasTotal: number;
  saldoDevedorInicial: number;
  valorJuros: number;
  valorAmortizacao: number;
  valorParcela: number;
  data: string;
}

export function calcularJurosMensaisFinanciamentoSacPrice(
  financiamento: Financiamento,
  mes: number,
  ano: number,
): JurosMensalFinanciamentoSacPrice | null {
  const cronograma = gerarCronograma(financiamento);
  const parcela = cronograma.find((p) => {
    const [parcelaAno, parcelaMes] = p.data.split("-").map(Number);
    return parcelaAno === ano && parcelaMes === mes;
  });
  if (!parcela) return null;

  return {
    financiamentoId: financiamento.id,
    ano,
    mes,
    parcelaNumero: parcela.numero,
    parcelasTotal: financiamento.parcelas_total,
    saldoDevedorInicial: parcela.saldoDevedorInicial,
    valorJuros: parcela.juros,
    valorAmortizacao: parcela.amortizacao,
    valorParcela: parcela.parcela,
    data: parcela.data,
  };
}

function descricaoFinanciamento(instituicao: string, apelidoImovel: string | null): string {
  return `${instituicao} — financiamento${apelidoImovel ? ` (${apelidoImovel})` : ""}`;
}

function descricaoDividaConsumo(instituicao: string, tipo: string): string {
  return `${instituicao} (${tipo})`;
}

function intervaloDatas(anoInicio: number, anoFim: number): { inicio: string; fim: string } {
  return { inicio: `${anoInicio}-01-01`, fim: `${anoFim}-12-31` };
}

/** Fonte 'exato': todo financiamento SAC/PRICE, decompondo cada parcela do cronograma teórico
 * cuja data caia dentro de [anoInicio, anoFim]. Financiamentos 'OUTRO' não entram aqui (sem
 * cronograma — ver `gerarCronograma`); são cobertos por `eventosConfirmados`. */
function eventosExatosFinanciamentos(db: Database, anoInicio: number, anoFim: number): EventoJuros[] {
  const financiamentos = consultar<Financiamento & { apelido_imovel: string | null }>(
    db,
    `SELECT f.*, i.apelido AS apelido_imovel
     FROM financiamentos f
     LEFT JOIN imoveis i ON i.id = f.imovel_id
     WHERE f.sistema IN ('SAC', 'PRICE')`,
  );

  const eventos: EventoJuros[] = [];
  for (const f of financiamentos) {
    const cronograma = gerarCronograma(f);
    const descricao = descricaoFinanciamento(f.instituicao, f.apelido_imovel);

    for (const parcela of cronograma) {
      const [parcelaAno, parcelaMes] = parcela.data.split("-").map(Number);
      if (parcelaAno < anoInicio || parcelaAno > anoFim) continue;

      eventos.push({
        data: parcela.data,
        ano: parcelaAno,
        mes: parcelaMes,
        dividaTipo: "financiamento",
        dividaId: f.id,
        descricaoDivida: descricao,
        valorJuros: arredondarCentavos(parcela.juros),
        fonte: "exato",
        formula:
          `Parcela ${parcela.numero}/${f.parcelas_total} (${f.sistema}): juros = saldo devedor inicial ` +
          `(${formatarMoeda(parcela.saldoDevedorInicial)}) × taxa mensal contratada (${f.taxa_juros_mensal}% a.m.)`,
        fonteDados: `financiamentos#${f.id} — cronograma ${f.sistema} calculado (financiamento/amortizacao.ts::gerarCronograma)`,
        quebraPorDestino: quebraPorDestinoCompleta(db, "financiamento", f.id, arredondarCentavos(parcela.juros)),
      });
    }
  }
  return eventos;
}

/** Fonte 'confirmado': linhas de `divida_pagamentos_historico` com `confirmado_por_usuario = 1`
 * E `valor_juros` preenchido (uma linha confirmada mas sem decomposição juros/amortização não
 * entra — não há como saber quanto do pagamento foi juros). Cobre dívida de consumo e
 * financiamento 'OUTRO' (financiamento SAC/PRICE usa o cronograma exato, não esta tabela —
 * ver comentário de topo do módulo). */
function eventosConfirmados(db: Database, anoInicio: number, anoFim: number): EventoJuros[] {
  const { inicio, fim } = intervaloDatas(anoInicio, anoFim);

  const linhas = consultar<{
    id: number;
    divida_tipo: DividaTipo;
    divida_id: number;
    data_pagamento: string;
    valor_juros: number;
    origem: "extraido_ia" | "manual";
  }>(
    db,
    `SELECT h.id, h.divida_tipo, h.divida_id, h.data_pagamento, h.valor_juros, h.origem
     FROM divida_pagamentos_historico h
     WHERE h.confirmado_por_usuario = 1
       AND h.valor_juros IS NOT NULL
       AND h.data_pagamento BETWEEN ? AND ?
       AND (
         h.divida_tipo = 'divida_consumo'
         OR (h.divida_tipo = 'financiamento' AND EXISTS (
               SELECT 1 FROM financiamentos f WHERE f.id = h.divida_id AND f.sistema = 'OUTRO'
             ))
       )
     ORDER BY h.data_pagamento`,
    [inicio, fim],
  );
  if (linhas.length === 0) return [];

  const dividasConsumo = new Map(
    consultar<{ id: number; instituicao: string; tipo: string }>(db, "SELECT id, instituicao, tipo FROM dividas_consumo").map((d) => [
      d.id,
      d,
    ]),
  );
  const financiamentos = new Map(
    consultar<{ id: number; instituicao: string; apelido_imovel: string | null }>(
      db,
      `SELECT f.id, f.instituicao, i.apelido AS apelido_imovel FROM financiamentos f LEFT JOIN imoveis i ON i.id = f.imovel_id`,
    ).map((f) => [f.id, f]),
  );

  const eventos: EventoJuros[] = [];
  for (const linha of linhas) {
    const descricao =
      linha.divida_tipo === "divida_consumo"
        ? (() => {
            const d = dividasConsumo.get(linha.divida_id);
            return d ? descricaoDividaConsumo(d.instituicao, d.tipo) : `Dívida de consumo #${linha.divida_id}`;
          })()
        : (() => {
            const f = financiamentos.get(linha.divida_id);
            return f ? descricaoFinanciamento(f.instituicao, f.apelido_imovel) : `Financiamento #${linha.divida_id}`;
          })();

    const [ano, mes] = linha.data_pagamento.split("-").map(Number);
    const valorJuros = arredondarCentavos(linha.valor_juros);

    eventos.push({
      data: linha.data_pagamento,
      ano,
      mes,
      dividaTipo: linha.divida_tipo,
      dividaId: linha.divida_id,
      descricaoDivida: descricao,
      valorJuros,
      fonte: "confirmado",
      formula: `Valor de juros informado no histórico de pagamentos (linha #${linha.id}), origem: ${linha.origem === "extraido_ia" ? "extração por IA, confirmada pelo usuário" : "lançamento manual"}`,
      fonteDados: `divida_pagamentos_historico#${linha.id} (confirmado_por_usuario = 1)`,
      quebraPorDestino: quebraPorDestinoCompleta(db, linha.divida_tipo, linha.divida_id, valorJuros),
    });
  }
  return eventos;
}

/** Fonte 'estimado': dívida de consumo com `taxa_juros_mensal_estimada` preenchida e SEM
 * nenhuma linha 'confirmado' utilizável (ver `eventosConfirmados`) — gera um evento estimado
 * por mês do intervalo pedido, `saldo_devedor_atual × taxa_juros_mensal_estimada`. LIMITAÇÃO
 * DE DADO (ver comentário de topo do módulo): `dividas_consumo` não guarda data de
 * contratação, então a estimativa cobre TODO [anoInicio, anoFim] pedido usando sempre o saldo
 * mais recente conhecido — pode não fazer sentido para anos muito anteriores a
 * `data_referencia_saldo` (a dívida pode nem ter existido, ou o saldo devedor real era bem
 * maior). Sempre rotulado 'estimado', nunca apresentado como pagamento confirmado. */
function eventosEstimadosDividasConsumo(db: Database, anoInicio: number, anoFim: number): EventoJuros[] {
  const dividas = consultar<{
    id: number;
    instituicao: string;
    tipo: string;
    saldo_devedor_atual: number;
    data_referencia_saldo: string;
    taxa_juros_mensal_estimada: number | null;
  }>(
    db,
    `SELECT id, instituicao, tipo, saldo_devedor_atual, data_referencia_saldo, taxa_juros_mensal_estimada
     FROM dividas_consumo
     WHERE taxa_juros_mensal_estimada IS NOT NULL`,
  );
  if (dividas.length === 0) return [];

  const idsComConfirmadoUtilizavel = new Set(
    consultar<{ divida_id: number }>(
      db,
      `SELECT DISTINCT divida_id FROM divida_pagamentos_historico
       WHERE divida_tipo = 'divida_consumo' AND confirmado_por_usuario = 1 AND valor_juros IS NOT NULL`,
    ).map((r) => r.divida_id),
  );

  const eventos: EventoJuros[] = [];
  for (const d of dividas) {
    if (idsComConfirmadoUtilizavel.has(d.id)) continue; // já coberta por 'confirmado' — não duplica com estimativa

    const descricao = descricaoDividaConsumo(d.instituicao, d.tipo);
    const valorJuros = arredondarCentavos(d.saldo_devedor_atual * ((d.taxa_juros_mensal_estimada ?? 0) / 100));
    if (valorJuros <= 0) continue;

    for (let ano = anoInicio; ano <= anoFim; ano++) {
      for (let mes = 1; mes <= 12; mes++) {
        eventos.push({
          data: `${ano}-${String(mes).padStart(2, "0")}-01`,
          ano,
          mes,
          dividaTipo: "divida_consumo",
          dividaId: d.id,
          descricaoDivida: descricao,
          valorJuros,
          fonte: "estimado",
          formula: `Estimativa: saldo devedor atual (${formatarMoeda(d.saldo_devedor_atual)}, apurado em ${d.data_referencia_saldo}) × taxa mensal estimada (${d.taxa_juros_mensal_estimada}% a.m.) — não confirma pagamento real, é um teto aproximado repetido para cada mês do período`,
          fonteDados: `dividas_consumo#${d.id}.taxa_juros_mensal_estimada — sem linha confirmada em divida_pagamentos_historico`,
          quebraPorDestino: quebraPorDestinoCompleta(db, "divida_consumo", d.id, valorJuros),
        });
      }
    }
  }
  return eventos;
}

/** Fonte 'mora': juros/multa/correção monetária de mora de contrato de locação, já
 * reconhecidos no razão por `provisarJurosMora` (erp/integracao-inadimplencia.ts) — lidos
 * direto de `ledger_entries` (não há função de leitura pronta para este módulo consumir; a
 * própria tarefa que motivou este módulo autoriza a consulta direta). Usa a perna de DÉBITO
 * na conta 1104 ("Contas a receber — juros e multa de mora") para não contar o mesmo
 * lançamento duas vezes (débito 1104 e crédito 4201 têm o mesmo valor — ver
 * `provisarJurosMora`), e só lançamentos "vivos" (não estornados), mesma condição de
 * `lancamentosVivosDaProvisao` em integracao-inadimplencia.ts. */
function eventosMora(db: Database, anoInicio: number, anoFim: number): EventoJuros[] {
  const { inicio, fim } = intervaloDatas(anoInicio, anoFim);

  const CONTA_JUROS_MULTA_MORA_A_RECEBER_ERP = 1104;
  const linhas = consultar<{
    id: number;
    data_lancamento: string;
    valor_debito: number;
    competencia_id: number;
    contrato_id: number;
    ano: number;
    mes: number;
    locatario: string;
    apelido_imovel: string;
  }>(
    db,
    `SELECT le.id, le.data_lancamento, le.valor_debito, le.origem_id AS competencia_id,
            ac.contrato_id, ac.ano, ac.mes, cl.locatario, im.apelido AS apelido_imovel
     FROM ledger_entries le
     JOIN aluguel_competencias ac ON ac.id = le.origem_id
     JOIN contratos_locacao cl ON cl.id = ac.contrato_id
     JOIN imoveis im ON im.id = ac.imovel_id
     WHERE le.origem_modulo = 'inadimplencia_juros'
       AND le.conta_id = ?
       AND le.valor_debito IS NOT NULL
       AND le.estorno_de_id IS NULL AND le.estornado_por_id IS NULL
       AND le.data_lancamento BETWEEN ? AND ?
     ORDER BY le.data_lancamento`,
    [CONTA_JUROS_MULTA_MORA_A_RECEBER_ERP, inicio, fim],
  );

  return linhas.map((linha): EventoJuros => {
    const valorJuros = arredondarCentavos(linha.valor_debito);
    return {
      data: linha.data_lancamento,
      ano: linha.ano,
      mes: linha.mes,
      dividaTipo: "contrato_locacao",
      dividaId: linha.competencia_id,
      descricaoDivida: `${linha.apelido_imovel} — ${linha.locatario} (contrato #${linha.contrato_id}, competência ${String(linha.mes).padStart(2, "0")}/${linha.ano})`,
      valorJuros,
      fonte: "mora",
      formula:
        "Juros de mora, multa e correção monetária reconhecidos por competência (débito 1104 'Contas a receber — " +
        "juros e multa de mora' / crédito 4201 'Juros recebidos'), calculados por provisarJurosMora a partir das " +
        "regras de mora do contrato (multa em duas faixas + juros pro-rata die + correção monetária pelo índice do contrato)",
      fonteDados: `ledger_entries#${linha.id} (origem_modulo = 'inadimplencia_juros', origem_id = competência #${linha.competencia_id})`,
      quebraPorDestino: quebraPorDestinoMora(valorJuros),
    };
  });
}

export interface ObterJurosPagosPeriodoParametros {
  anoInicio: number;
  anoFim: number;
}

/** API central do módulo: todo evento de juros pago (ou reconhecido, no caso de mora) entre
 * `anoInicio` e `anoFim` (inclusive, ambos os limites), de TODAS as fontes — cronograma
 * SAC/PRICE exato, histórico confirmado de dívida de consumo/financiamento 'OUTRO', estimativa
 * por taxa de dívida de consumo sem histórico, e mora de contrato de locação — já com a
 * quebra por destino aplicada em cada evento. Ordenado por data.
 *
 * Reaproveitada por `relatorioJurosMensal`/`relatorioJurosAnual` (abaixo) e pensada para ser
 * reaproveitada por outros módulos (indicadores ajustados por juros, priorização de quitação
 * de dívida) — não muda de assinatura/formato sem atualizar esses consumidores. */
export function obterJurosPagosPeriodo(db: Database, { anoInicio, anoFim }: ObterJurosPagosPeriodoParametros): EventoJuros[] {
  if (anoFim < anoInicio) {
    throw new Error(`Período inválido: anoFim (${anoFim}) é anterior a anoInicio (${anoInicio}).`);
  }

  const eventos = [
    ...eventosExatosFinanciamentos(db, anoInicio, anoFim),
    ...eventosConfirmados(db, anoInicio, anoFim),
    ...eventosEstimadosDividasConsumo(db, anoInicio, anoFim),
    ...eventosMora(db, anoInicio, anoFim),
  ];

  eventos.sort((a, b) => a.data.localeCompare(b.data) || a.dividaTipo.localeCompare(b.dividaTipo) || a.dividaId - b.dividaId);
  return eventos;
}

/** Agrega a quebra por destino de vários eventos num único total por destino — soma as fatias
 * de mesmo `destino` entre todos os eventos, arredondando a centavos. Ordenado do maior para o
 * menor valor (mais útil para leitura/gráfico que ordem alfabética). */
function agregarPorDestino(eventos: EventoJuros[]): ValorRateado[] {
  const totais = new Map<string, number>();
  for (const evento of eventos) {
    for (const fatia of evento.quebraPorDestino) {
      totais.set(fatia.destino, arredondarCentavos((totais.get(fatia.destino) ?? 0) + fatia.valor));
    }
  }
  return [...totais.entries()].map(([destino, valor]) => ({ destino, valor })).sort((a, b) => b.valor - a.valor);
}

export interface RelatorioJurosMensal {
  ano: number;
  mes: number;
  eventos: EventoJuros[];
  totalGeral: number;
  totalPorDestino: ValorRateado[];
}

/** Relatório mês a mês: todos os eventos de juros daquele mês/ano específico, com o total
 * geral e a quebra por destino agregada entre todos os eventos do mês. */
export function relatorioJurosMensal(db: Database, ano: number, mes: number): RelatorioJurosMensal {
  const eventos = obterJurosPagosPeriodo(db, { anoInicio: ano, anoFim: ano }).filter((e) => e.mes === mes);
  return {
    ano,
    mes,
    eventos,
    totalGeral: arredondarCentavos(eventos.reduce((acc, e) => acc + e.valorJuros, 0)),
    totalPorDestino: agregarPorDestino(eventos),
  };
}

export interface RelatorioJurosAnualMes {
  mes: number;
  eventos: EventoJuros[];
  totalGeral: number;
  totalPorDestino: ValorRateado[];
}

export interface RelatorioJurosAnual {
  ano: number;
  eventos: EventoJuros[];
  totalGeral: number;
  totalPorDestino: ValorRateado[];
  /** Sempre 12 entradas (mês 1 a 12), mesmo para meses sem nenhum evento (`eventos: []`,
   * `totalGeral: 0`) — facilita preencher um gráfico/tabela de 12 colunas sem checar buraco. */
  porMes: RelatorioJurosAnualMes[];
}

/** Relatório consolidado do ano inteiro: total geral, quebra por destino do ano inteiro, e a
 * mesma quebra (eventos/total/destino) mês a mês dentro do ano — o total do ano é sempre
 * exatamente a soma dos 12 totais mensais, porque ambos vêm do mesmo array de eventos, nunca
 * de duas consultas separadas que poderiam divergir. */
export function relatorioJurosAnual(db: Database, ano: number): RelatorioJurosAnual {
  const eventos = obterJurosPagosPeriodo(db, { anoInicio: ano, anoFim: ano });

  const porMes: RelatorioJurosAnualMes[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const eventosMes = eventos.filter((e) => e.mes === mes);
    porMes.push({
      mes,
      eventos: eventosMes,
      totalGeral: arredondarCentavos(eventosMes.reduce((acc, e) => acc + e.valorJuros, 0)),
      totalPorDestino: agregarPorDestino(eventosMes),
    });
  }

  return {
    ano,
    eventos,
    totalGeral: arredondarCentavos(eventos.reduce((acc, e) => acc + e.valorJuros, 0)),
    totalPorDestino: agregarPorDestino(eventos),
    porMes,
  };
}
