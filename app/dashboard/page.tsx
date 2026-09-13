import Link from 'next/link';
import styles from './page.module.css';
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
      <div className={styles["cabecalho-dashboard"]}>
        <h1>Dashboard</h1>
        <p className={styles.subtitle}>Visão geral do seu portfólio imobiliário</p>
      </div>

      {!stats ? (
        <div className={styles["mensagem-erro"]}>
          Erro ao carregar estatísticas. Verifique a conexão com o banco de dados.
        </div>
      ) : (
        <>
          <div className={styles["grid-stats"]}>
            <div className={styles["card-stat"]}>
              <div className={styles["stat-icon"]}>🏠</div>
              <div className={styles["stat-conteudo"]}>
                <p className={styles["stat-label"]}>Imóveis</p>
                <p className={styles["stat-valor"]}>{stats.total_imoveis}</p>
              </div>
            </div>

            <div className={styles["card-stat"]}>
              <div className={styles["stat-icon"]}>📋</div>
              <div className={styles["stat-conteudo"]}>
                <p className={styles["stat-label"]}>Contratos ativos</p>
                <p className={styles["stat-valor"]}>{stats.contratos_ativos}</p>
                <p className={styles["stat-detalhe"]}>de {stats.total_contratos} total</p>
              </div>
            </div>

            <div className={styles["card-stat"]}>
              <div className={styles["stat-icon"]}>💰</div>
              <div className={styles["stat-conteudo"]}>
                <p className={styles["stat-label"]}>Receita mensal</p>
                <p className={styles["stat-valor"]}>{formatarMoeda(stats.receita_mensal)}</p>
                <p className={styles["stat-detalhe"]}>média {formatarMoeda(stats.receita_media_contrato)}/contrato</p>
              </div>
            </div>
          </div>

          {contratosProximos.length > 0 && (
            <div className={styles["card-alertas"]}>
              <h2>⚠️ Contratos vencendo em breve</h2>
              <p className={styles.hint}>Próximos 90 dias — planeje renovações e reajustes</p>

              <table className={styles["tabela-alertas"]}>
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

          <div className={styles["grid-acoes"]}>
            <div className={styles["card-acao"]}>
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

            <div className={styles["card-acao"]}>
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

            <div className={styles["card-acao"]}>
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

    </>
  );
}
