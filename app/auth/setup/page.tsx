'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Pessoa {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
}

const PAPEIS = ['inquilino', 'investidor', 'prestador'] as const;

export default function PaginaSetup() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ id: string; email: string } | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pessoaSelecionada, setPessoaSelecionada] = useState('');
  const [papel, setPapel] = useState<typeof PAPEIS[number]>('inquilino');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch('/api/auth/usuario');
        if (!res.ok) {
          router.push('/auth/login');
          return;
        }

        const user = await res.json();
        setUsuario(user);

        const resPessoas = await fetch('/api/pessoas');
        if (resPessoas.ok) {
          setPessoas(await resPessoas.json());
        }
      } catch (err) {
        setErro('Erro ao carregar dados');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [router]);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (!pessoaSelecionada) {
      setErro('Selecione uma pessoa');
      return;
    }

    setEnviando(true);
    setErro('');

    try {
      const res = await fetch('/api/auth/usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pessoa_id: pessoaSelecionada,
          papel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || 'Erro ao vincular usuário');
        return;
      }

      setSucesso(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      setErro('Erro ao vincular usuário a pessoa');
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <div className="container">
        <div className="card-vazio">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="container">
        <div className="card-sucesso">
          <h2>✅ Configuração concluída!</h2>
          <p>Redirecionando para o dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card-setup">
        <h1>Completar Configuração</h1>
        <p className="subtitle">Associe sua conta a um perfil no sistema</p>

        <div className="info-box">
          <p>
            <strong>Email:</strong> {usuario?.email}
          </p>
          <p className="hint">
            Selecione o perfil correspondente a você no sistema para habilitar acesso aos seus contratos, imóveis e outros dados.
          </p>
        </div>

        {erro && <div className="erro-box">{erro}</div>}

        <form onSubmit={aoSubmeter}>
          <div className="form-group">
            <label htmlFor="pessoa">Qual é você no sistema? *</label>
            <select
              id="pessoa"
              value={pessoaSelecionada}
              onChange={(e) => setPessoaSelecionada(e.target.value)}
              required
            >
              <option value="">— Selecione —</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.cpf_cnpj && ` (${p.cpf_cnpj})`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="papel">Qual é seu papel? *</label>
            <select
              id="papel"
              value={papel}
              onChange={(e) => setPapel(e.target.value as typeof PAPEIS[number])}
              required
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {p === 'inquilino' && 'Inquilino (locatário)'}
                  {p === 'investidor' && 'Investidor (proprietário)'}
                  {p === 'prestador' && 'Prestador de serviço'}
                </option>
              ))}
            </select>
            <small className="hint">
              {papel === 'inquilino' &&
                'Você terá acesso ao portal do inquilino, vendo apenas seus contratos e pagamentos.'}
              {papel === 'investidor' &&
                'Você terá acesso ao dashboard completo, vendo seus imóveis, contratos e extratos.'}
              {papel === 'prestador' &&
                'Você poderá registrar apontamentos e acompanhar sua folha.'}
            </small>
          </div>

          <button
            type="submit"
            disabled={enviando || !pessoaSelecionada}
            className="botao-primario"
          >
            {enviando ? 'Processando...' : 'Confirmar e Continuar'}
          </button>
        </form>

        <div className="card-info">
          <p>
            <strong>Não encontrou sua pessoa?</strong> Entre em contato com o gestor do sistema para criar seu cadastro.
          </p>
          <p>
            <Link href="/meu-perfil">← Voltar ao perfil</Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }

        .card-setup {
          background: white;
          border-radius: 8px;
          padding: 40px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        h1 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 28px;
        }

        .subtitle {
          margin: 0 0 30px 0;
          color: #666;
          font-size: 16px;
        }

        .info-box {
          background: #f0f5ff;
          border-left: 4px solid #0066cc;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 30px;
        }

        .info-box p {
          margin: 8px 0;
          color: #333;
          font-size: 14px;
        }

        .info-box p:first-child {
          margin-top: 0;
        }

        .hint {
          color: #666;
          font-size: 12px;
          display: block;
          margin-top: 8px;
        }

        .erro-box {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 12px 15px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        label {
          display: block;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          font-size: 14px;
        }

        select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          background: white;
        }

        select:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
        }

        .botao-primario {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-primario:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }

        .botao-primario:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .card-info {
          background: #e7f3ff;
          border-left: 4px solid #0066cc;
          border-radius: 4px;
          padding: 15px;
          margin-top: 30px;
          font-size: 14px;
          color: #333;
        }

        .card-info p {
          margin: 8px 0;
        }

        .card-info p:first-child {
          margin-top: 0;
        }

        .card-info a {
          color: #0066cc;
          text-decoration: none;
          font-weight: 600;
        }

        .card-info a:hover {
          text-decoration: underline;
        }

        .card-vazio {
          background: white;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .card-sucesso {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          color: #155724;
        }

        .card-sucesso h2 {
          margin: 0 0 10px 0;
          font-size: 24px;
        }

        .card-sucesso p {
          margin: 8px 0;
        }
      `}</style>
    </div>
  );
}
