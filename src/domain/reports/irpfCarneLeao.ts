import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { Imovel } from "../types";
import { percentualTributavel } from "./rendaTributavel";

export interface FaixaIrpf {
  ateValor: number | null; // null = última faixa ("acima de")
  aliquotaPercentual: number;
  parcelaDeduzir: number;
}

/** Tabela progressiva mensal do IRPF vigente desde 05/2024 (Lei nº 14.848/2024) — a
 * mesma tabela usada no recolhimento mensal obrigatório (Carnê-Leão/DARF-Carnê). PODE
 * TER MUDADO desde então: confira a tabela vigente em gov.br/receitafederal antes de
 * usar este cálculo para qualquer finalidade oficial ou pericial. */
export const TABELA_IRPF_MENSAL_PADRAO: FaixaIrpf[] = [
  { ateValor: 2259.2, aliquotaPercentual: 0, parcelaDeduzir: 0 },
  { ateValor: 2826.65, aliquotaPercentual: 7.5, parcelaDeduzir: 169.44 },
  { ateValor: 3751.05, aliquotaPercentual: 15, parcelaDeduzir: 381.44 },
  { ateValor: 4664.68, aliquotaPercentual: 22.5, parcelaDeduzir: 662.77 },
  { ateValor: null, aliquotaPercentual: 27.5, parcelaDeduzir: 896.0 },
];

export function calcularImpostoMensal(baseTributavel: number, tabela: FaixaIrpf[]): { aliquotaPercentual: number; parcelaDeduzir: number; imposto: number } {
  if (baseTributavel <= 0) return { aliquotaPercentual: 0, parcelaDeduzir: 0, imposto: 0 };
  const faixa = tabela.find((f) => f.ateValor === null || baseTributavel <= f.ateValor) ?? tabela[tabela.length - 1];
  const imposto = Math.max(0, baseTributavel * (faixa.aliquotaPercentual / 100) - faixa.parcelaDeduzir);
  return { aliquotaPercentual: faixa.aliquotaPercentual, parcelaDeduzir: faixa.parcelaDeduzir, imposto };
}

export interface CategoriaDedutivel {
  codigo: string;
  descricao: string;
  padraoSelecionada: boolean;
}

/** Categorias do plano de contas oferecidas como candidatas a dedutíveis do Carnê-Leão
 * na tela — a seleção default é CONSERVADORA, não uma verdade fiscal fechada:
 * - 2.1.02 (manutenção/conservação) e 2.1.07 (comissão de administração/plataforma)
 *   vêm marcadas por padrão: são as despesas classicamente aceitas pela Receita
 *   Federal como "necessárias à percepção do rendimento e à manutenção da fonte
 *   pagadora" (art. 694, RIR/2018).
 * - 2.1.01 (condomínio/IPTU) vem DESMARCADA por padrão: quando o contrato tem rateio
 *   de custeio embutido, o reembolso recebido do locatário já foi excluído da renda
 *   tributável (ver rendaTributavel.ts) — deduzir a despesa bruta de novo duplicaria
 *   o benefício. Só marque se tiver certeza de que aquele condomínio/IPTU específico
 *   saiu do bolso do locador, sem repasse ao locatário.
 * - Financiamento (juros/amortização), obra/capex, inadimplência, tarifas bancárias,
 *   despesas administrativas gerais e advocacia ficam de fora e não aparecem na
 *   lista: são custo de aquisição, capital ou não classicamente dedutíveis no
 *   Carnê-Leão mensal.
 * Confirme com um contador antes de usar para qualquer finalidade oficial. */
export const CATEGORIAS_DEDUTIVEIS_CANDIDATAS: CategoriaDedutivel[] = [
  { codigo: "2.1.01", descricao: "Condomínio e IPTU", padraoSelecionada: false },
  { codigo: "2.1.02", descricao: "Manutenção corrente", padraoSelecionada: true },
  { codigo: "2.1.07", descricao: "Taxas de plataforma (Airbnb/imobiliária)", padraoSelecionada: true },
];

