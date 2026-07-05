/**
 * Serviço de Templates de Documentos
 * Gerencia criação, listagem, atualização e exclusão de templates
 */

import type { TemplateDocumento, ResultadoSaveTemplate, ResultadoDeleteTemplate } from '../types/template'

class ServicoTemplate {
  private chaveLocalStorage = 'lucide_templates'

  /**
   * Criar novo template a partir de um documento
   */
  criarTemplate(documento: any): ResultadoSaveTemplate {
    try {
      const templates = this.obterTodos()

      const novoTemplate: TemplateDocumento = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        nome: documento.titulo || 'Novo Template',
        descricao: '',
        categoria: 'outro',
        areaJuridica: documento.areaJuridica || 'civil',
        conteudo: documento.conteudo || '',
        html: documento.html,
        tags: documento.tags || [],
        dataCriacao: new Date(),
        dataModificacao: new Date(),
        autor: documento.autor || 'Sistema',
        vezes_usado: 0,
        ativo: true,
      }

      templates.push(novoTemplate)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(templates))

      return {
        sucesso: true,
        mensagem: 'Template criado com sucesso',
        templateId: novoTemplate.id,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao criar template: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Obter todos os templates
   */
  obterTodos(): TemplateDocumento[] {
    try {
      const templatesJSON = localStorage.getItem(this.chaveLocalStorage)
      if (!templatesJSON) {
        return []
      }
      const templates = JSON.parse(templatesJSON)
      return templates.map((t: any) => ({
        ...t,
        dataCriacao: new Date(t.dataCriacao),
        dataModificacao: new Date(t.dataModificacao),
      }))
    } catch {
      return []
    }
  }

  /**
   * Obter templates por categoria
   */
  obterPorCategoria(categoria: string): TemplateDocumento[] {
    return this.obterTodos().filter(t => t.categoria === categoria && t.ativo)
  }

  /**
   * Obter templates por área jurídica
   */
  obterPorArea(area: string): TemplateDocumento[] {
    return this.obterTodos().filter(t => t.areaJuridica === area && t.ativo)
  }

  /**
   * Pesquisar templates por nome ou tags
   */
  pesquisar(termo: string): TemplateDocumento[] {
    const termoLower = termo.toLowerCase()
    return this.obterTodos().filter(
      t =>
        t.ativo &&
        (t.nome.toLowerCase().includes(termoLower) ||
          t.descricao.toLowerCase().includes(termoLower) ||
          t.tags.some(tag => tag.toLowerCase().includes(termoLower)))
    )
  }

  /**
   * Atualizar template
   */
  atualizar(id: string, atualizacoes: Partial<TemplateDocumento>): ResultadoSaveTemplate {
    try {
      const templates = this.obterTodos()
      const indice = templates.findIndex(t => t.id === id)

      if (indice === -1) {
        return {
          sucesso: false,
          mensagem: 'Template não encontrado',
        }
      }

      templates[indice] = {
        ...templates[indice],
        ...atualizacoes,
        id,
        dataCriacao: templates[indice].dataCriacao,
        dataModificacao: new Date(),
      }

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(templates))

      return {
        sucesso: true,
        mensagem: 'Template atualizado com sucesso',
        templateId: id,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao atualizar template: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Deletar template
   */
  deletar(id: string): ResultadoDeleteTemplate {
    try {
      const templates = this.obterTodos()
      const novaLista = templates.filter(t => t.id !== id)

      if (novaLista.length === templates.length) {
        return {
          sucesso: false,
          mensagem: 'Template não encontrado',
        }
      }

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(novaLista))

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

  /**
   * Usar template (incrementa contador)
   */
  usar(id: string): ResultadoSaveTemplate {
    try {
      const templates = this.obterTodos()
      const template = templates.find(t => t.id === id)

      if (!template) {
        return {
          sucesso: false,
          mensagem: 'Template não encontrado',
        }
      }

      template.vezes_usado = (template.vezes_usado || 0) + 1
      template.dataModificacao = new Date()

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(templates))

      return {
        sucesso: true,
        mensagem: 'Template usado com sucesso',
        templateId: id,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao usar template: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Obter templates mais usados
   */
  obterMaisUsados(limite: number = 10): TemplateDocumento[] {
    return this.obterTodos()
      .filter(t => t.ativo)
      .sort((a, b) => (b.vezes_usado || 0) - (a.vezes_usado || 0))
      .slice(0, limite)
  }

  /**
   * Obter estatísticas de templates
   */
  obterEstatisticas() {
    const templates = this.obterTodos()
    const categorias: Record<string, number> = {}
    const areas: Record<string, number> = {}

    templates.forEach(t => {
      if (t.ativo) {
        categorias[t.categoria] = (categorias[t.categoria] || 0) + 1
        areas[t.areaJuridica] = (areas[t.areaJuridica] || 0) + 1
      }
    })

    return {
      totalTemplates: templates.filter(t => t.ativo).length,
      totalUsos: templates.reduce((sum, t) => sum + (t.vezes_usado || 0), 0),
      categorias,
      areas,
    }
  }
}

export const servicoTemplate = new ServicoTemplate()
