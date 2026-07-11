import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarDre, resultadoLiquido } from "./dre";
import type { Imovel } from "../types";

export interface DesempenhoImovel {
  imovel: Imovel;
  receita: number;
  despesa: number;
  resultadoLiquido: number;
}

/** Ranking de resultado líquido por imóvel (não "yield" de verdade — isso exigiria o valor
 * de mercado do imóvel como base, e valor_venal_atual é opcional/nem sempre cadastrado).
 * Exclui imóveis de uso pessoal, mesma regra do DRE agregado. */
export function calcularDesempenhoPorImovel(db: Database, dataInicio: string, dataFim: string): DesempenhoImovel[] {
  const imoveis = consultar<Imovel>(db, "SELECT * FROM imoveis WHERE uso_pessoal = 0 ORDER BY apelido");
  return imoveis
    .map((imovel): DesempenhoImovel => {
      const linhas = gerarDre(db, dataInicio, dataFim, imovel.id);
      const receita = linhas.filter((l) => l.grupo === "receita").reduce((acc, l) => acc + l.total, 0);
      const despesa = Math.abs(linhas.filter((l) => l.grupo === "despesa").reduce((acc, l) => acc + l.total, 0));
      return { imovel, receita, despesa, resultadoLiquido: resultadoLiquido(linhas) };
    })
    .sort((a, b) => b.resultadoLiquido - a.resultadoLiquido);
}

export interface DesempenhoCidade {
  cidade: string;
  receita: number;
  despesa: number;
  resultadoLiquido: number;
  quantidadeImoveis: number;
}

/** Agrega o desempenho por imóvel em centro de custo regional (cidade) — a "nuvem de
 * custos" Floripa × Curitiba: soma direta dos resultados por imóvel de cada cidade. */
export function calcularDesempenhoPorCidade(db: Database, dataInicio: string, dataFim: string): DesempenhoCidade[] {
  const porImovel = calcularDesempenhoPorImovel(db, dataInicio, dataFim);
  const porCidade = new Map<string, DesempenhoCidade>();

  for (const d of porImovel) {
    const cidade = d.imovel.cidade ?? "Sem cidade cadastrada";
    const atual = porCidade.get(cidade) ?? { cidade, receita: 0, despesa: 0, resultadoLiquido: 0, quantidadeImoveis: 0 };
    atual.receita += d.receita;
    atual.despesa += d.despesa;
    atual.resultadoLiquido += d.resultadoLiquido;
    atual.quantidadeImoveis += 1;
    porCidade.set(cidade, atual);
  }

  return Array.from(porCidade.values()).sort((a, b) => b.resultadoLiquido - a.resultadoLiquido);
}
