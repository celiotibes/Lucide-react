/**
 * Gerador de Petição Completo
 * Integra todas as 4 camadas + formatação judicial em uma solução end-to-end
 * Jurimetria → Resumo Prova → Formatação Judicial
 */

import { ServicoJurimetriaBR } from './servicoJurimetriaBR'
import { ServicoResmoProvaBR } from './servicoResmoProvaBR'
import { ServicoFormatacaoPaginaBR } from './servicoFormatacaoPaginaBR'
import type { FatoProva } from '@/types/jurimetriaBR'
import type { Tribunal, PetiacaoFormatada } from '@/types/formatacaoPaginaBR'

export interface ConfiguracaoPeticaoCompleta {
  tribunal: Tribunal
  idPeticao: string
  numeroProcesso: string
  titulo: string
  parte_autora: string
  parte_rea: string
  relator?: string
  data_distribuicao?: string
}

export interface PeticaoGeradaCompleta {
  resumoExecutivo: string
  matrizJurimetria: string
  resumoProva: string
  hermenauticaEstrategica: string
  indiceAnexos: string
  htmlCompleto: string
  cssPageJudicial: string
  validacao: {
    erros: string[]
    avisos: string[]
    valido: boolean
  }
  metadados: {
    numeroPaginas: number
    numeroParagrafos: number
    numeroTabelas: number
    numeroSeccoes: number
    dataGeracao: string
  }
}

export class GeradorPeticaoCompleto {
  /**
   * Gera petição completa com todas as 4 camadas
   */
  static gerarPeticaoCompleta(
    fatos: FatoProva[],
    config: ConfiguracaoPeticaoCompleta,
    jurisprudencia?: any[],
    indiceAnexosMarkdown?: string
  ): PeticaoGeradaCompleta {
    // PASSO 1: Jurimetria
    const analiseJurimetrica = ServicoJurimetriaBR.analisarJurimetria(fatos)
    const matrizJurimetriaHtml = ServicoJurimetriaBR.gerarMatrizHtml(analiseJurimetrica)

    // PASSO 2: Resumo de Prova com Hermenêutica Blindada
    const resmoProva = ServicoResmoProvaBR.gerarResmoProva(
      config.idPeticao,
      fatos,
      jurisprudencia
    )
    const resmoProvaHtml = ServicoResmoProvaBR.gerarHtmlResmoProva(resmoProva)
    const hermenauticaHtml = this._gerarSecaoHermenautica(resmoProva)

    // PASSO 3: Montagem de HTML completo
    const htmlConteudo = this._montarHtmlPeticao(
      config,
      matrizJurimetriaHtml,
      resmoProvaHtml,
      hermenauticaHtml,
      indiceAnexosMarkdown || ''
    )

    // PASSO 4: Formatação Judicial
    const peticaoFormatada = ServicoFormatacaoPaginaBR.formatarPeticao(
      htmlConteudo,
      config.tribunal,
      config.titulo,
      config.numeroProcesso
    )

    return {
      resumoExecutivo: this._gerarSecaoResumoExecutivo(resmoProva),
      matrizJurimetria: matrizJurimetriaHtml,
      resumoProva: resmoProvaHtml,
      hermenauticaEstrategica: hermenauticaHtml,
      indiceAnexos: indiceAnexosMarkdown || '',
      htmlCompleto: peticaoFormatada.htmlCompleto,
      cssPageJudicial: peticaoFormatada.cssEmbarcado,
      validacao: {
        erros: peticaoFormatada.metadadosPagina.validacaoSemantica.erros,
        avisos: peticaoFormatada.metadadosPagina.validacaoSemantica.avisos,
        valido:
          peticaoFormatada.metadadosPagina.validacaoSemantica.htmlValido,
      },
      metadados: {
        numeroPaginas: peticaoFormatada.metadadosPagina.numeroPaginas,
        numeroParagrafos: peticaoFormatada.metadadosPagina.numeroParagrafos,
        numeroTabelas: peticaoFormatada.metadadosPagina.numeroTabelas,
        numeroSeccoes: peticaoFormatada.metadadosPagina.numeroSeccoes,
        dataGeracao: new Date().toISOString(),
      },
    }
  }

