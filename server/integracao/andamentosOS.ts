// Registra uma etapa (andamento) da execução de uma ordem de serviço —
// "relatório passo a passo", não só check-in/check-out (docs/14). Quando o
// tipo do andamento implica mudança de status da OS, sincroniza
// `ordens_servico.status`/`checkin_at`/`checkout_at` no mesmo lugar: única
// fonte de verdade para a transição, em código testado, não duplicada entre
// trigger de banco e chamador (mesma decisão de arquitetura já aplicada a
// juros/multa e pró-rata — docs/03: fluxo de negócio vive em código, não
// escondido em SQL).
//
// Uma única regra é reforçada aqui (não no banco, porque depende de ler o
// estado atual antes de decidir — mais natural em código do que em CHECK
// constraint): uma OS em estado final (`concluido`/`cancelado`) não aceita
// novo andamento. Fora isso, a ordem exata dos tipos dentro de uma execução
// ativa não é validada — nenhuma regra de negócio real foi especificada
// para isso, e travar demais aqui seria inventar processo que o cliente não
// pediu.

import type { Pool } from 'pg';

export type TipoAndamento =
  | 'atribuida'
  | 'a_caminho'
  | 'iniciada'
  | 'pausada'
  | 'material_pendente'
  | 'retomada'
  | 'concluida'
  | 'cancelada'
  | 'comentario';

export interface RegistrarAndamentoInput {
  ordemServicoId: string;
  tipo: TipoAndamento;
  descricao?: string | null;
  fotosUrls?: string[];
  registradoPorPessoaId?: string | null;
}

export interface ResultadoAndamento {
  andamentoId: string;
  /** Novo valor de `ordens_servico.status`, ou `null` se este andamento não mudou o status. */
  statusAtualizado: string | null;
}

const ESTADOS_FINAIS = new Set(['concluido', 'cancelado']);

// Só os tipos que de fato mudam o status grosso da OS. `pausada`,
// `material_pendente`, `retomada` e `comentario` são granularidade extra
// dentro de "em_execucao" — não existe um status "pausado" separado no
// enum de `ordens_servico.status` (decisão deliberada: não adicionar um
// status novo para algo que o log já registra em detalhe).
const STATUS_POR_TIPO: Partial<Record<TipoAndamento, string>> = {
  atribuida: 'alocado',
  a_caminho: 'alocado',
  iniciada: 'em_execucao',
  retomada: 'em_execucao',
  concluida: 'concluido',
  cancelada: 'cancelado',
};

export async function registrarAndamentoOS(pool: Pool, input: RegistrarAndamentoInput): Promise<ResultadoAndamento> {
  const { rows: osRows } = await pool.query<{ status: string }>(`select status from ordens_servico where id = $1`, [
    input.ordemServicoId,
  ]);
  if (osRows.length === 0) {
    throw new Error(`Ordem de serviço ${input.ordemServicoId} não encontrada`);
  }
  const statusAtual = osRows[0].status;
  if (ESTADOS_FINAIS.has(statusAtual)) {
    throw new Error(
      `Ordem de serviço ${input.ordemServicoId} já está em estado final (${statusAtual}) — não aceita novo andamento`,
    );
  }

  const { rows: andamentoRows } = await pool.query<{ id: string }>(
    `insert into ordem_servico_andamentos (ordem_servico_id, tipo, descricao, fotos_urls, registrado_por_pessoa_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.ordemServicoId, input.tipo, input.descricao ?? null, input.fotosUrls ?? [], input.registradoPorPessoaId ?? null],
  );
  const andamentoId = andamentoRows[0].id;

  const novoStatus = STATUS_POR_TIPO[input.tipo];
  let statusAtualizado: string | null = null;

  if (novoStatus && novoStatus !== statusAtual) {
    if (input.tipo === 'iniciada') {
      await pool.query(
        `update ordens_servico set status = $1, checkin_at = coalesce(checkin_at, now()), atualizado_em = now() where id = $2`,
        [novoStatus, input.ordemServicoId],
      );
    } else if (input.tipo === 'concluida') {
      await pool.query(`update ordens_servico set status = $1, checkout_at = now(), atualizado_em = now() where id = $2`, [
        novoStatus,
        input.ordemServicoId,
      ]);
    } else {
      await pool.query(`update ordens_servico set status = $1, atualizado_em = now() where id = $2`, [
        novoStatus,
        input.ordemServicoId,
      ]);
    }
    statusAtualizado = novoStatus;
  }

  return { andamentoId, statusAtualizado };
}
