import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface NoFluxo {
  name: string;
  coluna: 0 | 1 | 2; // 0 = origem (receita), 1 = conta bancária, 2 = destino (despesa) — decidido pela própria montagem do grafo, nunca pela profundidade topológica que o recharts calcula (uma conta sem receita nenhuma roteada por ela vira "raiz" sem link de entrada e quebraria a classificação por depth)
  /** imóvel do qual essa origem é receita — null quando o nó não é receita de um imóvel
   * específico (outra entrada de crédito, "Outras origens" agrupada, ou nó de conta/destino).
   * Usado pro drill-down: clicar num nó de origem ligado a imóvel filtra Transações por ele. */
  imovelId: number | null;
  /** código do plano de contas representativo do nó — presente em origem sem imóvel (ex:
   * salário) e em destino de despesa com categoria própria; null em "Outras origens/despesas"
   * (agregam mais de uma categoria, não haveria um único código pra filtrar) e em nós de conta. */
  codigo: string | null;
}

export interface LigacaoFluxo {
  source: number;
  target: number;
  value: number;
}

export interface FluxoFinanceiro {
  nodes: NoFluxo[];
  links: LigacaoFluxo[];
}

const MAX_ORIGENS = 8;
const MAX_CATEGORIAS = 8;

/** Agrupa uma lista de {chave, valor} nos N maiores por valor, somando o resto sob
 * `rotuloResto` — mesma ideia em dois lugares deste arquivo (origem, categoria de destino),
 * extraída para não repetir a lógica de "top N + resto" duas vezes. */
function agruparTopN(itens: { chave: string; valor: number }[], maxItens: number, rotuloResto: string): Map<string, number> {
  const ordenado = [...itens].sort((a, b) => b.valor - a.valor);
  const resultado = new Map<string, number>();
  ordenado.slice(0, maxItens).forEach((i) => resultado.set(i.chave, (resultado.get(i.chave) ?? 0) + i.valor));
  const resto = ordenado.slice(maxItens).reduce((acc, i) => acc + i.valor, 0);
  if (resto > 0) resultado.set(rotuloResto, (resultado.get(rotuloResto) ?? 0) + resto);
  return resultado;
}

/** Monta o diagrama de fluxo (Sankey): de onde o dinheiro entra (imóvel que gerou aluguel,
 * ou outra fonte de receita/renda como salário) → por qual conta bancária passou → para
 * onde saiu (categoria de despesa, incluindo despesas pessoais e financiamento). O ponto
 * forense do diagrama: mostrar visualmente que receita de aluguel e renda pessoal (salário)
 * atravessam as MESMAS contas de onde saem despesas pessoais — a mistura de fluxo de caixa
 * PF/atividade que sustenta o caso.
 *
 * "Origem" inclui tanto receita da atividade (grupo='receita', rotulada pelo imóvel) quanto
 * qualquer outra entrada de dinheiro na mesma conta (qualquer conta/natureza='credito' fora
 * de receita/transferência, ex: salário — grupo='pessoal' mas natureza='credito' — rotulada
 * pela descrição da conta contábil). Sem isso, salário apareceria incorretamente como
 * "destino" de despesa, já que a query de despesa antes só filtrava por grupo, não por
 * natureza. "Destino" é sempre natureza='debito' (saída de fato). Exclui transferência entre
 * contas próprias e caução (grupo 'transferencia') dos dois lados: contar como origem ou
 * destino criaria dupla contagem quando o dinheiro só está mudando de conta, não sendo de
 * fato recebido/gasto. Limita a MAX_ORIGENS/MAX_CATEGORIAS maiores nós de cada lado (o resto
 * agrupado em "Outras origens/Outras despesas") para o diagrama continuar legível com
 * portfólios grandes — sem isso, uma carteira de 30+ imóveis vira um emaranhado ilegível. */
