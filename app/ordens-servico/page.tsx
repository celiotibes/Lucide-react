import { obterPool } from '@/server/integracao/db';
import { formatarData } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaOrdemServico {
  id: string;
  categoria: string;
  descricao: string | null;
  status: string;
  urgencia: string;
  alvo: string;
  prestador: string | null;
  data_agendada: string | null;
  total_andamentos: number;
}

async function buscarOrdensServico(): Promise<LinhaOrdemServico[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaOrdemServico>(`
    select os.id, os.categoria, os.descricao, os.status, os.urgencia,
           coalesce(i.identificacao, r.nome) as alvo,
           p.nome as prestador,
           os.data_agendada,
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
      <h2>Ordens de Serviço ({ordens.length})</h2>
      {ordens.length === 0 ? (
        <p className="vazio">Nenhuma ordem de serviço aberta ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Alvo</th>
              <th>Prestador</th>
              <th>Agendada para</th>
              <th>Etapas registradas</th>
              <th>Urgência</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((os) => (
              <tr key={os.id}>
                <td>{os.categoria}</td>
                <td>{os.alvo}</td>
                <td>{os.prestador ?? '—'}</td>
                <td>{os.data_agendada ? formatarData(os.data_agendada) : '—'}</td>
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
