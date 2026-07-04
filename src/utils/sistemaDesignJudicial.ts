/**
 * Sistema de Design Judicial
 * Paleta de cores, tipografia e componentes visuais para petições
 * Conforme padrões CNJ e pré-atributos visuais (<5s)
 */

// Paleta de cores judiciais
export const CORES_JUDICIAIS = {
  // Cores primárias (tribunal/autoridade)
  azulPrincipal: '#1A3A52',
  azulEscuro: '#0F2438',
  azulClaro: '#2D5A7B',

  // Cores de crítica (argumentação)
  vermelhoArgumento: '#C41E3A',
  vermelhoCritico: '#D32F2F',

  // Cores de suporte (sustentação)
  verdeApoio: '#2E7D32',
  verdeClaro: '#4CAF50',

  // Cores de atenção (cautelas)
  amareloAviso: '#FFC107',
  laranjaAlerta: '#FF9800',

  // Cores neutras
  cinzaPaginaBg: '#F9F9F9',
  cinzaBorda: '#CCCCCC',
  cinzaTextoSecundario: '#666666',
  pretoTexto: '#000000',
  brancoFundo: '#FFFFFF',
} as const

// Tipografia padrão CNJ
export const TIPOGRAFIA_JUDICIAL = {
  fonteFamilia: {
    principal: '"Arial", "Helvetica", sans-serif',
    monoespacada: '"Courier New", monospace',
  },
  tamanhos: {
    h1: '16pt',
    h2: '14pt',
    h3: '13pt',
    h4: '12pt',
    corpo: '12pt',
    rodape: '10pt',
    legenda: '10pt',
  },
  pesos: {
    normal: 400,
    bold: 700,
  },
  linhas: {
    espacamento: 1.5,
    minimo: '12pt',
  },
} as const

// Margens padrão por tribunal
export const MARGENS_TRIBUNAL = {
  padrao: {
    topo: '2.5cm',
    direita: '2.5cm',
    fundo: '2.5cm',
    esquerda: '3cm',
  },
  visual: {
    pequeno: '0.5cm',
    medio: '1cm',
    grande: '2cm',
  },
} as const

// Espaçamento visual (pré-atributos <5s)
export const ESPACAMENTO_PRE_ATENTIVO = {
  microEspacamento: '2px',
  pequeno: '4px',
  medio: '8px',
  grande: '16px',
  extraGrande: '24px',
  secao: '2cm',
} as const

// Classes de força probatória com cores e espaçamento
export const FORCA_PROVA = {
  alta: {
    cor: CORES_JUDICIAIS.verdeApoio,
    corFundo: '#E8F5E9',
    peso: 'bold',
    larguraBarraVisual: '80-100%',
    icone: '●●●',
  },
  moderada: {
    cor: CORES_JUDICIAIS.amareloAviso,
    corFundo: '#FFF8E1',
    peso: 'normal',
    larguraBarraVisual: '50-80%',
    icone: '●●○',
  },
  fragil: {
    cor: CORES_JUDICIAIS.vermelhoCritico,
    corFundo: '#FFEBEE',
    peso: 'normal',
    larguraBarraVisual: '<50%',
    icone: '●○○',
  },
} as const

// Componentes de hermenêutica (4 pilares)
export const HERMENAUTICA_PILARES = {
  ethos: {
    titulo: 'ETHOS (Credibilidade)',
    cor: CORES_JUDICIAIS.azulPrincipal,
    descricao: 'Autoridade e confiabilidade das provas',
  },
  pathos: {
    titulo: 'PATHOS (Justiça)',
    cor: CORES_JUDICIAIS.vermelhoArgumento,
    descricao: 'Apelo à justiça e equidade',
  },
  logos: {
    titulo: 'LOGOS (Lógica)',
    cor: CORES_JUDICIAIS.verdeApoio,
    descricao: 'Estrutura lógica do silogismo jurídico',
  },
  kairos: {
    titulo: 'KAIROS (Oportunidade)',
    cor: CORES_JUDICIAIS.amareloAviso,
    descricao: 'Oportunidade e tempestividade',
  },
} as const

// Validação semântica HTML
export const VALIDACAO_SEMANTICA = {
  h1: { minimo: 1, maximo: 1, css: 'color: ' + CORES_JUDICIAIS.azulPrincipal },
  h2: { minimo: 0, maximo: 10 },
  h3: { minimo: 0, maximo: 20 },
  tabelas: { deveTerThead: true, deveTerTbody: true },
  listas: { deveUsarUlOlLi: true },
  links: { deveTerHref: true },
  imagens: { deveTerAlt: true },
} as const

