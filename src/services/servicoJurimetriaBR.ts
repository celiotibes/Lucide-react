/**
 * Serviço de Jurimetria
 * Cálculos de: TCP (Taxa de Cobertura Probatória), Distribuição de Força, Análise de Gaps
 */

import type {
  FatoProva,
  DistribuicaoForcaFatos,
  Analisejurimetrica,
  MatrizProvaVisual,
  CorrelacaoArgumentoProva,
} from '@/types/jurimetriaBR'

export class ServicoJurimetriaBR {
  /**
   * Calcula Taxa de Cobertura Probatória (TCP)
   * Proporção de fatos com prova substancial / total de fatos
   */
  static calcularTCP(fatos: FatoProva[]): number {
    if (fatos.length === 0) return 0

    const contagemSubstancial = fatos.filter((f) => f.pesoProva === 'substancial').length
    return (contagemSubstancial / fatos.length) * 100
  }

  /**
   * Calcula média ponderada de grau de certeza
   */
  static calcularCertezaMedia(fatos: FatoProva[]): number {
    if (fatos.length === 0) return 0

    const totalCerteza = fatos.reduce((soma, f) => soma + f.grauCerteza, 0)
    return totalCerteza / fatos.length
  }

  /**
   * Analisa distribuição de força entre fatos
   */
  static analisarDistribuicaoForca(fatos: FatoProva[]): DistribuicaoForcaFatos {
    const distribuicao: DistribuicaoForcaFatos = {
      alta: 0,
      moderada: 0,
      fragil: 0,
    }

    fatos.forEach((fato) => {
      if (fato.grauCerteza >= 80) {
        distribuicao.alta += 1
      } else if (fato.grauCerteza >= 50) {
        distribuicao.moderada += 1
      } else {
        distribuicao.fragil += 1
      }
    })

    return distribuicao
  }

  /**
   * Identifica lacunas críticas de prova
   */
  static identificarLacunasRisco(fatos: FatoProva[]): string[] {
    const lacunas: string[] = []

    fatos.forEach((fato) => {
      if (fato.pesoProva === 'fragil') {
        lacunas.push(
          `Fato "${fato.alegacao.substring(0, 50)}..." é frágil (certeza: ${fato.grauCerteza}%)`
        )
      }

      if (fato.tipoProva === 'testemunhal' && fato.fontes.length === 1) {
        lacunas.push(
          `Fato "${fato.alegacao.substring(0, 50)}..." depende de testemunha única (vulnerável ao contra-interrogatório)`
        )
      }
    })

    return lacunas
  }

