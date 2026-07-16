import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { DeclaracaoFiscal } from "../types";
import { gerarRendaTributavel } from "./rendaTributavel";

export interface LinhaComparativoFiscal {
  anoCalendario: number;
  rendaReconstituida: number; // soma da renda tributável reconstruída a partir dos extratos bancários reais, no ano
  rendaDeclarada: number | null; // null = nada lançado em declaracoes_fiscais para este ano ainda
  origemDeclarado: "dirpf_anual" | "carne_leao_mensal" | "nenhum";
  mesesComCarneLeaoLancado: number; // só relevante quando origemDeclarado = 'carne_leao_mensal' — sinaliza cobertura parcial do ano
  diferenca: number | null; // reconstituida - declarada; positivo = reconstituída maior que o declarado
  percentualNaoDeclarado: number | null; // diferenca / reconstituida * 100
}

function listarDeclaracoes(db: Database): DeclaracaoFiscal[] {
  return consultar<DeclaracaoFiscal>(db, "SELECT * FROM declaracoes_fiscais ORDER BY ano_calendario, tipo, mes_referencia");
}

/** Compara, ano-calendário a ano-calendário, a renda tributável RECONSTITUÍDA a partir dos
 * extratos bancários reais (gerarRendaTributavel — já líquida do reembolso de rateio e do
 * repasse de consumo individualizado) contra o que foi de fato DECLARADO à Receita Federal
 * (lançado manualmente em declaracoes_fiscais, porque não há API pública para consultar
 * declarações já entregues — mesma limitação de Registrato/SCR documentada em
 * dividas_consumo). Prioriza o valor da DIRPF anual quando existe (é a apuração definitiva
 * do ano); na ausência dela, soma os DARFs de Carnê-Leão mensal lançados, sinalizando quando
 * a cobertura é parcial (menos de 12 meses) para não passar a impressão de que o ano inteiro
 * foi conferido. Sem nenhuma declaração lançada para o ano, rendaDeclarada fica null — nunca
 * se assume "declarado = zero" nem "declarado = reconstituído": ausência de dado é ausência
 * de dado, não uma resposta. */
export function compararDeclaradoXReconstituido(db: Database, dataInicio: string, dataFim: string): LinhaComparativoFiscal[] {
  const linhasRenda = gerarRendaTributavel(db, dataInicio, dataFim);
  const reconstituidaPorAno = new Map<number, number>();
  for (const linha of linhasRenda) {
    const ano = Number.parseInt(linha.mes.slice(0, 4), 10);
    reconstituidaPorAno.set(ano, (reconstituidaPorAno.get(ano) ?? 0) + linha.rendaTributavel);
  }

  const declaracoes = listarDeclaracoes(db);
  const anosDeclarados = new Set(declaracoes.map((d) => d.ano_calendario));
  const todosOsAnos = new Set([...reconstituidaPorAno.keys(), ...anosDeclarados]);

  return Array.from(todosOsAnos)
    .sort((a, b) => a - b)
    .map((ano): LinhaComparativoFiscal => {
      const rendaReconstituida = reconstituidaPorAno.get(ano) ?? 0;
      const declaracoesDoAno = declaracoes.filter((d) => d.ano_calendario === ano);
      const dirpf = declaracoesDoAno.find((d) => d.tipo === "dirpf_anual");
      const carneLeaoMensal = declaracoesDoAno.filter((d) => d.tipo === "carne_leao_mensal");

      let rendaDeclarada: number | null = null;
      let origemDeclarado: LinhaComparativoFiscal["origemDeclarado"] = "nenhum";
      if (dirpf) {
        rendaDeclarada = dirpf.rendimento_tributavel_declarado;
        origemDeclarado = "dirpf_anual";
      } else if (carneLeaoMensal.length > 0) {
        rendaDeclarada = carneLeaoMensal.reduce((acc, d) => acc + d.rendimento_tributavel_declarado, 0);
        origemDeclarado = "carne_leao_mensal";
      }

      const diferenca = rendaDeclarada !== null ? rendaReconstituida - rendaDeclarada : null;
      const percentualNaoDeclarado = diferenca !== null && rendaReconstituida > 0 ? (diferenca / rendaReconstituida) * 100 : null;

      return {
        anoCalendario: ano,
        rendaReconstituida,
        rendaDeclarada,
        origemDeclarado,
        mesesComCarneLeaoLancado: carneLeaoMensal.length,
        diferenca,
        percentualNaoDeclarado,
      };
    });
}
