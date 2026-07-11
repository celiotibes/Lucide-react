import type { Database } from "sql.js";
import { gerarDre } from "./dre";
import type { GrupoConta } from "../types";

export interface LinhaAnaliseVertical {
  codigo: string;
  descricao: string;
  grupo: GrupoConta;
  total: number;
  percentualSobreReceita: number | null; // null se não houver receita no período
}

/** Cada linha do DRE como % da receita total do período — mostra, por exemplo, que
 * despesa de manutenção consome uma fatia relativamente estável da receita mesmo quando
 * o valor absoluto sobe (a proporção é o que importa para capacidade contributiva, não o
 * número absoluto isolado). */
export function calcularAnaliseVertical(db: Database, dataInicio: string, dataFim: string): LinhaAnaliseVertical[] {
  const linhas = gerarDre(db, dataInicio, dataFim);
  const receitaTotal = linhas.filter((l) => l.grupo === "receita").reduce((acc, l) => acc + l.total, 0);
  return linhas.map((l) => ({
    codigo: l.codigo,
    descricao: l.descricao,
    grupo: l.grupo,
    total: l.total,
    percentualSobreReceita: receitaTotal > 0 ? (Math.abs(l.total) / receitaTotal) * 100 : null,
  }));
}

export interface LinhaAnaliseHorizontal {
  codigo: string;
  descricao: string;
  grupo: GrupoConta;
  totalAtual: number;
  totalAnterior: number;
  variacaoPercentual: number | null; // null se não havia valor no período anterior
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Compara cada linha do DRE do período atual com o período imediatamente anterior de
 * mesma duração (ex: últimos 12 meses × os 12 meses antes disso) — evidencia se o custo
 * de manutenção/obra subiu na mesma proporção da receita (capacidade contributiva
 * estável) ou ficou para trás (capacidade contributiva real caindo apesar da receita
 * bruta subir). */
export function calcularAnaliseHorizontal(db: Database, dataInicio: string, dataFim: string): LinhaAnaliseHorizontal[] {
  const diasPeriodo = Math.round((new Date(dataFim + "T00:00:00").getTime() - new Date(dataInicio + "T00:00:00").getTime()) / 86400000);
  const dataFimAnterior = somarDias(dataInicio, -1);
  const dataInicioAnterior = somarDias(dataFimAnterior, -diasPeriodo);

  const atual = gerarDre(db, dataInicio, dataFim);
  const anterior = gerarDre(db, dataInicioAnterior, dataFimAnterior);
  const porCodigoAnterior = new Map(anterior.map((l) => [l.codigo, l]));
  const porCodigoAtual = new Map(atual.map((l) => [l.codigo, l]));

  const codigos = new Set([...porCodigoAtual.keys(), ...porCodigoAnterior.keys()]);
  const resultado: LinhaAnaliseHorizontal[] = [];
  for (const codigo of codigos) {
    const linhaAtual = porCodigoAtual.get(codigo);
    const linhaAnterior = porCodigoAnterior.get(codigo);
    const totalAtual = linhaAtual?.total ?? 0;
    const totalAnterior = linhaAnterior?.total ?? 0;
    resultado.push({
      codigo,
      descricao: linhaAtual?.descricao ?? linhaAnterior?.descricao ?? codigo,
      grupo: linhaAtual?.grupo ?? linhaAnterior?.grupo ?? "despesa",
      totalAtual,
      totalAnterior,
      variacaoPercentual: totalAnterior !== 0 ? ((Math.abs(totalAtual) - Math.abs(totalAnterior)) / Math.abs(totalAnterior)) * 100 : null,
    });
  }
  return resultado.sort((a, b) => Math.abs(b.totalAtual) - Math.abs(a.totalAtual));
}
