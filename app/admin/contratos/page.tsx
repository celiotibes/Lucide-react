'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ContratoListaItem {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  valor_aluguel: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
}

export default function PaginaContratos() {
  const [contratos, setContratos] = useState<ContratoListaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch('/api/admin/contratos-lista');
        if (res.ok) {
          const data = await res.json();
          setContratos(data);
        } else {
          setErro('Erro ao carregar contratos');
        }
      } catch (err) {
        setErro('Erro ao carregar dados');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  const contratosFiltrados = filtroStatus
    ? contratos.filter((c) => c.status === filtroStatus)
    : contratos;

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
        <h1>Gestão de Contratos</h1>
        <Link href="/dashboard" className="botao-secundario">
          ← Dashboard
        </Link>
      </div>

      <div className="card-info">
        <p>
          <strong>Total de contratos:</strong> {contratos.length}
        </p>
        <p className="hint">
          Visualize, edite e exporte contratos em PDF. Acompanhe status e datas de vencimento.
        </p>
      </div>

      {erro && <div className="erro-box">{erro}</div>}

      <div className="filtros">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="select-filtro"
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="aviso_previo">Aviso Prévio</option>
          <option value="encerrado">Encerrado</option>
          <option value="extrajudicial">Extrajudicial</option>
          <option value="em_despejo">Em Despejo</option>
        </select>
      </div>

      {contratosFiltrados.length === 0 ? (
        <div className="card-vazio">
          <p>Nenhum contrato encontrado</p>
        </div>
      ) : (
        <div className="tabela-container">
          <table className="tabela-contratos">
            <thead>
              <tr>
                <th>Imóvel</th>
                <th>Locatário</th>
                <th>Aluguel</th>
                <th>Início</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contratosFiltrados.map((contrato) => (
                <tr key={contrato.id}>
                  <td>
                    <code className="imovel-code">{contrato.imovel_identificacao}</code>
                  </td>
                  <td>{contrato.locatario_nome}</td>
                  <td>R$ {contrato.valor_aluguel.toFixed(2).replace('.', ',')}</td>
                  <td>{new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}</td>
                  <td>
                    {contrato.data_fim ? new Date(contrato.data_fim).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td>
                    <span className={`tag status-${contrato.status}`}>
                      {formatarStatus(contrato.status)}
                    </span>
                  </td>
                  <td className="acoes">
                    <Link
                      href={`/admin/contratos/${contrato.id}`}
                      className="botao-pequeno-link"
                      title="Ver detalhes"
                    >
                      📄
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

        .filtros {
          margin-bottom: 20px;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .select-filtro {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .card-vazio {
          background: white;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .tabela-container {
          background: white;
          border-radius: 8px;
          overflow-x: auto;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .tabela-contratos {
          width: 100%;
          border-collapse: collapse;
        }

        .tabela-contratos th {
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

        .tabela-contratos td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          color: #333;
          font-size: 14px;
        }

        .tabela-contratos tr:hover {
          background: #f9f9f9;
        }

        .imovel-code {
          background: #f5f5f5;
          padding: 4px 8px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          color: #555;
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

        .status-ativo {
          background: #d4edda;
          color: #155724;
        }

        .status-aviso_previo {
          background: #fff3cd;
          color: #856404;
        }

        .status-encerrado {
          background: #e2e3e5;
          color: #383d41;
        }

        .status-extrajudicial {
          background: #f8d7da;
          color: #721c24;
        }

        .status-em_despejo {
          background: #f8d7da;
          color: #721c24;
        }

        .acoes {
          text-align: center;
        }

        .botao-pequeno-link {
          padding: 6px 12px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: all 0.2s;
        }

        .botao-pequeno-link:hover {
          background: #0052a3;
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
      `}</style>
    </div>
  );
}

function formatarStatus(status: string): string {
  const statusMap: Record<string, string> = {
    ativo: 'Ativo',
    aviso_previo: 'Aviso Prévio',
    encerrado: 'Encerrado',
    extrajudicial: 'Extrajudicial',
    em_despejo: 'Em Despejo',
  };
  return statusMap[status] || status;
}
