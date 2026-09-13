import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaFatura {
  id: string;
  tipo: string;
  status: string;
  competencia: string;
  vencimento: string;
  valor_bruto: string;
  valor_liquido: string;
  imovel: string;
  locatario: string | null;
}

async function buscarFaturas(): Promise<LinhaFatura[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaFatura>(`
    select f.id, f.tipo, f.status, f.competencia, f.vencimento, f.valor_bruto, f.valor_liquido,
           i.identificacao as imovel,
           p.nome as locatario
    from faturas f
    join imoveis i on i.id = f.imovel_id
    left join contrato_partes cp on cp.contrato_id = f.contrato_id and cp.papel = 'locatario_principal'
    left join pessoas p on p.id = cp.pessoa_id
    order by f.vencimento desc
    limit 200
  `);
  return rows;
}

const RUBRICA_STATUS: Record<string, string> = {
  aberta: 'Aberta',
  paga: 'Paga',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
  renegociada: 'Renegociada',
};

export default async function PaginaFaturas() {
  let faturas: LinhaFatura[] = [];
  let erro: string | null = null;

  try {
    faturas = await buscarFaturas();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Faturas</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Faturas ({faturas.length})</h2>
      {faturas.length === 0 ? (
        <p className="vazio">Nenhuma fatura gerada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Competência</th>
              <th>Vencimento</th>
              <th>Valor bruto</th>
              <th>Valor atualizado</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((fatura) => (
              <tr key={fatura.id}>
                <td>{fatura.imovel}</td>
                <td>{fatura.locatario ?? '—'}</td>
                <td>{formatarData(fatura.competencia)}</td>
                <td>{formatarData(fatura.vencimento)}</td>
                <td>{formatarMoeda(fatura.valor_bruto)}</td>
                <td>{formatarMoeda(fatura.valor_liquido)}</td>
                <td>
                  <span className={`tag${fatura.status === 'atrasada' ? ' tag--atrasada' : ''}`}>
                    {RUBRICA_STATUS[fatura.status] ?? fatura.status}
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
