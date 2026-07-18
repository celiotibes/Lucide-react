import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/formatacao';
import { compararVistorias, type ItemParaComparar } from '@/server/vistorias/compararVistorias';

export const dynamic = 'force-dynamic';

interface Vistoria {
  id: string;
  tipo: string;
  modo: string;
  status: string;
  data: string;
  data_agendada: string | null;
  vistoria_base_id: string | null;
  imovel: string;
  imovel_id: string;
  contrato_id: string;
  vistoriador: string | null;
}

interface ItemVistoriaLinha {
  item_checklist_id: string;
  estado: string | null;
  observacao: string | null;
  midia: { url: string; tipo: string }[];
  item_nome: string;
  ambiente_nome: string;
}

interface Fechamento {
  id: string;
  total_debitos: string;
  total_creditos: string;
  saldo_final: string;
  caucao_valor_atualizado: string | null;
  caucao_fonte: string | null;
  status: string;
}

const RUBRICA_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  periodica: 'Periódica',
  saida: 'Saída',
  conferencia: 'Conferência',
};

const RUBRICA_ESTADO: Record<string, string> = {
  novo: 'Novo',
  bom: 'Bom',
  regular: 'Regular',
  danificado: 'Danificado',
  inexistente: 'Inexistente',
};

async function buscarVistoria(id: string): Promise<Vistoria | null> {
  const pool = obterPool();
  const { rows } = await pool.query<Vistoria>(
    `select v.id, v.tipo, v.modo, v.status, v.data, v.data_agendada, v.vistoria_base_id,
            v.imovel_id, v.contrato_id,
            i.identificacao as imovel,
            p.nome as vistoriador
     from vistorias v
     join imoveis i on i.id = v.imovel_id
     left join pessoas p on p.id = v.realizada_por
     where v.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function buscarItens(vistoriaId: string): Promise<ItemVistoriaLinha[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ItemVistoriaLinha>(
    `select iv.item_checklist_id, iv.estado, iv.observacao, iv.midia,
            ic.nome as item_nome, av.nome as ambiente_nome
     from itens_vistoria iv
     join itens_checklist ic on ic.id = iv.item_checklist_id
     join ambientes_vistoria av on av.id = ic.ambiente_id
     where iv.vistoria_id = $1
     order by av.ordem, ic.ordem`,
    [vistoriaId],
  );
  return rows;
}

async function buscarFechamento(vistoriaSaidaId: string): Promise<Fechamento | null> {
  const pool = obterPool();
  const { rows } = await pool.query<Fechamento>(
    `select id, total_debitos, total_creditos, saldo_final, caucao_valor_atualizado, caucao_fonte, status
     from fechamentos_contrato where vistoria_saida_id = $1`,
    [vistoriaSaidaId],
  );
  return rows[0] ?? null;
}

export default async function PaginaVistoria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let vistoria: Vistoria | null;

  try {
    vistoria = await buscarVistoria(id);
  } catch {
    return (
      <>
        <h2>Vistoria</h2>
        <p className="erro-conexao">Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).</p>
      </>
    );
  }

  if (!vistoria) {
    notFound();
  }

  const itensAtuais = await buscarItens(vistoria.id);
  const itensBase = vistoria.vistoria_base_id ? await buscarItens(vistoria.vistoria_base_id) : [];
  const fechamento = vistoria.tipo === 'saida' || vistoria.tipo === 'conferencia' ? await buscarFechamento(vistoria.id) : null;

  const paraComparar = (linhas: ItemVistoriaLinha[]): ItemParaComparar[] =>
    linhas.map((l) => ({ itemChecklistId: l.item_checklist_id, estado: l.estado, observacao: l.observacao }));

  const nomesPorItem = new Map(
    [...itensBase, ...itensAtuais].map((l) => [l.item_checklist_id, { item: l.item_nome, ambiente: l.ambiente_nome }]),
  );

  const comparacao = vistoria.vistoria_base_id
    ? compararVistorias(paraComparar(itensBase), paraComparar(itensAtuais))
    : null;

  return (
    <>
      <div className="cabecalho-lista">
        <h2>
          {RUBRICA_TIPO[vistoria.tipo] ?? vistoria.tipo} — {vistoria.imovel}
        </h2>
        <Link href="/vistorias" className="botao-link">
          ← Todas as vistorias
        </Link>
      </div>

      <p>
        <strong>Status:</strong> {vistoria.status} &nbsp;|&nbsp; <strong>Modo:</strong>{' '}
        {vistoria.modo === 'autovistoria' ? 'Autovistoria' : 'Presencial'} &nbsp;|&nbsp;{' '}
        <strong>Vistoriador:</strong> {vistoria.vistoriador ?? '—'} &nbsp;|&nbsp; <strong>Data:</strong>{' '}
        {vistoria.data_agendada ? formatarDataHora(vistoria.data_agendada) : formatarData(vistoria.data)}
      </p>

      {vistoria.vistoria_base_id && comparacao ? (
        <>
          <h3>
            Comparativo com a vistoria de entrada ({comparacao.divergencias.length} divergência
            {comparacao.divergencias.length === 1 ? '' : 's'} em {comparacao.itensComparados} itens)
          </h3>
          {comparacao.divergencias.length === 0 ? (
            <p className="vazio">Nenhuma divergência entre entrada e saída — imóvel devolvido no mesmo estado.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ambiente</th>
                  <th>Item</th>
                  <th>Estado na entrada</th>
                  <th>Estado na saída</th>
                  <th>Observação na saída</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.divergencias.map((d) => (
                  <tr key={d.itemChecklistId}>
                    <td>{nomesPorItem.get(d.itemChecklistId)?.ambiente ?? '—'}</td>
                    <td>{nomesPorItem.get(d.itemChecklistId)?.item ?? '(item removido)'}</td>
                    <td>{d.estadoAnterior ? RUBRICA_ESTADO[d.estadoAnterior] ?? d.estadoAnterior : '—'}</td>
                    <td>
                      <span className="tag tag--atrasada">
                        {d.estadoAtual ? RUBRICA_ESTADO[d.estadoAtual] ?? d.estadoAtual : 'não vistoriado'}
                      </span>
                    </td>
                    <td>{d.observacaoAtual ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(vistoria.tipo === 'saida' || vistoria.tipo === 'conferencia') && (
            <>
              <h3>Fechamento financeiro</h3>
              <Link href={`/vistorias/${vistoria.id}/fechamento`} className="botao-link">
                Editar fechamento
              </Link>
              {fechamento && (
                <>
                  <p>
                    <strong>Débitos:</strong> {formatarMoeda(fechamento.total_debitos)} &nbsp;|&nbsp;{' '}
                    <strong>Créditos:</strong> {formatarMoeda(fechamento.total_creditos)}
                    {fechamento.caucao_valor_atualizado && (
                      <>
                        {' '}
                        (inclui caução atualizada de {formatarMoeda(fechamento.caucao_valor_atualizado)},{' '}
                        {fechamento.caucao_fonte === 'indice_bacen' ? 'via índice da poupança' : 'via extrato bancário'})
                      </>
                    )}
                  </p>
                  <p>
                    <strong>Saldo final:</strong>{' '}
                    <span className={`tag${Number(fechamento.saldo_final) < 0 ? ' tag--atrasada' : ' tag--concluido'}`}>
                      {Number(fechamento.saldo_final) >= 0
                        ? `A devolver ao inquilino: ${formatarMoeda(fechamento.saldo_final)}`
                        : `A cobrar do inquilino: ${formatarMoeda(Math.abs(Number(fechamento.saldo_final)))}`}
                    </span>{' '}
                    ({fechamento.status})
                  </p>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <h3>Itens vistoriados ({itensAtuais.length})</h3>
          {itensAtuais.length === 0 ? (
            <p className="vazio">Nenhum item registrado ainda.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ambiente</th>
                  <th>Item</th>
                  <th>Estado</th>
                  <th>Observação</th>
                  <th>Mídia</th>
                </tr>
              </thead>
              <tbody>
                {itensAtuais.map((item) => (
                  <tr key={item.item_checklist_id}>
                    <td>{item.ambiente_nome}</td>
                    <td>{item.item_nome}</td>
                    <td>{item.estado ? RUBRICA_ESTADO[item.estado] ?? item.estado : '—'}</td>
                    <td>{item.observacao ?? '—'}</td>
                    <td>{item.midia?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
