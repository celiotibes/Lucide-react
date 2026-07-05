/**
 * Serviço de Compartilhamento de Documentos
 * Gerencia links de compartilhamento e permissões
 */

import type {
  CompartilhamentoDocumento,
  PermissaoCompartilhamento,
  TipoCompartilhamento,
  ResultadoCompartilhamento,
  ResultadoDeletarCompartilhamento,
  VisualizacaoCompartilhado,
} from '../types/sharing'

class ServicoCompartilhamento {
  private chaveLocalStorage = 'lucide_compartilhamentos'
  private chaveVisualizacoes = 'lucide_visualizacoes'

  /**
   * Gerar chave de acesso aleatória
   */
  private gerarChaveAcesso(): string {
    return `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Compartilhar documento por link
   */
  compartilharPorLink(
    documentoId: string,
    permissao: PermissaoCompartilhamento,
    dataExpiracao?: Date
  ): ResultadoCompartilhamento {
    try {
      const compartilhamentos = this.obterTodos()
      const chaveAcesso = this.gerarChaveAcesso()

      const novoCompartilhamento: CompartilhamentoDocumento = {
        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentoId,
        tipo: 'link',
        permissao,
        chaveAcesso,
        dataCriacao: new Date(),
        dataExpiracao,
        ativo: true,
        visualizacoes: 0,
      }

      compartilhamentos.push(novoCompartilhamento)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(compartilhamentos))

      const urlCompartilhamento = `${window.location.origin}?share=${chaveAcesso}`

      return {
        sucesso: true,
        mensagem: 'Documento compartilhado com sucesso',
        compartilhamentoId: novoCompartilhamento.id,
        link: urlCompartilhamento,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao compartilhar: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Compartilhar documento por email
   */
  compartilharPorEmail(
    documentoId: string,
    email: string,
    nome: string,
    permissao: PermissaoCompartilhamento
  ): ResultadoCompartilhamento {
    try {
      const compartilhamentos = this.obterTodos()
      const chaveAcesso = this.gerarChaveAcesso()

      const novoCompartilhamento: CompartilhamentoDocumento = {
        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentoId,
        tipo: 'email',
        permissao,
        chaveAcesso,
        email,
        nome,
        dataCriacao: new Date(),
        ativo: true,
        visualizacoes: 0,
      }

      compartilhamentos.push(novoCompartilhamento)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(compartilhamentos))

      return {
        sucesso: true,
        mensagem: `Documento compartilhado com ${email}`,
        compartilhamentoId: novoCompartilhamento.id,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao compartilhar por email: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Obter todos os compartilhamentos
   */
  obterTodos(): CompartilhamentoDocumento[] {
    try {
      const compartilhamentosJSON = localStorage.getItem(this.chaveLocalStorage)
      if (!compartilhamentosJSON) {
        return []
      }
      const compartilhamentos = JSON.parse(compartilhamentosJSON)
      return compartilhamentos.map((c: any) => ({
        ...c,
        dataCriacao: new Date(c.dataCriacao),
        dataExpiracao: c.dataExpiracao ? new Date(c.dataExpiracao) : undefined,
        ultimaVisualizacao: c.ultimaVisualizacao ? new Date(c.ultimaVisualizacao) : undefined,
      }))
    } catch {
      return []
    }
  }

  /**
   * Obter compartilhamentos de um documento
   */
  obterPorDocumento(documentoId: string): CompartilhamentoDocumento[] {
    return this.obterTodos()
      .filter(c => c.documentoId === documentoId && c.ativo)
      .sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime())
  }

  /**
   * Buscar compartilhamento por chave de acesso
   */
  obterPorChaveAcesso(chaveAcesso: string): CompartilhamentoDocumento | null {
    const compartilhamento = this.obterTodos().find(
      c => c.chaveAcesso === chaveAcesso && c.ativo
    )

    if (!compartilhamento) {
      return null
    }

    if (compartilhamento.dataExpiracao && new Date() > compartilhamento.dataExpiracao) {
      this.desativar(compartilhamento.id)
      return null
    }

    return compartilhamento
  }

  /**
   * Revogar acesso
   */
  revogar(compartilhamentoId: string): ResultadoDeletarCompartilhamento {
    try {
      const compartilhamentos = this.obterTodos()
      const indice = compartilhamentos.findIndex(c => c.id === compartilhamentoId)

      if (indice === -1) {
        return {
          sucesso: false,
          mensagem: 'Compartilhamento não encontrado',
        }
      }

      compartilhamentos[indice].ativo = false
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(compartilhamentos))

      return {
        sucesso: true,
        mensagem: 'Acesso revogado com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao revogar acesso: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Desativar compartilhamento
   */
  private desativar(compartilhamentoId: string): void {
    const compartilhamentos = this.obterTodos()
    const indice = compartilhamentos.findIndex(c => c.id === compartilhamentoId)

    if (indice !== -1) {
      compartilhamentos[indice].ativo = false
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(compartilhamentos))
    }
  }

  /**
   * Registrar visualização
   */
  registrarVisualizacao(compartilhamentoId: string): void {
    try {
      const compartilhamentos = this.obterTodos()
      const indice = compartilhamentos.findIndex(c => c.id === compartilhamentoId)

      if (indice !== -1) {
        compartilhamentos[indice].visualizacoes = (compartilhamentos[indice].visualizacoes || 0) + 1
        compartilhamentos[indice].ultimaVisualizacao = new Date()
        localStorage.setItem(this.chaveLocalStorage, JSON.stringify(compartilhamentos))
      }

      const novaVisualizacao: VisualizacaoCompartilhado = {
        id: `vis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        compartilhamentoId,
        dataVisualizacao: new Date(),
        navegador: navigator.userAgent.substring(0, 50),
      }

