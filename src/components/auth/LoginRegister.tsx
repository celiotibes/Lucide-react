/**
 * Componente de Login e Registro
 * Interface para autenticação de usuários
 */

import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import './LoginRegister.css'

interface LoginRegisterProps {
  onLoginSuccess?: () => void
}

export function LoginRegister({ onLoginSuccess }: LoginRegisterProps) {
  const { login, registrar, erro, limparErro, carregando } = useAuth()
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroLocal(null)
    limparErro()

    if (!email || !senha) {
      setErroLocal('Email e senha são obrigatórios')
      return
    }

    const resultado = login(email, senha)
    if (resultado.sucesso) {
      setEmail('')
      setSenha('')
      if (onLoginSuccess) {
        onLoginSuccess()
      }
    } else {
      setErroLocal(resultado.mensagem || 'Erro ao fazer login')
    }
  }

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroLocal(null)
    limparErro()

    if (!email || !senha || !nome) {
      setErroLocal('Todos os campos são obrigatórios')
      return
    }

    const resultado = registrar(email, senha, nome)
    if (resultado.sucesso) {
      setErroLocal(null)
      setModo('login')
      setEmail('')
      setSenha('')
      setNome('')
      setErroLocal('Registro realizado com sucesso! Faça login para continuar.')
    } else {
      setErroLocal(resultado.mensagem || 'Erro ao registrar')
    }
  }

  return (
    <div className="login-register-container">
      <div className="login-register-box">
        <div className="auth-header">
          <h1>⚖️ Lucide-react</h1>
          <p>Plataforma de Pesquisa Jurídica</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`tab-btn ${modo === 'login' ? 'ativo' : ''}`}
            onClick={() => {
              setModo('login')
              setErroLocal(null)
            }}
          >
            🔐 Login
          </button>
          <button
            className={`tab-btn ${modo === 'registro' ? 'ativo' : ''}`}
            onClick={() => {
              setModo('registro')
              setErroLocal(null)
            }}
          >
            ✨ Registrar
          </button>
        </div>

        {/* Modo Login */}
        {modo === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">📧 Email</label>
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={carregando}
              />
            </div>

            <div className="form-group">
              <label htmlFor="senha">🔒 Senha</label>
              <input
                id="senha"
                type="password"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={carregando}
              />
            </div>

            {(erroLocal || erro) && (
              <div className="alert alert-erro">
                ⚠️ {erroLocal || erro}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={carregando}>
              {carregando ? '⏳ Autenticando...' : '🔓 Entrar'}
            </button>
          </form>
        )}

        {/* Modo Registro */}
        {modo === 'registro' && (
          <form onSubmit={handleRegistro} className="auth-form">
            <div className="form-group">
              <label htmlFor="nome">👤 Nome Completo</label>
              <input
                id="nome"
                type="text"
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={carregando}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email-reg">📧 Email</label>
              <input
                id="email-reg"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={carregando}
              />
            </div>

            <div className="form-group">
              <label htmlFor="senha-reg">🔒 Senha</label>
              <input
                id="senha-reg"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={carregando}
              />
            </div>

            {(erroLocal || erro) && (
              <div className={`alert ${erroLocal?.includes('sucesso') ? 'alert-sucesso' : 'alert-erro'}`}>
                {erroLocal?.includes('sucesso') ? '✓' : '⚠️'} {erroLocal || erro}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={carregando}>
              {carregando ? '⏳ Registrando...' : '✨ Criar Conta'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>🧪 Demo: Dados salvos em localStorage (development only)</p>
        </div>
      </div>
    </div>
  )
}
