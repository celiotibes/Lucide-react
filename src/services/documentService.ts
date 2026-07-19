/**
 * Serviço de Gerenciamento de Documentos
 * CRUD completo com versionamento e persistência
 */

import type {
  Documento,
  DocumentoSalvo,
  VersaoDocumento,
  ResultadoSave,
  OpcoesCriacao,
  OpcoesCarregamento,
  EstatisticasDocumento,
} from '../types/document'

const CHAVE_DOCUMENTOS = 'lucide_documentos'
const CHAVE_VERSOES = 'lucide_versoes_'
const MAX_VERSOES = 20

export class ServicoDocumento {
  /**
   * Criar novo documento
   */
  criarDocumento(opcoes: OpcoesCriacao): Documento {
    const agora = new Date()
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const documento: Documento = {
      id,
      titulo: opcoes.titulo,
      tipo: opcoes.tipo,
      areaJuridica: opcoes.areaJuridica,
      conteudo: opcoes.conteudoInicial || '',
      dataCriacao: agora,
      dataModificacao: agora,
      autor: opcoes.autor || 'Anônimo',
      status: 'rascunho',
      tags: [],
      versoes: [],
    }

    // Salvar documento
    this.salvarDocumento(documento)

    return documento
  }

  /**
   * Salvar documento (com versionamento automático)
   */
  salvarDocumento(documento: Documento): ResultadoSave {
    try {
      const agora = new Date()
      documento.dataModificacao = agora

      // Criar versão se conteúdo mudou
      const ultimaVersao = documento.versoes[documento.versoes.length - 1]
      if (!ultimaVersao || ultimaVersao.conteudo !== documento.conteudo) {
        const novaVersao: VersaoDocumento = {
          id: `v_${Date.now()}`,
          numero: documento.versoes.length + 1,
          dataCriacao: agora,
          conteudo: documento.conteudo,
          html: documento.html,
          descricao: `Auto-save - ${agora.toLocaleTimeString('pt-BR')}`,
          autor: documento.autor,
          tamanho: documento.conteudo.length,
        }

        documento.versoes.push(novaVersao)

        // Limitar versões
        if (documento.versoes.length > MAX_VERSOES) {
          documento.versoes = documento.versoes.slice(-MAX_VERSOES)
        }
      }

      // Salvar no localStorage
      const docs = this.listarDocumentosSalvos()
      const indice = docs.findIndex((d) => d.id === documento.id)

      if (indice >= 0) {
        docs[indice] = this.converterParaSalvo(documento)
      } else {
        docs.push(this.converterParaSalvo(documento))
      }

      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(docs))
      localStorage.setItem(
        CHAVE_VERSOES + documento.id,
        JSON.stringify(documento.versoes)
      )

      return {
        sucesso: true,
        documentoId: documento.id,
        timestamp: agora,
        versao: documento.versoes.length,
      }
    } catch (erro) {
      console.error('Erro ao salvar documento:', erro)
      return {
        sucesso: false,
        documentoId: documento.id,
        timestamp: new Date(),
        versao: 0,
        mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido',
      }
    }
  }

  /**
   * Carregar documento por ID
   */
  carregarDocumento(
    documentoId: string,
    opcoes?: OpcoesCarregamento
  ): Documento | null {
    try {
      const docs = this.listarDocumentosSalvos()
      const docSalvo = docs.find((d) => d.id === documentoId)

      if (!docSalvo) return null

      const versoes = opcoes?.incluirVersoes
        ? JSON.parse(localStorage.getItem(CHAVE_VERSOES + documentoId) || '[]')
        : []

      return {
        id: docSalvo.id,
        titulo: docSalvo.titulo,
        tipo: docSalvo.tipo,
        areaJuridica: docSalvo.areaJuridica,
        conteudo: versoes.length > 0 ? versoes[versoes.length - 1].conteudo : '',
        dataCriacao: new Date(docSalvo.dataCriacao),
        dataModificacao: new Date(docSalvo.dataModificacao),
        autor: 'Anônimo',
        status: docSalvo.status,
        tags: [],
        versoes,
      }
    } catch (erro) {
      console.error('Erro ao carregar documento:', erro)
      return null
    }
  }

  /**
   * Listar todos os documentos salvos
   */
  listarDocumentosSalvos(): DocumentoSalvo[] {
    try {
      const docsJSON = localStorage.getItem(CHAVE_DOCUMENTOS)
      if (!docsJSON) return []

      const docs: DocumentoSalvo[] = JSON.parse(docsJSON)
      return docs.sort(
        (a, b) =>
          new Date(b.dataModificacao).getTime() -
          new Date(a.dataModificacao).getTime()
      )
    } catch (erro) {
      console.error('Erro ao listar documentos:', erro)
      return []
    }
  }

  /**
   * Filtrar documentos
   */
  filtrarDocumentos(
    criterios: Partial<DocumentoSalvo>
  ): DocumentoSalvo[] {
    const documentos = this.listarDocumentosSalvos()

    return documentos.filter((doc) => {
      for (const [chave, valor] of Object.entries(criterios)) {
        if (valor && doc[chave as keyof DocumentoSalvo] !== valor) {
          return false
        }
      }
      return true
    })
  }

  /**
   * Atualizar metadados do documento
   */
  atualizarMetadados(
    documentoId: string,
    atualizacoes: Partial<Documento>
  ): boolean {
    try {
      const docs = this.listarDocumentosSalvos()
      const indice = docs.findIndex((d) => d.id === documentoId)

      if (indice < 0) return false

      const docAtual = docs[indice]
      docs[indice] = {
        ...docAtual,
        ...atualizacoes,
        dataModificacao: new Date().toISOString(),
      }

      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(docs))
      return true
    } catch (erro) {
      console.error('Erro ao atualizar metadados:', erro)
      return false
    }
  }

  /**
   * Deletar documento
   */
  deletarDocumento(documentoId: string): boolean {
    try {
      const docs = this.listarDocumentosSalvos()
      const novaLista = docs.filter((d) => d.id !== documentoId)

      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(novaLista))
      localStorage.removeItem(CHAVE_VERSOES + documentoId)

      return true
    } catch (erro) {
      console.error('Erro ao deletar documento:', erro)
      return false
    }
  }

  /**
   * Restaurar versão anterior
   */
  restaurarVersao(documentoId: string, numeroVersao: number): boolean {
    try {
      const documento = this.carregarDocumento(documentoId, {
        incluirVersoes: true,
      })

      if (!documento) return false

      const versao = documento.versoes.find((v) => v.numero === numeroVersao)
      if (!versao) return false

      documento.conteudo = versao.conteudo
      documento.html = versao.html
      this.salvarDocumento(documento)

      return true
    } catch (erro) {
      console.error('Erro ao restaurar versão:', erro)
      return false
    }
  }

  /**
   * Calcular estatísticas do documento
   */
  calcularEstatisticas(conteudo: string): EstatisticasDocumento {
    const palavras = conteudo.trim().split(/\s+/).filter((p) => p.length > 0)
    const linhas = conteudo.split('\n')
    const paragrafos = conteudo.split(/\n\n+/).filter((p) => p.trim().length > 0)

    return {
      totalPalavras: palavras.length,
      totalCaracteres: conteudo.length,
      totalLinhas: linhas.length,
      paragrafos: paragrafos.length,
      tempoEscrita: 0,
    }
  }

  /**
   * Exportar documento para JSON
   */
  exportarJSON(documento: Documento): string {
    return JSON.stringify(
      {
        ...documento,
        dataCriacao: documento.dataCriacao.toISOString(),
        dataModificacao: documento.dataModificacao.toISOString(),
      },
      null,
      2
    )
  }

  /**
   * Duplicar documento
   */
  duplicarDocumento(documentoId: string, novoTitulo?: string): Documento | null {
    try {
      const original = this.carregarDocumento(documentoId, {
        incluirVersoes: true,
      })

      if (!original) return null

      const copia = this.criarDocumento({
        titulo: novoTitulo || `${original.titulo} (Cópia)`,
        tipo: original.tipo,
        areaJuridica: original.areaJuridica,
        conteudoInicial: original.conteudo,
      })

      return copia
    } catch (erro) {
      console.error('Erro ao duplicar documento:', erro)
      return null
    }
  }

  /**
   * Converter para formato salvo
   */
  private converterParaSalvo(documento: Documento): DocumentoSalvo {
    return {
      id: documento.id,
      titulo: documento.titulo,
      tipo: documento.tipo,
      areaJuridica: documento.areaJuridica,
      dataCriacao: documento.dataCriacao.toISOString(),
      dataModificacao: documento.dataModificacao.toISOString(),
      status: documento.status,
      tamanho: documento.conteudo.length,
      versoes: documento.versoes.length,
    }
  }

  /**
   * Limpar todos os dados
   */
  limparTudo(): boolean {
    try {
      const docs = this.listarDocumentosSalvos()
      docs.forEach((doc) => {
        localStorage.removeItem(CHAVE_VERSOES + doc.id)
      })
      localStorage.removeItem(CHAVE_DOCUMENTOS)
      return true
    } catch (erro) {
      console.error('Erro ao limpar dados:', erro)
      return false
    }
  }
}

export const servicoDocumento = new ServicoDocumento()
