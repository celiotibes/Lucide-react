import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarDataHora } from '@/lib/formatacao';
import { aprovarCompatibilidade, reprovarCompatibilidade, marcarEntrevistaRequerida } from './actions';

export const dynamic = 'force-dynamic';

interface PontoAtrito {
  variavel: string;
  descricao: string;
}

interface AlertaCritico {
  tipo: string;
  descricao: string;
}

interface LinhaCompatibilidade {
  id: string;
  imovel: string;
  score_geral: string;
  pontos_atrito: PontoAtrito[];
  alertas_criticos: AlertaCritico[];
  status: string;
  parecer: string | null;
  criado_em: string;
  nome_a: string;
  quarto_a: string | null;
  nome_b: string;
  quarto_b: string | null;
}

interface LinhaAguardando {
  lead_id: string;
  nome: string;
  imovel: string;
  quarto: string;
  criado_em: string;
}

const RUBRICA_STATUS: Record<string, string> = {
  calculado: 'Aguardando decisão',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  entrevista_requerida: 'Entrevista requerida',
};

const CONSULTA_COMPATIBILIDADES = `
  select cc.id, i.identificacao as imovel, cc.score_geral, cc.pontos_atrito, cc.alertas_criticos,
         cc.status, cc.parecer, cc.criado_em,
         coalesce(la.nome, pa.nome) as nome_a,
         coalesce(
           (select co.identificacao from comodos co where co.id = la.comodo_interesse_id),
           (select co.identificacao from comodos co
              join contratos c on c.comodo_id = co.id
              join contrato_partes cp on cp.contrato_id = c.id
              where cp.pessoa_id = pa.id and c.status = 'ativo' limit 1)
         ) as quarto_a,
         coalesce(lb.nome, pb.nome) as nome_b,
         coalesce(
           (select co.identificacao from comodos co where co.id = lb.comodo_interesse_id),
           (select co.identificacao from comodos co
              join contratos c on c.comodo_id = co.id
              join contrato_partes cp on cp.contrato_id = c.id
              where cp.pessoa_id = pb.id and c.status = 'ativo' limit 1)
         ) as quarto_b
  from compatibilidades_coliving cc
  join imoveis i on i.id = cc.imovel_id
  join perfis_convivencia pfa on pfa.id = cc.perfil_a_id
  left join leads la on la.id = pfa.lead_id
  left join pessoas pa on pa.id = pfa.pessoa_id
  join perfis_convivencia pfb on pfb.id = cc.perfil_b_id
  left join leads lb on lb.id = pfb.lead_id
  left join pessoas pb on pb.id = pfb.pessoa_id
`;

async function buscarPendentes(): Promise<LinhaCompatibilidade[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaCompatibilidade>(
    `${CONSULTA_COMPATIBILIDADES} where cc.status = 'calculado' order by cc.criado_em desc`,
  );
  return rows;
}

async function buscarDecididas(): Promise<LinhaCompatibilidade[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaCompatibilidade>(
    `${CONSULTA_COMPATIBILIDADES} where cc.status <> 'calculado' order by cc.decidido_em desc limit 20`,
  );
  return rows;
}

async function buscarAguardandoSegundoInteressado(): Promise<LinhaAguardando[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaAguardando>(`
    select l.id as lead_id, l.nome, i.identificacao as imovel, co.identificacao as quarto, l.criado_em
    from leads l
    join perfis_convivencia pf on pf.lead_id = l.id
    join imoveis i on i.id = l.imovel_interesse_id
    join comodos co on co.id = l.comodo_interesse_id
    where l.status not in ('reprovado', 'contrato_assinado')
      and not exists (
        select 1 from compatibilidades_coliving cc where cc.perfil_a_id = pf.id or cc.perfil_b_id = pf.id
      )
    order by l.criado_em desc
  `);
  return rows;
}

