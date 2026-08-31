'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AuditLog {
  id: string;
  tabela: string;
  registro_id: string;
  operacao: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  usuario_email: string | null;
  usuario_id: string | null;
  criado_em: string;
}

interface PaginatedResponse {
  data: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

const OPERACOES = ['insert', 'update', 'delete'];
const TABELAS_COMUNS = [
  'contratos',
  'faturas',
  'garantias',
  'pessoas',
  'usuarios',
  'investidor_ledger',
  'split_pagamento',
];

const ICONES_OPERACAO: Record<string, string> = {
  insert: '➕',
  update: '✏️',
  delete: '🗑️',
};

const CORES_OPERACAO: Record<string, string> = {
  insert: '#d4edda',
  update: '#fff3cd',
  delete: '#f8d7da',
};

export default function PaginaAuditoria() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [total, setTotal] = useState(0);

  // Filtros
  const [tabela, setTabela] = useState('');
  const [operacao, setOperacao] = useState('');
  const [registroId, setRegistroId] = useState('');
  const [pagina, setPagina] = useState(0);
  const limit = 50;

  // Detalhes expandidos
  const [expandido, setExpandido] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro('');

    try {
      const params = new URLSearchParams();
      if (tabela) params.append('tabela', tabela);
      if (operacao) params.append('operacao', operacao);
      if (registroId) params.append('registro_id', registroId);
      params.append('limit', limit.toString());
      params.append('offset', (pagina * limit).toString());

      const res = await fetch(`/api/audit-logs?${params}`);

      if (!res.ok) {
        if (res.status === 403) {
          setErro('Você não tem permissão para acessar auditoria (admin/economista apenas)');
        } else {
          setErro('Erro ao carregar audit logs');
        }
        return;
      }

      const data: PaginatedResponse = await res.json();
      setLogs(data.data);
      setTotal(data.total);
    } catch (err) {
      setErro('Erro ao carregar dados');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [tabela, operacao, registroId, pagina]);

  function aoLimpar() {
    setTabela('');
    setOperacao('');
    setRegistroId('');
    setPagina(0);
  }

  function formatarData(isoString: string) {
    const data = new Date(isoString);
    return data.toLocaleString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatarValor(valor: unknown): string {
    if (valor === null) return 'null';
    if (typeof valor === 'boolean') return valor ? 'true' : 'false';
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
  }

  function obterMudancas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
    if (!antes || !depois) return [];

    const mudancas = [];
    const todasAsColunas = new Set([...Object.keys(antes), ...Object.keys(depois)]);

    for (const coluna of todasAsColunas) {
      if (antes[coluna] !== depois[coluna]) {
        mudancas.push({
          coluna,
          antes: antes[coluna],
          depois: depois[coluna],
        });
      }
    }

    return mudancas;
  }

  const totalPaginas = Math.ceil(total / limit);
  const mudancas = expandido ? obterMudancas(logs.find(l => l.id === expandido)?.dados_antes || {}, logs.find(l => l.id === expandido)?.dados_depois || {}) : [];

