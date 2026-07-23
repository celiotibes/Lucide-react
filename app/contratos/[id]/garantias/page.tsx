'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Garantia {
  id: string;
  tipo: string;
  valor: string | null;
  data_inicio: string | null;
  data_vencimento_apolice: string | null;
  apolice_numero: string | null;
  status: string;
  criado_em: string;
}

const TIPOS_GARANTIA = [
  { value: 'caucao', label: 'Caução' },
  { value: 'fiador', label: 'Fiador' },
  { value: 'seguro_fianca', label: 'Seguro-fiança' },
  { value: 'titulo_capitalizacao', label: 'Título de capitalização' },
  { value: 'seguro_incendio', label: 'Seguro-incêndio' },
];

export default function PaginaGarantias({ params }: { params: Promise<{ id: string }> }) {
  const [contratoId, setContratoId] = useState('');
  const [garantias, setGarantias] = useState<Garantia[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [mostraFormulario, setMostraFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [formulario, setFormulario] = useState({
    tipo: 'caucao',
    valor: '',
    data_inicio: '',
    data_vencimento_apolice: '',
    apolice_numero: '',
    status: 'ativa',
  });

  useEffect(() => {
    params.then(({ id }) => {
      setContratoId(id);
      buscarGarantias(id);
    });
  }, [params]);

  async function buscarGarantias(id: string) {
    try {
      const res = await fetch(`/api/contratos/${id}/garantias`);
      if (res.ok) {
        setGarantias(await res.json());
      } else {
        setErro('Erro ao carregar garantias');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.tipo) {
      setErro('Tipo de garantia é obrigatório');
      setLoading(false);
      return;
    }

    try {
      const url = editandoId
        ? `/api/contratos/${contratoId}/garantias/${editandoId}`
        : `/api/contratos/${contratoId}/garantias`;

      const method = editandoId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formulario,
          valor: formulario.valor ? Number(formulario.valor) : null,
        }),
      });

      if (res.ok) {
        const garantia = await res.json();
        if (editandoId) {
          setGarantias(garantias.map((g) => (g.id === garantia.id ? garantia : g)));
          setEditandoId(null);
        } else {
          setGarantias([...garantias, garantia]);
        }
        setSucesso(editandoId ? 'Garantia atualizada!' : 'Garantia criada!');
        setFormulario({
          tipo: 'caucao',
          valor: '',
          data_inicio: '',
          data_vencimento_apolice: '',
          apolice_numero: '',
          status: 'ativa',
        });
        setMostraFormulario(false);
        setTimeout(() => setSucesso(''), 3000);
      } else {
        const data = await res.json();
        setErro(data.erro || 'Erro ao salvar garantia');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(garantiaId: string) {
    if (!confirm('Tem certeza que deseja deletar esta garantia?')) return;

    try {
      const res = await fetch(`/api/contratos/${contratoId}/garantias/${garantiaId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setGarantias(garantias.filter((g) => g.id !== garantiaId));
        setSucesso('Garantia deletada!');
        setTimeout(() => setSucesso(''), 3000);
      } else {
        setErro('Erro ao deletar garantia');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    }
  }

  function editarGarantia(garantia: Garantia) {
    setFormulario({
      tipo: garantia.tipo,
      valor: garantia.valor ? String(garantia.valor) : '',
      data_inicio: garantia.data_inicio || '',
      data_vencimento_apolice: garantia.data_vencimento_apolice || '',
      apolice_numero: garantia.apolice_numero || '',
      status: garantia.status,
    });
    setEditandoId(garantia.id);
    setMostraFormulario(true);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setFormulario({
      tipo: 'caucao',
      valor: '',
      data_inicio: '',
      data_vencimento_apolice: '',
      apolice_numero: '',
      status: 'ativa',
    });
    setMostraFormulario(false);
  }

  return (
    <div className="container-garantias">
      <div className="cabecalho-lista">
        <h2>Garantias</h2>
        <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

      {!mostraFormulario && (
        <button className="botao-link" onClick={() => setMostraFormulario(true)}>
          + Adicionar garantia
        </button>
      )}

      {mostraFormulario && (
        <form onSubmit={handleSubmit} className="formulario-garantia">
          <h3>{editandoId ? 'Editar garantia' : 'Nova garantia'}</h3>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="tipo">Tipo *</label>
              <select
                id="tipo"
                value={formulario.tipo}
                onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                required
              >
                {TIPOS_GARANTIA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo-formulario">
              <label htmlFor="valor">Valor (R$)</label>
              <input
                id="valor"
                type="number"
                value={formulario.valor}
                onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
                min="0.01"
                step="0.01"
              />
            </div>
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="data_inicio">Data de início</label>
              <input
                id="data_inicio"
                type="date"
                value={formulario.data_inicio}
                onChange={(e) => setFormulario({ ...formulario, data_inicio: e.target.value })}
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="data_vencimento_apolice">Vencimento da apólice</label>
              <input
                id="data_vencimento_apolice"
                type="date"
                value={formulario.data_vencimento_apolice}
                onChange={(e) => setFormulario({ ...formulario, data_vencimento_apolice: e.target.value })}
              />
            </div>
          </div>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="apolice_numero">Número da apólice</label>
              <input
                id="apolice_numero"
                type="text"
                value={formulario.apolice_numero}
                onChange={(e) => setFormulario({ ...formulario, apolice_numero: e.target.value })}
                placeholder="Ex: POL-2024-001"
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formulario.status}
                onChange={(e) => setFormulario({ ...formulario, status: e.target.value })}
              >
                <option value="ativa">Ativa</option>
                <option value="vencida">Vencida</option>
                <option value="baixada">Baixada</option>
              </select>
            </div>
          </div>

          <div className="botoes-formulario">
            <button type="button" className="botao-cancelar" onClick={cancelarEdicao}>
              Cancelar
            </button>
            <button type="submit" className="botao-enviar" disabled={loading}>
              {loading ? 'Salvando...' : editandoId ? '✓ Atualizar' : '✓ Criar'}
            </button>
          </div>
        </form>
      )}

      {garantias.length === 0 ? (
        <p className="vazio">Nenhuma garantia adicionada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Apólice</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {garantias.map((g) => (
              <tr key={g.id}>
                <td>{TIPOS_GARANTIA.find((t) => t.value === g.tipo)?.label || g.tipo}</td>
                <td>{g.valor ? `R$ ${parseFloat(g.valor).toFixed(2).replace('.', ',')}` : '—'}</td>
                <td>{g.apolice_numero || '—'}</td>
                <td>{g.data_vencimento_apolice ? new Date(g.data_vencimento_apolice).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  <span className={`tag status-${g.status}`}>{g.status}</span>
                </td>
                <td>
                  <button
                    className="botao-link"
                    onClick={() => editarGarantia(g)}
                    style={{ marginRight: '8px' }}
                  >
                    Editar
                  </button>
                  <button
                    className="botao-link"
                    onClick={() => handleDelete(g.id)}
                    style={{ color: '#dc3545' }}
                  >
                    Deletar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .container-garantias {
          max-width: 900px;
        }

        .formulario-garantia {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .formulario-garantia h3 {
          margin-bottom: 20px;
          color: #333;
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
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid #eee;
        }

        .botao-cancelar,
        .botao-enviar {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
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

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }

        th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #555;
          border-bottom: 2px solid #eee;
        }

        td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }

        tr:hover {
          background: #f9f9f9;
        }

        .tag {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .tag.status-ativa {
          background: #d4edda;
          color: #155724;
        }

        .tag.status-vencida {
          background: #fff3cd;
          color: #856404;
        }

        .tag.status-baixada {
          background: #e2e3e5;
          color: #383d41;
        }

        .botao-link {
          background: none;
          border: none;
          color: #007bff;
          cursor: pointer;
          font-size: 0.9rem;
          padding: 0;
          text-decoration: underline;
        }

        .botao-link:hover {
          color: #0056b3;
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

        .vazio {
          text-align: center;
          color: #999;
          padding: 40px 20px;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
