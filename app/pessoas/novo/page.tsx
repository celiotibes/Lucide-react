'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PAPEIS = [
  { value: 'locatario', label: 'Locatário' },
  { value: 'fiador', label: 'Fiador' },
  { value: 'investidor', label: 'Investidor' },
  { value: 'prestador_fixo', label: 'Prestador fixo' },
  { value: 'prestador_eventual', label: 'Prestador eventual' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'fornecedor', label: 'Fornecedor' },
];

export default function PaginaNovaPessoa() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [papeisSelecionados, setPapeisSelecionados] = useState<string[]>([]);

  const [formulario, setFormulario] = useState({
    nome: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    endereco: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');

    if (!formulario.nome.trim()) {
      setErro('Nome é obrigatório');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/pessoas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formulario,
          papeis: papeisSelecionados,
        }),
      });

      if (res.ok) {
        router.push('/pessoas');
      } else {
        const data = await res.json();
        setErro(data.erro || 'Erro ao criar pessoa');
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

  return (
    <div className="container-nova-pessoa">
      <div className="cabecalho-lista">
        <h2>Nova pessoa</h2>
        <Link href="/pessoas" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}

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
            {loading ? 'Criando...' : '✓ Criar pessoa'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .container-nova-pessoa {
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
      `}</style>
    </div>
  );
}
