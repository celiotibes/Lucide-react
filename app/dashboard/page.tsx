import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface Estatisticas {
  total_contratos: number;
  contratos_ativos: number;
  total_imoveis: number;
  receita_mensal: string;
  receita_media_contrato: string;
}

interface ContratoProximo {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string | null;
  data_vencimento_aditivo: string | null;
}

async function buscarEstatisticas(): Promise<Estatisticas | null> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query<Estatisticas>(
      `select
        count(distinct c.id) as total_contratos,
        count(distinct case when c.status = 'ativo' then c.id end) as contratos_ativos,
        count(distinct i.id) as total_imoveis,
        coalesce(sum(case when c.status = 'ativo' then c.valor_aluguel else 0 end), 0) as receita_mensal,
        coalesce(avg(case when c.status = 'ativo' then c.valor_aluguel end), 0) as receita_media_contrato
       from contratos c
       full outer join imoveis i on 1=1`
    );

    return rows.length > 0 ? rows[0] : null;
  } catch (erro) {
    console.error('Erro ao buscar estatísticas:', erro);
    return null;
  }
}

async function buscarContratosProximos(): Promise<ContratoProximo[]> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query<ContratoProximo>(
      `select c.id, i.identificacao as imovel_identificacao, p.nome as locatario_nome,
              c.data_fim as data_vencimento_aditivo
       from contratos c
       join imoveis i on i.id = c.imovel_id
       left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       left join pessoas p on p.id = cp.pessoa_id
       where c.status = 'ativo'
         and c.data_fim is not null
         and c.data_fim <= current_date + interval '90 days'
       order by c.data_fim asc
       limit 5`
    );

    return rows;
  } catch (erro) {
    console.error('Erro ao buscar contratos próximos:', erro);
    return [];
  }
}

export default async function PaginaDashboard() {
  const stats = await buscarEstatisticas();
  const contratosProximos = await buscarContratosProximos();

  return (
    <>
      <div className="cabecalho-dashboard">
        <h1>Dashboard</h1>
        <p className="subtitle">Visão geral do seu portfólio imobiliário</p>
      </div>

      {!stats ? (
        <div className="mensagem-erro">
          Erro ao carregar estatísticas. Verifique a conexão com o banco de dados.
        </div>
      ) : (
        <>
          <div className="grid-stats">
            <div className="card-stat">
              <div className="stat-icon">🏠</div>
              <div className="stat-conteudo">
                <p className="stat-label">Imóveis</p>
                <p className="stat-valor">{stats.total_imoveis}</p>
              </div>
            </div>

            <div className="card-stat">
              <div className="stat-icon">📋</div>
              <div className="stat-conteudo">
                <p className="stat-label">Contratos ativos</p>
                <p className="stat-valor">{stats.contratos_ativos}</p>
                <p className="stat-detalhe">de {stats.total_contratos} total</p>
              </div>
            </div>

            <div className="card-stat">
              <div className="stat-icon">💰</div>
              <div className="stat-conteudo">
                <p className="stat-label">Receita mensal</p>
                <p className="stat-valor">{formatarMoeda(stats.receita_mensal)}</p>
                <p className="stat-detalhe">média {formatarMoeda(stats.receita_media_contrato)}/contrato</p>
              </div>
            </div>
          </div>

          {contratosProximos.length > 0 && (
            <div className="card-alertas">
              <h2>⚠️ Contratos vencendo em breve</h2>
              <p className="hint">Próximos 90 dias — planeje renovações e reajustes</p>

              <table className="tabela-alertas">
                <thead>
                  <tr>
                    <th>Imóvel</th>
                    <th>Locatário</th>
                    <th>Vencimento</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contratosProximos.map((c) => (
                    <tr key={c.id}>
                      <td>{c.imovel_identificacao}</td>
                      <td>{c.locatario_nome || '—'}</td>
                      <td>{c.data_vencimento_aditivo ? formatarData(c.data_vencimento_aditivo) : '—'}</td>
                      <td>
                        <Link href={`/contratos/${c.id}/documentos`}>Ver contrato</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid-acoes">
            <div className="card-acao">
              <h3>📝 Gestão</h3>
              <ul>
                <li>
                  <Link href="/contratos">Contratos</Link>
                </li>
                <li>
                  <Link href="/imoveis">Imóveis</Link>
                </li>
                <li>
                  <Link href="/pessoas">Pessoas</Link>
                </li>
                <li>
                  <Link href="/hospedagens">Hospedagens</Link>
                </li>
              </ul>
            </div>

            <div className="card-acao">
              <h3>💼 Financeiro</h3>
              <ul>
                <li>
                  <Link href="/extratos">Extratos</Link>
                </li>
                <li>
                  <Link href="/conciliacao-bancaria">Conciliação</Link>
                </li>
              </ul>
            </div>

            <div className="card-acao">
              <h3>👤 Conta</h3>
              <ul>
                <li>
                  <Link href="/meu-perfil">Meu perfil</Link>
                </li>
                <li>
                  <Link href="/portal">Portal inquilino</Link>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .cabecalho-dashboard {
          margin-bottom: 40px;
        }

        .cabecalho-dashboard h1 {
          margin: 0 0 10px 0;
          font-size: 32px;
          color: #333;
        }

        .subtitle {
          margin: 0;
          color: #666;
          font-size: 16px;
        }

        .grid-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .card-stat {
          display: flex;
          align-items: center;
          gap: 20px;
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
        }

        .card-stat:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        .stat-icon {
          font-size: 40px;
          line-height: 1;
        }

        .stat-conteudo {
          flex: 1;
        }

        .stat-label {
          margin: 0;
          color: #666;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-valor {
          margin: 8px 0 4px 0;
          color: #333;
          font-size: 28px;
          font-weight: 700;
        }

        .stat-detalhe {
          margin: 0;
          color: #999;
          font-size: 12px;
        }

        .card-alertas {
          background: white;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 40px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border-left: 4px solid #ff9800;
        }

        .card-alertas h2 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 18px;
        }

        .hint {
          margin: 0 0 20px 0;
          color: #999;
          font-size: 13px;
        }

        .tabela-alertas {
          width: 100%;
          border-collapse: collapse;
        }

        .tabela-alertas th {
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

        .tabela-alertas td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          color: #333;
          font-size: 14px;
        }

        .tabela-alertas tr:hover {
          background: #f9f9f9;
        }

        .tabela-alertas a {
          color: #007bff;
          text-decoration: none;
          font-weight: 500;
        }

        .tabela-alertas a:hover {
          text-decoration: underline;
        }

        .grid-acoes {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .card-acao {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .card-acao h3 {
          margin: 0 0 16px 0;
          color: #333;
          font-size: 16px;
        }

        .card-acao ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .card-acao li {
          margin-bottom: 8px;
        }

        .card-acao li:last-child {
          margin-bottom: 0;
        }

        .card-acao a {
          display: block;
          padding: 8px 12px;
          color: #007bff;
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .card-acao a:hover {
          background: #f0f5ff;
          color: #0056b3;
        }

        .mensagem-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </>
  );
}