export interface LinhaCarneLeaoImovel {
  imovel: Imovel;
  rendaTributavelBruta: number;
  despesaDedutivel: number;
  baseTributavel: number;
  impostoEstimado: number; // fatia do imposto AGREGADO alocada a este imóvel, proporcional à sua base tributável — ver nota em calcularCarneLeaoPorImovel
  resultadoLiquidoPosImposto: number;
}

export interface ResultadoCarneLeaoConsolidado {
  linhas: LinhaCarneLeaoImovel[];
  rendaTributavelBrutaTotal: number;
  despesaDedutivelTotal: number;
  baseTributavelTotal: number;
  aliquotaMarginalConsolidada: number; // a faixa real do contribuinte, aplicada sobre a soma de todos os imóveis
  impostoEstimadoTotal: number;
  resultadoLiquidoPosImpostoTotal: number;
}

function contarMeses(dataInicio: string, dataFim: string): number {
  const inicio = new Date(dataInicio + "T00:00:00");
  const fim = new Date(dataFim + "T00:00:00");
  return Math.max(1, (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()) + 1);
}

/** Simula o Carnê-Leão: o IRPF do Carnê-Leão é um imposto PESSOAL do contribuinte,
 * apurado sobre a SOMA de todos os rendimentos tributáveis recebidos de pessoas físicas
 * no mês (todos os imóveis juntos) — nunca imóvel por imóvel. Um locador com muitas
 * unidades pequenas pode ter cada uma isoladamente abaixo da faixa de isenção mensal
 * (R$ 2.259,20) enquanto a soma de todas cai na faixa de 27,5%; aplicar a tabela
 * progressiva a cada imóvel separadamente subestimaria drasticamente o imposto devido
 * e inflaria artificialmente a renda líquida pós-imposto aparente. Por isso o imposto é
 * calculado UMA VEZ sobre a base agregada (renda tributável de todos os imóveis menos
 * despesa dedutível de todos, média mensal do período x nº de meses — mesma aproximação
 * linear de antes, agora aplicada à base certa) e depois distribuído de volta a cada
 * imóvel proporcionalmente à sua fatia da base tributável total, só para fins de leitura
 * "quanto cada imóvel contribui" — a alíquota marginal exibida é sempre a do agregado,
 * porque é essa a faixa real em que o contribuinte se encontra. */