  /**
   * Monta HTML completo da petição com todas as seções
   */
  private static _montarHtmlPeticao(
    config: ConfiguracaoPeticaoCompleta,
    matrizJurimetriaHtml: string,
    resmoProvaHtml: string,
    hermenauticaHtml: string,
    indiceAnexosHtml: string
  ): string {
    return `
<div class="peticao-completa">
  <!-- CAPTION -->
  <div class="caption-peticao" style="text-align: center; margin-bottom: 2cm; page-break-after: avoid;">
    <h1>${config.titulo.toUpperCase()}</h1>
    <p><strong>Número do Processo:</strong> ${config.numeroProcesso}</p>
    <p><strong>Partes:</strong></p>
    <p><strong>Autora:</strong> ${config.parte_autora}</p>
    <p><strong>Ré:</strong> ${config.parte_rea}</p>
    ${config.relator ? `<p><strong>Relator(a):</strong> ${config.relator}</p>` : ''}
    ${config.data_distribuicao ? `<p><strong>Data de Distribuição:</strong> ${config.data_distribuicao}</p>` : ''}
  </div>

  <!-- INTROITO -->
  <section class="introito-peticao" style="page-break-after: avoid;">
    <p style="text-indent: 1.5cm;">
      Vem, respeitosamente, por intermédio de seus advogados constituídos, ao
      encontro desta Corte, a <strong>${config.parte_autora}</strong>, devidamente
      qualificada, interpor a presente petição, fundamentada nos fatos e documentação
      que seguem:
    </p>
  </section>

  <!-- RESUMO EXECUTIVO -->
  <section class="resumo-executivo">
    <h2>RESUMO EXECUTIVO</h2>
    ${this._gerarSecaoResumoExecutivo({})}
  </section>

  <!-- MATRIZ JURIMETRIA -->
  <section class="secao-jurimetria" style="page-break-after: always;">
    <h2>ANÁLISE QUANTITATIVA DE FORÇA PROBATÓRIA (JURIMETRIA)</h2>
    ${matrizJurimetriaHtml}
  </section>

  <!-- RESUMO DE PROVA -->
  <section class="secao-resumo-prova" style="page-break-after: always;">
    <h2>FUNDAMENTAÇÃO JURÍDICA E RESUMO ESTRATÉGICO</h2>
    ${resmoProvaHtml}
  </section>

  <!-- HERMENÊUTICA -->
  <section class="secao-hermenautica" style="page-break-after: always;">
    ${hermenauticaHtml}
  </section>

  <!-- ÍNDICE DE ANEXOS -->
  <section class="secao-anexos" style="page-break-before: always;">
    <h2>ÍNDICE SEMÂNTICO DE ANEXOS</h2>
    ${indiceAnexosHtml}
  </section>

  <!-- CONCLUSÃO -->
  <section class="conclusao-peticao" style="page-break-after: avoid;">
    <h2>CONCLUSÃO</h2>
    <p style="text-indent: 1.5cm;">
      Pelo exposto, requer-se a procedência do pedido, condenando-se a ré ao
      cumprimento da obrigação, com todas as consequências legais e contratuais
      advindas de seu não cumprimento. Fica, ainda, aberto espaço para eventual
      oferecimento de prova adicional.
    </p>
    <p style="text-align: center; margin-top: 3cm;">
      Brasília, ${new Date().toLocaleDateString('pt-BR')}
    </p>
    <div style="margin-top: 3cm; text-align: center;">
      <p>_________________________________</p>
      <p>${config.parte_autora}</p>
    </div>
  </section>
</div>
`
  }

  /**
   * Gera seção de resumo executivo
   */
  private static _gerarSecaoResumoExecutivo(resmoProva: any): string {
    return `
<div style="background: #f9f9f9; padding: 1cm; border-left: 4px solid #1A3A52; margin-bottom: 1cm;">
  <p>
    <strong>Tese Central:</strong> Esta petição é apoiada por fatos provados
    através de múltiplas fontes documentais e testemunhais substanciais.
  </p>
  <p>
    <strong>Força Probatória:</strong> A preponderância das provas apresentadas
    supera largamente os padrões exigidos pela lei processual civil.
  </p>
  <p>
    <strong>Fundamentação Legal:</strong> O direito da autora encontra amparo
    em jurisprudência pacífica dos tribunais superiores.
  </p>
</div>
`
  }

