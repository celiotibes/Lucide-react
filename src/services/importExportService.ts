/**
 * Serviço de Import/Export
 * Exportar e importar documentos em múltiplos formatos
 */

import { servicoDocumento } from './documentService'
import type { Documento } from '../types/document'

export type FormatoExportacao = 'json' | 'markdown' | 'texto-plano' | 'html' | 'backup'

export interface OpçõesExportacao {
  formato: FormatoExportacao
  incluirVersões?: boolean
  incluirMetadados?: boolean
  comprimido?: boolean
}

export class ServicoImportExport {
  /**
   * Exportar documento
   */
  exportarDocumento(documentoId: string, opções: OpçõesExportacao): string {
    const doc = servicoDocumento.carregarDocumento(documentoId, {
      incluirVersoes: opções.incluirVersões,
      incluirMetadata: opções.incluirMetadados,
    })

    if (!doc) {
      throw new Error('Documento não encontrado')
    }

    switch (opções.formato) {
      case 'json':
        return this.exportarJSON(doc, opções.incluirVersões)

      case 'markdown':
        return this.exportarMarkdown(doc)

      case 'texto-plano':
        return this.exportarTextoPlano(doc)

      case 'html':
        return this.exportarHTML(doc)

      case 'backup':
        return this.exportarBackup(doc)

      default:
        throw new Error('Formato inválido')
    }
  }

  /**
   * Exportar todos os documentos como backup
   */
  exportarBackupCompleto(): string {
    const docs = servicoDocumento.listarDocumentosSalvos()
    const backup = {
      versão: '1.0',
      dataCriação: new Date().toISOString(),
      totalDocumentos: docs.length,
      documentos: docs.map(doc => ({
        ...doc,
        versões: this.obterVersõesDocumento(doc.id),
      })),
    }

    return JSON.stringify(backup, null, 2)
  }

