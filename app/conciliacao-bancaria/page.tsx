import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';
import { aprovarTransacao, ignorarTransacao } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaTransacao {
  id: string;
  conta: string;
  data: string;
  valor: string;
  descricao: string | null;
  origem: string;
  categoria_sugerida: string | null;
}

interface OpcaoCategoria {
  id: string;
  nome: string;
}

async function buscarTransacoesPendentes(): Promise<LinhaTransacao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaTransacao>(`
    select t.id, cb.instituicao as conta, t.data, t.valor, t.descricao, t.origem,
           cf.nome as categoria_sugerida
    from transacoes_bancarias t
    join contas_bancarias cb on cb.id = t.conta_id
    left join categorias_financeiras cf on cf.id = t.categoria_sugerida
    where t.status = 'sugerido'
    order by t.data desc
    limit 200
  `);
  return rows;
}

async function buscarCategorias(): Promise<OpcaoCategoria[]> {
  const pool = obterPool();
  const { rows } = await pool.query<OpcaoCategoria>(`select id, nome from categorias_financeiras order by nome`);
  return rows;
}

export default async function PaginaConciliacaoBancaria() {
  let transacoes: LinhaTransacao[] = [];
  let categorias: OpcaoCategoria[] = [];
  let erro: string | null = null;

  try {
    [transacoes, categorias] = await Promise.all([buscarTransacoesPendentes(), buscarCategorias()]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Conciliação Bancária</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Conciliação Bancária ({transacoes.length} pendentes)</h2>
      <p>Transações importadas (OFX ou lançadas manualmente) que ainda não foram revisadas. Nenhuma vira DRE oficial sem aprovação humana.</p>
      {transacoes.length === 0 ? (
        <p className="vazio">Nenhuma transação pendente de conciliação.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Origem</th>
              <th>Categoria</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => (
              <tr key={t.id}>
                <td>{t.conta}</td>
                <td>{formatarData(t.data)}</td>
                <td>{t.descricao ?? '—'}</td>
                <td className={Number(t.valor) < 0 ? 'valor-negativo' : undefined}>{formatarMoeda(t.valor)}</td>
                <td>{t.origem}</td>
                <td>
                  <form action={aprovarTransacao} className="formulario-linha">
                    <input type="hidden" name="id" value={t.id} />
                    <select name="categoria_final_id" defaultValue={t.categoria_sugerida ?? ''}>
                      <option value="">Sem categoria</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Aprovar</button>
                  </form>
                </td>
                <td>
                  <form action={ignorarTransacao}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="botao-secundario">
                      Ignorar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
