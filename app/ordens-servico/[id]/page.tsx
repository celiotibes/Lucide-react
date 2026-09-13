import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarDataHora } from '@/lib/formatacao';
import { FormularioAndamento } from './FormularioAndamento';

export const dynamic = 'force-dynamic';

const ESTADOS_FINAIS = new Set(['concluido', 'cancelado']);

interface OrdemServico {
  id: string;
  protocolo: string | null;
  categoria: string;
  natureza: string | null;
  descricao: string | null;
  status: string;
  urgencia: string;
  alvo: string;
  prestador: string | null;
  aberto_por: string | null;
  data_agendada: string | null;
  sla_prazo_em: string | null;
  sla_vencido: boolean;
  anexos_urls: string[];
  avaliacao_estrelas: number | null;
  criado_em: string;
}

interface Andamento {
  id: string;
  tipo: string;
  descricao: string | null;
  fotos_urls: string[];
  registrado_por: string | null;
  criado_em: string;
}

const RUBRICA_STATUS: Record<string, string> = {
  aberto: 'Aberto',
  alocado: 'Alocado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const RUBRICA_NATUREZA: Record<string, string> = {
  emergencia: 'Emergência',
  financeiro: 'Financeiro',
  contratual: 'Contratual',
  manutencao: 'Manutenção',
  juridico: 'Jurídico',
};

const RUBRICA_ANDAMENTO: Record<string, string> = {
  atribuida: 'Atribuída a um prestador',
  a_caminho: 'Prestador a caminho',
  iniciada: 'Execução iniciada',
  pausada: 'Execução pausada',
  material_pendente: 'Aguardando material',
  retomada: 'Execução retomada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  comentario: 'Comentário',
};

async function buscarOrdemServico(id: string): Promise<OrdemServico | null> {
  const pool = obterPool();
  const { rows } = await pool.query<OrdemServico>(
    `select os.id, os.protocolo, os.categoria, os.natureza, os.descricao, os.status, os.urgencia,
            coalesce(i.identificacao, r.nome) as alvo,
            prest.nome as prestador,
            abre.nome as aberto_por,
            os.data_agendada, os.sla_prazo_em,
            (os.sla_prazo_em is not null and os.sla_prazo_em < now() and os.status not in ('concluido','cancelado')) as sla_vencido,
            os.anexos_urls, os.avaliacao_estrelas, os.criado_em
     from ordens_servico os
     left join imoveis i on i.id = os.imovel_id
     left join residenciais r on r.id = os.residencial_id
     left join pessoas prest on prest.id = os.prestador_id
     left join pessoas abre on abre.id = os.aberto_por_pessoa_id
     where os.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function buscarAndamentos(id: string): Promise<Andamento[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Andamento>(
    `select a.id, a.tipo, a.descricao, a.fotos_urls, p.nome as registrado_por, a.criado_em
     from ordem_servico_andamentos a
     left join pessoas p on p.id = a.registrado_por_pessoa_id
     where a.ordem_servico_id = $1
     order by a.criado_em`,
    [id],
  );
  return rows;
}

async function buscarPrestadores(): Promise<{ id: string; nome: string }[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: string; nome: string }>(
    `select distinct p.id, p.nome
     from pessoas p
     join pessoa_papeis pp on pp.pessoa_id = p.id
     where pp.papel in ('prestador_fixo', 'prestador_eventual')
     order by p.nome`,
  );
  return rows;
}

export default async function PaginaDetalheOrdemServico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let os: OrdemServico | null = null;
  let andamentos: Andamento[] = [];
  let prestadores: { id: string; nome: string }[] = [];
  let erro: string | null = null;

  try {
    [os, andamentos, prestadores] = await Promise.all([buscarOrdemServico(id), buscarAndamentos(id), buscarPrestadores()]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return <p className="erro-conexao">{erro}</p>;
  }
  if (!os) {
    notFound();
  }

  return (
    <>
      <p>
        <Link href="/ordens-servico">← Voltar</Link>
      </p>
      <h2>{os.protocolo ?? os.id}</h2>

      <dl className="ficha">
        <dt>Status</dt>
        <dd>
          <span className={`tag${os.status === 'concluido' ? ' tag--concluido' : ''}`}>
            {RUBRICA_STATUS[os.status] ?? os.status}
          </span>
        </dd>

        <dt>Natureza</dt>
        <dd>{os.natureza ? RUBRICA_NATUREZA[os.natureza] ?? os.natureza : '—'}</dd>

        <dt>Categoria</dt>
        <dd>{os.categoria}</dd>

        <dt>Descrição</dt>
        <dd>{os.descricao ?? '—'}</dd>

        <dt>Alvo</dt>
        <dd>{os.alvo}</dd>

        <dt>Aberto por</dt>
        <dd>{os.aberto_por ?? '—'}</dd>

        <dt>Prestador</dt>
        <dd>{os.prestador ?? '—'}</dd>

        <dt>Urgência</dt>
        <dd>{os.urgencia}</dd>

        <dt>Agendada para</dt>
        <dd>{os.data_agendada ? formatarData(os.data_agendada) : '—'}</dd>

        <dt>Prazo de SLA</dt>
        <dd>
          {os.sla_prazo_em ? (
            <span className={`tag${os.sla_vencido ? ' tag--atrasada' : ''}`}>
              {formatarDataHora(os.sla_prazo_em)}
              {os.sla_vencido ? ' (vencido)' : ''}
            </span>
          ) : (
            '—'
          )}
        </dd>

        <dt>Avaliação</dt>
        <dd>{os.avaliacao_estrelas ? '★'.repeat(os.avaliacao_estrelas) : 'ainda não avaliado'}</dd>

        <dt>Anexos</dt>
        <dd>
          {os.anexos_urls.length === 0
            ? '—'
            : os.anexos_urls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                  {url}
                </a>
              ))}
        </dd>
      </dl>

      <h3>Andamento</h3>
      {andamentos.length === 0 ? (
        <p className="vazio">Nenhuma etapa registrada ainda.</p>
      ) : (
        <ol className="linha-do-tempo">
          {andamentos.map((a) => (
            <li key={a.id}>
              <strong>{RUBRICA_ANDAMENTO[a.tipo] ?? a.tipo}</strong>
              <span className="linha-do-tempo-data">{formatarDataHora(a.criado_em)}</span>
              {a.registrado_por && <span className="linha-do-tempo-autor"> — {a.registrado_por}</span>}
              {a.descricao && <p>{a.descricao}</p>}
              {a.fotos_urls.length > 0 && (
                <p>
                  {a.fotos_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                      {url}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3>Registrar andamento</h3>
      {ESTADOS_FINAIS.has(os.status) ? (
        <p className="vazio">Esta OS já está em estado final ({RUBRICA_STATUS[os.status] ?? os.status}) — não aceita novo andamento.</p>
      ) : (
        <FormularioAndamento ordemServicoId={os.id} prestadores={prestadores} />
      )}
    </>
  );
}