export function gerarFluxoFinanceiro(db: Database, dataInicio: string, dataFim: string): FluxoFinanceiro {
  const linhasEntrada = consultar<{ origem: string; conta: string; imovel_id: number | null; codigo: string; valor: number }>(
    db,
    `SELECT
        CASE WHEN p.grupo = 'receita' THEN COALESCE(i.apelido, 'Sem imóvel vinculado') ELSE p.descricao END AS origem,
        cb.banco || ' ' || cb.numero AS conta,
        i.id AS imovel_id,
        p.codigo AS codigo,
        SUM(t.valor) AS valor
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     JOIN contas_bancarias cb ON cb.id = t.conta_id
     LEFT JOIN imoveis i ON i.id = t.imovel_id
     WHERE p.natureza = 'credito' AND p.grupo != 'transferencia' AND t.data BETWEEN ? AND ?
     GROUP BY origem, conta, imovel_id, codigo
     HAVING SUM(t.valor) > 0`,
    [dataInicio, dataFim],
  );

  const linhasSaida = consultar<{ conta: string; categoria: string; codigo: string; valor: number }>(
    db,
    `SELECT cb.banco || ' ' || cb.numero AS conta, p.descricao AS categoria, p.codigo AS codigo, SUM(ABS(t.valor)) AS valor
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     JOIN contas_bancarias cb ON cb.id = t.conta_id
     WHERE p.natureza = 'debito' AND p.grupo != 'transferencia' AND t.data BETWEEN ? AND ?
     GROUP BY conta, categoria, codigo
     HAVING SUM(ABS(t.valor)) > 0`,
    [dataInicio, dataFim],
  );

  // Top N origens (por soma total, somando todas as contas) e top N categorias de destino
  // (por soma total) definem quais nós aparecem nomeados; o resto agrupa.
  const totalPorOrigem = new Map<string, number>();
  for (const l of linhasEntrada) totalPorOrigem.set(l.origem, (totalPorOrigem.get(l.origem) ?? 0) + l.valor);
  const origensAgrupadas = agruparTopN(
    Array.from(totalPorOrigem, ([chave, valor]) => ({ chave, valor })),
    MAX_ORIGENS,
    "Outras origens",
  );
  const nomesOrigensPermitidas = new Set(origensAgrupadas.keys());

  const totalPorCategoria = new Map<string, number>();
  for (const l of linhasSaida) totalPorCategoria.set(l.categoria, (totalPorCategoria.get(l.categoria) ?? 0) + l.valor);
  const categoriasAgrupadas = agruparTopN(
    Array.from(totalPorCategoria, ([chave, valor]) => ({ chave, valor })),
    MAX_CATEGORIAS,
    "Outras despesas",
  );
  const nomesCategoriasPermitidas = new Set(categoriasAgrupadas.keys());

  function nomeOrigemExibida(origem: string): string {
    return nomesOrigensPermitidas.has(origem) ? origem : "Outras origens";
  }
  function nomeCategoriaExibida(categoria: string): string {
    return nomesCategoriasPermitidas.has(categoria) ? categoria : "Outras despesas";
  }

  // Metadados por nome de nó exibido — capturados ANTES de montar os nós, pro drill-down (ver
  // NoFluxo): "Outras origens/Outras despesas" ficam de fora de propósito (agregam mais de uma
  // categoria/imóvel, não haveria alvo único pra filtrar Transações).
  const metadataOrigemPorNome = new Map<string, { imovelId: number | null; codigo: string | null }>();
  for (const l of linhasEntrada) {
    const nome = nomeOrigemExibida(l.origem);
    if (nome === "Outras origens" || metadataOrigemPorNome.has(nome)) continue;
    metadataOrigemPorNome.set(nome, { imovelId: l.imovel_id, codigo: l.imovel_id === null ? l.codigo : null });
  }
  const metadataDestinoPorNome = new Map<string, { codigo: string | null }>();
  for (const l of linhasSaida) {
    const nome = nomeCategoriaExibida(l.categoria);
    if (nome === "Outras despesas" || metadataDestinoPorNome.has(nome)) continue;
    metadataDestinoPorNome.set(nome, { codigo: l.codigo });
  }

  // Monta os nós com a coluna decidida explicitamente por qual papel exerce no grafo (nunca
  // pela profundidade topológica calculada pelo recharts — uma conta que só recebe despesa
  // nesta janela, sem nenhuma origem roteada por ela, não teria link de entrada e o recharts
  // a trataria como "raiz" da mesma profundidade das origens reais). Como os três universos
  // de nome (imóvel/descrição de origem, "banco número", descrição de categoria de despesa)
  // não se sobrepõem na prática, cada nome é inequivocamente de uma única coluna.
  const nodes: NoFluxo[] = [];
  const indicePorNome = new Map<string, number>();
  function indiceDoNo(name: string, coluna: 0 | 1 | 2): number {
    const existente = indicePorNome.get(name);
    if (existente !== undefined) return existente;
    const indice = nodes.length;
    const metadata = coluna === 0 ? metadataOrigemPorNome.get(name) : coluna === 2 ? metadataDestinoPorNome.get(name) : undefined;
    nodes.push({ name, coluna, imovelId: (metadata as { imovelId?: number | null })?.imovelId ?? null, codigo: metadata?.codigo ?? null });
    indicePorNome.set(name, indice);
    return indice;
  }

  // Mapa aninhado (origem -> destino -> valor) em vez de chave-string concatenada: nomes de
  // imóvel/banco/categoria são texto livre e não têm por que ser seguros como delimitador.
  function somarNoMapaAninhado(mapa: Map<string, Map<string, number>>, origem: string, destino: string, valor: number): void {
    const destinos = mapa.get(origem) ?? new Map<string, number>();
    destinos.set(destino, (destinos.get(destino) ?? 0) + valor);
    mapa.set(origem, destinos);
  }

  const linksOrigemConta = new Map<string, Map<string, number>>();
  for (const l of linhasEntrada) somarNoMapaAninhado(linksOrigemConta, nomeOrigemExibida(l.origem), l.conta, l.valor);

  const linksContaCategoria = new Map<string, Map<string, number>>();
  for (const l of linhasSaida) somarNoMapaAninhado(linksContaCategoria, l.conta, nomeCategoriaExibida(l.categoria), l.valor);

  const links: LigacaoFluxo[] = [];
  for (const [origem, destinos] of linksOrigemConta) {
    for (const [destino, valor] of destinos) links.push({ source: indiceDoNo(origem, 0), target: indiceDoNo(destino, 1), value: valor });
  }
  for (const [origem, destinos] of linksContaCategoria) {
    for (const [destino, valor] of destinos) links.push({ source: indiceDoNo(origem, 1), target: indiceDoNo(destino, 2), value: valor });
  }

  return { nodes, links };
}
