/**
 * Serviço de Formatação de Página Judicial
 * Geração CSS @page para petições conforme padrões de tribunal
 * Implementa regras de quebra de página, cabeçalhos, rodapés
 */

import type {
  
  Tribunal,
  PetiacaoFormatada,
  ValidacaoSemantica,
  
  ConfiguracaoPadraoesbr,
} from '@/types/formatacaoPaginaBR'

export class ServicoFormatacaoPaginaBR {
  /**
   * Configurações padrão por tribunal
   */
  static CONFIGURACOES_PADRAO: ConfiguracaoPadraoesbr = {
    TJPR: {
      tribunal: 'TJPR',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: {
        topo: '2.5cm',
        direita: '2.5cm',
        fundo: '2.5cm',
        esquerda: '3cm',
      },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'TRIBUNAL DE JUSTIÇA DO PARANÁ',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
    TJSC: {
      tribunal: 'TJSC',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: {
        topo: '2.5cm',
        direita: '2.5cm',
        fundo: '2.5cm',
        esquerda: '3cm',
      },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'TRIBUNAL DE JUSTIÇA DE SANTA CATARINA',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
    TRF4: {
      tribunal: 'TRF4',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: {
        topo: '2.5cm',
        direita: '2.5cm',
        fundo: '2.5cm',
        esquerda: '3cm',
      },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'TRIBUNAL REGIONAL FEDERAL DA 4ª REGIÃO',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
    TJMT: {
      tribunal: 'TJMT',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: { topo: '2.5cm', direita: '2.5cm', fundo: '2.5cm', esquerda: '3cm' },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'TRIBUNAL DE JUSTIÇA DE MATO GROSSO',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
    TJRO: {
      tribunal: 'TJRO',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: { topo: '2.5cm', direita: '2.5cm', fundo: '2.5cm', esquerda: '3cm' },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'TRIBUNAL DE JUSTIÇA DE RONDÔNIA',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
    JFPR: {
      tribunal: 'JFPR',
      tamanho: 'A4',
      orientacao: 'retrato',
      margens: { topo: '2.5cm', direita: '2.5cm', fundo: '2.5cm', esquerda: '3cm' },
      cabecalho: {
        altura: '1.5cm',
        conteudoEsquerda: 'JUSTIÇA FEDERAL - PARANÁ',
        conteudoCentro: '',
        conteudoDireita: '',
        linhaDivisoria: true,
        corLinha: '#1A3A52',
      },
      rodape: {
        altura: '1cm',
        conteudo: 'Página [página] de [páginas]',
        numeracao: true,
        dataHora: false,
        linhaDivisoria: true,
        fonteTamanho: '10pt',
      },
      espacamento: {
        entreLinhas: 1.5,
        paragrafoAntes: '0.5cm',
        paragrafoDepois: '0.5cm',
        tituloSecaoAntes: '1cm',
        tituloSecaoDepois: '0.5cm',
        tabelaPadrao: true,
        larguraTabela: '100%',
      },
      tipografia: {
        fontePrincipal: 'Arial, Helvetica, sans-serif',
        tamanhoBase: '12pt',
        tamanhoH1: '16pt',
        tamanhoH2: '14pt',
        tamanhoH3: '13pt',
        tamanhoH4: '12pt',
        tamanhoH5: '11pt',
        tamanhoH6: '10pt',
        tamanhoRodape: '10pt',
        corfontePrincipal: '#000000',
        pesoH1: 'bold',
        pesoH2: 'bold',
        cffamiliaMonoespacado: 'Courier New, monospace',
      },
    },
  }

  /**
   * Gera CSS @page completo para formatação judicial
   */
  static gerarCssPageJudicial(tribunal: Tribunal): string {
    const config = this.CONFIGURACOES_PADRAO[tribunal]

    return `
/* ========================================
   FORMATAÇÃO JUDICIAL - ${tribunal}
   CSS @page para impressão/PDF
   ======================================== */

@page {
  size: A4 ${config.orientacao === 'paisagem' ? 'landscape' : 'portrait'};
  margin-top: ${config.margens.topo};
  margin-right: ${config.margens.direita};
  margin-bottom: ${config.margens.fundo};
  margin-left: ${config.margens.esquerda};

  /* Cabeçalho */
  @top-left {
    content: "${config.cabecalho.conteudoEsquerda}";
    font-size: 10pt;
    font-weight: bold;
    color: ${config.cabecalho.corLinha};
    padding-bottom: 0.5cm;
    border-bottom: 1px solid ${config.cabecalho.corLinha};
  }

  @top-center {
    content: "${config.cabecalho.conteudoCentro}";
    font-size: 10pt;
    color: ${config.cabecalho.corLinha};
  }

  @top-right {
    content: "${config.cabecalho.conteudoDireita}";
    font-size: 10pt;
    color: ${config.cabecalho.corLinha};
  }

  /* Rodapé */
  @bottom-left {
    content: "";
  }

  @bottom-center {
    content: "Página " counter(page) " de " counter(pages);
    font-size: ${config.rodape.fonteTamanho};
    padding-top: 0.5cm;
    border-top: 1px solid #999;
  }

  @bottom-right {
    content: "";
  }
}

/* Primeira página - margem superior aumentada para caption */
@page :first {
  margin-top: 3.5cm;
}

/* Páginas em branco */
@page :blank {
  display: none;
}

/* ========================================
   ESTILOS DE CORPO
   ======================================== */

* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}

body {
  font-family: ${config.tipografia.fontePrincipal};
  font-size: ${config.tipografia.tamanhoBase};
  color: ${config.tipografia.corfontePrincipal};
  line-height: ${config.espacamento.entreLinhas};
  text-align: justify;
  margin: 0;
  padding: 0;
}

p {
  margin-top: ${config.espacamento.paragrafoAntes};
  margin-bottom: ${config.espacamento.paragrafoDepois};
  text-align: justify;
  orphans: 2;
  widows: 2;
}

/* ========================================
   ESTILOS DE HEADING
   ======================================== */

h1 {
  font-size: ${config.tipografia.tamanhoH1};
  font-weight: ${config.tipografia.pesoH1};
  margin-top: ${config.espacamento.tituloSecaoAntes};
  margin-bottom: ${config.espacamento.tituloSecaoDepois};
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

h2 {
  font-size: ${config.tipografia.tamanhoH2};
  font-weight: ${config.tipografia.pesoH2};
  margin-top: ${config.espacamento.tituloSecaoAntes};
  margin-bottom: ${config.espacamento.tituloSecaoDepois};
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
  color: ${config.cabecalho.corLinha};
}

h3 {
  font-size: ${config.tipografia.tamanhoH3};
  margin-top: 0.8cm;
  margin-bottom: 0.4cm;
  page-break-after: avoid;
  orphans: 2;
  widows: 2;
}

h4 {
  font-size: ${config.tipografia.tamanhoH4};
  margin-top: 0.6cm;
  margin-bottom: 0.3cm;
  page-break-after: avoid;
}

h5 {
  font-size: ${config.tipografia.tamanhoH5};
  margin-top: 0.4cm;
  margin-bottom: 0.2cm;
}

h6 {
  font-size: ${config.tipografia.tamanhoH6};
  margin-top: 0.3cm;
  margin-bottom: 0.1cm;
}

/* ========================================
   ESTILOS DE TABELA
   ======================================== */

table {
  width: ${config.espacamento.larguraTabela};
  border-collapse: collapse;
  margin: ${config.espacamento.paragrafoAntes} 0;
  page-break-inside: avoid;
  font-size: 11pt;
}

thead {
  background-color: #f0f0f0;
  page-break-after: avoid;
}

thead tr {
  page-break-after: avoid;
}

thead th {
  background-color: #f0f0f0;
  border: 1px solid #999;
  padding: 0.5cm;
  font-weight: bold;
  text-align: left;
  page-break-inside: avoid;
}

tbody tr {
  page-break-inside: avoid;
  border-bottom: 1px solid #ddd;
}

tbody tr:nth-child(even) {
  background-color: #fafafa;
}

tbody td {
  border: 1px solid #ddd;
  padding: 0.4cm;
  text-align: left;
  page-break-inside: avoid;
}

/* ========================================
   ESTILOS DE LISTA
   ======================================== */

ul, ol {
  margin: ${config.espacamento.paragrafoAntes} 0;
  padding-left: 1.5cm;
  page-break-inside: avoid;
}

li {
  margin-bottom: 0.3cm;
  page-break-inside: avoid;
}

/* ========================================
   ESTILOS DE CITAÇÃO E CÓDIGO
   ======================================== */

blockquote {
  border-left: 4px solid ${config.cabecalho.corLinha};
  padding-left: 1cm;
  margin-left: 0;
  font-style: italic;
  color: #555;
}

code, pre {
  font-family: ${config.tipografia.cffamiliaMonoespacado};
  font-size: 10pt;
  background-color: #f5f5f5;
  padding: 0.3cm;
  border-radius: 3px;
}

pre {
  page-break-inside: avoid;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* ========================================
   QUEBRAS DE PÁGINA
   ======================================== */

.quebra-pagina {
  page-break-before: always;
}

.evitar-quebra {
  page-break-inside: avoid;
}

/* Não quebrar logo após heading */
h1 + p,
h2 + p,
h3 + p {
  page-break-before: avoid;
}

/* ========================================
   ESTILOS ESPECÍFICOS PARA PETIÇÃO
   ======================================== */

.secao-resumo {
  page-break-after: always;
}

.matriz-jurimetria {
  page-break-inside: avoid;
  margin: ${config.espacamento.paragrafoAntes} 0;
}

.hermenautica-estrategica {
  page-break-inside: avoid;
  margin: ${config.espacamento.paragrafoAntes} 0;
  padding: 0.5cm;
  border-left: 4px solid ${config.cabecalho.corLinha};
  background-color: #f9f9f9;
}

.anexos-indice {
  page-break-before: always;
}

.indice-semantico {
  page-break-inside: avoid;
  font-size: 11pt;
}

/* ========================================
   IMPRESSÃO E VISIBILIDADE
   ======================================== */

@media print {
  a {
    text-decoration: none;
    color: inherit;
  }

  a[href]:after {
    content: "";
  }

  .nao-imprimir {
    display: none !important;
  }

  img {
    max-width: 100%;
    page-break-inside: avoid;
  }
}

/* ========================================
   MARGENS DE SEGURANÇA
   ======================================== */

.margem-seguranca {
  margin: 1cm;
  border: 1px dashed #ccc;
}
`
  }

  /**
   * Gera HTML completo com CSS embarcado
   */
  static gerarHtmlComCssEmbarcado(
    htmlConteudo: string,
    tribunal: Tribunal,
    titulo: string,
    numeroProcesso: string
  ): string {
    const cssPageJudicial = this.gerarCssPageJudicial(tribunal)
    const cssGlobal = this._gerarCssGlobal()

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titulo}</title>
    <style>
        ${cssGlobal}
        ${cssPageJudicial}
    </style>
</head>
<body>
    <div class="documento-peticao" data-tribunal="${tribunal}" data-numero-processo="${numeroProcesso}">
        ${htmlConteudo}
    </div>
</body>
</html>`
  }

  /**
   * CSS global para elementos básicos
   */
  private static _gerarCssGlobal(): string {
    return `
/* Reset CSS padrão */
html, body, div, span, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, address, cite, code,
dl, dt, dd, ol, ul, li,
fieldset, form, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td {
    margin: 0;
    padding: 0;
    border: 0;
    font-weight: inherit;
    font-style: inherit;
    font-size: 100%;
    font-family: inherit;
    vertical-align: baseline;
}

html {
    box-sizing: border-box;
}

*, *:before, *:after {
    box-sizing: inherit;
}

/* Normalização de elementos */
article, aside, details, figcaption, figure, footer, header,
main, menu, nav, section, summary {
    display: block;
}

audio, canvas, video {
    display: inline-block;
}

audio:not([controls]) {
    display: none;
}

/* Links */
a {
    color: #1A3A52;
    text-decoration: underline;
}

a:visited {
    color: #663399;
}

a:hover {
    color: #C41E3A;
}

/* Imagens */
img {
    max-width: 100%;
    height: auto;
    border: 0;
}

/* Tabelas */
table {
    border-spacing: 0;
    border-collapse: collapse;
}

/* Formulários */
input, select, textarea {
    font-family: inherit;
    font-size: 100%;
    vertical-align: baseline;
}

/* Elementos de destaque */
strong, b {
    font-weight: bold;
}

em, i {
    font-style: italic;
}

small {
    font-size: 80%;
}

/* Códigos e pre */
code, kbd, samp, pre {
    font-family: 'Courier New', monospace;
}
`
  }

  /**
   * Validação de estrutura HTML semântica
   */
  static validarSemanticaHtml(html: string): ValidacaoSemantica {
    const erros: string[] = []
    const avisos: string[] = []

    // Verificar H1
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length
    if (h1Count === 0) {
      erros.push('Documento deve conter pelo menos um H1')
    } else if (h1Count > 1) {
      avisos.push(`Documento contém ${h1Count} H1s; recomenda-se apenas 1`)
    }

    // Verificar sequência H1-H6
    const headingPattern = /<h([1-6])[^>]*>/gi
    let ultimoNivel = 0
    let match
    while ((match = headingPattern.exec(html)) !== null) {
      const nivelAtual = parseInt(match[1])
      if (nivelAtual > ultimoNivel + 1) {
        avisos.push(
          `Sequência de heading quebrada: H${ultimoNivel} para H${nivelAtual}`
        )
      }
      ultimoNivel = nivelAtual
    }

    // Verificar tabelas
    const tabelasPattern = /<table[^>]*>/gi
    const tabelasCount = (html.match(tabelasPattern) || []).length
    if (tabelasCount > 0) {
      for (let i = 0; i < tabelasCount; i++) {
        if (!html.includes('<thead')) {
          avisos.push('Tabela sem <thead>; recomenda-se estrutura semântica')
        }
        if (!html.includes('<tbody')) {
          avisos.push('Tabela sem <tbody>; recomenda-se estrutura semântica')
        }
      }
    }

    // Verificar listas
    const listasPattern = /<(ul|ol)[^>]*>/gi
    const listasCount = (html.match(listasPattern) || []).length
    if (listasCount > 0) {
      if (!(/<li[^>]*>/).test(html)) {
        erros.push('Listas devem conter elementos <li>')
      }
    }

    // Verificar links
    const linksPattern = /<a[^>]*href="([^"]*)"/gi
    while ((match = linksPattern.exec(html)) !== null) {
      if (match[1].trim() === '') {
        avisos.push('Links com href vazio encontrados')
      }
    }

    // Verificar alt em imagens
    const imagensPattern = /<img[^>]*>/gi
    const imagens = html.match(imagensPattern) || []
    const imagensComAlt = imagens.filter((img) => /alt="/i.test(img)).length
    if (imagensComAlt < imagens.length) {
      avisos.push(
        `${imagens.length - imagensComAlt} imagem(ns) sem atributo alt`
      )
    }

    return {
      htmlValido: erros.length === 0,
      estruturaHeadings: avisos.filter((a) => a.includes('heading')).length === 0,
      tabelasStructuradas:
        avisos.filter((a) => a.includes('thead') || a.includes('tbody')).length ===
        0,
      listasPropriaS: erros.filter((e) => e.includes('Listas')).length === 0,
      linksAtivos: avisos.filter((a) => a.includes('href vazio')).length === 0,
      imagenscomAlt:
        avisos.filter((a) => a.includes('sem atributo alt')).length === 0,
      contrasteCores: true, // TODO: Implementar verificação real
      avisos,
      erros,
    }
  }

  /**
   * Aplicar formatação a HTML de petição
   */
  static formatarPeticao(
    htmlConteudo: string,
    tribunal: Tribunal,
    titulo: string,
    numeroProcesso: string
  ): PetiacaoFormatada {
    const htmlCompleto = this.gerarHtmlComCssEmbarcado(
      htmlConteudo,
      tribunal,
      titulo,
      numeroProcesso
    )
    const cssPageJudicial = this.gerarCssPageJudicial(tribunal)
    const validacao = this.validarSemanticaHtml(htmlConteudo)

    // Contar elementos
    const numeroPaginas = Math.ceil(htmlConteudo.length / 3000) // Estimativa
    const numeroParagrafos = (htmlConteudo.match(/<p[^>]*>/gi) || []).length
    const numeroTabelas = (htmlConteudo.match(/<table[^>]*>/gi) || []).length
    const numeroSeccoes =
      (htmlConteudo.match(/<h[1-2][^>]*>/gi) || []).length

    return {
      html: htmlConteudo,
      cssEmbarcado: cssPageJudicial,
      htmlCompleto,
      metadadosPagina: {
        numeroPaginas,
        numeroParagrafos,
        numeroTabelas,
        numeroSeccoes,
        validacaoSemantica: validacao,
      },
    }
  }
}
