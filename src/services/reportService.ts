/**
 * Serviço de Relatórios
 * Gera relatórios customizáveis em múltiplos formatos
 */

import type {
  Relatorio,
  ConfiguracaoRelatorio,
  ResultadoRelatorio,
  TemplateRelatorio,
} from '../types/reports'

class ServicoRelatorios {
  private chaveLocalStorage = 'lucide_relatorios'
  private chaveTemplates = 'lucide_templates_relatorios'

  gerarRelatorio(config: ConfiguracaoRelatorio, conteudo: string): ResultadoRelatorio {
    try {
      const relatorios = this.obterTodos()

      const novoRelatorio: Relatorio = {
        id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        titulo: config.titulo,
        tipo: config.tipo,
        conteudo,
        html: this.gerarHTML(config, conteudo),
        metadados: {
          titulo: config.titulo,
          autor: config.autor || 'Usuário',
          descricao: config.descricao,
          versao: '1.0',
          empresa: config.empresa,
          confidencial: config.confidencial,
          dataGeracao: new Date(),
        },
        dataCriacao: new Date(),
        dataModificacao: new Date(),
        autor: config.autor,
        tamanho: conteudo.length,
      }

      relatorios.push(novoRelatorio)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(relatorios))

      return {
        sucesso: true,
        mensagem: 'Relatório gerado com sucesso',
        relatorioId: novoRelatorio.id,
        conteudo: this.converterFormato(novoRelatorio.html || '', config.formato),
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao gerar relatório: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  obterTodos(): Relatorio[] {
    try {
      const relatoriosJSON = localStorage.getItem(this.chaveLocalStorage)
      if (!relatoriosJSON) {
        return []
      }
      const relatorios = JSON.parse(relatoriosJSON)
      return relatorios.map((r: any) => ({
        ...r,
        dataCriacao: new Date(r.dataCriacao),
        dataModificacao: new Date(r.dataModificacao),
        metadados: {
          ...r.metadados,
          dataGeracao: new Date(r.metadados.dataGeracao),
          dataVencimento: r.metadados.dataVencimento ? new Date(r.metadados.dataVencimento) : undefined,
        },
      }))
    } catch {
      return []
    }
  }

  obterPorDocumento(documentoId: string): Relatorio[] {
    return this.obterTodos().filter(r => r.documentoId === documentoId)
  }

  obterPorTipo(tipo: string): Relatorio[] {
    return this.obterTodos().filter(r => r.tipo === tipo)
  }

  obterPorId(id: string): Relatorio | null {
    return this.obterTodos().find(r => r.id === id) || null
  }

  deletar(relatorioId: string): ResultadoRelatorio {
    try {
      const relatorios = this.obterTodos()
      const novaLista = relatorios.filter(r => r.id !== relatorioId)

      if (novaLista.length === relatorios.length) {
        return {
          sucesso: false,
          mensagem: 'Relatório não encontrado',
        }
      }

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(novaLista))

      return {
        sucesso: true,
        mensagem: 'Relatório deletado com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao deletar relatório: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  marcarFavorito(relatorioId: string, favorito: boolean): ResultadoRelatorio {
    try {
      const relatorios = this.obterTodos()
      const relatorio = relatorios.find(r => r.id === relatorioId)

      if (!relatorio) {
        return {
          sucesso: false,
          mensagem: 'Relatório não encontrado',
        }
      }

      relatorio.favorito = favorito
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(relatorios))

      return {
        sucesso: true,
        mensagem: favorito ? 'Adicionado aos favoritos' : 'Removido dos favoritos',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao atualizar favorito: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  salvarTemplate(template: TemplateRelatorio): ResultadoRelatorio {
    try {
      const templates = this.obterTemplates()
      templates.push({
        ...template,
        id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })
      localStorage.setItem(this.chaveTemplates, JSON.stringify(templates))

      return {
        sucesso: true,
        mensagem: 'Template salvo com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao salvar template: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  obterTemplates(): TemplateRelatorio[] {
    try {
      const templatesJSON = localStorage.getItem(this.chaveTemplates)
      return templatesJSON ? JSON.parse(templatesJSON) : []
    } catch {
      return []
    }
  }

  obterTemplatePorId(id: string): TemplateRelatorio | null {
    return this.obterTemplates().find(t => t.id === id) || null
  }

  deletarTemplate(templateId: string): ResultadoRelatorio {
    try {
      const templates = this.obterTemplates()
      const novaLista = templates.filter(t => t.id !== templateId)

      if (novaLista.length === templates.length) {
        return {
          sucesso: false,
          mensagem: 'Template não encontrado',
        }
      }

      localStorage.setItem(this.chaveTemplates, JSON.stringify(novaLista))

      return {
        sucesso: true,
        mensagem: 'Template deletado com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao deletar template: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  private gerarHTML(config: ConfiguracaoRelatorio, conteudo: string): string {
    const capa = config.incluirCapaRelatorio
      ? `<div style="page-break-after: always; padding: 40px; text-align: center; border-bottom: 2px solid #1b3a57;">
        <h1 style="color: #1b3a57; font-size: 32px; margin-bottom: 20px;">${config.titulo}</h1>
        ${config.empresa ? `<p style="font-size: 16px; color: #666;">${config.empresa}</p>` : ''}
        ${config.descricao ? `<p style="font-size: 14px; color: #999; margin-top: 20px;">${config.descricao}</p>` : ''}
        ${config.dataGeracao ? `<p style="font-size: 12px; color: #999; margin-top: 40px;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>` : ''}
        ${config.confidencial ? `<p style="font-size: 14px; color: #f44336; font-weight: bold; margin-top: 40px;">CONFIDENCIAL</p>` : ''}
      </div>`
      : ''

    const rodape = config.incluirRodape
      ? `<hr style="border: none; border-top: 1px solid #E0E0E0; margin-top: 40px; margin-bottom: 20px;">
        <div style="font-size: 10px; color: #999; text-align: center;">
          <p>${config.empresa ? config.empresa + ' - ' : ''}${config.autor ? 'Autor: ' + config.autor : ''}</p>
        </div>`
      : ''

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${config.titulo}</title>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #333; }
            h1 { font-size: 18pt; color: #1b3a57; margin-bottom: 12pt; }
            h2 { font-size: 14pt; color: #1b3a57; margin-top: 12pt; margin-bottom: 8pt; }
            p { margin-bottom: 10pt; }
            @page { margin: 30mm 25mm 30mm 25mm; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${capa}
          ${conteudo}
          ${rodape}
        </body>
      </html>`
  }

  private converterFormato(html: string, formato: string): string {
    switch (formato) {
      case 'html':
        return html
      case 'markdown':
        return this.htmlParaMarkdown(html)
      case 'pdf':
        return 'Use browser print-to-PDF'
      case 'docx':
        return 'Usar biblioteca externa (docx)'
      case 'json':
        return JSON.stringify({ html, timestamp: new Date() }, null, 2)
      default:
        return html
    }
  }

  private htmlParaMarkdown(html: string): string {
    return html
      .replace(/<h1[^>]*>([^<]+)<\/h1>/g, '# $1\n')
      .replace(/<h2[^>]*>([^<]+)<\/h2>/g, '## $1\n')
      .replace(/<h3[^>]*>([^<]+)<\/h3>/g, '### $1\n')
      .replace(/<p[^>]*>([^<]+)<\/p>/g, '$1\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  }
}

export const servicoRelatorios = new ServicoRelatorios()
