import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { obterPool } from '@/server/integracao/db';

export const dynamic = 'force-dynamic';

interface ContratoInquilino {
  id: string;
  imovel_identificacao: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  status: string;
}

async function buscarContratosInquilino(usuarioId: string): Promise<ContratoInquilino[]> {
  try {
    const pool = obterPool();

    // Busca contratos onde o usuário é locatário
    const { rows } = await pool.query<ContratoInquilino>(
      `select c.id, i.identificacao as imovel_identificacao,
              c.data_inicio, c.data_fim, c.valor_aluguel, c.status
       from contratos c
       join imoveis i on i.id = c.imovel_id
       join contrato_partes cp on cp.contrato_id = c.id
       where cp.papel = 'locatario_principal'
         and cp.pessoa_id = $1
       order by c.data_inicio desc`,
      [usuarioId]
    );

    return rows;
  } catch (erro) {
    console.error('Erro ao buscar contratos do inquilino:', erro);
    return [];
  }
}

export default async function PaginaPortalInquilino() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let contratos: ContratoInquilino[] = [];
  let erro: string | null = null;

  if (user) {
    try {
      contratos = await buscarContratosInquilino(user.id);
    } catch {
      erro = 'Erro ao carregar seus contratos';
    }
  }

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
        <h2>Meus Imóveis</h2>
        <Link href="/meu-perfil" className="botao-secundario">
          👤 Perfil
        </Link>
      </div>

      {erro && <p className="erro-conexao">{erro}</p>}

      {contratos.length === 0 ? (
        <div className="card-vazio">
          <p className="vazio">Você não possui nenhum contrato ativo no momento.</p>
        </div>
      ) : (
        <div className="grid-contratos">
          {contratos.map((c) => (
            <Link key={c.id} href={`/portal/contratos/${c.id}`} className="card-contrato">
              <div className="card-header">
                <h3>{c.imovel_identificacao}</h3>
                <span className={`tag status-${c.status}`}>
                  {RUBRICA_STATUS[c.status] || c.status}
                </span>
              </div>

              <div className="card-body">
                <div className="info-linha">
                  <span className="label">Aluguel mensal</span>
                  <span className="valor">R$ {parseFloat(c.valor_aluguel).toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="info-linha">
                  <span className="label">Desde</span>
                  <span className="data">{new Date(c.data_inicio).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              <div className="card-footer">
                Ver contrato →
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        .cabecalho-lista {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .cabecalho-lista h2 {
          margin: 0;
          color: #333;
        }

        .card-vazio {
          background: white;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .vazio {
          color: #999;
          font-style: italic;
          margin: 0;
        }

        .grid-contratos {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }

        .card-contrato {
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          text-decoration: none;
          color: inherit;
        }

        .card-contrato:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .card-header {
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .card-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .card-body {
          padding: 20px;
          flex: 1;
        }

        .info-linha {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .info-linha:last-child {
          margin-bottom: 0;
        }

        .label {
          color: #666;
          font-size: 13px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .valor {
          color: #333;
          font-size: 16px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .data {
          color: #333;
          font-size: 14px;
        }

        .card-footer {
          padding: 12px 20px;
          background: #f9f9f9;
          color: #667eea;
          font-size: 13px;
          font-weight: 600;
          text-align: right;
          border-top: 1px solid #eee;
        }

        .tag {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tag.status-ativo {
          background: rgba(76, 175, 80, 0.2);
          color: #2e7d32;
        }

        .tag.status-aviso_previo {
          background: rgba(255, 193, 7, 0.2);
          color: #f57f17;
        }

        .tag.status-encerrado {
          background: rgba(158, 158, 158, 0.2);
          color: #616161;
        }

        .tag.status-extrajudicial,
        .tag.status-em_despejo {
          background: rgba(244, 67, 54, 0.2);
          color: #c62828;
        }

        .erro-conexao {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </>
  );
}