  /**
   * Calcula score jurimetria geral (0-100)
   * Fórmula: TCP (40%) + Certeza (40%) - Penalidade de Gaps (20%)
   */
  static calcularScorejurimetrico(fatos: FatoProva[]): number {
    const tcp = this.calcularTCP(fatos)
    const certeza = this.calcularCertezaMedia(fatos)
    const lacunas = this.identificarLacunasRisco(fatos)
    const penaldidadeLacunas = lacunas.length * 5 // 5 pontos por lacuna

    const score = tcp * 0.4 + certeza * 0.4 - penaldidadeLacunas
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Gera matriz visual Argumento vs Prova para exibição
   */
  static gerarMatrizVisual(fatos: FatoProva[]): MatrizProvaVisual[] {
    return fatos.map((fato, idx) => ({
      numeroLinha: idx + 1,
      argumento: fato.alegacao.substring(0, 80),
      tipoProva: fato.tipoProva.charAt(0).toUpperCase() + fato.tipoProva.slice(1),
      certeza: `${fato.grauCerteza}%`,
      documentosApoio: fato.fontes.join(', '),
      barraForca: this._criarBarraForca(fato.grauCerteza),
    }))
  }

  /**
   * Cria barra visual de força (para HTML/CSS)
   */
  private static _criarBarraForca(certeza: number): string {
    const preenchida = Math.floor(certeza / 10)
    const vazia = 10 - preenchida
    return `${'█'.repeat(preenchida)}${'░'.repeat(vazia)} ${certeza}%`
  }

  /**
   * Análise completa de jurimetria
   */
  static analisarJurimetria(fatos: FatoProva[]): Analisejurimetrica {
    return {
      tcp: this.calcularTCP(fatos),
      grauCertezaMedia: this.calcularCertezaMedia(fatos),
      distribuicaoForcaFatos: this.analisarDistribuicaoForca(fatos),
      matrizArgumentoProva: this._construirMatrizArgumentos(fatos),
      lacunasRisco: this.identificarLacunasRisco(fatos),
      scorejurimetrico: this.calcularScorejurimetrico(fatos),
      matrizVisual: this.gerarMatrizVisual(fatos),
    }
  }

  /**
   * Constrói matriz de correlação Argumento vs Prova
   */
  private static _construirMatrizArgumentos(fatos: FatoProva[]): CorrelacaoArgumentoProva[] {
    return fatos.map((fato) => ({
      argumento: fato.alegacao,
      provasRespaldam: fato.fontes,
      fraquesFrentes: this._identificarFraquezas(fato),
      riscoContraargumento: this._calcularRiscoContraargumento(fato),
      forcaEscudo: this._calcularForcaEscudo(fato),
    }))
  }

  /**
   * Identifica fraquezas na defesa do argumento
   */
  private static _identificarFraquezas(fato: FatoProva): string[] {
    const fraquezas: string[] = []

    if (fato.grauCerteza < 50) {
      fraquezas.push('Grau de certeza baixo - vulnerável a contestação')
    }

    if (fato.tipoProva === 'testemunhal') {
      fraquezas.push('Prova testemunhal - sujeita a desafios de credibilidade')
    }

    if (fato.fontes.length === 1) {
      fraquezas.push('Fonte única - falta de corroboração')
    }

    if (fato.pesoProva === 'fragil') {
      fraquezas.push('Estrutura de prova frágil - necessita reforço')
    }

    return fraquezas
  }

  /**
   * Calcula risco de contra-argumentação (0-100)
   */
  private static _calcularRiscoContraargumento(fato: FatoProva): number {
    let risco = 100 - fato.grauCerteza // Base: inverso da certeza

    if (fato.tipoProva === 'testemunhal') {
      risco += 15 // Testemunhal é mais fácil de contestar
    }

    if (fato.fontes.length === 1) {
      risco += 20 // Fonte única aumenta risco
    }

    if (fato.pesoProva === 'fragil') {
      risco += 25 // Prova frágil tem risco alto de contestação
    }

    return Math.min(100, risco)
  }

  /**
   * Calcula força de escudo de Hermenêutica Blindada (0-100)
   * Baseia-se na robustez das provas contra contra-argumentação
   */
  private static _calcularForcaEscudo(fato: FatoProva): number {
    let escudo = fato.grauCerteza // Base: grau de certeza

    if (fato.tipoProva === 'documental') {
      escudo += 15 // Prova documental é mais difícil de contestar
    }

    if (fato.fontes.length > 1) {
      escudo += 10 // Múltiplas fontes reforçam o escudo
    }

    if (fato.pesoProva === 'substancial') {
      escudo += 20 // Prova substancial tem defesa forte
    }

    // Prova pericial adiciona credibilidade
    if (fato.tipoProva === 'pericial') {
      escudo += 15
    }

    return Math.min(100, escudo)
  }

  /**
   * Gera HTML table com matriz jurimetria para petição
   */
  static gerarMatrizHtml(analise: Analisejurimetrica): string {
    let html = `
    <section class="analise-jurimetria" style="margin: 20px 0; padding: 15px; border-left: 4px solid #1A3A52;">
      <h2 style="color: #1A3A52; margin-top: 0;">Análise de Força Probatória (Jurimetria)</h2>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>TCP (Taxa Cobertura)</strong><br>
          <span style="font-size: 1.8em; color: #2E7D32;">${analise.tcp.toFixed(1)}%</span>
        </div>
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>Certeza Média</strong><br>
          <span style="font-size: 1.8em; color: #1A3A52;">${analise.grauCertezaMedia.toFixed(1)}%</span>
        </div>
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>Score Jurimetria</strong><br>
          <span style="font-size: 1.8em; color: #C41E3A;">${analise.scorejurimetrico.toFixed(1)}/100</span>
        </div>
      </div>

      <h3>Distribuição de Força dos Fatos</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Categoria</th>
          <th style="padding: 10px; text-align: center;">Quantidade</th>
          <th style="padding: 10px; text-align: left;">Descrição</th>
        </tr>
        <tr style="background: #e8f5e9;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Alta</strong> (80-100%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analise.distribuicaoForcaFatos.alta}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos com prova sólida</td>
        </tr>
        <tr style="background: #fff3e0;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Moderada</strong> (50-80%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analise.distribuicaoForcaFatos.moderada}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos com prova razoável</td>
        </tr>
        <tr style="background: #ffebee;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Frágil</strong> (&lt;50%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analise.distribuicaoForcaFatos.fragil}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos que precisam reforço</td>
        </tr>
      </table>

      <h3>Matriz de Força Probatória Detalhada</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Fato Alegado</th>
          <th style="padding: 10px; text-align: center;">Tipo de Prova</th>
          <th style="padding: 10px; text-align: center;">Certeza</th>
          <th style="padding: 10px; text-align: center;">Força Visual</th>
          <th style="padding: 10px; text-align: left;">Documentos</th>
        </tr>
        ${analise.matrizVisual
          .map(
            (linha) => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px;">${linha.argumento}</td>
          <td style="padding: 10px; text-align: center;">${linha.tipoProva}</td>
          <td style="padding: 10px; text-align: center;"><strong>${linha.certeza}</strong></td>
          <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 0.9em;">${linha.barraForca}</td>
          <td style="padding: 10px; font-size: 0.9em;">${linha.documentosApoio}</td>
        </tr>
        `
          )
          .join('')}
      </table>

      ${
        analise.lacunasRisco.length > 0
          ? `
      <h3 style="color: #C41E3A; margin-top: 20px;">⚠️ Lacunas Críticas Identificadas</h3>
      <ul style="background: #ffebee; padding: 15px; border-radius: 4px; border-left: 4px solid #C41E3A;">
        ${analise.lacunasRisco.map((lacuna) => `<li style="margin-bottom: 8px;">${lacuna}</li>`).join('')}
      </ul>
      `
          : `
      <p style="background: #e8f5e9; padding: 12px; border-radius: 4px; border-left: 4px solid #2E7D32;">
        ✓ Nenhuma lacuna crítica identificada - petição com cobertura probatória sólida.
      </p>
      `
      }
    </section>
    `
    return html
  }
}