export function calcularCarneLeaoPorImovel(
  db: Database,
  dataInicio: string,
  dataFim: string,
  codigosDedutiveis: string[],
  tabela: FaixaIrpf[] = TABELA_IRPF_MENSAL_PADRAO,
): ResultadoCarneLeaoConsolidado {
  const imoveis = consultar<Imovel>(db, "SELECT * FROM imoveis WHERE uso_pessoal = 0 ORDER BY apelido");
  const numeroMeses = contarMeses(dataInicio, dataFim);

  const porImovel = imoveis.map((imovel) => {
    // Une transações diretas do imóvel com a fatia de transações rateadas entre vários
    // imóveis (mesmo padrão de gerarDre em dre.ts) — sem isso, receita/despesa rateada
    // (ex.: condomínio coletivo) fica de fora do cálculo para todo imóvel participante.
    const receitaAluguel = consultar<{ codigo: string; valor: number; percentual: number | null }>(
      db,
      `SELECT codigo, valor, percentual FROM (
         SELECT p.codigo AS codigo, t.valor AS valor, c.percentual_aluguel_efetivo AS percentual
         FROM transacoes t
         JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
         LEFT JOIN contratos_locacao c ON c.id = t.contrato_id
         WHERE p.grupo = 'receita' AND t.imovel_id = ? AND t.data BETWEEN ? AND ?
         UNION ALL
         SELECT p.codigo AS codigo, r.valor_rateado AS valor, c.percentual_aluguel_efetivo AS percentual
         FROM rateios r
         JOIN transacoes t ON t.id = r.transacao_id
         JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
         LEFT JOIN contratos_locacao c ON c.id = t.contrato_id
         WHERE p.grupo = 'receita' AND r.imovel_id = ? AND t.data BETWEEN ? AND ?
       )`,
      [imovel.id, dataInicio, dataFim, imovel.id, dataInicio, dataFim],
    );
    // Mesma regra de rendaTributavel.ts::percentualTributavel: só o código de aluguel
    // (1.1.01) tem o percentual do contrato aplicado, reembolso de consumo individualizado
    // (1.1.02) é sempre 0%, e qualquer outra receita (multas, créditos jurídicos, Airbnb)
    // é 100% tributável, mesmo que vinculada a um contrato com rateio embutido.
    const rendaTributavelBruta = receitaAluguel.reduce((acc, l) => acc + l.valor * (percentualTributavel(l.codigo, l.percentual) / 100), 0);

    let despesaDedutivel = 0;
    if (codigosDedutiveis.length > 0) {
      const placeholders = codigosDedutiveis.map(() => "?").join(",");
      const linhas = consultar<{ total: number | null }>(
        db,
        `SELECT SUM(valor) AS total FROM (
           SELECT ABS(t.valor) AS valor FROM transacoes t
           WHERE t.imovel_id = ? AND t.plano_conta_codigo IN (${placeholders}) AND t.data BETWEEN ? AND ?
           UNION ALL
           SELECT ABS(r.valor_rateado) AS valor FROM rateios r
           JOIN transacoes t ON t.id = r.transacao_id
           WHERE r.imovel_id = ? AND t.plano_conta_codigo IN (${placeholders}) AND t.data BETWEEN ? AND ?
         )`,
        [imovel.id, ...codigosDedutiveis, dataInicio, dataFim, imovel.id, ...codigosDedutiveis, dataInicio, dataFim],
      );
      despesaDedutivel = linhas[0]?.total ?? 0;
    }

    const baseTributavel = Math.max(0, rendaTributavelBruta - despesaDedutivel);
    return { imovel, rendaTributavelBruta, despesaDedutivel, baseTributavel };
  });

  const rendaTributavelBrutaTotal = porImovel.reduce((acc, l) => acc + l.rendaTributavelBruta, 0);
  const despesaDedutivelTotal = porImovel.reduce((acc, l) => acc + l.despesaDedutivel, 0);
  const baseTributavelTotal = porImovel.reduce((acc, l) => acc + l.baseTributavel, 0);

  // Imposto calculado UMA ÚNICA VEZ sobre a base agregada de todos os imóveis (ver nota
  // acima) — nunca por imóvel isoladamente.
  const resultadoMensalConsolidado = calcularImpostoMensal(baseTributavelTotal / numeroMeses, tabela);
  const impostoEstimadoTotal = resultadoMensalConsolidado.imposto * numeroMeses;

  const linhas: LinhaCarneLeaoImovel[] = porImovel.map((l): LinhaCarneLeaoImovel => {
    // Fatia do imposto agregado proporcional à participação deste imóvel na base
    // tributável total — puramente informativo (quanto cada imóvel "pesa" no imposto do
    // contribuinte), não um imposto calculado independentemente para ele.
    const impostoEstimado = baseTributavelTotal > 0 ? impostoEstimadoTotal * (l.baseTributavel / baseTributavelTotal) : 0;
    return { ...l, impostoEstimado, resultadoLiquidoPosImposto: l.baseTributavel - impostoEstimado };
  });

  return {
    linhas,
    rendaTributavelBrutaTotal,
    despesaDedutivelTotal,
    baseTributavelTotal,
    aliquotaMarginalConsolidada: resultadoMensalConsolidado.aliquotaPercentual,
    impostoEstimadoTotal,
    resultadoLiquidoPosImpostoTotal: baseTributavelTotal - impostoEstimadoTotal,
  };
}
