/**
 * Serviço de PDF Export Avançado
 * Exporta documentos como PDF com múltiplas opções
 */

import type { OpcoesPDFExport, CapaDocumento, ResultadoPDFExport } from '../types/pdfExport'
import { servicoDocumento } from './documentService'

class ServicoPDFExport {
  /**
   * Exportar documento como PDF
   */
  exportarPDF(documentoId: string, opcoes: OpcoesPDFExport): ResultadoPDFExport {
    try {
      const doc = servicoDocumento.carregarDocumento(documentoId, {
        incluirVersoes: false,
        incluirMetadata: true,
      })

      if (!doc) {
        return {
          sucesso: false,
          mensagem: 'Documento não encontrado',
        }
      }

      const html = this.gerarHTMLPDF(doc, opcoes)
      const nomeArquivo = `${doc.titulo.replace(/[^a-z0-9]/gi, '_')}_${new Date().getTime()}.pdf`

      // Simula exportação usando print-to-PDF do navegador
      this.exportarViaNavegador(html, nomeArquivo)

      return {
        sucesso: true,
        mensagem: 'PDF exportado com sucesso',
        nomeArquivo,
        tamanhoKB: Math.round(html.length / 1024),
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao exportar PDF: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Exportar com capa personalizada
   */
  exportarPDFComCapa(
    documentoId: string,
    capa: CapaDocumento,
    opcoes: OpcoesPDFExport
  ): ResultadoPDFExport {
    try {
      const doc = servicoDocumento.carregarDocumento(documentoId, {
        incluirVersoes: false,
        incluirMetadata: true,
      })

      if (!doc) {
        return {
          sucesso: false,
          mensagem: 'Documento não encontrado',
        }
      }

      const htmlCapa = this.gerarHTMLCapa(capa, opcoes)
      const htmlDocumento = this.gerarHTMLPDF(doc, opcoes)
      const htmlCompleto = htmlCapa + '<div style="page-break-after: always;"></div>' + htmlDocumento

      const nomeArquivo = `${capa.titulo.replace(/[^a-z0-9]/gi, '_')}_${new Date().getTime()}.pdf`

      this.exportarViaNavegador(htmlCompleto, nomeArquivo)

      return {
        sucesso: true,
        mensagem: 'PDF com capa exportado com sucesso',
        nomeArquivo,
        tamanhoKB: Math.round(htmlCompleto.length / 1024),
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao exportar PDF com capa: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Exportar múltiplos documentos como um único PDF
   */
  exportarMultiplosPDF(
    documentoIds: string[],
    opcoes: OpcoesPDFExport,
    nomeArquivo?: string
  ): ResultadoPDFExport {
    try {
      const htmlParts: string[] = []

      documentoIds.forEach((docId, indice) => {
        const doc = servicoDocumento.carregarDocumento(docId, {
          incluirVersoes: false,
          incluirMetadata: true,
        })

        if (doc) {
          const html = this.gerarHTMLPDF(doc, opcoes)
          htmlParts.push(html)

          if (indice < documentoIds.length - 1) {
            htmlParts.push('<div style="page-break-after: always;"></div>')
          }
        }
      })

      if (htmlParts.length === 0) {
        return {
          sucesso: false,
          mensagem: 'Nenhum documento válido encontrado',
        }
      }

      const htmlCompleto = htmlParts.join('')
      const nomeFile =
        nomeArquivo || `documentos_multiplos_${new Date().getTime()}.pdf`

      this.exportarViaNavegador(htmlCompleto, nomeFile)

      return {
        sucesso: true,
        mensagem: `${documentoIds.length} documento(s) exportado(s) com sucesso`,
        nomeArquivo: nomeFile,
        tamanhoKB: Math.round(htmlCompleto.length / 1024),
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao exportar múltiplos PDFs: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Gerar HTML formatado para PDF
   */
  private gerarHTMLPDF(documento: any, opcoes: OpcoesPDFExport): string {
    const margens = `${opcoes.margemTop}mm ${opcoes.margemRight}mm ${opcoes.margemBottom}mm ${opcoes.margemLeft}mm`
    const orientacao = opcoes.orientacao === 'landscape' ? 'landscape' : 'portrait'

    const estilos = `
      @page {
        size: ${opcoes.tamanho} ${orientacao};
        margin: ${margens};
      }

      body {
        font-family: 'Arial', sans-serif;
        line-height: 1.6;
        color: #333;
        margin: 0;
        padding: 0;
      }

      h1, h2, h3 {
        color: #1b3a57;
        margin-top: 20px;
        margin-bottom: 10px;
      }

      h1 { font-size: 28px; border-bottom: 2px solid #1b3a57; padding-bottom: 10px; }
      h2 { font-size: 20px; }
      h3 { font-size: 16px; }

      p {
        margin: 10px 0;
        text-align: justify;
      }

      .cabecalho {
        border-bottom: 2px solid #1b3a57;
        padding-bottom: 10px;
        margin-bottom: 20px;
      }

      .rodape {
        border-top: 1px solid #ccc;
        padding-top: 10px;
        margin-top: 20px;
        font-size: 12px;
        color: #999;
      }

      .numero-pagina {
        text-align: right;
        font-size: 12px;
        color: #999;
      }

      .assinatura {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #333;
        width: 200px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
      }

      th, td {
        border: 1px solid #ddd;
        padding: 10px;
        text-align: left;
      }

      th {
        background-color: #f5f5f5;
        font-weight: bold;
      }

      pre {
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        overflow-x: auto;
      }

      @media print {
        body { margin: 0; }
        .no-print { display: none; }
      }
    `

    const conteudo = documento.html || `<pre>${documento.conteudo}</pre>`

    const assinaturaSec = opcoes.incluirAssinatura
      ? `
        <div class="assinatura">
          <p>_____________________________</p>
          <p>${opcoes.assinatura || 'Assinado digitalmente'}</p>
          <p>${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      `
      : ''

    const rodape = opcoes.incluirRodape
      ? `
        <div class="rodape">
          <p>Documento: ${documento.titulo}</p>
          <p>Tipo: ${documento.tipo} | Área: ${documento.areaJuridica}</p>
          <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `
      : ''

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${documento.titulo}</title>
        <style>
          ${estilos}
        </style>
      </head>
      <body>
        <div class="cabecalho">
          <h1>${documento.titulo}</h1>
          <p><strong>Tipo:</strong> ${documento.tipo} | <strong>Área:</strong> ${documento.areaJuridica}</p>
          <p><strong>Autor:</strong> ${documento.autor} | <strong>Data:</strong> ${new Date(documento.dataCriacao).toLocaleDateString('pt-BR')}</p>
        </div>

        <div class="conteudo">
          ${conteudo}
        </div>

        ${assinaturaSec}
        ${rodape}
      </body>
      </html>
    `

    return html
  }

  /**
   * Gerar HTML da capa
   */
  private gerarHTMLCapa(capa: CapaDocumento, opcoes: OpcoesPDFExport): string {
    const estilos = `
      body {
        margin: 0;
        padding: 0;
        font-family: 'Arial', sans-serif;
        background: linear-gradient(135deg, #1b3a57 0%, #2c5aa0 100%);
        color: white;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .capa-container {
        text-align: center;
        padding: 60px 40px;
        background: linear-gradient(135deg, #1b3a57 0%, #2c5aa0 100%);
        width: 100%;
        box-sizing: border-box;
      }

      .capa-logo {
        font-size: 48px;
        margin-bottom: 40px;
      }

      h1 {
        font-size: 48px;
        margin: 20px 0;
        font-weight: bold;
      }

      h2 {
        font-size: 28px;
        margin: 20px 0;
        opacity: 0.9;
        font-weight: normal;
      }

      .capa-separador {
        height: 2px;
        background: rgba(255, 255, 255, 0.5);
        margin: 40px auto;
        width: 200px;
      }

      .capa-info {
        margin-top: 60px;
        font-size: 14px;
        opacity: 0.9;
      }

      .capa-rodape {
        position: absolute;
        bottom: 40px;
        width: 100%;
        text-align: center;
        font-size: 12px;
        opacity: 0.7;
      }
    `

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${capa.titulo}</title>
        <style>
          ${estilos}
        </style>
      </head>
      <body>
        <div class="capa-container">
          <div class="capa-logo">⚖️</div>
          <h1>${capa.titulo}</h1>
          <h2>${capa.subtitulo}</h2>
          <div class="capa-separador"></div>
          <div class="capa-info">
            <p><strong>${capa.autor}</strong></p>
            <p>${capa.areaJuridica.charAt(0).toUpperCase() + capa.areaJuridica.slice(1)}</p>
            <p>${capa.data.toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      </body>
      </html>
    `

    return html
  }

  /**
   * Exportar via navegador (simula PDF via print)
   */
  private exportarViaNavegador(html: string, nomeArquivo: string): void {
    const janela = window.open('', '_blank')
    if (janela) {
      janela.document.write(html)
      janela.document.close()

      setTimeout(() => {
        janela.print()
      }, 250)
    }
  }

  /**
   * Obter tamanhos de página disponíveis
   */
  obterTamanhosPagina() {
    return {
      A4: 'A4 (210 x 297 mm)',
      A3: 'A3 (297 x 420 mm)',
      Letter: 'Letter (8.5 x 11 in)',
      Legal: 'Legal (8.5 x 14 in)',
    }
  }

  /**
   * Obter qualidades de imagem disponíveis
   */
  obterQualidadesImagem() {
    return {
      baixa: 'Baixa (menor tamanho)',
      media: 'Média (recomendado)',
      alta: 'Alta (melhor qualidade)',
    }
  }
}

export const servicoPDFExport = new ServicoPDFExport()