      const visualizacoes = this.obterVisualizacoes()
      visualizacoes.push(novaVisualizacao)
      localStorage.setItem(this.chaveVisualizacoes, JSON.stringify(visualizacoes))
    } catch {
      // Silenciosamente ignora erros de rastreamento
    }
  }

  /**
   * Obter todas as visualizações
   */
  obterVisualizacoes(): VisualizacaoCompartilhado[] {
    try {
      const visualizacoesJSON = localStorage.getItem(this.chaveVisualizacoes)
      if (!visualizacoesJSON) {
        return []
      }
      const visualizacoes = JSON.parse(visualizacoesJSON)
      return visualizacoes.map((v: any) => ({
        ...v,
        dataVisualizacao: new Date(v.dataVisualizacao),
      }))
    } catch {
      return []
    }
  }

  /**
   * Obter visualizações de um compartilhamento
   */
  obterVisualizacoesPorCompartilhamento(compartilhamentoId: string): VisualizacaoCompartilhado[] {
    return this.obterVisualizacoes()
      .filter(v => v.compartilhamentoId === compartilhamentoId)
      .sort((a, b) => b.dataVisualizacao.getTime() - a.dataVisualizacao.getTime())
  }

  /**
   * Obter estatísticas de um compartilhamento
   */
  obterEstatisticas(compartilhamentoId: string) {
    const compartilhamento = this.obterTodos().find(c => c.id === compartilhamentoId)
    if (!compartilhamento) {
      return null
    }

    const visualizacoes = this.obterVisualizacoesPorCompartilhamento(compartilhamentoId)

    return {
      compartilhamentoId,
      totalVisualizacoes: visualizacoes.length,
      ultimaVisualizacao: compartilhamento.ultimaVisualizacao,
      dataCriacao: compartilhamento.dataCriacao,
      dataExpiracao: compartilhamento.dataExpiracao,
      ativo: compartilhamento.ativo,
    }
  }

  /**
   * Limpar compartilhamentos expirados
   */
  limparExpirados(): number {
    const compartilhamentos = this.obterTodos()
    const agora = new Date()
    let deletados = 0

    const filtrados = compartilhamentos.filter(c => {
      if (c.dataExpiracao && agora > c.dataExpiracao) {
        deletados++
        return false
      }
      return true
    })

    if (deletados > 0) {
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(filtrados))
    }

    return deletados
  }
}

export const servicoCompartilhamento = new ServicoCompartilhamento()
