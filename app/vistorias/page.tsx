import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarDataHora } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaVistoria {
  id: string;
  tipo: string;
  modo: string;
  status: string;
  data: string;
  data_agendada: string | null;
  imovel: string;
  vistoriador: string | null;
  itens_registrados: number;
}

async function buscarVistorias(): Promise<LinhaVistoria[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaVistoria>(`
    select v.id, v.tipo, v.modo, v.status, v.data, v.data_agendada,
           i.identificacao as imovel,
           p.nome as vistoriador,
           (select count(*)::int from itens_vistoria iv where iv.vistoria_id = v.id) as itens_registrados
    from vistorias v
    join imoveis i on i.id = v.imovel_id
    left join pessoas p on p.id = v.realizada_por
    order by coalesce(v.data_agendada, v.data) desc
    limit 200
  `);
  return rows;
}

const RUBRICA_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  periodica: 'Periódica',
  saida: 'Saída',
  conferencia: 'Conferência',
};

const RUBRICA_STATUS: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  aguardando_assinatura: 'Aguardando assinatura',
  assinada: 'Assinada',
  contestada: 'Contestada',
  encerrada: 'Encerrada',
};

export default async function PaginaVistorias() {
  let vistorias: LinhaVistoria[] = [];
  let erro: string | null = null;

  try {
    vistorias = await buscarVistorias();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Vistorias</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Vistorias ({vistorias.length})</h2>
      </div>
      {vistorias.length === 0 ? (
        <p className="vazio">Nenhuma vistoria registrada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Tipo</th>
              <th>Modo</th>
              <th>Vistoriador</th>
              <th>Data</th>
              <th>Itens registrados</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vistorias.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/vistorias/${v.id}`}>{v.imovel}</Link>
                </td>
                <td>{RUBRICA_TIPO[v.tipo] ?? v.tipo}</td>
                <td>{v.modo === 'autovistoria' ? 'Autovistoria' : 'Presencial'}</td>
                <td>{v.vistoriador ?? '—'}</td>
                <td>{v.data_agendada ? formatarDataHora(v.data_agendada) : formatarData(v.data)}</td>
                <td>{v.itens_registrados}</td>
                <td>
                  <span className={`tag${v.status === 'encerrada' || v.status === 'concluida' ? ' tag--concluido' : ''}`}>
                    {RUBRICA_STATUS[v.status] ?? v.status}
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
