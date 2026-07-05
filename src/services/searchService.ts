/**
 * Serviço de Busca
 * Full-text search e filtros avançados para documentos
 */

import { servicoDocumento } from './documentService'
import type { DocumentoSalvo, Documento } from '../types/document'

export interface CritériosBusca {
  texto?: string
  área?: string | null
  tipo?: string | null
  status?: string | null
  dataInício?: Date | null
  dataFim?: Date | null
  tamanhoMín?: number
  tamanhoMáx?: number
  versõesMín?: number
  ordenarPor?: 'relevância' | 'data' | 'tamanho' | 'versões'
}

export interface ResultadoBusca {
  documentos: DocumentoSalvo[]
  total: number
  tempo: number
  critérios: CritériosBusca
}

export class ServicoSearch {
  /**
   * Buscar documentos com critérios avançados
   */
  buscar(critérios: CritériosBusca): ResultadoBusca {
    const inicio = Date.now()

    let docs = servicoDocumento.listarDocumentosSalvos()

    // Filtro por texto (full-text search)
    if (critérios.texto && critérios.texto.trim()) {
      const textoNormalizado = critérios.texto.toLowerCase()
      docs = docs.filter(doc => {
        // Busca em título
        if (doc.titulo.toLowerCase().includes(textoNormalizado)) {
          return true
        }

        // Busca em conteúdo (carrega documento completo)
        const docCompleto = servicoDocumento.carregarDocumento(doc.id, {
          incluirVersoes: false,
        })
        if (docCompleto && docCompleto.conteudo.toLowerCase().includes(textoNormalizado)) {
          return true
        }

        return false
      })
    }

    // Filtro por área jurídica
    if (critérios.área) {
      docs = docs.filter(doc => doc.areaJuridica === critérios.área)
    }

    // Filtro por tipo
    if (critérios.tipo) {
      docs = docs.filter(doc => doc.tipo === critérios.tipo)
    }

    // Filtro por status
    if (critérios.status) {
      docs = docs.filter(doc => doc.status === critérios.status)
    }

    // Filtro por data inicial
    if (critérios.dataInício) {
      docs = docs.filter(doc => {
        const dataDoc = new Date(doc.dataModificacao)
        return dataDoc >= critérios.dataInício!
      })
    }

    // Filtro por data final
    if (critérios.dataFim) {
      docs = docs.filter(doc => {
        const dataDoc = new Date(doc.dataModificacao)
        return dataDoc <= critérios.dataFim!
      })
    }

    // Filtro por tamanho mínimo
    if (critérios.tamanhoMín !== undefined && critérios.tamanhoMín > 0) {
      docs = docs.filter(doc => doc.tamanho >= critérios.tamanhoMín!)
    }

    // Filtro por tamanho máximo
    if (critérios.tamanhoMáx !== undefined && critérios.tamanhoMáx > 0) {
      docs = docs.filter(doc => doc.tamanho <= critérios.tamanhoMáx!)
    }

    // Filtro por número de versões
    if (critérios.versõesMín !== undefined && critérios.versõesMín > 0) {
      docs = docs.filter(doc => doc.versoes >= critérios.versõesMín!)
    }

    // Ordenação
    if (critérios.ordenarPor) {
      docs = this.ordenarResultados(docs, critérios.ordenarPor, critérios.texto)
    }

    const tempo = Date.now() - inicio

    return {
      documentos: docs,
      total: docs.length,
      tempo,
      critérios,
    }
  }

  /**
   * Ordenar resultados
   */
  private ordenarResultados(
    docs: DocumentoSalvo[],
    ordenarPor: string,
    textoOriginal?: string
  ): DocumentoSalvo[] {
    switch (ordenarPor) {
      case 'relevância':
        if (textoOriginal) {
          // Simples relevância: documentos com texto no título primeiro
          return docs.sort((a, b) => {
            const aTemTexto = a.titulo.toLowerCase().includes(textoOriginal.toLowerCase())
            const bTemTexto = b.titulo.toLowerCase().includes(textoOriginal.toLowerCase())
            if (aTemTexto === bTemTexto) {
              return new Date(b.dataModificacao).getTime() - new Date(a.dataModificacao).getTime()
            }
            return aTemTexto ? -1 : 1
          })
        }
        return docs

      case 'data':
        return docs.sort(
          (a, b) => new Date(b.dataModificacao).getTime() - new Date(a.dataModificacao).getTime()
        )

      case 'tamanho':
        return docs.sort((a, b) => b.tamanho - a.tamanho)

      case 'versões':
        return docs.sort((a, b) => b.versoes - a.versoes)

      default:
        return docs
    }
  }

  /**
   * Sugestões de busca (palavras mais comuns em títulos)
   */
  obterSugestões(prefixo: string, limite: number = 5): string[] {
    const docs = servicoDocumento.listarDocumentosSalvos()
    const palavras = new Set<string>()

    docs.forEach(doc => {
      const titulo = doc.titulo.toLowerCase()
      if (titulo.includes(prefixo.toLowerCase())) {
        palavras.add(doc.titulo)
      }
    })

    return Array.from(palavras).slice(0, limite)
  }

  /**
   * Obter estatísticas de busca
   */
  obterEstatísticas(): {
    totalDocumentos: number
    porArea: Record<string, number>
    porTipo: Record<string, number>
    porStatus: Record<string, number>
  } {
    const docs = servicoDocumento.listarDocumentosSalvos()

    const porArea: Record<string, number> = {}
    const porTipo: Record<string, number> = {}
    const porStatus: Record<string, number> = {}

    docs.forEach(doc => {
      porArea[doc.areaJuridica] = (porArea[doc.areaJuridica] || 0) + 1
      porTipo[doc.tipo] = (porTipo[doc.tipo] || 0) + 1
      porStatus[doc.status] = (porStatus[doc.status] || 0) + 1
    })

    return {
      totalDocumentos: docs.length,
      porArea,
      porTipo,
      porStatus,
    }
  }
}

export const servicoSearch = new ServicoSearch()
