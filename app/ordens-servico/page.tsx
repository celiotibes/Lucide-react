import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarDataHora } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaOrdemServico {
  id: string;
  protocolo: string | null;
  categoria: string;
  natureza: string | null;
  descricao: string | null;
  status: string;
  urgencia: string;
  alvo: string;
  prestador: string | null;
  data_agendada: string | null;
  sla_prazo_em: string | null;
  sla_vencido: boolean;
  total_andamentos: number;
}

async function buscarOrdensServico(): Promise<LinhaOrdemServico[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaOrdemServico>(`
    select os.id, os.protocolo, os.categoria, os.natureza, os.descricao, os.status, os.urgencia,
           coalesce(i.identificacao, r.nome) as alvo,
           p.nome as prestador,
           os.data_agendada,
           os.sla_prazo_em,
           (os.sla_prazo_em is not null and os.sla_prazo_em < now() and os.status not in ('concluido','cancelado')) as sla_vencido,
           (select count(*)::int from ordem_servico_andamentos a where a.ordem_servico_id = os.id) as total_andamentos
    from ordens_servico os
    left join imoveis i on i.id = os.imovel_id
    left join residenciais r on r.id = os.residencial_id
    left join pessoas p on p.id = os.prestador_id
    order by coalesce(os.data_agendada, os.criado_em) desc
    limit 200
  `);
  return rows;
}

const RUBRICA_STATUS: Record<string, string> = {
  aberto: 'Aberto',
  alocado: 'Alocado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const RUBRICA_NATUREZA: Record<string, string> = {
  emergencia: 'Emergência',
  financeiro: 'Financeiro',
  contratual: 'Contratual',
  manutencao: 'Manutenção',
  juridico: 'Jurídico',
};

export default async function PaginaOrdensServico() {
  let ordens: LinhaOrdemServico[] = [];
  let erro: string | null = null;

  try {
    ordens = await buscarOrdensServico();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Ordens de Serviço</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Ordens de Serviço ({ordens.length})</h2>
        <Link href="/ordens-servico/novo" className="botao-link">
          + Nova solicitação
        </Link>
      </div>
      {ordens.length === 0 ? (
        <p className="vazio">Nenhuma ordem de serviço aberta ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Natureza</th>
              <th>Categoria</th>
              <th>Alvo</th>
              <th>Prestador</th>
              <th>Agendada para</th>
              <th>Prazo SLA</th>
              <th>Etapas</th>
              <th>Urgência</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((os) => (
              <tr key={os.id}>
                <td>
                  <Link href={`/ordens-servico/${os.id}`}>{os.protocolo ?? os.id.slice(0, 8)}</Link>
                </td>
                <td>{os.natureza ? RUBRICA_NATUREZA[os.natureza] ?? os.natureza : '—'}</td>
                <td>{os.categoria}</td>
                <td>{os.alvo}</td>
                <td>{os.prestador ?? '—'}</td>
                <td>{os.data_agendada ? formatarData(os.data_agendada) : '—'}</td>
                <td>
                  {os.sla_prazo_em ? (
                    <span className={`tag${os.sla_vencido ? ' tag--atrasada' : ''}`}>
                      {formatarDataHora(os.sla_prazo_em)}
                      {os.sla_vencido ? ' (vencido)' : ''}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{os.total_andamentos}</td>
                <td>{os.urgencia}</td>
                <td>
                  <span className={`tag${os.status === 'concluido' ? ' tag--concluido' : ''}`}>
                    {RUBRICA_STATUS[os.status] ?? os.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
