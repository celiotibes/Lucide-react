import { useState, useCallback } from 'react'
import { servicoGoogleDrive } from '../services/googleDriveService'
import type {
  GoogleDriveSyncConfig,
  SincronizacaoStatus,
  EstadoSincronizacao,
  GoogleDriveFile,
  ResultadoSincronizacao,
} from '../types/googleDrive'

interface UseGoogleDriveReturn {
  configuracao: GoogleDriveSyncConfig
  status: SincronizacaoStatus
  estado: EstadoSincronizacao
  estaAutenticado: boolean
  erro: string | null
  sucesso: string | null
  salvarConfiguracao: (config: Partial<GoogleDriveSyncConfig>) => void
  sincronizar: () => Promise<void>
  fazerBackup: () => Promise<void>
  restaurarBackup: (backupId: string) => Promise<void>
  listarArquivos: () => Promise<GoogleDriveFile[]>
  desconectar: () => void
}

export function useGoogleDrive(): UseGoogleDriveReturn {
  const [configuracao, setConfiguracao] = useState<GoogleDriveSyncConfig>(
    servicoGoogleDrive.obterConfiguracao()
  )
  const [status, setStatus] = useState<SincronizacaoStatus>(
    servicoGoogleDrive.obterStatusSincronizacao()
  )
  const [estado, setEstado] = useState<EstadoSincronizacao>(
    servicoGoogleDrive.obterEstadoSincronizacao()
  )
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const salvarConfiguracao = useCallback((config: Partial<GoogleDriveSyncConfig>) => {
    const novaConfig = { ...configuracao, ...config }
    servicoGoogleDrive.salvarConfiguracao(novaConfig)
    setConfiguracao(novaConfig)
  }, [configuracao])

  const sincronizar = useCallback(async () => {
    try {
      setErro(null)
      const resultado = await servicoGoogleDrive.sincronizar()
      if (resultado.sucesso) {
        setSucesso(resultado.mensagem)
        setStatus(servicoGoogleDrive.obterStatusSincronizacao())
        setEstado(servicoGoogleDrive.obterEstadoSincronizacao())
      } else {
        setErro(resultado.mensagem)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao sincronizar')
    }
  }, [])

  const fazerBackup = useCallback(async () => {
    try {
      setErro(null)
      const resultado = await servicoGoogleDrive.fazerBackup()
      if (resultado.sucesso) {
        setSucesso(resultado.mensagem)
      } else {
        setErro(resultado.mensagem)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao fazer backup')
    }
  }, [])

  const restaurarBackup = useCallback(async (backupId: string) => {
    try {
      setErro(null)
      const resultado = await servicoGoogleDrive.restaurarBackup(backupId)
      if (resultado.sucesso) {
        setSucesso(resultado.mensagem)
      } else {
        setErro(resultado.mensagem)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao restaurar backup')
    }
  }, [])

  const listarArquivos = useCallback(async () => {
    try {
      setErro(null)
      const arquivos = await servicoGoogleDrive.listarArquivos()
      return arquivos
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao listar arquivos')
      return []
    }
  }, [])

  const desconectar = useCallback(() => {
    servicoGoogleDrive.desconectar()
    setConfiguracao(servicoGoogleDrive.obterConfiguracao())
    setStatus(servicoGoogleDrive.obterStatusSincronizacao())
    setSucesso('Desconectado do Google Drive')
  }, [])

  return {
    configuracao,
    status,
    estado,
    estaAutenticado: servicoGoogleDrive.estaAutenticado(),
    erro,
    sucesso,
    salvarConfiguracao,
    sincronizar,
    fazerBackup,
    restaurarBackup,
    listarArquivos,
    desconectar,
  }
}
