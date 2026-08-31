import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface ContratoDetalhes {
  id: string;
  imovel_identificacao: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  dia_vencimento: number | null;
  indice_reajuste: string | null;
  status: string;
  locatario_nome: string | null;
}

async function buscarContrato(contratoId: string): Promise<ContratoDetalhes | null> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query<ContratoDetalhes>(
      `select c.id, i.identificacao as imovel_identificacao, c.tipo,
              c.data_inicio, c.data_fim, c.valor_aluguel, c.dia_vencimento,
              c.indice_reajuste, c.status,
              p.nome as locatario_nome
       from contratos c
       join imoveis i on i.id = c.imovel_id
       left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       left join pessoas p on p.id = cp.pessoa_id
       where c.id = $1`,
      [contratoId]
    );

    return rows.length > 0 ? rows[0] : null;
  } catch (erro) {
    console.error('Erro ao buscar contrato:', erro);
    return null;
  }
}

export default async function PaginaDetalheContratoPortal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contrato = await buscarContrato(id);

  if (!contrato) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Contrato não encontrado</h2>
          <Link href="/portal" className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">O contrato solicitado não foi encontrado.</p>
      </>
    );
  }

  const RUBRICA_TIPO: Record<string, string> = {
    locacao_padrao: 'Locação padrão',
    temporada: 'Temporada',
  };

  const RUBRICA_STATUS: Record<string, string> = {
    ativo: 'Ativo',
    aviso_previo: 'Aviso prévio',
    encerrado: 'Encerrado',
    extrajudicial: 'Extrajudicial',
    em_despejo: 'Em despejo',
  };

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Detalhes do Contrato</h2>
        <Link href="/portal" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      <div className="container-detalhes">
        <div className="card-secao">
          <h3>Informações do Imóvel</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Identificação</label>
              <p>{contrato.imovel_identificacao}</p>
            </div>
            <div className="info-item">
              <label>Tipo de contrato</label>
              <p>{RUBRICA_TIPO[contrato.tipo] || contrato.tipo}</p>
            </div>
            <div className="info-item">
              <label>Status</label>
              <p>
                <span className={`tag status-${contrato.status}`}>
                  {RUBRICA_STATUS[contrato.status] || contrato.status}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="card-secao">
          <h3>Termos Financeiros</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Aluguel mensal</label>
              <p className="valor-grande">{formatarMoeda(contrato.valor_aluguel)}</p>
            </div>
            <div className="info-item">
              <label>Dia de vencimento</label>
              <p>{contrato.dia_vencimento || '—'}</p>
            </div>
            <div className="info-item">
              <label>Índice de reajuste</label>
              <p>{contrato.indice_reajuste || 'Sem reajuste automático'}</p>
            </div>
          </div>
        </div>

        <div className="card-secao">
          <h3>Período de Vigência</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Início</label>
              <p>{formatarData(contrato.data_inicio)}</p>
            </div>
            <div className="info-item">
              <label>Término</label>
              <p>{contrato.data_fim ? formatarData(contrato.data_fim) : '(Sem data de término)'}</p>
            </div>
          </div>
        </div>

        <div className="card-secao">
          <h3>Dados do Locatário</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Nome</label>
              <p>{contrato.locatario_nome || '—'}</p>
            </div>
          </div>
        </div>

        <div className="card-acoes">
          <h3>Ações</h3>
          <div className="grid-acoes">
            <Link href={`/portal/contratos/${id}/pagamentos`} className="botao-acao">
              📋 Histórico de Pagamentos
            </Link>
            <Link href={`/portal/contratos/${id}/segunda-via`} className="botao-acao">
              📄 2ª Via de Boletos
            </Link>
            <Link href={`/portal/contratos/${id}/suporte`} className="botao-acao">
              💬 Entre em Contato
            </Link>
          </div>
        </div>

        <div className="card-aviso">
          <p>
            Para mais detalhes ou para solicitações relacionadas ao contrato, entre em contato com o proprietário ou gestor do imóvel.
          </p>
        </div>
      </div>

      <style jsx>{`
        .container-detalhes {
          max-width: 700px;
        }

        .card-secao {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .card-secao h3 {
          margin: 0 0 20px 0;
          color: #333;
          font-size: 16px;
          padding-bottom: 10px;
          border-bottom: 2px solid #f0f0f0;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
        }

        .info-item label {
          color: #666;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .info-item p {
          color: #333;
          font-size: 15px;
          margin: 0;
          padding: 0;
        }

        .info-item p.valor-grande {
          font-size: 20px;
          font-weight: 600;
          color: #2c3e50;
        }

        .tag {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tag.status-ativo {
          background: #d4edda;
          color: #155724;
        }

        .tag.status-aviso_previo {
          background: #fff3cd;
          color: #856404;
        }

        .tag.status-encerrado,
        .tag.status-extrajudicial,
        .tag.status-em_despejo {
          background: #f8d7da;
          color: #721c24;
        }

        .card-aviso {
          background: #e7f3ff;
          border-left: 4px solid #0066cc;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
          font-size: 14px;
          color: #333;
        }

        .card-aviso p {
          margin: 0;
        }

        .erro-conexao {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }

        .card-acoes {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .card-acoes h3 {
          margin: 0 0 20px 0;
          color: #333;
          font-size: 16px;
          padding-bottom: 10px;
          border-bottom: 2px solid #f0f0f0;
        }

        .grid-acoes {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .botao-acao {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          color: #1f2937;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s;
          cursor: pointer;
          gap: 8px;
        }

        .botao-acao:hover {
          background: #e5e7eb;
          border-color: #d1d5db;
        }

        @media (max-width: 600px) {
          .grid-acoes {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
