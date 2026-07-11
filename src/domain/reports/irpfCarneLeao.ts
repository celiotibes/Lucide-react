import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { Imovel } from "../types";

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
  aliquotaMarginal: number;
  impostoEstimado: number;
  resultadoLiquidoPosImposto: number;
}

function contarMeses(dataInicio: string, dataFim: string): number {
  const inicio = new Date(dataInicio + "T00:00:00");
  const fim = new Date(dataFim + "T00:00:00");
  return Math.max(1, (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()) + 1);
}

/** Simula o Carnê-Leão por imóvel: renda tributável (já líquida do reembolso de
 * rateio, mesma regra de rendaTributavel.ts) menos despesa dedutível selecionada,
 * imposto aplicado sobre a MÉDIA MENSAL do período e multiplicado de volta pelo
 * número de meses — aproximação para visão consolidada, não substitui a apuração
 * mês a mês real (a tabela é progressiva e não linear; um mês de pico de receita
 * paga alíquota mais alta que a média, então isto tende a subestimar levemente o
 * imposto de períodos com receita muito irregular mês a mês). */
export function calcularCarneLeaoPorImovel(
  db: Database,
  dataInicio: string,
  dataFim: string,
  codigosDedutiveis: string[],
  tabela: FaixaIrpf[] = TABELA_IRPF_MENSAL_PADRAO,
): LinhaCarneLeaoImovel[] {
  const imoveis = consultar<Imovel>(db, "SELECT * FROM imoveis WHERE uso_pessoal = 0 ORDER BY apelido");
  const numeroMeses = contarMeses(dataInicio, dataFim);

  return imoveis.map((imovel): LinhaCarneLeaoImovel => {
    const receitaAluguel = consultar<{ valor: number; percentual: number | null }>(
      db,
      `SELECT t.valor AS valor, c.percentual_aluguel_efetivo AS percentual
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       LEFT JOIN contratos_locacao c ON c.id = t.contrato_id
       WHERE p.grupo = 'receita' AND t.imovel_id = ? AND t.data BETWEEN ? AND ?`,
      [imovel.id, dataInicio, dataFim],
    );
    const rendaTributavelBruta = receitaAluguel.reduce((acc, l) => {
      const percentual = l.percentual !== null ? l.percentual : 100;
      return acc + l.valor * (percentual / 100);
    }, 0);

    let despesaDedutivel = 0;
    if (codigosDedutiveis.length > 0) {
      const placeholders = codigosDedutiveis.map(() => "?").join(",");
      const linhas = consultar<{ total: number | null }>(
        db,
        `SELECT SUM(ABS(valor)) AS total FROM transacoes WHERE imovel_id = ? AND plano_conta_codigo IN (${placeholders}) AND data BETWEEN ? AND ?`,
        [imovel.id, ...codigosDedutiveis, dataInicio, dataFim],
      );
      despesaDedutivel = linhas[0]?.total ?? 0;
    }

    const baseTributavel = Math.max(0, rendaTributavelBruta - despesaDedutivel);
    const resultadoMensal = calcularImpostoMensal(baseTributavel / numeroMeses, tabela);
    const impostoEstimado = resultadoMensal.imposto * numeroMeses;

    return {
      imovel,
      rendaTributavelBruta,
      despesaDedutivel,
      baseTributavel,
      aliquotaMarginal: resultadoMensal.aliquotaPercentual,
      impostoEstimado,
      resultadoLiquidoPosImposto: baseTributavel - impostoEstimado,
    };
  });
}
