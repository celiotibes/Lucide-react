'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Contrato {
  id: string;
  imovel_identificacao: string;
  tipo: string;
  data_inicio: string;
  dia_vencimento: number | null;
  valor_aluguel: string;
  indice_reajuste: string | null;
  aviso_previo_dias: number;
  status: string;
}

export default function PaginaEditarContrato({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState('');
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [formulario, setFormulario] = useState({
    dia_vencimento: 10,
    valor_aluguel: '',
    indice_reajuste: '',
    aviso_previo_dias: 30,
    status: 'ativo',
  });

  useEffect(() => {
    params.then(({ id }) => {
      setContratoId(id);
      buscarContrato(id);
    });
  }, [params]);

  async function buscarContrato(id: string) {
    try {
      const res = await fetch(`/api/contratos/${id}/editar`);
      if (res.ok) {
        const data = await res.json();
        setContrato(data);
        setFormulario({
          dia_vencimento: data.dia_vencimento || 10,
          valor_aluguel: String(data.valor_aluguel),
          indice_reajuste: data.indice_reajuste || '',
          aviso_previo_dias: data.aviso_previo_dias || 30,
          status: data.status || 'ativo',
        });
      } else {
        setErro('Contrato não encontrado');
      }
    } catch (e) {
      setErro('Erro ao carregar contrato');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.valor_aluguel || Number(formulario.valor_aluguel) <= 0) {
      setErro('Valor do aluguel deve ser maior que zero');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/contratos/${contratoId}/editar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dia_vencimento: Number(formulario.dia_vencimento),
          valor_aluguel: Number(formulario.valor_aluguel),
          indice_reajuste: formulario.indice_reajuste || null,
          aviso_previo_dias: Number(formulario.aviso_previo_dias),
          status: formulario.status,
        }),
      });

      if (res.ok) {
        setSucesso('Contrato atualizado com sucesso!');
        setTimeout(() => {
          router.push(`/contratos/${contratoId}/documentos`);
        }, 2000);
      } else {
        const data = await res.json();
        setErro(data.erro || 'Erro ao atualizar contrato');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  if (!contrato) {
    return <p>Carregando...</p>;
  }

  return (
    <div className="container-editar-contrato">
      <div className="cabecalho-lista">
        <h2>Editar contrato</h2>
        <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

      <div className="info-contrato">
        <p>
          <strong>Imóvel:</strong> {contrato.imovel_identificacao}
        </p>
        <p>
          <strong>Tipo:</strong> {contrato.tipo === 'locacao_padrao' ? 'Locação padrão' : 'Temporada'}
        </p>
        <p>
          <strong>Início:</strong> {new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="formulario-contrato">
        <div className="secao-formulario">
          <h3>Termos financeiros</h3>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="valor_aluguel">Valor do aluguel (R$) *</label>
              <input
                id="valor_aluguel"
                type="number"
                value={formulario.valor_aluguel}
                onChange={(e) => setFormulario({ ...formulario, valor_aluguel: e.target.value })}
                min="0.01"
                step="0.01"
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="dia_vencimento">Dia de vencimento (1-31)</label>
              <input
                id="dia_vencimento"
                type="number"
                value={formulario.dia_vencimento}
                onChange={(e) => setFormulario({ ...formulario, dia_vencimento: Number(e.target.value) })}
                min="1"
                max="31"
              />
            </div>
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="indice_reajuste">Índice de reajuste</label>
              <select
                id="indice_reajuste"
                value={formulario.indice_reajuste}
                onChange={(e) => setFormulario({ ...formulario, indice_reajuste: e.target.value })}
              >
                <option value="">Sem reajuste automático</option>
                <option value="IPCA">IPCA</option>
                <option value="IGPM">IGP-M</option>
                <option value="INPC">INPC</option>
              </select>
            </div>

            <div className="campo-formulario">
              <label htmlFor="aviso_previo_dias">Prazo de aviso prévio (dias)</label>
              <input
                id="aviso_previo_dias"
                type="number"
                value={formulario.aviso_previo_dias}
                onChange={(e) => setFormulario({ ...formulario, aviso_previo_dias: Number(e.target.value) })}
                min="1"
              />
            </div>
          </div>
        </div>

        <div className="secao-formulario">
          <h3>Status</h3>

          <div className="campo-formulario">
            <label htmlFor="status">Status do contrato</label>
            <select
              id="status"
              value={formulario.status}
              onChange={(e) => setFormulario({ ...formulario, status: e.target.value })}
            >
              <option value="ativo">Ativo</option>
              <option value="aviso_previo">Aviso prévio</option>
              <option value="encerrado">Encerrado</option>
              <option value="extrajudicial">Extrajudicial</option>
              <option value="em_despejo">Em despejo</option>
            </select>
          </div>
        </div>

        <div className="botoes-formulario">
          <Link href={`/contratos/${contratoId}/documentos`} className="botao-cancelar">
            Cancelar
          </Link>
          <button type="submit" className="botao-enviar" disabled={loading}>
            {loading ? 'Salvando...' : '✓ Salvar alterações'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .container-editar-contrato {
          max-width: 700px;
        }

        .info-contrato {
          background: #f9f9f9;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
        }

        .info-contrato p {
          margin: 8px 0;
          font-size: 0.95rem;
          color: #555;
        }

        .formulario-contrato {
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
        .campo-formulario select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .campo-formulario input:focus,
        .campo-formulario select:focus {
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
