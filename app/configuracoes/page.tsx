import { obterPool } from '@/server/integracao/db';
import { formatarData } from '@/lib/formatacao';
import { atualizarIndicePadrao, cadastrarIndiceEconomico } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaIndice {
  id: string;
  indice: string;
  competencia: string;
  percentual_acumulado_12m: string;
}

async function buscarIndicePadrao(): Promise<string> {
  const pool = obterPool();
  const { rows } = await pool.query<{ valor: string }>(
    `select valor from configuracoes_sistema where chave = 'indice_reajuste_padrao'`,
  );
  return rows[0]?.valor ?? 'IPCA';
}

async function buscarIndicesEconomicos(): Promise<LinhaIndice[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaIndice>(
    `select id, indice, competencia, percentual_acumulado_12m
     from indices_economicos
     order by competencia desc, indice
     limit 24`,
  );
  return rows;
}

export default async function PaginaConfiguracoes() {
  let indicePadrao = 'IPCA';
  let indices: LinhaIndice[] = [];
  let erro: string | null = null;
  try {
    [indicePadrao, indices] = await Promise.all([buscarIndicePadrao(), buscarIndicesEconomicos()]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Configurações</h2>
        </div>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Configurações</h2>
      </div>

      <section>
        <h3>Índice de reajuste padrão</h3>
        <p className="section-hint">
          Usado para propor o novo valor de aluguel na renovação de contratos que não definem um índice próprio.
        </p>
        <form action={atualizarIndicePadrao}>
          <select name="indice_reajuste_padrao" defaultValue={indicePadrao}>
            <option value="IPCA">IPCA</option>
            <option value="IGPM">IGPM</option>
          </select>
          <button type="submit" className="botao-primario">
            Salvar
          </button>
        </form>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Índices econômicos (percentual acumulado em 12 meses)</h3>
        <p className="section-hint">
          Sem integração automática com IBGE/FGV — cadastre o percentual mais recente de cada índice todo mês para
          que as propostas de reajuste sejam calculadas.
        </p>
        <form action={cadastrarIndiceEconomico}>
          <label>
            Índice
            <select name="indice" required>
              <option value="IPCA">IPCA</option>
              <option value="IGPM">IGPM</option>
              <option value="INPC">INPC</option>
            </select>
          </label>
          <label>
            Competência (mês/ano)
            <input type="month" name="competencia" required />
          </label>
          <label>
            Percentual acumulado 12m (%)
            <input type="number" name="percentual_acumulado_12m" step="0.01" required />
          </label>
          <button type="submit" className="botao-primario">
            Cadastrar
          </button>
        </form>

        {indices.length === 0 ? (
          <p className="vazio">Nenhum índice cadastrado ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Índice</th>
                <th>Competência</th>
                <th>Percentual (12m)</th>
              </tr>
            </thead>
            <tbody>
              {indices.map((i) => (
                <tr key={i.id}>
                  <td>{i.indice}</td>
                  <td>{formatarData(i.competencia)}</td>
                  <td>{(Number(i.percentual_acumulado_12m) * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