// Utilitários para gerar CSS dinâmico
export function gerarCssBarraForca(forca: 'alta' | 'moderada' | 'fragil'): string {
  const config = FORCA_PROVA[forca]
  return `
    background-color: ${config.corFundo};
    border-left: 4px solid ${config.cor};
    color: ${config.cor};
    font-weight: ${config.peso};
  `
}

export function gerarCssHeadingJudicial(nivel: 1 | 2 | 3 | 4): string {
  const tamanho = {
    1: TIPOGRAFIA_JUDICIAL.tamanhos.h1,
    2: TIPOGRAFIA_JUDICIAL.tamanhos.h2,
    3: TIPOGRAFIA_JUDICIAL.tamanhos.h3,
    4: TIPOGRAFIA_JUDICIAL.tamanhos.h4,
  }[nivel]

  return `
    font-family: ${TIPOGRAFIA_JUDICIAL.fonteFamilia.principal};
    font-size: ${tamanho};
    font-weight: ${TIPOGRAFIA_JUDICIAL.pesos.bold};
    color: ${CORES_JUDICIAIS.azulPrincipal};
    margin-top: ${ESPACAMENTO_PRE_ATENTIVO.grande};
    margin-bottom: ${ESPACAMENTO_PRE_ATENTIVO.medio};
    page-break-after: avoid;
    orphans: 3;
    widows: 3;
  `
}

export function gerarCssCorporo(): string {
  return `
    font-family: ${TIPOGRAFIA_JUDICIAL.fonteFamilia.principal};
    font-size: ${TIPOGRAFIA_JUDICIAL.tamanhos.corpo};
    line-height: ${TIPOGRAFIA_JUDICIAL.linhas.espacamento};
    color: ${CORES_JUDICIAIS.pretoTexto};
    text-align: justify;
    hyphens: auto;
  `
}

// Validador semântico
export function validarSemanticaBasica(html: string): {
  valido: boolean
  avisos: string[]
  erros: string[]
} {
  const avisos: string[] = []
  const erros: string[] = []

  // Contar H1s
  const h1s = (html.match(/<h1[^>]*>/gi) || []).length
  if (h1s === 0) {
    erros.push('Documento deve ter exatamente 1 tag H1')
  } else if (h1s > 1) {
    avisos.push(`Documento tem ${h1s} tags H1 (recomendado: 1)`)
  }

  // Verificar tabelas com thead/tbody
  const tabelas = (html.match(/<table[^>]*>/gi) || []).length
  if (tabelas > 0) {
    const tabelasComThead = (
      html.match(/<table[^>]*>[\s\S]*?<thead/i) || []
    ).length
    if (tabelasComThead < tabelas) {
      avisos.push(
        `${tabelas - tabelasComThead} tabelas sem <thead> (recomendado: incluir)`
      )
    }
  }

  // Verificar listas
  const listas = (html.match(/(<ul>|<ol>)/gi) || []).length
  const listasComLi = (html.match(/(<ul>|<ol>)[\s\S]*?<li/i) || []).length
  if (listas > listasComLi) {
    avisos.push('Algumas listas não contêm itens <li>')
  }

  // Verificar links
  const links = (html.match(/<a[^>]*>/gi) || []).length
  const linksComHref = (html.match(/<a[^>]*href="[^"]+"/gi) || []).length
  if (links > linksComHref) {
    erros.push(`${links - linksComHref} links sem href`)
  }

  // Verificar imagens
  const imagens = (html.match(/<img[^>]*>/gi) || []).length
  const imagensComAlt = (html.match(/<img[^>]*alt="[^"]+"/gi) || []).length
  if (imagens > imagensComAlt) {
    avisos.push(
      `${imagens - imagensComAlt} imagens sem alt text (recomendado: incluir)`
    )
  }

  return {
    valido: erros.length === 0,
    avisos,
    erros,
  }
}

// Conversão de unidades
export function emParaPx(em: number): number {
  return em * 16 // Assume 16px base
}

export function cmParaPx(cm: number): number {
  return cm * 37.795 // 1cm = 37.795px
}

export function ptParaPx(pt: number): number {
  return pt * 1.333 // 1pt ≈ 1.333px
}
