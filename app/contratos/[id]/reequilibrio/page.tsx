import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';
import { definirCriteriosReequilibrio, descartarReequilibrio } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaReequilibrio {
  id: string;
  marco_data: string;
  status: string;
  criterios: string | null;
  valor_proposto: string | null;
  notificacao_planejamento_enviada_em: string | null;
  notificacao_oficial_enviada_em: string | null;
}

async function buscarReequilibrios(contratoId: string): Promise<LinhaReequilibrio[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaReequilibrio>(
    `select id, marco_data, status, criterios, valor_proposto,
            notificacao_planejamento_enviada_em, notificacao_oficial_enviada_em
     from reequilibrios_contratuais
     where contrato_id = $1
     order by marco_data desc`,
    [contratoId],
  );
  return rows;
}

const RUBRICA_STATUS: Record<string, string> = {
  aguardando_criterios: 'Aguardando critérios',
  criterios_definidos: 'Critérios definidos',
  descartado: 'Descartado',
};

export default async function PaginaReequilibrioContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let reequilibrios: LinhaReequilibrio[] = [];
  let erro: string | null = null;
  try {
    reequilibrios = await buscarReequilibrios(id);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Reequilíbrio contratual trienal (Art. 19, Lei 8.245/91)</h2>
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
        <h2>Reequilíbrio contratual trienal (Art. 19, Lei 8.245/91)</h2>
        <Link href={`/contratos/${id}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>
      <p className="section-hint">
        Decorridos 3 anos sem acordo, qualquer parte pode pedir revisão judicial do aluguel para ajustar ao preço de
        mercado — o sistema avisa o calendário (90 e 30 dias antes do marco), mas não calcula esse valor sozinho.
        Defina abaixo os critérios de mercado usados antes da notificação oficial sair.
      </p>

      {reequilibrios.length === 0 ? (
        <p className="vazio">Nenhum marco trienal dentro da janela de aviso ainda.</p>
      ) : (
        reequilibrios.map((r) => (
          <div
            key={r.id}
            style={{ marginBottom: '1.5rem', border: '1px solid #d1d5db', borderRadius: '8px', padding: '1rem' }}
          >
            <p>
              <strong>Marco: {formatarData(r.marco_data)}</strong> —{' '}
              <span className="tag">{RUBRICA_STATUS[r.status] ?? r.status}</span>
            </p>
            <p className="section-hint">
              Planejamento (90d): {r.notificacao_planejamento_enviada_em ? formatarData(r.notificacao_planejamento_enviada_em) : 'ainda não enviado'} ·
              Oficial (30d): {r.notificacao_oficial_enviada_em ? formatarData(r.notificacao_oficial_enviada_em) : 'ainda não enviado'}
            </p>

            {r.status === 'criterios_definidos' ? (
              <>
                <p>
                  <strong>Critérios usados:</strong> {r.criterios}
                </p>
                {r.valor_proposto && (
                  <p>
                    <strong>Valor de referência proposto:</strong> {formatarMoeda(r.valor_proposto)}
                  </p>
                )}
              </>
            ) : r.status === 'aguardando_criterios' ? (
              <form action={definirCriteriosReequilibrio}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="contrato_id" value={id} />
                <label>
                  Critérios de mercado usados (comparáveis, avaliação profissional, etc.)
                  <textarea name="criterios" rows={4} required />
                </label>
                <label>
                  Valor de referência proposto (opcional)
                  <input type="number" name="valor_proposto" step="0.01" min="0" />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="submit" className="botao-primario">
                    Salvar critérios
                  </button>
                </div>
              </form>
            ) : null}

            {r.status !== 'descartado' && (
              <form action={descartarReequilibrio} style={{ marginTop: '0.5rem' }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="contrato_id" value={id} />
                <button type="submit" className="botao-secundario">
                  Descartar este marco (não pedir revisão)
                </button>
              </form>
            )}
          </div>
        ))
      )}
    </>
  );
}
