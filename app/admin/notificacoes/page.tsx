'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ContratoComVencimento {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  data_fim: string;
  valor_aluguel: number;
  diasAteVencimento: number;
  notificacao_enviada: boolean;
}

export default function PaginaNotificacoes() {
  const [contratos, setContratos] = useState<ContratoComVencimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch('/api/admin/contratos-vencimento');
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

  async function executarNotificacoes() {
    setExecutando(true);
    setErro('');
    setMensagem('');

    try {
      const res = await fetch('/api/cron/notificar-vencimentos', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'test'}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem(
          `✓ Notificações enviadas com sucesso: ${data.sucesso} sucesso, ${data.falhas} falhas`,
        );
      } else {
        setErro(data.erro || 'Erro ao executar notificações');
      }
    } catch (err) {
      setErro('Erro ao executar notificações');
    } finally {
      setExecutando(false);
      setTimeout(() => setMensagem(''), 5000);
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
        <h1>Notificações de Vencimento</h1>
        <Link href="/dashboard" className="botao-secundario">
          ← Dashboard
        </Link>
      </div>

      <div className="card-info">
        <p>
          <strong>Contratos para notificar:</strong> {contratos.length}
        </p>
        <p className="hint">
          Acompanhe contratos que estão próximos do vencimento. Execute notificações manualmente ou aguarde o agendamento automático (6:30 AM UTC).
        </p>
      </div>

      {erro && <div className="erro-box">{erro}</div>}
      {mensagem && <div className="sucesso-box">{mensagem}</div>}

      <div className="acoes-container">
        <button
          onClick={executarNotificacoes}
          disabled={executando}
          className="botao-principal"
        >
          {executando ? '⏳ Enviando notificações...' : '📧 Executar Notificações Agora'}
        </button>
      </div>

      {contratos.length === 0 ? (
        <div className="card-vazio">
          <p>Nenhum contrato para notificar no próximo mês</p>
        </div>
      ) : (
        <div className="tabela-container">
          <table className="tabela-contratos">
            <thead>
              <tr>
                <th>Imóvel</th>
                <th>Locatário</th>
                <th>Vencimento</th>
                <th>Dias</th>
                <th>Aluguel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code className="imovel-code">{c.imovel_identificacao}</code>
                  </td>
                  <td>{c.locatario_nome}</td>
                  <td>{new Date(c.data_fim).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <span className={`dias-badge dias-${c.diasAteVencimento <= 7 ? 'crítico' : c.diasAteVencimento <= 14 ? 'aviso' : 'normal'}`}>
                      {c.diasAteVencimento}
                    </span>
                  </td>
                  <td>R$ {c.valor_aluguel.toFixed(2).replace('.', ',')}</td>
                  <td>
                    {c.notificacao_enviada ? (
                      <span className="tag-enviado">✓ Notificado</span>
                    ) : (
                      <span className="tag-pendente">○ Pendente</span>
                    )}
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

        .acoes-container {
          margin-bottom: 30px;
        }

        .botao-principal {
          padding: 12px 24px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-principal:hover:not(:disabled) {
          background: #0052a3;
        }

        .botao-principal:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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

        .dias-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-align: center;
          min-width: 40px;
        }

        .dias-crítico {
          background: #fee;
          color: #c33;
        }

        .dias-aviso {
          background: #fef3c7;
          color: #92400e;
        }

        .dias-normal {
          background: #d1fae5;
          color: #047857;
        }

        .tag-enviado {
          display: inline-block;
          padding: 4px 10px;
          background: #d4edda;
          color: #155724;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
        }

        .tag-pendente {
          display: inline-block;
          padding: 4px 10px;
          background: #fff3cd;
          color: #856404;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
