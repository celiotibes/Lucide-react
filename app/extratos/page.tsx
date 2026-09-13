import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaExtrato {
  id: string;
  proprietario: string;
  alvo: string;
  competencia: string;
  receita_bruta: string;
  total_deducoes: string;
  valor_repassado: string;
  enviado_em: string | null;
}

async function buscarExtratos(): Promise<LinhaExtrato[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaExtrato>(`
    select e.id, p.nome as proprietario,
           coalesce(i.identificacao, 'Consolidado (carteira inteira)') as alvo,
           e.competencia, e.receita_bruta, e.total_deducoes, e.valor_repassado, e.enviado_em
    from extratos_mensais_proprietario e
    join pessoas p on p.id = e.pessoa_id
    left join imoveis i on i.id = e.imovel_id
    order by e.competencia desc, p.nome, i.identificacao nulls first
    limit 200
  `);
  return rows;
}

export default async function PaginaExtratos() {
  let extratos: LinhaExtrato[] = [];
  let erro: string | null = null;

  try {
    extratos = await buscarExtratos();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Extratos do Proprietário</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Extratos do Proprietário ({extratos.length})</h2>
      {extratos.length === 0 ? (
        <p className="vazio">Nenhum extrato gerado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Proprietário</th>
              <th>Imóvel</th>
              <th>Competência</th>
              <th>Receita bruta</th>
              <th>Deduções</th>
              <th>Valor repassado</th>
              <th>Envio</th>
            </tr>
          </thead>
          <tbody>
            {extratos.map((e) => (
              <tr key={e.id}>
                <td>{e.proprietario}</td>
                <td>{e.alvo}</td>
                <td>{formatarData(e.competencia)}</td>
                <td>{formatarMoeda(e.receita_bruta)}</td>
                <td>{formatarMoeda(e.total_deducoes)}</td>
                <td>{formatarMoeda(e.valor_repassado)}</td>
                <td>
                  {e.enviado_em ? (
                    formatarData(e.enviado_em)
                  ) : (
                    <span className="tag tag--atrasada">não enviado</span>
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
