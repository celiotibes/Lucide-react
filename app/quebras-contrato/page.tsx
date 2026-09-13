import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';
import { aprovarQuebra, rejeitarQuebra } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaQuebraContrato {
  id: string;
  ordem_servico_id: string;
  protocolo: string | null;
  imovel: string;
  inquilino: string | null;
  data_rescisao_desejada: string;
  data_notificacao: string;
  multa_calculada: string | null;
  faixa_bonificacao: string | null;
}

const RUBRICA_FAIXA: Record<string, string> = {
  ate_22_novembro: 'Bonificação de 85% (notificado até 22/11)',
  ate_27_novembro: 'Bonificação de 80% (notificado até 27/11)',
  fora_da_janela: 'Sem bonificação de dezembro',
  nao_aplicavel: 'Fora do período de dezembro',
};

async function buscarSolicitacoesPendentes(): Promise<LinhaQuebraContrato[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaQuebraContrato>(`
    select sq.id, sq.ordem_servico_id, os.protocolo,
           i.identificacao as imovel,
           p.nome as inquilino,
           sq.data_rescisao_desejada, sq.data_notificacao, sq.multa_calculada, sq.faixa_bonificacao
    from solicitacoes_quebra_contrato sq
    join ordens_servico os on os.id = sq.ordem_servico_id
    join imoveis i on i.id = os.imovel_id
    left join pessoas p on p.id = os.aberto_por_pessoa_id
    where sq.status = 'em_analise'
    order by sq.criado_em desc
  `);
  return rows;
}

export default async function PaginaQuebrasContrato() {
  let solicitacoes: LinhaQuebraContrato[] = [];
  let erro: string | null = null;

  try {
    solicitacoes = await buscarSolicitacoesPendentes();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Quebras de Contrato</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Quebras de Contrato ({solicitacoes.length} pendentes)</h2>
      <p className="section-hint">
        O valor de multa mostrado (quando existe) é calculado automaticamente pela regra de cada cidade — é insumo
        para a decisão, não uma aprovação automática. Sem regra codificada para a cidade, a coluna fica em branco e a
        gestão calcula manualmente.
      </p>
      {solicitacoes.length === 0 ? (
        <p className="vazio">Nenhuma solicitação de quebra de contrato pendente.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Imóvel</th>
              <th>Inquilino</th>
              <th>Notificação</th>
              <th>Rescisão desejada</th>
              <th>Multa calculada</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {solicitacoes.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/ordens-servico/${s.ordem_servico_id}`}>{s.protocolo ?? s.ordem_servico_id.slice(0, 8)}</Link>
                </td>
                <td>{s.imovel}</td>
                <td>{s.inquilino ?? '—'}</td>
                <td>{formatarData(s.data_notificacao)}</td>
                <td>{formatarData(s.data_rescisao_desejada)}</td>
                <td>
                  {s.multa_calculada ? (
                    <>
                      {formatarMoeda(s.multa_calculada)}
                      {s.faixa_bonificacao && (
                        <>
                          <br />
                          <span className="tag">{RUBRICA_FAIXA[s.faixa_bonificacao] ?? s.faixa_bonificacao}</span>
                        </>
                      )}
                    </>
                  ) : (
                    'sem cálculo automático'
                  )}
                </td>
                <td>
                  <form action={aprovarQuebra} className="formulario-linha">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="text" name="parecer_gestao" placeholder="Parecer (obrigatório)" required />
                    <button type="submit">Aprovar</button>
                  </form>
                  <form action={rejeitarQuebra} className="formulario-linha">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="text" name="parecer_gestao" placeholder="Parecer (obrigatório)" required />
                    <button type="submit" className="botao-secundario">
                      Rejeitar
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
