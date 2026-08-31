'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Usuario {
  id: string;
  email: string;
  user_metadata?: {
    nome?: string;
  };
}

export default function PaginaMeuPerfil() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    buscarUsuario();
  }, []);

  async function buscarUsuario() {
    try {
      const res = await fetch('/api/auth/usuario');
      if (res.ok) {
        const data = await res.json();
        setUsuario(data);
      } else {
        setErro('Erro ao carregar dados do usuário');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (!confirm('Tem certeza que deseja fazer logout?')) return;

    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (res.ok) {
        router.push('/auth/login');
      } else {
        setErro('Erro ao fazer logout');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    }
  }

  if (loading) {
    return <p>Carregando...</p>;
  }

  if (erro) {
    return (
      <div>
        <div className="mensagem-erro">{erro}</div>
        <Link href="/">← Voltar</Link>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div>
        <p>Usuário não encontrado</p>
        <Link href="/auth/login">Fazer login</Link>
      </div>
    );
  }

  return (
    <div className="container-perfil">
      <div className="cabecalho-lista">
        <h2>Meu Perfil</h2>
        <Link href="/" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      <div className="card-perfil">
        <div className="secao-perfil">
          <h3>Informações da Conta</h3>

          <div className="info-item">
            <label>Email</label>
            <p>{usuario.email}</p>
          </div>

          <div className="info-item">
            <label>ID do Usuário</label>
            <p className="monospace">{usuario.id}</p>
          </div>
        </div>

        <div className="secao-perfil">
          <h3>Ações</h3>

          <button onClick={handleLogout} className="botao-logout">
            🚪 Fazer logout
          </button>
        </div>
      </div>

      <style jsx>{`
        .container-perfil {
          max-width: 600px;
        }

        .card-perfil {
          background: white;
          border-radius: 8px;
          padding: 30px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .secao-perfil {
          margin-bottom: 30px;
          padding-bottom: 30px;
          border-bottom: 1px solid #eee;
        }

        .secao-perfil:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .secao-perfil h3 {
          color: #333;
          margin-bottom: 20px;
          font-size: 16px;
        }

        .info-item {
          margin-bottom: 15px;
        }

        .info-item label {
          display: block;
          color: #666;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-item p {
          color: #333;
          font-size: 15px;
          margin: 0;
          padding: 10px;
          background: #f9f9f9;
          border-radius: 4px;
        }

        .info-item p.monospace {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          word-break: break-all;
        }

        .botao-logout {
          background: #dc3545;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }

        .botao-logout:hover {
          background: #c82333;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }

        .mensagem-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
}
