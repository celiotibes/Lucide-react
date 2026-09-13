import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';
import { aprovarReajuste, rejeitarReajuste } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaReajuste {
  id: string;
  indice: string;
  percentual: string;
  valor_anterior: string;
  valor_novo: string;
  status: string;
  data_proposta: string;
  data_aprovacao: string | null;
}

async function buscarReajustes(contratoId: string): Promise<LinhaReajuste[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaReajuste>(
    `select id, indice, percentual, valor_anterior, valor_novo, status, data_proposta, data_aprovacao
     from reajustes_contrato
     where contrato_id = $1
     order by data_proposta desc`,
    [contratoId],
  );
  return rows;
}

const RUBRICA_STATUS: Record<string, string> = {
  proposto: 'Aguardando confirmação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  aplicado: 'Aplicado',
};

export default async function PaginaReajustesContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let reajustes: LinhaReajuste[] = [];
  let erro: string | null = null;
  try {
    reajustes = await buscarReajustes(id);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Reajustes do contrato</h2>
          <Link href={`/contratos/${id}/documentos`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Reajustes do contrato</h2>
        <Link href={`/contratos/${id}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>
      <p className="section-hint">
        Propostas geradas automaticamente 30 dias antes do vencimento (índice do contrato ou padrão do sistema).
        Nenhum valor é aplicado ao contrato sem confirmação aqui.
      </p>

      {reajustes.length === 0 ? (
        <p className="vazio">Nenhum reajuste proposto ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Proposto em</th>
              <th>Índice</th>
              <th>Percentual</th>
              <th>De</th>
              <th>Para</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {reajustes.map((r) => (
              <tr key={r.id}>
                <td>{formatarData(r.data_proposta)}</td>
                <td>{r.indice}</td>
                <td>{(Number(r.percentual) * 100).toFixed(2)}%</td>
                <td>{formatarMoeda(r.valor_anterior)}</td>
                <td>{formatarMoeda(r.valor_novo)}</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[r.status] ?? r.status}</span>
                  {r.data_aprovacao && ` (${formatarData(r.data_aprovacao)})`}
                </td>
                <td>
                  {r.status === 'proposto' ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <form action={aprovarReajuste}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="contrato_id" value={id} />
                        <button type="submit" className="botao-primario">
                          Aprovar
                        </button>
                      </form>
                      <form action={rejeitarReajuste}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="contrato_id" value={id} />
                        <button type="submit" className="botao-secundario">
                          Rejeitar
                        </button>
                      </form>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