function CardComparacao({ c, decisao }: { c: LinhaCompatibilidade; decisao: boolean }) {
  return (
    <div className="card-resumo" style={{ minWidth: '100%', marginBottom: '1rem' }}>
      <div className="cabecalho-lista">
        <strong>
          {c.imovel} — {c.nome_a} ({c.quarto_a ?? '—'}) × {c.nome_b} ({c.quarto_b ?? '—'})
        </strong>
        <span className="tag">
          {Number(c.score_geral).toFixed(0)}% · {RUBRICA_STATUS[c.status] ?? c.status}
        </span>
      </div>

      {c.pontos_atrito.length > 0 && (
        <div>
          <strong>Pontos de atrito:</strong>
          <ul>
            {c.pontos_atrito.map((p, indice) => (
              <li key={`${p.variavel}-${indice}`}>{p.descricao}</li>
            ))}
          </ul>
        </div>
      )}

      {c.alertas_criticos.length > 0 && (
        <div className="erro-conexao">
          <strong>Alertas:</strong>
          <ul>
            {c.alertas_criticos.map((a, indice) => (
              <li key={`${a.tipo}-${indice}`}>{a.descricao}</li>
            ))}
          </ul>
        </div>
      )}

      {c.parecer && (
        <p className="section-hint">
          <strong>Parecer:</strong> {c.parecer}
        </p>
      )}

      <p className="section-hint">Calculado em {formatarDataHora(c.criado_em)}.</p>

      {decisao && (
        <div className="formulario-linha">
          <form action={aprovarCompatibilidade}>
            <input type="hidden" name="id" value={c.id} />
            <input type="text" name="parecer" placeholder="Parecer (obrigatório)" required />
            <button type="submit">Aprovar</button>
          </form>
          <form action={marcarEntrevistaRequerida}>
            <input type="hidden" name="id" value={c.id} />
            <input type="text" name="parecer" placeholder="Parecer (obrigatório)" required />
            <button type="submit" className="botao-secundario">
              Pedir entrevista
            </button>
          </form>
          <form action={reprovarCompatibilidade}>
            <input type="hidden" name="id" value={c.id} />
            <input type="text" name="parecer" placeholder="Parecer (obrigatório)" required />
            <button type="submit" className="botao-secundario">
              Reprovar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default async function PaginaColiving() {
  let pendentes: LinhaCompatibilidade[] = [];
  let decididas: LinhaCompatibilidade[] = [];
  let aguardando: LinhaAguardando[] = [];
  let erro: string | null = null;

  try {
    [pendentes, decididas, aguardando] = await Promise.all([
      buscarPendentes(),
      buscarDecididas(),
      buscarAguardandoSegundoInteressado(),
    ]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Coliving — Triagem e Compatibilidade</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Coliving — Triagem e Compatibilidade</h2>
        <Link href="/coliving/novo" className="botao-secundario">
          Formulário de interesse
        </Link>
      </div>
      <p className="section-hint">
        O score é insumo, não aprovação automática — a decisão de aprovar, reprovar ou pedir entrevista é sempre da gestão,
        com parecer registrado.
      </p>

      <h3>Comparações pendentes de decisão ({pendentes.length})</h3>
      {pendentes.length === 0 ? (
        <p className="vazio">Nenhuma comparação pendente.</p>
      ) : (
        pendentes.map((c) => <CardComparacao key={c.id} c={c} decisao />)
      )}

      <h3>Aguardando 2º interessado ({aguardando.length})</h3>
      {aguardando.length === 0 ? (
        <p className="vazio">Nenhum candidato aguardando concorrente para comparação.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Candidato</th>
              <th>Imóvel</th>
              <th>Quarto pretendido</th>
              <th>Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {aguardando.map((a) => (
              <tr key={a.lead_id}>
                <td>{a.nome}</td>
                <td>{a.imovel}</td>
                <td>{a.quarto}</td>
                <td>{formatarDataHora(a.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {decididas.length > 0 && (
        <>
          <h3>Decisões recentes</h3>
          {decididas.map((c) => (
            <CardComparacao key={c.id} c={c} decisao={false} />
          ))}
        </>
      )}
    </>
  );
}
