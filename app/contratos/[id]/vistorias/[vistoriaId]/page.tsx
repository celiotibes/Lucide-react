import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { obterUrlAssinadaDocumento } from '@/lib/supabase/storage';
import { formatarMoeda, formatarDataHora } from '@/lib/formatacao';
import {
  ITENS_CHECKLIST_VISTORIA,
  RUBRICA_ITEM_CHECKLIST,
  type ChecklistVistoria,
} from '@/server/vistorias/checklist';
import { salvarChecklist, adicionarFotoVistoria, concluirVistoria } from '../actions';

export const dynamic = 'force-dynamic';

interface LinhaVistoria {
  id: string;
  tipo: string;
  status: string;
  data: string;
  checklist_json: ChecklistVistoria;
}

interface LinhaFoto {
  id: string;
  url: string;
  capturado_em: string;
}

async function buscarVistoria(vistoriaId: string): Promise<LinhaVistoria | null> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaVistoria>(
    `select id, tipo, status, data, checklist_json from vistorias where id = $1`,
    [vistoriaId],
  );
  return rows[0] ?? null;
}

async function buscarFotos(vistoriaId: string): Promise<LinhaFoto[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaFoto>(
    `select id, url, capturado_em from vistoria_fotos where vistoria_id = $1 order by capturado_em desc`,
    [vistoriaId],
  );
  return rows;
}

const RUBRICA_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  periodica: 'Periódica',
  saida: 'Saída',
};

export default async function PaginaDetalheVistoria({
  params,
}: {
  params: Promise<{ id: string; vistoriaId: string }>;
}) {
  const { id: contratoId, vistoriaId } = await params;

  let vistoria: LinhaVistoria | null;
  let fotos: LinhaFoto[] = [];
  try {
    vistoria = await buscarVistoria(vistoriaId);
    if (vistoria) {
      fotos = await buscarFotos(vistoriaId);
    }
  } catch {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Vistoria</h2>
          <Link href={`/contratos/${contratoId}/vistorias`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).</p>
      </>
    );
  }
  if (!vistoria) {
    notFound();
  }

  const fotosComUrl = await Promise.all(
    fotos.map(async (foto) => ({
      ...foto,
      urlAssinada: await obterUrlAssinadaDocumento(foto.url).catch(() => null),
    })),
  );

  const somenteLeitura = vistoria.status === 'concluida';
  const checklist = vistoria.checklist_json;

  return (
    <>
      <div className="cabecalho-lista">
        <h2>
          Vistoria de {RUBRICA_TIPO[vistoria.tipo] ?? vistoria.tipo} — {formatarDataHora(vistoria.data)}
        </h2>
        <Link href={`/contratos/${contratoId}/vistorias`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      <p className="section-hint">
        Status: <span className="tag">{somenteLeitura ? 'Concluída' : 'Em andamento'}</span>
      </p>

      {checklist.retencaoCaucao && (
        <section style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
          <h3>Retenção de caução</h3>
          <p>Caução: {formatarMoeda(checklist.retencaoCaucao.valorCaucao)}</p>
          <p>Total de danos apurados: {formatarMoeda(checklist.retencaoCaucao.totalDanos)}</p>
          <p>Retido: {formatarMoeda(checklist.retencaoCaucao.valorRetido)}</p>
          <p>Devolvido ao inquilino: {formatarMoeda(checklist.retencaoCaucao.valorDevolvido)}</p>
          {checklist.retencaoCaucao.saldoDevedor > 0 && (
            <p className="erro-conexao">
              Saldo devedor de {formatarMoeda(checklist.retencaoCaucao.saldoDevedor)} — confissão de dívida aberta.
            </p>
          )}
        </section>
      )}

      <form action={salvarChecklist}>
        <input type="hidden" name="vistoria_id" value={vistoria.id} />
        <input type="hidden" name="contrato_id" value={contratoId} />

        <label>
          Chaves devolvidas
          <select name="chaves_devolvidas" defaultValue={checklist.chavesDevolvidas == null ? '' : checklist.chavesDevolvidas ? 'sim' : 'nao'} disabled={somenteLeitura}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Situação</th>
              <th>Custo de reparo</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {ITENS_CHECKLIST_VISTORIA.map((item) => {
              const atual = checklist.itens.find((i) => i.item === item);
              return (
                <tr key={item}>
                  <td>{RUBRICA_ITEM_CHECKLIST[item]}</td>
                  <td>
                    <select name={`situacao_${item}`} defaultValue={atual?.situacao ?? 'ok'} disabled={somenteLeitura}>
                      <option value="ok">OK</option>
                      <option value="dano">Com dano</option>
                      <option value="nao_aplica">Não se aplica</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      name={`custo_${item}`}
                      step="0.01"
                      min="0"
                      defaultValue={atual?.custoReparo ?? ''}
                      disabled={somenteLeitura}
                    />
                  </td>
                  <td>
                    <input type="text" name={`observacao_${item}`} defaultValue={atual?.observacao ?? ''} disabled={somenteLeitura} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!somenteLeitura && (
          <button type="submit" className="botao-primario">
            Salvar checklist
          </button>
        )}
      </form>

      <h3>Fotos</h3>
      {!somenteLeitura && (
        <form action={adicionarFotoVistoria} className="formulario">
          <input type="hidden" name="vistoria_id" value={vistoria.id} />
          <input type="hidden" name="contrato_id" value={contratoId} />
          <label>
            Foto
            <input type="file" name="arquivo" accept=".jpg,.jpeg,.png,.webp" required />
          </label>
          <label>
            Latitude (opcional)
            <input type="number" name="latitude" step="0.0000001" />
          </label>
          <label>
            Longitude (opcional)
            <input type="number" name="longitude" step="0.0000001" />
          </label>
          <button type="submit" className="botao-secundario">
            Adicionar foto
          </button>
        </form>
      )}

      {fotosComUrl.length === 0 ? (
        <p className="vazio">Nenhuma foto anexada ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {fotosComUrl.map((foto) =>
            foto.urlAssinada ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={foto.id} src={foto.urlAssinada} alt="Foto da vistoria" style={{ maxWidth: '200px', borderRadius: '8px' }} />
            ) : (
              <p key={foto.id} className="erro-conexao">
                Não foi possível gerar a URL da foto.
              </p>
            ),
          )}
        </div>
      )}

      {!somenteLeitura && (
        <form action={concluirVistoria} style={{ marginTop: '1.5rem' }}>
          <input type="hidden" name="vistoria_id" value={vistoria.id} />
          <input type="hidden" name="contrato_id" value={contratoId} />
          <button type="submit" className="botao-primario">
            Concluir vistoria
          </button>
        </form>
      )}
    </>
  );
}