  return (
    <div className="container">
      <div className="cabecalho">
        <h1>Auditoria e Histórico</h1>
        <Link href="/dashboard" className="botao-secundario">
          ← Dashboard
        </Link>
      </div>

      <div className="card-filtros">
        <h3>Filtros</h3>
        <div className="filtros-grid">
          <div className="filtro-grupo">
            <label htmlFor="tabela">Tabela</label>
            <select id="tabela" value={tabela} onChange={(e) => { setTabela(e.target.value); setPagina(0); }}>
              <option value="">— Todas —</option>
              {TABELAS_COMUNS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="filtro-grupo">
            <label htmlFor="operacao">Operação</label>
            <select id="operacao" value={operacao} onChange={(e) => { setOperacao(e.target.value); setPagina(0); }}>
              <option value="">— Todas —</option>
              {OPERACOES.map(op => <option key={op} value={op}>{op.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="filtro-grupo">
            <label htmlFor="registroId">ID do Registro</label>
            <input
              id="registroId"
              type="text"
              placeholder="UUID..."
              value={registroId}
              onChange={(e) => { setRegistroId(e.target.value); setPagina(0); }}
            />
          </div>

          <button onClick={aoLimpar} className="botao-limpar">
            Limpar Filtros
          </button>
        </div>
      </div>

      {erro && <div className="erro-box">{erro}</div>}

      <div className="card-resultados">
        <p className="resultado-info">
          Total: <strong>{total}</strong> registros | Página {pagina + 1} de {totalPaginas || 1}
        </p>

        {carregando ? (
          <p>Carregando...</p>
        ) : logs.length === 0 ? (
          <p className="vazio">Nenhum registro encontrado.</p>
        ) : (
          <div className="lista-auditoria">
            {logs.map((log) => (
              <div key={log.id} className="linha-auditoria" style={{ borderLeft: `4px solid ${CORES_OPERACAO[log.operacao]}` }}>
                <div className="linha-header">
                  <div className="linha-info-principal">
                    <span className="operacao-badge" title={log.operacao}>
                      {ICONES_OPERACAO[log.operacao]}
                    </span>
                    <span className="tabela-badge">{log.tabela}</span>
                    <code className="registro-id">{log.registro_id.slice(0, 8)}...</code>
                    <span className="data">{formatarData(log.criado_em)}</span>
                  </div>

                  <div className="linha-usuario">
                    {log.usuario_email ? (
                      <small>{log.usuario_email}</small>
                    ) : (
                      <small className="sem-usuario">(sem usuário)</small>
                    )}
                  </div>
                </div>

                <div className="linha-acoes">
                  <button
                    onClick={() => setExpandido(expandido === log.id ? null : log.id)}
                    className="btn-expandir"
                  >
                    {expandido === log.id ? '▼ Colapsar' : '▶ Detalhes'}
                  </button>
                </div>

                {expandido === log.id && (
                  <div className="linha-detalhes">
                    {log.operacao === 'delete' ? (
                      <div className="campo-deletado">
                        <h4>Registro Deletado</h4>
                        <pre>{JSON.stringify(log.dados_antes, null, 2)}</pre>
                      </div>
                    ) : log.operacao === 'insert' ? (
                      <div className="campo-criado">
                        <h4>Registro Criado</h4>
                        <pre>{JSON.stringify(log.dados_depois, null, 2)}</pre>
                      </div>
                    ) : (
                      <div className="mudancas-list">
                        <h4>Mudanças ({mudancas.length})</h4>
                        {mudancas.length === 0 ? (
                          <p className="sem-mudancas">Nenhuma mudança registrada</p>
                        ) : (
                          mudancas.map((m) => (
                            <div key={m.coluna} className="mudanca-item">
                              <div className="mudanca-coluna">{m.coluna}</div>
                              <div className="mudanca-valores">
                                <div className="antes">
                                  <small>Antes:</small>
                                  <code>{formatarValor(m.antes)}</code>
                                </div>
                                <div className="depois">
                                  <small>Depois:</small>
                                  <code>{formatarValor(m.depois)}</code>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="paginacao">
          <button
            onClick={() => setPagina(Math.max(0, pagina - 1))}
            disabled={pagina === 0}
            className="btn-paginacao"
          >
            ← Anterior
          </button>

          <span className="pagina-info">
            Página {pagina + 1} de {totalPaginas}
          </span>

          <button
            onClick={() => setPagina(Math.min(totalPaginas - 1, pagina + 1))}
            disabled={pagina >= totalPaginas - 1}
            className="btn-paginacao"
          >
            Próxima →
          </button>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .cabecalho {
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

        .botao-secundario {
          padding: 8px 16px;
          background: #f0f0f0;
          color: #333;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-secundario:hover {
          background: #e0e0e0;
        }

        .card-filtros {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .card-filtros h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 16px;
        }

        .filtros-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          align-items: flex-end;
        }

        .filtro-grupo {
          display: flex;
          flex-direction: column;
        }

        .filtro-grupo label {
          font-weight: 600;
          color: #666;
          font-size: 13px;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filtro-grupo select,
        .filtro-grupo input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          background: white;
        }

        .filtro-grupo select:focus,
        .filtro-grupo input:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
        }

        .botao-limpar {
          padding: 8px 16px;
          background: #ccc;
          color: #333;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-limpar:hover {
          background: #bbb;
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

        .card-resultados {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          margin-bottom: 20px;
        }

        .resultado-info {
          margin: 0 0 20px 0;
          color: #666;
          font-size: 13px;
        }

        .vazio {
          color: #999;
          font-style: italic;
          text-align: center;
          padding: 40px 20px;
        }

        .lista-auditoria {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .linha-auditoria {
          background: #f9f9f9;
          border-radius: 4px;
          overflow: hidden;
        }

        .linha-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          gap: 20px;
        }

        .linha-info-principal {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .operacao-badge {
          font-size: 16px;
          line-height: 1;
        }

        .tabela-badge {
          display: inline-block;
          background: #e7f3ff;
          color: #0066cc;
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .registro-id {
          background: #f0f0f0;
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 11px;
          color: #666;
          font-family: 'Monaco', monospace;
        }

        .data {
          color: #999;
          font-size: 12px;
          white-space: nowrap;
        }

        .linha-usuario {
          display: flex;
          justify-content: flex-end;
          min-width: 200px;
        }

        .linha-usuario small {
          color: #666;
          font-size: 12px;
          background: #fff;
          padding: 4px 8px;
          border-radius: 3px;
          border: 1px solid #ddd;
        }

        .sem-usuario {
          color: #999;
          font-style: italic;
        }

        .linha-acoes {
          padding: 0 12px 12px 12px;
        }

        .btn-expandir {
          padding: 6px 12px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-expandir:hover {
          background: #0052a3;
        }

        .linha-detalhes {
          background: white;
          padding: 15px;
          border-top: 1px solid #eee;
          font-size: 13px;
        }

        .linha-detalhes h4 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .campo-deletado pre,
        .campo-criado pre {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 3px;
          overflow-x: auto;
          font-size: 11px;
          line-height: 1.4;
          margin: 0;
        }

        .campo-deletado pre {
          border-left: 3px solid #dc3545;
        }

        .campo-criado pre {
          border-left: 3px solid #28a745;
        }

        .mudancas-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .sem-mudancas {
          color: #999;
          font-style: italic;
          margin: 0;
        }

        .mudanca-item {
          background: white;
          border: 1px solid #eee;
          border-radius: 3px;
          padding: 10px;
        }

        .mudanca-coluna {
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .mudanca-valores {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .antes,
        .depois {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .antes small,
        .depois small {
          color: #999;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .antes code,
        .depois code {
          background: #f5f5f5;
          padding: 4px 6px;
          border-radius: 2px;
          font-size: 11px;
          word-break: break-all;
          font-family: 'Monaco', monospace;
          color: #555;
        }

        .paginacao {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          margin-top: 30px;
        }

        .btn-paginacao {
          padding: 8px 16px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-paginacao:hover:not(:disabled) {
          background: #0052a3;
        }

        .btn-paginacao:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .pagina-info {
          color: #666;
          font-size: 13px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
