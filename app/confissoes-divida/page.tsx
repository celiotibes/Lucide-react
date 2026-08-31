import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';
import { marcarAcordado, marcarPago, marcarJudicializado } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaConfissaoDivida {
  id: string;
  valor_principal: string;
  juros_pct_am: string;
  multa_pct: string;
  honorarios_pct: string;
  status: string;
  documento_id: string | null;
  data_vistoria: string;
  imovel: string;
  inquilino: string | null;
}

const RUBRICA_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  acordado: 'Acordado',
  pago: 'Pago',
  judicializado: 'Judicializado',
};

async function buscarConfissoes(): Promise<LinhaConfissaoDivida[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaConfissaoDivida>(`
    select cd.id, cd.valor_principal, cd.juros_pct_am, cd.multa_pct, cd.honorarios_pct, cd.status, cd.documento_id,
           v.data as data_vistoria,
           i.identificacao as imovel,
           p.nome as inquilino
    from confissoes_divida cd
    join vistorias v on v.id = cd.vistoria_id
    join contratos c on c.id = cd.contrato_id
    join imoveis i on i.id = c.imovel_id
    left join contrato_partes cp on cp.contrato_id = cd.contrato_id and cp.papel = 'locatario_principal'
    left join pessoas p on p.id = cp.pessoa_id
    order by v.data desc
  `);
  return rows;
}

export default async function PaginaConfissoesDivida() {
  let confissoes: LinhaConfissaoDivida[] = [];
  let erro: string | null = null;

  try {
    confissoes = await buscarConfissoes();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Confissões de Dívida</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Confissões de Dívida ({confissoes.length})</h2>
      <p className="section-hint">
        Geradas automaticamente quando uma vistoria de saída aponta saldo devedor não coberto pela caução (Fase 6).
        Os percentuais de juros/multa/honorários são os termos padrão da confissão, não um valor já calculado —
        atualize o status aqui conforme a negociação evolui.
      </p>
      {confissoes.length === 0 ? (
        <p className="vazio">Nenhuma confissão de dívida registrada.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Inquilino</th>
              <th>Vistoria</th>
              <th>Valor principal</th>
              <th>Juros a.m.</th>
              <th>Multa</th>
              <th>Honorários</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {confissoes.map((c) => (
              <tr key={c.id}>
                <td>{c.imovel}</td>
                <td>{c.inquilino ?? '—'}</td>
                <td>{formatarData(c.data_vistoria)}</td>
                <td>{formatarMoeda(c.valor_principal)}</td>
                <td>{(Number(c.juros_pct_am) * 100).toFixed(2)}%</td>
                <td>{(Number(c.multa_pct) * 100).toFixed(2)}%</td>
                <td>{(Number(c.honorarios_pct) * 100).toFixed(2)}%</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[c.status] ?? c.status}</span>
                </td>
                <td>
                  {c.status === 'pago' ? (
                    '—'
                  ) : (
                    <div className="formulario-linha">
                      {c.status === 'pendente' && (
                        <form action={marcarAcordado}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="botao-secundario">
                            Registrar acordo
                          </button>
                        </form>
                      )}
                      <form action={marcarPago}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit">Marcar como paga</button>
                      </form>
                      {c.status !== 'judicializado' && (
                        <form action={marcarJudicializado}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="botao-secundario">
                            Encaminhar à judicialização
                          </button>
                        </form>
                      )}
                    </div>
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
