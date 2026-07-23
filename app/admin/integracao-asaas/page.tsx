'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface StatusIntegracao {
  conectado: boolean;
  ambiente: 'sandbox' | 'producao';
  saldo: number;
  cobrancas_pendentes: number;
  cobrancas_pagas: number;
  cobrancas_atrasadas: number;
  ultimaVerificacao: string;
  erro?: string;
}

export default function PaginaIntegracaoAsaas() {
  const [status, setStatus] = useState<StatusIntegracao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    carregarStatus();
  }, []);

  async function carregarStatus() {
    setCarregando(true);
    setErro('');
    try {
      const res = await fetch('/api/admin/asaas-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setErro('Erro ao carregar status');
      }
    } catch (err) {
      setErro('Erro ao conectar com servidor');
    } finally {
      setCarregando(false);
    }
  }

  async function testarConexao() {
    setTestando(true);
    setErro('');
    setMensagem('');

    try {
      const res = await fetch('/api/admin/asaas-test', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setMensagem(`✓ Teste bem-sucedido! Saldo: R$ ${data.saldo.toFixed(2).replace('.', ',')}`);
        carregarStatus();
      } else {
        setErro(data.erro || 'Teste falhou');
      }
    } catch (err) {
      setErro('Erro ao executar teste');
    } finally {
      setTestando(false);
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
        <h1>Integração Asaas</h1>
        <Link href="/dashboard" className="botao-secundario">
          ← Dashboard
        </Link>
      </div>

      <div className="card-info">
        <p>
          <strong>Status da integração de pagamentos</strong>
        </p>
        <p className="hint">
          Monitore a conexão com Asaas, saldo disponível e estatísticas de cobrança.
        </p>
      </div>

      {erro && <div className="erro-box">{erro}</div>}
      {mensagem && <div className="sucesso-box">{mensagem}</div>}

      {status && (
        <>
          <div className="grid-3-colunas">
            <div className={`card status ${status.conectado ? 'conectado' : 'desconectado'}`}>
              <h3>Status</h3>
              <p className="valor-status">
                {status.conectado ? '🟢 Conectado' : '🔴 Desconectado'}
              </p>
              <p className="ambiente">Ambiente: {status.ambiente === 'sandbox' ? '🧪 Sandbox' : '🚀 Produção'}</p>
            </div>

            <div className="card">
              <h3>Saldo Disponível</h3>
              <p className="valor-grande">R$ {status.saldo.toFixed(2).replace('.', ',')}</p>
            </div>

            <div className="card">
              <h3>Última Verificação</h3>
              <p className="valor-pequeno">{new Date(status.ultimaVerificacao).toLocaleString('pt-BR')}</p>
            </div>
          </div>

          <div className="grid-3-colunas">
            <div className="card-stats">
              <div className="stat">
                <p className="numero">{status.cobrancas_pendentes}</p>
                <p className="label">Cobrancas Pendentes</p>
              </div>
            </div>
            <div className="card-stats">
              <div className="stat">
                <p className="numero">{status.cobrancas_pagas}</p>
                <p className="label">Cobrancas Pagas</p>
              </div>
            </div>
            <div className="card-stats">
              <div className="stat">
                <p className="numero">{status.cobrancas_atrasadas}</p>
                <p className="label">Cobrancas Atrasadas</p>
              </div>
            </div>
          </div>

          <div className="secao-acoes">
            <button
              onClick={testarConexao}
              disabled={testando}
              className="botao-teste"
            >
              {testando ? '⏳ Testando...' : '🧪 Testar Conexão'}
            </button>
            <button onClick={carregarStatus} disabled={carregando} className="botao-refresh">
              🔄 Atualizar
            </button>
          </div>

          <div className="secao-documentacao">
            <h2>Configuração</h2>
            <div className="config-item">
              <label>API Key</label>
              <p className="valor-config">
                {process.env.NEXT_PUBLIC_ASAAS_API_KEY
                  ? `Configurado (${process.env.NEXT_PUBLIC_ASAAS_API_KEY.slice(0, 10)}...)`
                  : 'Não configurado'}
              </p>
            </div>
            <div className="config-item">
              <label>Webhook Secret</label>
              <p className="valor-config">
                {process.env.ASAAS_WEBHOOK_SECRET ? 'Configurado' : 'Não configurado'}
              </p>
            </div>
            <div className="config-item">
              <label>URL Webhook</label>
              <p className="valor-config">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/api/webhooks/asaas`
                  : 'Carregando...'}
              </p>
            </div>
          </div>

          {status.conectado && (
            <div className="secao-info">
              <h2>Próximas Ações</h2>
              <ul>
                <li>✓ Conexão com Asaas validada</li>
                <li>✓ Emissão de cobranças ativada</li>
                <li>✓ Webhooks de recebimento monitorados</li>
                <li>→ Configure links de pagamento nos contratos (Phase 1)</li>
                <li>→ Implemente notificações SMS de vencimento (Phase 1)</li>
              </ul>
            </div>
          )}

          {!status.conectado && (
            <div className="secao-aviso">
              <h2>⚠️ Integração Desativada</h2>
              <p>
                A integração com Asaas está desativada ou com erro. Verifique:
              </p>
              <ul>
                <li>Variável de ambiente <code>NEXT_PUBLIC_ASAAS_API_KEY</code> está definida</li>
                <li>API Key é válida no painel Asaas</li>
                <li>Credenciais de sandbox (se em desenvolvimento)</li>
                <li>Permissões de acesso na conta Asaas</li>
              </ul>
              <p>
                Contacte suporte@asaas.com se o erro persistir.
              </p>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .container {
          max-width: 1000px;
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

        h2 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
        }

        .card-info {
          background: #e7f3ff;
          border-left: 4px solid #0066cc;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 30px;
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

        .sucesso-box {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
          border-radius: 4px;
          padding: 12px 15px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .grid-3-colunas {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }

        .card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .card.status {
          border-left: 4px solid #999;
        }

        .card.status.conectado {
          border-left-color: #22c55e;
          background: #f0fdf4;
        }

        .card.status.desconectado {
          border-left-color: #ef4444;
          background: #fef2f2;
        }

        .card h3 {
          margin: 0 0 10px 0;
          color: #999;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .valor-status {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #333;
        }

        .ambiente {
          margin: 8px 0 0 0;
          font-size: 12px;
          color: #666;
        }

        .valor-grande {
          margin: 0;
          color: #22c55e;
          font-size: 24px;
          font-weight: 600;
        }

        .valor-pequeno {
          margin: 0;
          color: #666;
          font-size: 13px;
        }

        .card-stats {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .stat .numero {
          margin: 0 0 8px 0;
          font-size: 32px;
          font-weight: 700;
          color: #0066cc;
        }

        .stat .label {
          margin: 0;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .secao-acoes {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
        }

        .botao-teste {
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-teste:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .botao-teste:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .botao-refresh {
          padding: 12px 24px;
          background: #f0f0f0;
          color: #333;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-refresh:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .botao-refresh:disabled {
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

        .secao-documentacao {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .config-item {
          margin: 15px 0;
          padding-bottom: 15px;
          border-bottom: 1px solid #f0f0f0;
        }

        .config-item:last-child {
          border-bottom: none;
        }

        .config-item label {
          display: block;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
          margin-bottom: 5px;
        }

        .valor-config {
          margin: 0;
          color: #333;
          font-size: 14px;
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .secao-info {
          background: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .secao-info ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .secao-info li {
          color: #22c55e;
          font-size: 14px;
          margin: 8px 0;
        }

        .secao-aviso {
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          padding: 20px;
        }

        .secao-aviso ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .secao-aviso li {
          color: #92400e;
          font-size: 14px;
          margin: 8px 0;
        }

        .secao-aviso p {
          color: #92400e;
          font-size: 14px;
          margin: 10px 0;
        }

        .secao-aviso code {
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 3px;
          padding: 2px 6px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
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
