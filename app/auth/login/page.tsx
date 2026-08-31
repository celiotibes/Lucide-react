'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!email.trim()) {
      setErro('Email é obrigatório');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setSucesso('Verifique seu email para fazer login');
        setEmail('');
      } else {
        setErro(data.erro || 'Erro ao enviar link de login');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-auth">
      <div className="card-login">
        <h1>CRMT Gestão Imobiliária</h1>
        <p className="subtitle">Entre com seu email para receber link de acesso</p>

        {erro && <div className="mensagem-erro">{erro}</div>}
        {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

        <form onSubmit={handleLogin} className="formulario-login">
          <div className="campo-formulario">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="botao-login" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar link de acesso'}
          </button>
        </form>

        <p className="texto-ajuda">
          Você receberá um link de login por email. O link expira em 24 horas.
        </p>

        <hr className="divisor" />

        <p className="rodape">
          <Link href="/">← Voltar à home</Link>
        </p>
      </div>

      <style jsx>{`
        .container-auth {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .card-login {
          background: white;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          width: 100%;
          max-width: 400px;
        }

        h1 {
          text-align: center;
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }

        .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
          font-size: 14px;
        }

        .formulario-login {
          margin: 30px 0;
        }

        .campo-formulario {
          margin-bottom: 20px;
        }

        .campo-formulario label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
          font-size: 14px;
        }

        .campo-formulario input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .campo-formulario input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .campo-formulario input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .botao-login {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .botao-login:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(102, 126, 234, 0.3);
        }

        .botao-login:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .texto-ajuda {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 15px;
          line-height: 1.5;
        }

        .divisor {
          border: none;
          border-top: 1px solid #eee;
          margin: 25px 0;
        }

        .rodape {
          text-align: center;
          font-size: 13px;
        }

        .rodape a {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
        }

        .rodape a:hover {
          text-decoration: underline;
        }

        .mensagem-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #f5c6cb;
          font-size: 14px;
        }

        .mensagem-sucesso {
          background: #d4edda;
          color: #155724;
          padding: 12px 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #c3e6cb;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