  /**
   * Importar documento de JSON
   */
  importarDocumento(json: string): { sucesso: boolean; documentoId?: string; mensagem: string } {
    try {
      const dados = JSON.parse(json)

      const doc: Documento = {
        id: dados.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        titulo: dados.titulo || 'Documento Importado',
        tipo: dados.tipo || 'editor-novo',
        areaJuridica: dados.areaJuridica || 'civil',
        conteudo: dados.conteudo || dados.content || '',
        html: dados.html,
        dataCriacao: new Date(dados.dataCriacao || Date.now()),
        dataModificacao: new Date(dados.dataModificacao || Date.now()),
        autor: dados.autor || 'Importado',
        status: dados.status || 'rascunho',
        tags: dados.tags || [],
        metadata: dados.metadata,
        versoes: dados.versoes || [],
      }

      const resultado = servicoDocumento.salvarDocumento(doc)

      if (resultado.sucesso) {
        return {
          sucesso: true,
          documentoId: doc.id,
          mensagem: 'Documento importado com sucesso',
        }
      } else {
        return {
          sucesso: false,
          mensagem: resultado.mensagem || 'Erro ao salvar documento',
        }
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao importar: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Importar backup completo
   */
  importarBackupCompleto(json: string): { sucesso: boolean; importados: number; erros: string[] } {
    const erros: string[] = []
    let importados = 0

    try {
      const dados = JSON.parse(json)

      if (!dados.documentos || !Array.isArray(dados.documentos)) {
        return {
          sucesso: false,
          importados: 0,
          erros: ['Arquivo de backup inválido'],
        }
      }

      dados.documentos.forEach((doc: any, idx: number) => {
        try {
          const resultado = this.importarDocumento(JSON.stringify(doc))
          if (resultado.sucesso) {
            importados++
          } else {
            erros.push(`Documento ${idx + 1}: ${resultado.mensagem}`)
          }
        } catch (erro) {
          erros.push(
            `Documento ${idx + 1}: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`
          )
        }
      })

      return {
        sucesso: importados > 0,
        importados,
        erros,
      }
    } catch (erro) {
      return {
        sucesso: false,
        importados: 0,
        erros: [erro instanceof Error ? erro.message : 'Erro desconhecido'],
      }
    }
  }

  /**
   * Gerar download de arquivo
   */
  gerarDownload(conteúdo: string, nomeArquivo: string, tipo: string = 'application/json') {
    const blob = new Blob([conteúdo], { type: tipo })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nomeArquivo
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Privado: Exportar para JSON
   */
  private exportarJSON(doc: Documento, incluirVersões?: boolean): string {
    const dados: any = {
      id: doc.id,
      titulo: doc.titulo,
      tipo: doc.tipo,
      areaJuridica: doc.areaJuridica,
      conteudo: doc.conteudo,
      html: doc.html,
      dataCriacao: doc.dataCriacao.toISOString(),
      dataModificacao: doc.dataModificacao.toISOString(),
      autor: doc.autor,
      status: doc.status,
      tags: doc.tags,
      metadata: doc.metadata,
    }

    if (incluirVersões) {
      dados.versoes = doc.versoes.map(v => ({
        ...v,
        dataCriacao: v.dataCriacao.toISOString(),
      }))
    }

    return JSON.stringify(dados, null, 2)
  }

  /**
   * Privado: Exportar para Markdown
   */
  private exportarMarkdown(doc: Documento): string {
    return `# ${doc.titulo}

**Informações do Documento:**
- Tipo: ${doc.tipo}
- Área Jurídica: ${doc.areaJuridica}
- Status: ${doc.status}
- Autor: ${doc.autor}
- Data de Criação: ${doc.dataCriacao.toLocaleDateString('pt-BR')}
- Última Modificação: ${doc.dataModificacao.toLocaleDateString('pt-BR')}

---

## Conteúdo

${doc.conteudo}

---

*Exportado de Lucide-react em ${new Date().toLocaleString('pt-BR')}*
`
  }

  /**
   * Privado: Exportar para Texto Plano
   */
  private exportarTextoPlano(doc: Documento): string {
    return `${doc.titulo}\n${'='.repeat(doc.titulo.length)}\n\nTipo: ${doc.tipo}\nÁrea: ${doc.areaJuridica}\nStatus: ${doc.status}\nAutor: ${doc.autor}\nCriado em: ${doc.dataCriacao.toLocaleDateString('pt-BR')}\n\n${doc.conteudo}`
  }

  /**
   * Privado: Exportar para HTML
   */
  private exportarHTML(doc: Documento): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.titulo}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .header {
      border-bottom: 2px solid #1b3a57;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${doc.titulo}</h1>
  </div>

  <div class="meta">
    <p><strong>Tipo:</strong> ${doc.tipo}</p>
    <p><strong>Área Jurídica:</strong> ${doc.areaJuridica}</p>
    <p><strong>Status:</strong> ${doc.status}</p>
    <p><strong>Autor:</strong> ${doc.autor}</p>
    <p><strong>Criado em:</strong> ${doc.dataCriacao.toLocaleDateString('pt-BR')}</p>
    <p><strong>Modificado em:</strong> ${doc.dataModificacao.toLocaleDateString('pt-BR')}</p>
  </div>

  <div class="conteudo">
    ${doc.html || `<pre>${doc.conteudo}</pre>`}
  </div>

  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 11px; color: #999;">
    <p>Exportado de Lucide-react em ${new Date().toLocaleString('pt-BR')}</p>
  </footer>
</body>
</html>`
  }

  /**
   * Privado: Exportar para Backup (JSON comprimido)
   */
  private exportarBackup(doc: Documento): string {
    return JSON.stringify({
      v: '1.0',
      ts: Date.now(),
      d: doc,
    })
  }

  /**
   * Privado: Obter versões de documento
   */
  private obterVersõesDocumento(documentoId: string): any[] {
    try {
      const versõesJSON = localStorage.getItem(`lucide_versoes_${documentoId}`)
      return versõesJSON ? JSON.parse(versõesJSON) : []
    } catch {
      return []
    }
  }
}

export const servicoImportExport = new ServicoImportExport()
