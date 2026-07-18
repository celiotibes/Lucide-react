// Motor de substituição de variáveis para os modelos de contrato
// (Legal Design/Visual Law em HTML — `docs/27-motor-de-contratos.md`).
//
// Deliberadamente simples em vez de puxar Handlebars como dependência
// nova: só dois recursos são realmente necessários aqui — substituição
// escapada de `{{variavel}}` (segurança: o campo "pedidos específicos do
// inquilino" é texto livre digitado por alguém, e vira HTML injetado no
// documento — sem escapar isso é uma injeção de HTML de manual) e um
// bloco de repetição `{{#each lista}}...{{/each}}` (tabela de mobília,
// lista de locatários/solidários). Se o catálogo de modelos crescer e
// precisar de condicionais/parciais, trocar por Handlebars é uma mudança
// isolada nesta única função — nada que a chama precisa saber como o
// merge é feito por dentro.

export type ValorTemplate = string | number | null | undefined;
export type LinhaTemplate = Record<string, ValorTemplate>;
export interface DadosTemplate {
  [chave: string]: ValorTemplate | LinhaTemplate[];
}

const REGEX_EACH = /\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const REGEX_VARIAVEL_CRUA = /\{\{\{([\w.]+)\}\}\}/g;
const REGEX_VARIAVEL_ESCAPADA = /\{\{([\w.]+)\}\}/g;

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paraTexto(valor: ValorTemplate): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

export function mesclarTemplate(corpoHtml: string, dados: DadosTemplate): string {
  let resultado = corpoHtml.replace(REGEX_EACH, (_match, chaveLista: string, blocoInterno: string) => {
    const lista = dados[chaveLista];
    if (!Array.isArray(lista)) return '';
    return lista
      .map((linha) =>
        blocoInterno
          .replace(REGEX_VARIAVEL_CRUA, (_m, campo: string) => paraTexto(linha[campo]))
          .replace(REGEX_VARIAVEL_ESCAPADA, (_m, campo: string) => escaparHtml(paraTexto(linha[campo]))),
      )
      .join('');
  });

  resultado = resultado.replace(REGEX_VARIAVEL_CRUA, (_match, chave: string) => paraTexto(dados[chave] as ValorTemplate));
  resultado = resultado.replace(REGEX_VARIAVEL_ESCAPADA, (_match, chave: string) =>
    escaparHtml(paraTexto(dados[chave] as ValorTemplate)),
  );

  return resultado;
}

// "Cláusulas Adicionais" do formulário é uma textarea de texto livre —
// cada parágrafo (separado por linha em branco) vira um <p> próprio no
// HTML final, escapado (mesma razão de `escaparHtml` acima).
export function paragrafosParaHtml(textoLivre: string | null | undefined): string {
  if (!textoLivre || !textoLivre.trim()) return '';
  return textoLivre
    .split(/\n{2,}/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean)
    .map((paragrafo) => `<p>${escaparHtml(paragrafo)}</p>`)
    .join('\n');
}
