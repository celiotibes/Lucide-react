'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ContratoDetalhe {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locador_nome: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: number;
  dia_vencimento: number;
  aviso_previo_dias: number;
  tipo: string;
  indice_reajuste: string | null;
  status: string;
  garantias: Array<{
    id: string;
    tipo: string;
    valor?: number;
    data_vencimento_apolice?: string;
    status: string;
  }>;
}

export default function PaginaDetalheContrato() {
  const params = useParams();
  const contratoId = params.id as string;

  const [contrato, setContrato] = useState<ContratoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [sucessoPdf, setSucessoPdf] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch(`/api/admin/contratos/${contratoId}`);
        if (res.ok) {
          const data = await res.json();
          setContrato(data);
        } else {
          setErro('Erro ao carregar contrato');
        }
      } catch (err) {
        setErro('Erro ao carregar dados');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [contratoId]);

  async function baixarPdf() {
    setBaixandoPdf(true);
    setSucessoPdf('');
    setErro('');

    try {
      const res = await fetch(`/api/contratos/${contratoId}/pdf`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contrato-${contrato?.imovel_identificacao.replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSucessoPdf('✓ PDF baixado com sucesso');
        setTimeout(() => setSucessoPdf(''), 3000);
      } else {
        setErro('Erro ao gerar PDF');
      }
    } catch (err) {
      setErro('Erro ao baixar arquivo');
    } finally {
      setBaixandoPdf(false);
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

  if (!contrato) {
    return (
      <div className="container">
        <div className="card-vazio">
          <p>Contrato não encontrado</p>
          <Link href="/admin/contratos" className="botao-link">
            ← Voltar para lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="cabecalho">
        <div>
          <h1>{contrato.imovel_identificacao}</h1>
          <p className="subtitulo">Contrato ID: {contratoId.slice(0, 8)}...</p>
        </div>
        <div className="acoes-cabecalho">
          <button onClick={baixarPdf} disabled={baixandoPdf} className="botao-pdf">
            {baixandoPdf ? '⏳ Gerando PDF...' : '📥 Baixar PDF'}
          </button>
          <Link href="/admin/contratos" className="botao-secundario">
            ← Voltar
          </Link>
        </div>
      </div>

      {erro && <div className="erro-box">{erro}</div>}
      {sucessoPdf && <div className="sucesso-box">{sucessoPdf}</div>}

      <div className="grid-3-colunas">
        <div className="card">
          <h3>Locatário</h3>
          <p className="valor-grande">{contrato.locatario_nome}</p>
        </div>
        <div className="card">
          <h3>Proprietário</h3>
          <p className="valor-grande">{contrato.locador_nome}</p>
        </div>
        <div className="card">
          <h3>Status</h3>
          <p className={`valor-grande status-${contrato.status}`}>
            {formatarStatus(contrato.status)}
          </p>
        </div>
      </div>

      <div className="secao">
        <h2>Condições Financeiras</h2>
        <div className="grid-2-colunas">
          <div className="info-item">
            <label>Aluguel Mensal</label>
            <p className="valor">R$ {contrato.valor_aluguel.toFixed(2).replace('.', ',')}</p>
          </div>
          <div className="info-item">
            <label>Dia de Vencimento</label>
            <p className="valor">{contrato.dia_vencimento}º dia do mês</p>
          </div>
          <div className="info-item">
            <label>Reajuste</label>
            <p className="valor">
              {contrato.indice_reajuste ? `${contrato.indice_reajuste} (anual)` : 'Sem reajuste'}
            </p>
          </div>
          <div className="info-item">
            <label>Aviso Prévio</label>
            <p className="valor">{contrato.aviso_previo_dias} dias</p>
          </div>
        </div>
      </div>

      <div className="secao">
        <h2>Vigência</h2>
        <div className="grid-2-colunas">
          <div className="info-item">
            <label>Início</label>
            <p className="valor">
              {new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div className="info-item">
            <label>Término</label>
            <p className="valor">
              {contrato.data_fim
                ? new Date(contrato.data_fim).toLocaleDateString('pt-BR')
                : 'Indeterminado'}
            </p>
          </div>
        </div>
      </div>

      {contrato.garantias && contrato.garantias.length > 0 && (
        <div className="secao">
          <h2>Garantias</h2>
          <div className="tabela-garantias">
            {contrato.garantias.map((g) => (
              <div key={g.id} className="garantia-card">
                <div className="info-row">
                  <span className="label">Tipo:</span>
                  <span className="valor">{formatarTipoGarantia(g.tipo)}</span>
                </div>
                {g.valor && (
                  <div className="info-row">
                    <span className="label">Valor:</span>
                    <span className="valor">R$ {g.valor.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                {g.data_vencimento_apolice && (
                  <div className="info-row">
                    <span className="label">Vencimento da Apólice:</span>
                    <span className="valor">
                      {new Date(g.data_vencimento_apolice).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                <div className="info-row">
                  <span className="label">Status:</span>
                  <span className={`tag-status status-${g.status}`}>
                    {formatarStatusGarantia(g.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }

        .cabecalho {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
        }

        h1 {
          margin: 0;
          color: #333;
          font-size: 32px;
        }

        .subtitulo {
          margin: 8px 0 0 0;
          color: #999;
          font-size: 12px;
        }

        .acoes-cabecalho {
          display: flex;
          gap: 10px;
        }

        .botao-pdf {
          padding: 10px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-pdf:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .botao-pdf:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .botao-secundario {
          padding: 10px 20px;
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

        .botao-link {
          color: #0066cc;
          text-decoration: none;
          font-weight: 600;
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
          margin-bottom: 30px;
        }

        .grid-2-colunas {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }

        .card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .card h3 {
          margin: 0 0 10px 0;
          color: #999;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .valor-grande {
          margin: 0;
          color: #333;
          font-size: 18px;
          font-weight: 600;
        }

        .status-ativo {
          color: #22c55e;
        }

        .status-aviso_previo {
          color: #f59e0b;
        }

        .status-encerrado {
          color: #6b7280;
        }

        .status-extrajudicial,
        .status-em_despejo {
          color: #ef4444;
        }

        .secao {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .secao h2 {
          margin: 0 0 20px 0;
          color: #333;
          font-size: 16px;
          font-weight: 600;
        }

        .info-item {
          padding: 10px 0;
        }

        .info-item label {
          display: block;
          color: #999;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
          margin-bottom: 5px;
        }

        .info-item .valor {
          margin: 0;
          color: #333;
          font-size: 15px;
        }

        .tabela-garantias {
          display: grid;
          gap: 15px;
        }

        .garantia-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 15px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 8px 0;
          font-size: 14px;
        }

        .info-row .label {
          color: #666;
          font-weight: 500;
        }

        .info-row .valor {
          color: #333;
          font-weight: 500;
        }

        .tag-status {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-ativa {
          background: #d1fae5;
          color: #047857;
        }

        .status-vencida {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-baixada {
          background: #e5e7eb;
          color: #374151;
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

function formatarStatusGarantia(status: string): string {
  const statusMap: Record<string, string> = {
    ativa: 'Ativa',
    vencida: 'Vencida',
    baixada: 'Baixada',
  };
  return statusMap[status] || status;
}

function formatarTipoGarantia(tipo: string): string {
  const tipoMap: Record<string, string> = {
    caucao: 'Caução',
    fiador: 'Fiador',
    seguro_fianca: 'Seguro-Fiança',
    titulo_capitalizacao: 'Título de Capitalização',
    seguro_incendio: 'Seguro-Incêndio',
  };
  return tipoMap[tipo] || tipo;
}
