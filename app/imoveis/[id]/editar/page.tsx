'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Imovel {
  id: string;
  identificacao: string;
  tipo: string;
  cep: string | null;
  endereco: string | null;
  cidade_id: string;
  permite_coliving: boolean;
  permite_temporada: boolean;
  observacoes: string | null;
}

interface Cidade {
  id: string;
  nome: string;
}

export default function PaginaEditarImovel({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [imovelId, setImovelId] = useState('');
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [formulario, setFormulario] = useState({
    identificacao: '',
    tipo: 'apartamento' as string,
    cep: '',
    endereco: '',
    cidade_id: '',
    permite_coliving: false,
    permite_temporada: false,
    observacoes: '',
  });

  useEffect(() => {
    params.then(({ id }) => {
      setImovelId(id);
      buscarImovel(id);
      buscarCidades();
    });
  }, [params]);

  async function buscarImovel(id: string) {
    try {
      const res = await fetch(`/api/imoveis/${id}`);
      if (res.ok) {
        const data = await res.json();
        setImovel(data);
        setFormulario({
          identificacao: data.identificacao,
          tipo: data.tipo,
          cep: data.cep || '',
          endereco: data.endereco || '',
          cidade_id: data.cidade_id,
          permite_coliving: data.permite_coliving,
          permite_temporada: data.permite_temporada,
          observacoes: data.observacoes || '',
        });
      } else {
        setErro('Imóvel não encontrado');
      }
    } catch (e) {
      setErro('Erro ao carregar imóvel');
    }
  }

  async function buscarCidades() {
    try {
      const res = await fetch('/api/cidades');
      if (res.ok) {
        setCidades(await res.json());
      }
    } catch (e) {
      setErro('Erro ao carregar cidades');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.identificacao || !formulario.cidade_id) {
      setErro('Identificação e cidade são obrigatórios');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/imoveis/${imovelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formulario),
      });

      if (res.ok) {
        setSucesso('Imóvel atualizado com sucesso!');
        setTimeout(() => {
          router.push('/imoveis');
        }, 2000);
      } else {
        const erro = await res.json();
        setErro(erro.erro || 'Erro ao atualizar imóvel');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja deletar este imóvel? Esta ação não pode ser desfeita.')) {
      return;
    }

    setLoading(true);
    setErro('');

    try {
      const res = await fetch(`/api/imoveis/${imovelId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSucesso('Imóvel deletado com sucesso!');
        setTimeout(() => {
          router.push('/imoveis');
        }, 2000);
      } else {
        const erro = await res.json();
        setErro(erro.erro || 'Erro ao deletar imóvel');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  if (!imovel) {
    return <p>Carregando...</p>;
  }

  return (
    <div className="container-editar-imovel">
      <div className="cabecalho-lista">
        <h2>Editar imóvel</h2>
        <Link href="/imoveis" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

      <form onSubmit={handleSubmit} className="formulario-imovel">
        <div className="secao-formulario">
          <h3>Informações básicas</h3>

          <div className="campo-formulario">
            <label htmlFor="identificacao">Identificação *</label>
            <input
              id="identificacao"
              type="text"
              value={formulario.identificacao}
              onChange={(e) => setFormulario({ ...formulario, identificacao: e.target.value })}
              placeholder="ex: Apto 14, Kitnet 16"
              required
            />
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="tipo">Tipo *</label>
              <select
                id="tipo"
                value={formulario.tipo}
                onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                required
              >
                <option value="apartamento">Apartamento</option>
                <option value="kitnet">Kitnet</option>
                <option value="casa">Casa</option>
                <option value="sala">Sala comercial</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div className="campo-formulario">
              <label htmlFor="cidade">Cidade *</label>
              <select
                id="cidade"
                value={formulario.cidade_id}
                onChange={(e) => setFormulario({ ...formulario, cidade_id: e.target.value })}
                required
              >
                <option value="">— Selecione uma cidade —</option>
                {cidades.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="endereco">Endereço</label>
              <input
                id="endereco"
                type="text"
                value={formulario.endereco}
                onChange={(e) => setFormulario({ ...formulario, endereco: e.target.value })}
              />
            </div>
            <div className="campo-formulario">
              <label htmlFor="cep">CEP</label>
              <input
                id="cep"
                type="text"
                value={formulario.cep}
                onChange={(e) => setFormulario({ ...formulario, cep: e.target.value })}
                placeholder="00000-000"
              />
            </div>
          </div>
        </div>

        <div className="secao-formulario">
          <h3>Características</h3>

          <div className="grupo-checkboxes">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={formulario.permite_coliving}
                onChange={(e) => setFormulario({ ...formulario, permite_coliving: e.target.checked })}
              />
              ☑️ Permite coliving (múltiplos quartos com inquilinos diferentes)
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={formulario.permite_temporada}
                onChange={(e) => setFormulario({ ...formulario, permite_temporada: e.target.checked })}
              />
              ☑️ Permite temporada (Airbnb/Booking)
            </label>
          </div>

          <div className="campo-formulario">
            <label htmlFor="observacoes">Observações</label>
            <textarea
              id="observacoes"
              value={formulario.observacoes}
              onChange={(e) => setFormulario({ ...formulario, observacoes: e.target.value })}
              rows={4}
              placeholder="Notas adicionais sobre o imóvel..."
            />
          </div>
        </div>

        <div className="botoes-formulario">
          <Link href="/imoveis" className="botao-cancelar">
            Cancelar
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="botao-deletar"
            disabled={loading}
            title="Deletar este imóvel"
          >
            {loading ? '⏳ Processando...' : '🗑️ Deletar'}
          </button>
          <button type="submit" className="botao-enviar" disabled={loading}>
            {loading ? 'Salvando...' : '✓ Salvar alterações'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .container-editar-imovel {
          max-width: 700px;
        }

        .formulario-imovel {
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

        .campo-formulario input,
        .campo-formulario select,
        .campo-formulario textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .campo-formulario input:focus,
        .campo-formulario select:focus,
        .campo-formulario textarea:focus {
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
        .botao-deletar,
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

        .botao-deletar {
          background: #dc3545;
          color: white;
        }

        .botao-deletar:hover:not(:disabled) {
          background: #c82333;
        }

        .botao-deletar:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
