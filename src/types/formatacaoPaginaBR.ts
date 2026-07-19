/**
 * Formatação de Página Judicial
 * Configuração CSS @page para petições com padrões de tribunal
 * Conforme padrões TJPR, TJSC, TRF4, JFPR
 */

export type Tribunal = 'TJPR' | 'TJSC' | 'TJMT' | 'TJRO' | 'TRF4' | 'JFPR'
export type TamanhoPagina = 'A4' | 'A3'
export type Orientacao = 'retrato' | 'paisagem'

export interface ConfiguracaoPaginaJudicial {
  tribunal: Tribunal
  tamanho: TamanhoPagina
  orientacao: Orientacao
  margens: MargensPagina
  cabecalho: CabecalhoPagina
  rodape: RodapePagina
  espacamento: EspacamentoPagina
  tipografia: TipografiaPagina
}

export interface MargensPagina {
  topo: string // '2.5cm'
  direita: string // '2.5cm'
  fundo: string // '2.5cm'
  esquerda: string // '3cm'
}

export interface CabecalhoPagina {
  altura: string // '1.5cm'
  conteudoEsquerda: string // Nome do tribunal
  conteudoCentro: string // Número da petição
  conteudoDireita: string // Espécie de ação
  linhaDivisoria: boolean
  corLinha: string // '#1A3A52'
}

export interface RodapePagina {
  altura: string // '1cm'
  conteudo: string // 'Página [página] de [páginas]'
  numeracao: boolean
  dataHora: boolean
  linhaDivisoria: boolean
  fonteTamanho: string // '10pt'
}

export interface EspacamentoPagina {
  entreLinhas: number // 1.5
  paragrafoAntes: string // '0.5cm'
  paragrafoDepois: string // '0.5cm'
  tituloSecaoAntes: string // '1cm'
  tituloSecaoDepois: string // '0.5cm'
  tabelaPadrao: boolean
  larguraTabela: string // '100%'
}

export interface TipografiaPagina {
  fontePrincipal: string // 'Arial, Helvetica, sans-serif'
  tamanhoBase: string // '12pt'
  tamanhoH1: string // '16pt'
  tamanhoH2: string // '14pt'
  tamanhoH3: string // '13pt'
  tamanhoH4: string // '12pt'
  tamanhoH5: string // '11pt'
  tamanhoH6: string // '10pt'
  tamanhoRodape: string // '10pt'
  corfontePrincipal: string // '#000000'
  pesoH1: string // 'bold'
  pesoH2: string // 'bold'
  cffamiliaMonoespacado: string // 'Courier New, monospace'
}

export interface ConfiguracaoQuebrapagina {
  aposSecaoPrincipal: boolean
  aposResumoProva: boolean
  aposMatrizJurimetria: boolean
  aposHermenautica: boolean
  minimovLinhastantes: number // Mínimo de linhas antes de quebra
}

export interface EspequeSemanticaHtml {
  h1: EspequeElemento
  h2: EspequeElemento
  h3: EspequeElemento
  tabela: EspequeTabela
  lista: EspequeElemento
  citacao: EspequeElemento
}

export interface EspequeElemento {
  valido: boolean
  erros: string[]
  avisos: string[]
}

export interface EspequeTabela {
  temThead: boolean
  temTbody: boolean
  temCaption: boolean
  linhasUniformes: boolean
  celulasvazias: boolean
  erros: string[]
}

export interface PetiacaoFormatada {
  html: string
  cssEmbarcado: string
  htmlCompleto: string // HTML com <!DOCTYPE>, <head>, <body>
  metadadosPagina: {
    numeroPaginas: number
    numeroParagrafos: number
    numeroTabelas: number
    numeroSeccoes: number
    validacaoSemantica: ValidacaoSemantica
  }
}

export interface ValidacaoSemantica {
  htmlValido: boolean
  estruturaHeadings: boolean // H1-H6 sequencial
  tabelasStructuradas: boolean // <thead>, <tbody>
  listasPropriaS: boolean // <ul>, <ol>, <li>
  linksAtivos: boolean // href preenchido
  imagenscomAlt: boolean // alt text presente
  contrasteCores: boolean // WCAG AA
  avisos: string[]
  erros: string[]
}

export interface TemplateSecaoPeticao {
  titulo: string
  nivelHeading: 'h1' | 'h2' | 'h3' | 'h4'
  conteudo: string
  quebraPagemAntes: boolean
  quebraPagemDepois: boolean
  indentacao: number // 0-5
  classes: string[]
}

export interface ConfiguracaoPadraoesbr {
  TJPR: ConfiguracaoPaginaJudicial
  TJSC: ConfiguracaoPaginaJudicial
  TJMT: ConfiguracaoPaginaJudicial
  TJRO: ConfiguracaoPaginaJudicial
  TRF4: ConfiguracaoPaginaJudicial
  JFPR: ConfiguracaoPaginaJudicial
}
