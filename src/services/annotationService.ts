/**
 * Serviço de Anotações e Comentários
 * Gerencia anotações, comentários e bookmarks em documentos
 */

import type {
  Anotacao,
  Comentario,
  TipoAnotacao,
  ResultadoAnotacao,
  ResultadoDeleteAnotacao,
  EstatisticasAnotacoes,
} from '../types/annotations'

class ServicoAnotacoes {
  private chaveLocalStorage = 'lucide_anotacoes'
  private chaveComentarios = 'lucide_comentarios'

  /**
   * Criar nova anotação
   */
  criar(
    documentoId: string,
    tipo: TipoAnotacao,
    conteudo: string,
    autor: string,
    textoselecionado?: string,
    posicao?: number
  ): ResultadoAnotacao {
    try {
      const anotacoes = this.obterTodas()

      const novaAnotacao: Anotacao = {
        id: `nt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentoId,
        tipo,
        conteudo,
        textoselecionado,
        posicao,
        autor,
        dataCriacao: new Date(),
        dataModificacao: new Date(),
        resolvida: false,
      }

      anotacoes.push(novaAnotacao)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(anotacoes))

      return {
        sucesso: true,
        mensagem: 'Anotação criada com sucesso',
        anotacaoId: novaAnotacao.id,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao criar anotação: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Obter todas as anotações
   */
  obterTodas(): Anotacao[] {
    try {
      const anotacoesJSON = localStorage.getItem(this.chaveLocalStorage)
      if (!anotacoesJSON) {
        return []
      }
      const anotacoes = JSON.parse(anotacoesJSON)
      return anotacoes.map((a: any) => ({
        ...a,
        dataCriacao: new Date(a.dataCriacao),
        dataModificacao: new Date(a.dataModificacao),
      }))
    } catch {
      return []
    }
  }

  /**
   * Obter anotações de um documento
   */
  obterPorDocumento(documentoId: string): Anotacao[] {
    return this.obterTodas()
      .filter(a => a.documentoId === documentoId)
      .sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime())
  }

  /**
   * Obter anotações não resolvidas
   */
  obterPendentes(documentoId?: string): Anotacao[] {
    let anotacoes = this.obterTodas().filter(a => !a.resolvida)

    if (documentoId) {
      anotacoes = anotacoes.filter(a => a.documentoId === documentoId)
    }

    return anotacoes.sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime())
  }

  /**
   * Obter anotações de um tipo
   */
  obterPorTipo(documentoId: string, tipo: TipoAnotacao): Anotacao[] {
    return this.obterPorDocumento(documentoId).filter(a => a.tipo === tipo)
  }

  /**
   * Atualizar anotação
   */
  atualizar(anotacaoId: string, atualizacoes: Partial<Anotacao>): ResultadoAnotacao {
    try {
      const anotacoes = this.obterTodas()
      const indice = anotacoes.findIndex(a => a.id === anotacaoId)

      if (indice === -1) {
        return {
          sucesso: false,
          mensagem: 'Anotação não encontrada',
        }
      }

      anotacoes[indice] = {
        ...anotacoes[indice],
        ...atualizacoes,
        id: anotacaoId,
        dataCriacao: anotacoes[indice].dataCriacao,
        dataModificacao: new Date(),
      }

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(anotacoes))

      return {
        sucesso: true,
        mensagem: 'Anotação atualizada com sucesso',
        anotacaoId,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao atualizar anotação: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Marcar como resolvida
   */
  marcarResolvida(anotacaoId: string, resolvida: boolean): ResultadoAnotacao {
    return this.atualizar(anotacaoId, { resolvida })
  }

  /**
   * Deletar anotação
   */
  deletar(anotacaoId: string): ResultadoDeleteAnotacao {
    try {
      const anotacoes = this.obterTodas()
      const novaLista = anotacoes.filter(a => a.id !== anotacaoId)

      if (novaLista.length === anotacoes.length) {
        return {
          sucesso: false,
          mensagem: 'Anotação não encontrada',
        }
      }

      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(novaLista))

      // Deletar comentários associados
      this.deletarComentariosDeAnotacao(anotacaoId)

      return {
        sucesso: true,
        mensagem: 'Anotação deletada com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao deletar anotação: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Adicionar comentário a uma anotação
   */
  adicionarComentario(anotacaoId: string, conteudo: string, autor: string): ResultadoAnotacao {
    try {
      const comentarios = this.obterComentarios()

      const novoComentario: Comentario = {
        id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        anotacaoId,
        conteudo,
        autor,
        dataCriacao: new Date(),
      }

      comentarios.push(novoComentario)
      localStorage.setItem(this.chaveComentarios, JSON.stringify(comentarios))

      return {
        sucesso: true,
        mensagem: 'Comentário adicionado com sucesso',
        anotacaoId,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao adicionar comentário: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Obter comentários de uma anotação
   */
  obterComentariosPorAnotacao(anotacaoId: string): Comentario[] {
    return this.obterComentarios()
      .filter(c => c.anotacaoId === anotacaoId)
      .sort((a, b) => a.dataCriacao.getTime() - b.dataCriacao.getTime())
  }

  /**
   * Obter todos os comentários
   */
  private obterComentarios(): Comentario[] {
    try {
      const comentariosJSON = localStorage.getItem(this.chaveComentarios)
      if (!comentariosJSON) {
        return []
      }
      const comentarios = JSON.parse(comentariosJSON)
      return comentarios.map((c: any) => ({
        ...c,
        dataCriacao: new Date(c.dataCriacao),
      }))
    } catch {
      return []
    }
  }

  /**
   * Deletar comentário
   */
  deletarComentario(comentarioId: string): ResultadoDeleteAnotacao {
    try {
      const comentarios = this.obterComentarios()
      const novaLista = comentarios.filter(c => c.id !== comentarioId)

      if (novaLista.length === comentarios.length) {
        return {
          sucesso: false,
          mensagem: 'Comentário não encontrado',
        }
      }

      localStorage.setItem(this.chaveComentarios, JSON.stringify(novaLista))

      return {
        sucesso: true,
        mensagem: 'Comentário deletado com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao deletar comentário: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  /**
   * Deletar comentários de uma anotação
   */
  private deletarComentariosDeAnotacao(anotacaoId: string): void {
    const comentarios = this.obterComentarios()
    const filtrados = comentarios.filter(c => c.anotacaoId !== anotacaoId)
    localStorage.setItem(this.chaveComentarios, JSON.stringify(filtrados))
  }

  /**
   * Obter estatísticas
   */
  obterEstatisticas(documentoId: string): EstatisticasAnotacoes {
    const anotacoes = this.obterPorDocumento(documentoId)
    const porTipo: Record<TipoAnotacao, number> = {
      comentario: 0,
      destaque: 0,
      bookmark: 0,
      duvida: 0,
      aprovo: 0,
    }

    let totalComentarios = 0

    anotacoes.forEach(a => {
      porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1
      const comentariosDeAnotacao = this.obterComentariosPorAnotacao(a.id)
      totalComentarios += comentariosDeAnotacao.length
    })

    return {
      totalAnotacoes: anotacoes.length,
      totalComentarios,
      anotacoesResolvidas: anotacoes.filter(a => a.resolvida).length,
      anotacoesPendentes: anotacoes.filter(a => !a.resolvida).length,
      porTipo,
    }
  }

  /**
   * Limpar anotações de um documento
   */
  limparDocumento(documentoId: string): ResultadoDeleteAnotacao {
    try {
      const anotacoes = this.obterTodas()
      const paraDeletar = anotacoes.filter(a => a.documentoId === documentoId)

      const filtradas = anotacoes.filter(a => a.documentoId !== documentoId)
      localStorage.setItem(this.chaveLocalStorage, JSON.stringify(filtradas))

      // Deletar comentários associados
      paraDeletar.forEach(a => this.deletarComentariosDeAnotacao(a.id))

      return {
        sucesso: true,
        mensagem: `${paraDeletar.length} anotação(ões) deletada(s)`,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao limpar anotações: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }
}

export const servicoAnotacoes = new ServicoAnotacoes()
