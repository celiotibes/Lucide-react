/**
 * Hook de Autenticação
 * Gerencia estado de autenticação do usuário
 */

import { useState, useCallback, useEffect } from 'react'
import { servicoAutenticacao } from '../services/authService'

interface Usuario {
  id: string
  nome: string
  email: string
  dataCriacao: Date
  ultimoAcesso: Date
}

interface UseAuthState {
  usuario: Usuario | null
  estaLogado: boolean
  carregando: boolean
  erro: string | null
}

export function useAuth() {
  const [estado, setEstado] = useState<UseAuthState>({
    usuario: null,
    estaLogado: false,
    carregando: true,
    erro: null,
  })

  // Verificar se está logado ao montar
  useEffect(() => {
    const usuario = servicoAutenticacao.obterUsuarioAtual()
    setEstado({
      usuario,
      estaLogado: usuario !== null,
      carregando: false,
      erro: null,
    })
  }, [])

  const registrar = useCallback((email: string, senha: string, nome: string) => {
    setEstado(prev => ({
      ...prev,
      carregando: true,
      erro: null,
    }))

    const resultado = servicoAutenticacao.registrar(email, senha, nome)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: null,
      }))
      return { sucesso: true }
    } else {
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: resultado.mensagem || 'Erro ao registrar',
      }))
      return { sucesso: false, mensagem: resultado.mensagem }
    }
  }, [])

  const login = useCallback((email: string, senha: string) => {
    setEstado(prev => ({
      ...prev,
      carregando: true,
      erro: null,
    }))

    const resultado = servicoAutenticacao.login(email, senha)

    if (resultado.sucesso && resultado.usuario) {
      setEstado({
        usuario: resultado.usuario,
        estaLogado: true,
        carregando: false,
        erro: null,
      })
      return { sucesso: true }
    } else {
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: resultado.mensagem || 'Erro ao fazer login',
      }))
      return { sucesso: false, mensagem: resultado.mensagem }
    }
  }, [])

  const logout = useCallback(() => {
    const sucesso = servicoAutenticacao.logout()

    if (sucesso) {
      setEstado({
        usuario: null,
        estaLogado: false,
        carregando: false,
        erro: null,
      })
      return true
    }
    return false
  }, [])

  const limparErro = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      erro: null,
    }))
  }, [])

  return {
    usuario: estado.usuario,
    estaLogado: estado.estaLogado,
    carregando: estado.carregando,
    erro: estado.erro,
    registrar,
    login,
    logout,
    limparErro,
  }
}
