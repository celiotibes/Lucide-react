'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Pessoa {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  papeis: string[];
}

const PAPEIS = [
  { value: 'locatario', label: 'Locatário' },
  { value: 'fiador', label: 'Fiador' },
  { value: 'investidor', label: 'Investidor' },
  { value: 'prestador_fixo', label: 'Prestador fixo' },
  { value: 'prestador_eventual', label: 'Prestador eventual' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'fornecedor', label: 'Fornecedor' },
];

export default function PaginaEditarPessoa({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [pessoaId, setPessoaId] = useState('');
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [papeisSelecionados, setPapeisSelecionados] = useState<string[]>([]);

  const [formulario, setFormulario] = useState({
    nome: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    endereco: '',
  });

  useEffect(() => {
    params.then(({ id }) => {
      setPessoaId(id);
      buscarPessoa(id);
    });
  }, [params]);

  async function buscarPessoa(id: string) {
    try {
      const res = await fetch(`/api/pessoas/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPessoa(data);
        setFormulario({
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj || '',
          email: data.email || '',
          telefone: data.telefone || '',
          endereco: data.endereco || '',
        });
        setPapeisSelecionados(data.papeis || []);
      } else {
        setErro('Pessoa não encontrada');
      }
    } catch (e) {
      setErro('Erro ao carregar pessoa');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.nome.trim()) {
      setErro('Nome é obrigatório');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/pessoas/${pessoaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formulario,
          papeis: papeisSelecionados,
        }),
      });

      if (res.ok) {
        setSucesso('Pessoa atualizada com sucesso!');
        setTimeout(() => {
          router.push('/pessoas');
        }, 2000);
      } else {
        const data = await res.json();
        setErro(data.erro || 'Erro ao atualizar pessoa');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  function togglePapel(papel: string) {
    setPapeisSelecionados((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel]
    );
  }

  if (!pessoa) {
    return <p>Carregando...</p>;
  }

  return (
    <div className="container-editar-pessoa">
      <div className="cabecalho-lista">
        <h2>Editar pessoa</h2>
        <Link href="/pessoas" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

      <form onSubmit={handleSubmit} className="formulario-pessoa">
        <div className="secao-formulario">
          <h3>Informações básicas</h3>

          <div className="campo-formulario">
            <label htmlFor="nome">Nome *</label>
            <input
              id="nome"
              type="text"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              placeholder="Maria Silva"
              required
            />
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="cpf_cnpj">CPF/CNPJ</label>
              <input
                id="cpf_cnpj"
                type="text"
                value={formulario.cpf_cnpj}
                onChange={(e) => setFormulario({ ...formulario, cpf_cnpj: e.target.value })}
                placeholder="000.000.000-00"
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={formulario.email}
                onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
                placeholder="maria@exemplo.com"
              />
            </div>
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="telefone">Telefone</label>
              <input
                id="telefone"
                type="tel"
                value={formulario.telefone}
                onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
                placeholder="(41) 9999-9999"
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="endereco">Endereço</label>
              <input
                id="endereco"
                type="text"
                value={formulario.endereco}
                onChange={(e) => setFormulario({ ...formulario, endereco: e.target.value })}
                placeholder="Rua das Flores, 123"
              />
            </div>
          </div>
        </div>

        <div className="secao-formulario">
          <h3>Papéis (opcional)</h3>
          <div className="grupo-checkboxes">
            {PAPEIS.map((papel) => (
              <label key={papel.value} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={papeisSelecionados.includes(papel.value)}
                  onChange={() => togglePapel(papel.value)}
                />
                ☑️ {papel.label}
              </label>
            ))}
          </div>
        </div>

        <div className="botoes-formulario">
          <Link href="/pessoas" className="botao-cancelar">
            Cancelar
          </Link>
          <button type="submit" className="botao-enviar" disabled={loading}>
            {loading ? 'Salvando...' : '✓ Salvar alterações'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .container-editar-pessoa {
          max-width: 700px;
        }

        .formulario-pessoa {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .secao-formulario {
          margin-bottom: 30px;
        }

        .secao-formulario h3 {
          font-size: 1rem;
          margin-bottom: 15px;
          color: #333;
          padding-bottom: 10px;
          border-bottom: 2px solid #f0f0f0;
        }

        .campo-formulario {
          margin-bottom: 15px;
        }

        .campo-formulario label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
          font-size: 0.95rem;
        }

        .campo-formulario input {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .campo-formulario input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .linha-campos {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        @media (max-width: 600px) {
          .linha-campos {
            grid-template-columns: 1fr;
          }
        }

        .grupo-checkboxes {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #f9f9f9;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .checkbox-item:hover {
          background: #f0f5ff;
          border-color: #007bff;
        }

        .checkbox-item input[type='checkbox'] {
          cursor: pointer;
          width: 18px;
          height: 18px;
          margin: 0;
        }

        .botoes-formulario {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .botao-cancelar,
        .botao-enviar {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 500;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }

        .botao-cancelar {
          background: #f0f0f0;
          color: #333;
        }

        .botao-cancelar:hover {
          background: #e0e0e0;
        }

        .botao-enviar {
          background: #28a745;
          color: white;
        }

        .botao-enviar:hover:not(:disabled) {
          background: #218838;
        }

        .botao-enviar:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .mensagem-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }

        .mensagem-sucesso {
          background: #d4edda;
          color: #155724;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #c3e6cb;
        }
      `}</style>
    </div>
  );
}
