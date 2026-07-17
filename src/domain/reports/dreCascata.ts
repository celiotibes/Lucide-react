import type { LinhaDre } from "../types";

export interface EtapaCascataDre {
  rotulo: string;
  base: number; // onde a barra começa no eixo Y (o menor entre o acumulado antes e depois desta etapa)
  altura: number; // |delta| desta etapa — a altura visual da barra
  valor: number; // delta real (positivo = receita, negativo = despesa); no total final é o acumulado inteiro do período
  tipo: "receita" | "despesa" | "total";
}

/** Cascata (waterfall) do DRE: Receita Bruta → cada categoria de despesa, da maior para a
 * menor, "pendurada" no acumulado da barra anterior → Resultado líquido. Diferente da tabela
 * "Resultado por imóvel/cidade" (que mostra cada total isolado), a cascata mostra visualmente
 * COMO o resultado foi corroído passo a passo — a mesma leitura de uma demonstração de
 * resultado, só que em barra em vez de linha de texto. Não recalcula nada: consome as mesmas
 * linhas de gerarDre() já usadas no restante do Painel, então nunca diverge do resto da tela. */
export function gerarCascataDre(linhas: LinhaDre[]): EtapaCascataDre[] {
  const receitaBruta = linhas.filter((l) => l.grupo === "receita").reduce((acc, l) => acc + l.total, 0);
  const despesas = linhas
    .filter((l) => l.grupo === "despesa")
    .slice()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const etapas: EtapaCascataDre[] = [
    { rotulo: "Receita bruta", base: 0, altura: Math.abs(receitaBruta), valor: receitaBruta, tipo: "receita" },
  ];

  let acumulado = receitaBruta;
  for (const d of despesas) {
    const inicio = acumulado;
    const fim = acumulado + d.total; // d.total já vem negativo (padrão de gerarDre)
    etapas.push({ rotulo: d.descricao, base: Math.min(inicio, fim), altura: Math.abs(d.total), valor: d.total, tipo: "despesa" });
    acumulado = fim;
  }

  etapas.push({ rotulo: "Resultado líquido", base: 0, altura: Math.abs(acumulado), valor: acumulado, tipo: "total" });
  return etapas;
}
