/**
 * Hook para usar relatórios
 */

import { useState, useCallback } from 'react'
import { servicoRelatorios } from '../services/reportService'
import type { ConfiguracaoRelatorio, Relatorio, TemplateRelatorio } from '../types/reports'

export function useReports() {
  const [relatorios, setRelatorios] = useState<Relatorio[]>(servicoRelatorios.obterTodos())
  const [templates, setTemplates] = useState<TemplateRelatorio[]>(servicoRelatorios.obterTemplates())
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const limparMensagens = useCallback(() => {
    setErro(null)
    setSucesso(null)
  }, [])

  const gerarRelatorio = useCallback((config: ConfiguracaoRelatorio, conteudo: string) => {
    setCarregando(true)
    limparMensagens()

    try {
      const resultado = servicoRelatorios.gerarRelatorio(config, conteudo)

      if (resultado.sucesso) {
        setRelatorios(servicoRelatorios.obterTodos())
        setSucesso(resultado.mensagem)
        setCarregando(false)
        return { sucesso: true, relatorioId: resultado.relatorioId }
      } else {
        setErro(resultado.mensagem)
        setCarregando(false)
        return { sucesso: false }
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro ao gerar relatório'
      setErro(mensagem)
      setCarregando(false)
      return { sucesso: false }
    }
  }, [limparMensagens])

  const obterTodos = useCallback(() => {
    return servicoRelatorios.obterTodos()
  }, [])

  const obterPorDocumento = useCallback((documentoId: string) => {
    return servicoRelatorios.obterPorDocumento(documentoId)
  }, [])

  const obterPorTipo = useCallback((tipo: string) => {
    return servicoRelatorios.obterPorTipo(tipo)
  }, [])

  const deletar = useCallback((relatorioId: string) => {
    const resultado = servicoRelatorios.deletar(relatorioId)

    if (resultado.sucesso) {
      setRelatorios(servicoRelatorios.obterTodos())
      setSucesso(resultado.mensagem)
    } else {
      setErro(resultado.mensagem)
    }
  }, [])

  const marcarFavorito = useCallback((relatorioId: string, favorito: boolean) => {
    const resultado = servicoRelatorios.marcarFavorito(relatorioId, favorito)

    if (resultado.sucesso) {
      setRelatorios(servicoRelatorios.obterTodos())
      setSucesso(resultado.mensagem)
    } else {
      setErro(resultado.mensagem)
    }
  }, [])

  const salvarTemplate = useCallback((template: TemplateRelatorio) => {
    const resultado = servicoRelatorios.salvarTemplate(template)

    if (resultado.sucesso) {
      setTemplates(servicoRelatorios.obterTemplates())
      setSucesso(resultado.mensagem)
      return { sucesso: true }
    } else {
      setErro(resultado.mensagem)
      return { sucesso: false }
    }
  }, [])

  const deletarTemplate = useCallback((templateId: string) => {
    const resultado = servicoRelatorios.deletarTemplate(templateId)

    if (resultado.sucesso) {
      setTemplates(servicoRelatorios.obterTemplates())
      setSucesso(resultado.mensagem)
    } else {
      setErro(resultado.mensagem)
    }
  }, [])

  return {
    relatorios,
    templates,
    carregando,
    erro,
    sucesso,
    gerarRelatorio,
    obterTodos,
    obterPorDocumento,
    obterPorTipo,
    deletar,
    marcarFavorito,
    salvarTemplate,
    deletarTemplate,
    limparMensagens,
  }
}
