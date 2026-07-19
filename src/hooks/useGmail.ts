import { useState, useCallback } from 'react'
import { servicoGmail } from '../services/gmailService'
import type {
  ConfiguracaoSincronizacaoGmail,
  EstadoSincronizacaoGmail,
  MensagemGmail,
  ReferenceExtraida,
} from '../types/gmail'

interface UseGmailReturn {
  configuracao: ConfiguracaoSincronizacaoGmail
  estado: EstadoSincronizacaoGmail
  referencias: ReferenceExtraida[]
  estaAutenticado: boolean
  erro: string | null
  sucesso: string | null
  salvarConfiguracao: (config: Partial<ConfiguracaoSincronizacaoGmail>) => void
  buscarMensagens: (query?: string) => Promise<MensagemGmail[]>
  sincronizar: () => Promise<void>
  limparReferencias: () => void
  desconectar: () => void
}

export function useGmail(): UseGmailReturn {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoSincronizacaoGmail>(
    servicoGmail.obterConfiguracao()
  )
  const [estado, setEstado] = useState<EstadoSincronizacaoGmail>(
    servicoGmail.obterEstadoSincronizacao()
  )
  const [referencias, setReferencias] = useState<ReferenceExtraida[]>(
    servicoGmail.obterReferenciasExtraidas()
  )
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const salvarConfiguracao = useCallback((config: Partial<ConfiguracaoSincronizacaoGmail>) => {
    const novaConfig = { ...configuracao, ...config }
    servicoGmail.salvarConfiguracao(novaConfig)
    setConfiguracao(novaConfig)
  }, [configuracao])

  const buscarMensagens = useCallback(async (query?: string) => {
    try {
      setErro(null)
      const resultado = await servicoGmail.buscarMensagens(query)
      if (resultado.sucesso && resultado.mensagens) {
        setSucesso(resultado.mensagem)
        return resultado.mensagens
      } else {
        setErro(resultado.mensagem)
        return []
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro ao buscar mensagens'
      setErro(mensagem)
      return []
    }
  }, [])

  const sincronizar = useCallback(async () => {
    try {
      setErro(null)
      const resultado = await servicoGmail.sincronizar()
      if (resultado.sucesso) {
        setSucesso(resultado.mensagem)
        setEstado(servicoGmail.obterEstadoSincronizacao())
        setReferencias(servicoGmail.obterReferenciasExtraidas())
      } else {
        setErro(resultado.mensagem)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao sincronizar')
    }
  }, [])

  const limparReferencias = useCallback(() => {
    servicoGmail.limparReferencias()
    setReferencias([])
    setSucesso('Referências removidas')
  }, [])

  const desconectar = useCallback(() => {
    servicoGmail.desconectar()
    setConfiguracao(servicoGmail.obterConfiguracao())
    setEstado(servicoGmail.obterEstadoSincronizacao())
    setReferencias([])
    setSucesso('Desconectado do Gmail')
  }, [])

  return {
    configuracao,
    estado,
    referencias,
    estaAutenticado: servicoGmail.estaAutenticado(),
    erro,
    sucesso,
    salvarConfiguracao,
    buscarMensagens,
    sincronizar,
    limparReferencias,
    desconectar,
  }
}
