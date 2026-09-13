import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';
import { confirmarFatura } from './actions';
import { FormularioFaturaCelesc } from './FormularioFaturaCelesc';
import { FormularioCalcularAuditoria } from './FormularioCalcularAuditoria';

export const dynamic = 'force-dynamic';

interface Residencial {
  id: string;
  nome: string;
}

interface FaturaPendente {
  id: string;
  residencial: string;
  competencia: string;
  valor_total: string;
  energia_injetada_kwh: string;
  energia_consumida_rede_kwh: string;
}

interface Auditoria {
  id: string;
  residencial: string;
  competencia: string;
  area_comum_kwh: string;
  resultado_financeiro_valor: string;
  inconsistente: boolean;
}

async function buscarResidenciais(): Promise<Residencial[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Residencial>(`select id, nome from residenciais order by nome`);
  return rows;
}

async function buscarFaturasPendentes(): Promise<FaturaPendente[]> {
  const pool = obterPool();
  const { rows } = await pool.query<FaturaPendente>(`
    select f.id, r.nome as residencial, f.competencia, f.valor_total, f.energia_injetada_kwh, f.energia_consumida_rede_kwh
    from faturas_celesc_gd f
    join residenciais r on r.id = f.residencial_id
    where f.status = 'pendente_confirmacao'
    order by f.competencia desc
  `);
  return rows;
}

async function buscarAuditorias(): Promise<Auditoria[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Auditoria>(`
    select a.id, r.nome as residencial, a.competencia, a.area_comum_kwh, a.resultado_financeiro_valor, a.inconsistente
    from auditorias_energia_solar a
    join residenciais r on r.id = a.residencial_id
    order by a.competencia desc
    limit 50
  `);
  return rows;
}

export default async function PaginaEnergiaSolar() {
  let residenciais: Residencial[] = [];
  let faturasPendentes: FaturaPendente[] = [];
  let auditorias: Auditoria[] = [];
  let erro: string | null = null;

  try {
    [residenciais, faturasPendentes, auditorias] = await Promise.all([
      buscarResidenciais(),
      buscarFaturasPendentes(),
      buscarAuditorias(),
    ]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Energia Solar</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Energia Solar (Geração Distribuída)</h2>
      <p>
        Cruza a geração fotovoltaica confirmada com a fatura de Geração Distribuída da Celesc e o consumo já cobrado dos
        inquilinos para isolar o consumo de área comum (docs/30). A leitura diária de geração via API do ShinePhone ainda
        depende de <code>server/growatt/client.ts</code> rodar fora deste ambiente sandbox — por ora, `geracao_solar` é
        alimentada manualmente.
      </p>

      <h3>Lançar fatura Celesc GD</h3>
      {residenciais.length === 0 ? (
        <p className="vazio">Nenhum residencial cadastrado.</p>
      ) : (
        <FormularioFaturaCelesc residenciais={residenciais} />
      )}

      <h3>Faturas pendentes de confirmação ({faturasPendentes.length})</h3>
      {faturasPendentes.length === 0 ? (
        <p className="vazio">Nenhuma fatura pendente.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Residencial</th>
              <th>Competência</th>
              <th>Valor total</th>
              <th>Energia injetada (kWh)</th>
              <th>Energia consumida da rede (kWh)</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {faturasPendentes.map((f) => (
              <tr key={f.id}>
                <td>{f.residencial}</td>
                <td>{formatarData(f.competencia)}</td>
                <td>{formatarMoeda(f.valor_total)}</td>
                <td>{Number(f.energia_injetada_kwh).toFixed(2)}</td>
                <td>{Number(f.energia_consumida_rede_kwh).toFixed(2)}</td>
                <td>
                  <form action={confirmarFatura}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit">Confirmar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Calcular auditoria de um residencial/competência</h3>
      <p>
        Só calcula quando geração solar e fatura Celesc GD dessa competência já estiverem confirmadas — caso contrário devolve
        o motivo, nunca um número estimado.
      </p>
      {residenciais.length > 0 && <FormularioCalcularAuditoria residenciais={residenciais} />}

      <h3>Auditorias calculadas ({auditorias.length})</h3>
      {auditorias.length === 0 ? (
        <p className="vazio">Nenhuma auditoria calculada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Residencial</th>
              <th>Competência</th>
              <th>Área comum (kWh)</th>
              <th>Resultado financeiro</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {auditorias.map((a) => (
              <tr key={a.id}>
                <td>{a.residencial}</td>
                <td>{formatarData(a.competencia)}</td>
                <td>{Number(a.area_comum_kwh).toFixed(2)}</td>
                <td className={Number(a.resultado_financeiro_valor) < 0 ? 'valor-negativo' : undefined}>
                  {formatarMoeda(a.resultado_financeiro_valor)}
                </td>
                <td>
                  {a.inconsistente ? (
                    <span className="tag tag--atrasada">Inconsistente — verifique as leituras</span>
                  ) : (
                    <span className="tag">OK</span>
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