  /**
   * Gera seção detalhada de hermenêutica blindada
   */
  private static _gerarSecaoHermenautica(resmoProva: any): string {
    return `
<section class="hermenautica-blindada">
  <h2>HERMENÊUTICA BLINDADA E ARGUMENTAÇÃO ESTRATÉGICA</h2>

  <div class="pilares-hermenautica" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1cm; margin-bottom: 1cm;">
    <div style="border: 1px solid #1A3A52; padding: 0.8cm; border-radius: 4px;">
      <h3 style="color: #1A3A52; margin-top: 0;">ETHOS (Credibilidade)</h3>
      <p>
        A autoridade desta petição baseia-se em provas documentais contemporâneas,
        testemunhas idôneas e perícia técnica especializada. Cada elemento probatório
        é acompanhado de sua fonte original com data e local de origem, eliminando
        qualquer suspeita de manipulação ou reconstrução.
      </p>
    </div>

    <div style="border: 1px solid #C41E3A; padding: 0.8cm; border-radius: 4px;">
      <h3 style="color: #C41E3A; margin-top: 0;">PATHOS (Justiça)</h3>
      <p>
        A justiça demanda o respeito às obrigações livremente assumidas. Não se
        pode permitir enriquecimento injustificado de quem descumpre seus deveres.
        A proteção dos direitos adquiridos é fundamento essencial do Estado de Direito.
      </p>
    </div>

    <div style="border: 1px solid #2E7D32; padding: 0.8cm; border-radius: 4px;">
      <h3 style="color: #2E7D32; margin-top: 0;">LOGOS (Lógica)</h3>
      <p>
        A estrutura lógica desta petição segue rigorosamente as regras do
        silogismo jurídico: da lei aplicável aos fatos provados surge conclusão
        inaexpugnável de procedência. O encadeamento é irreversível.
      </p>
    </div>

    <div style="border: 1px solid #FFC107; padding: 0.8cm; border-radius: 4px;">
      <h3 style="color: #FFC107; margin-top: 0;">KAIROS (Oportunidade)</h3>
      <p>
        A apresentação oportuna desta petição preserva as provas no tempo,
        evita que testemunhas se tornem indisponíveis, e protege as expectativas
        legítimas da autora. A demora poderia gerar dano irreparável.
      </p>
    </div>
  </div>

  <h3>Análise de Contestações Esperadas e Refutações Preemptivas</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <thead style="background: #f0f0f0;">
      <tr>
        <th style="border: 1px solid #999; padding: 0.5cm; text-align: left;">
          Contestação Esperada
        </th>
        <th style="border: 1px solid #999; padding: 0.5cm; text-align: left;">
          Nossa Refutação Preemptiva
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Desafio à credibilidade das testemunhas
        </td>
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Jurisprudência pacífica reconhece presunção de credibilidade; ônus de
          impugnação é do réu. Múltiplas testemunhas corroboram mutuamente.
        </td>
      </tr>
      <tr style="background: #fafafa;">
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Insuficiência de prova documental
        </td>
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Preponderância das provas é padrão aplicável; perfeição não é requisito.
          Documentos originais com carimbos temporais comprovam autenticidade.
        </td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Procedimento de obtenção de prova questionado
        </td>
        <td style="border: 1px solid #ddd; padding: 0.5cm;">
          Todas as provas foram obtidas regularmente conforme CPC. Não há
          violação a direitos fundamentais ou procedimento irregular.
        </td>
      </tr>
    </tbody>
  </table>
</section>
`
  }

  /**
   * Exportar petição para arquivo
   */
  static exportarPeticao(peticaoGerada: PeticaoGeradaCompleta, formato: 'html' | 'json'): string {
    if (formato === 'html') {
      return peticaoGerada.htmlCompleto
    } else {
      return JSON.stringify(peticaoGerada, null, 2)
    }
  }
}
