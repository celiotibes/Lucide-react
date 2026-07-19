/**
 * Hook de Dashboard
 * Gerencia documentos recentes, estatísticas e atividades
 */

import { useState, useCallback, useEffect } from 'react'
import type {
  DocumentoRecente,
  EstatisticasDashboard,
  AtividadeRecente,
  
} from '../types/dashboard'

interface UseDashboardState {
  documentosRecentes: DocumentoRecente[]
  atividades: AtividadeRecente[]
  estatisticas: EstatisticasDashboard
  carregando: boolean
  erro: string | null
}

const CHAVE_DOCUMENTOS = 'lucide_documentos_recentes'
const CHAVE_ATIVIDADES = 'lucide_atividades'

export function useDashboard() {
  const [estado, setEstado] = useState<UseDashboardState>({
    documentosRecentes: [],
    atividades: [],
    estatisticas: {
      totalDocumentos: 0,
      documentosHoje: 0,
      ultimaAtualizado: new Date(),
    },
    carregando: true,
    erro: null,
  })

  // Carregar dados do localStorage na inicialização
  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = useCallback(() => {
    try {
      const docsJSON = localStorage.getItem(CHAVE_DOCUMENTOS)
      const atividadesJSON = localStorage.getItem(CHAVE_ATIVIDADES)

      const documentos: DocumentoRecente[] = docsJSON ? JSON.parse(docsJSON) : []
      const atividades: AtividadeRecente[] = atividadesJSON ? JSON.parse(atividadesJSON) : []

      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const documentosHoje = documentos.filter((d) => {
        const dataDoc = new Date(d.dataModificacao)
        dataDoc.setHours(0, 0, 0, 0)
        return dataDoc.getTime() === hoje.getTime()
      }).length

      const areaCounts: Record<string, number> = {}
      documentos.forEach((d) => {
        if (d.areaJuridica) {
          areaCounts[d.areaJuridica] = (areaCounts[d.areaJuridica] || 0) + 1
        }
      })

      const areaMaisUsada = Object.entries(areaCounts).sort(([, a], [, b]) => b - a)[0]?.[0]

      setEstado({
        documentosRecentes: documentos.sort(
          (a, b) => new Date(b.dataModificacao).getTime() - new Date(a.dataModificacao).getTime()
        ),
        atividades: atividades.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
        estatisticas: {
          totalDocumentos: documentos.length,
          documentosHoje,
          ultimaAtualizado: new Date(),
          areaMaisUsada,
        },
        carregando: false,
        erro: null,
      })
    } catch (erro) {
      console.error('Erro ao carregar dashboard:', erro)
      setEstado((prev) => ({
        ...prev,
        carregando: false,
        erro: 'Erro ao carregar dados',
      }))
    }
  }, [])

  const criarDocumento = useCallback(
    (titulo: string, tipo: DocumentoRecente['tipo'], areaJuridica?: string): DocumentoRecente => {
      const novoDoc: DocumentoRecente = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        titulo,
        tipo,
        dataModificacao: new Date(),
        areaJuridica,
        tamanho: 0,
        status: 'ativo',
      }

      // Salvar no localStorage
      const docsJSON = localStorage.getItem(CHAVE_DOCUMENTOS)
      const documentos: DocumentoRecente[] = docsJSON ? JSON.parse(docsJSON) : []
      documentos.push(novoDoc)
      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(documentos))

      // Registrar atividade
      registrarAtividade('criacao', `Documento criado: ${titulo}`, novoDoc.id)

      // Atualizar estado
      carregarDados()

      return novoDoc
    },
    [carregarDados]
  )

  const atualizarDocumento = useCallback(
    (id: string, atualizacoes: Partial<DocumentoRecente>) => {
      const docsJSON = localStorage.getItem(CHAVE_DOCUMENTOS)
      let documentos: DocumentoRecente[] = docsJSON ? JSON.parse(docsJSON) : []

      documentos = documentos.map((d) =>
        d.id === id
          ? {
              ...d,
              ...atualizacoes,
              dataModificacao: new Date(),
            }
          : d
      )

      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(documentos))
      carregarDados()
    },
    [carregarDados]
  )

  const deletarDocumento = useCallback(
    (id: string) => {
      const docsJSON = localStorage.getItem(CHAVE_DOCUMENTOS)
      let documentos: DocumentoRecente[] = docsJSON ? JSON.parse(docsJSON) : []

      const doc = documentos.find((d) => d.id === id)
      documentos = documentos.filter((d) => d.id !== id)

      localStorage.setItem(CHAVE_DOCUMENTOS, JSON.stringify(documentos))
      registrarAtividade('edicao', `Documento deletado: ${doc?.titulo || 'desconhecido'}`)
      carregarDados()
    },
    [carregarDados]
  )

  const registrarAtividade = useCallback((
    tipo: AtividadeRecente['tipo'],
    descricao: string,
    documento?: string
  ) => {
    const atividadesJSON = localStorage.getItem(CHAVE_ATIVIDADES)
    const atividades: AtividadeRecente[] = atividadesJSON ? JSON.parse(atividadesJSON) : []

    atividades.push({
      id: `ativ_${Date.now()}`,
      tipo,
      descricao,
      documento,
      data: new Date(),
    })

    // Manter apenas últimas 100 atividades
    if (atividades.length > 100) {
      atividades.shift()
    }

    localStorage.setItem(CHAVE_ATIVIDADES, JSON.stringify(atividades))
  }, [])

  const limparTudo = useCallback(() => {
    localStorage.removeItem(CHAVE_DOCUMENTOS)
    localStorage.removeItem(CHAVE_ATIVIDADES)
    carregarDados()
  }, [carregarDados])

  return {
    documentosRecentes: estado.documentosRecentes,
    atividades: estado.atividades,
    estatisticas: estado.estatisticas,
    carregando: estado.carregando,
    erro: estado.erro,
    criarDocumento,
    atualizarDocumento,
    deletarDocumento,
    registrarAtividade,
    limparTudo,
    recarregar: carregarDados,
  }
}
