'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Usuario {
  id: string;
  email: string;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  papel: string;
  criado_em: string;
}

interface Pessoa {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

const PAPEIS = ['admin', 'economista', 'inquilino', 'investidor', 'prestador'] as const;

export default function PaginaUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [usuarioEditando, setUsuarioEditando] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ pessoa_id: string | null; papel: string }>({
    pessoa_id: null,
    papel: 'inquilino',
  });

  useEffect(() => {
    async function carregar() {
      try {
        const [resUsuarios, resPessoas] = await Promise.all([
          fetch('/api/usuarios'),
          fetch('/api/pessoas'),
        ]);

        if (!resUsuarios.ok) {
          if (resUsuarios.status === 403) {
            setErro('Você não tem permissão para acessar esta página (admin/economista apenas)');
          } else {
            setErro('Erro ao carregar usuários');
          }
          return;
        }

        const dataUsuarios = await resUsuarios.json();
        setUsuarios(dataUsuarios);

        if (resPessoas.ok) {
          const dataPessoas = await resPessoas.json();
          setPessoas(dataPessoas);
        }
      } catch (err) {
        setErro('Erro ao carregar dados');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  async function aoEditarUsuario(usuario: Usuario) {
    setUsuarioEditando(usuario.id);
    setFormData({
      pessoa_id: usuario.pessoa_id,
      papel: usuario.papel,
    });
  }

  async function aoSalvar(usuarioId: string) {
    setAtualizando(usuarioId);
    setErro('');
    setMensagem('');

    try {
      const res = await fetch('/api/usuarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuarioId,
          pessoa_id: formData.pessoa_id,
          papel: formData.papel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErro(data.erro || 'Erro ao atualizar usuário');
        return;
      }

      const usuarioAtualizado = await res.json();
      setUsuarios(usuarios.map((u) => (u.id === usuarioId ? usuarioAtualizado : u)));
      setMensagem('Usuário atualizado com sucesso');
      setUsuarioEditando(null);

      setTimeout(() => setMensagem(''), 3000);
    } catch (err) {
      setErro('Erro ao atualizar usuário');
    } finally {
      setAtualizando(null);
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

  return (
    <div className="container">
      <div className="cabecalho-lista">
        <h1>Gestão de Usuários</h1>
        <Link href="/dashboard" className="botao-secundario">
          ← Dashboard
        </Link>
      </div>

      <div className="card-info">
        <p>
          <strong>Total de usuários:</strong> {usuarios.length}
        </p>
        <p className="hint">
          Associe usuários a pessoas no sistema e atribua seus papéis (admin, inquilino, investidor, prestador).
        </p>
      </div>

      {erro && <div className="erro-box">{erro}</div>}
      {mensagem && <div className="sucesso-box">{mensagem}</div>}

      <div className="tabela-container">
        <table className="tabela-usuarios">
          <thead>
            <tr>
              <th>Email</th>
              <th>Pessoa Vinculada</th>
              <th>Papel</th>
              <th>Data de Criação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className={usuarioEditando === usuario.id ? 'editando' : ''}>
                <td>
                  <code className="email-code">{usuario.email}</code>
                </td>
                <td>
                  {usuarioEditando === usuario.id ? (
                    <select
                      value={formData.pessoa_id || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, pessoa_id: e.target.value || null })
                      }
                      className="select-inline"
                    >
                      <option value="">— Sem vínculo —</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                          {p.cpf_cnpj && ` (${p.cpf_cnpj})`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={usuario.pessoa_nome ? '' : 'sem-vinculo'}>
                      {usuario.pessoa_nome || '(sem vínculo)'}
                    </span>
                  )}
                </td>
                <td>
                  {usuarioEditando === usuario.id ? (
                    <select
                      value={formData.papel}
                      onChange={(e) => setFormData({ ...formData, papel: e.target.value })}
                      className="select-inline"
                    >
                      {PAPEIS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`tag papel-${usuario.papel}`}>{usuario.papel}</span>
                  )}
                </td>
                <td className="data-criacao">
                  {new Date(usuario.criado_em).toLocaleDateString('pt-BR')}
                </td>
                <td className="acoes">
                  {usuarioEditando === usuario.id ? (
                    <>
                      <button
                        onClick={() => aoSalvar(usuario.id)}
                        disabled={atualizando === usuario.id}
                        className="btn-pequeno btn-sucesso"
                      >
                        ✓ Salvar
                      </button>
                      <button
                        onClick={() => setUsuarioEditando(null)}
                        className="btn-pequeno btn-cancelar"
                      >
                        ✕ Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => aoEditarUsuario(usuario)}
                      className="btn-pequeno btn-editar"
                    >
                      ✏️ Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .cabecalho-lista {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        h1 {
          margin: 0;
          color: #333;
          font-size: 28px;
        }

        .card-info {
          background: #e7f3ff;
          border-left: 4px solid #0066cc;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .card-info p {
          margin: 8px 0;
          color: #333;
          font-size: 14px;
        }

        .card-info p:first-child {
          margin-top: 0;
        }

        .hint {
          color: #666;
          font-size: 12px;
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

        .sucesso-box {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
          border-radius: 4px;
          padding: 12px 15px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .tabela-container {
          background: white;
          border-radius: 8px;
          overflow-x: auto;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .tabela-usuarios {
          width: 100%;
          border-collapse: collapse;
        }

        .tabela-usuarios th {
          background: #f5f5f5;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #eee;
        }

        .tabela-usuarios td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          color: #333;
          font-size: 14px;
        }

        .tabela-usuarios tr:hover {
          background: #f9f9f9;
        }

        .tabela-usuarios tr.editando {
          background: #f0f5ff;
        }

        .email-code {
          background: #f5f5f5;
          padding: 4px 8px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          color: #555;
        }

        .sem-vinculo {
          color: #999;
          font-style: italic;
        }

        .tag {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tag.papel-admin {
          background: #ff6b6b;
          color: white;
        }

        .tag.papel-economista {
          background: #4ecdc4;
          color: white;
        }

        .tag.papel-inquilino {
          background: #95e1d3;
          color: #333;
        }

        .tag.papel-investidor {
          background: #ffa502;
          color: white;
        }

        .tag.papel-prestador {
          background: #6c5ce7;
          color: white;
        }

        .data-criacao {
          color: #999;
          font-size: 12px;
        }

        .acoes {
          white-space: nowrap;
        }

        .select-inline {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #0066cc;
          border-radius: 3px;
          font-size: 13px;
          font-family: inherit;
          background: white;
        }

        .btn-pequeno {
          padding: 6px 12px;
          margin-right: 6px;
          border: none;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-editar {
          background: #0066cc;
          color: white;
        }

        .btn-editar:hover {
          background: #0052a3;
        }

        .btn-sucesso {
          background: #28a745;
          color: white;
        }

        .btn-sucesso:hover:not(:disabled) {
          background: #218838;
        }

        .btn-sucesso:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-cancelar {
          background: #ccc;
          color: #333;
        }

        .btn-cancelar:hover {
          background: #bbb;
        }

        .botao-secundario {
          padding: 8px 16px;
          background: #f0f0f0;
          color: #333;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s;
        }

        .botao-secundario:hover {
          background: #e0e0e0;
        }

        .card-vazio {
          background: white;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}
