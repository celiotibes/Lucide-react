// Inquilino abre um chamado — a base do portal self-service (pilares 1 e 2
// do pedido do cliente, docs/16-portal-inquilino-helpdesk.md). Resolve o
// contrato ativo do imóvel para quem abre (vínculo direto do chamado com o
// contrato vigente, não só o imóvel), calcula o prazo de SLA pela
// natureza (server/atendimento/prazoSla.ts) e grava a OS — protocolo é
// gerado pelo próprio banco (trigger, schema seção 23.1).
//
// `natureza` é OBRIGATÓRIA aqui — mesmo a coluna sendo nullable na
// tabela (OS geradas internamente, como o cronograma preventivo, não
// precisam dela) — é o fluxo do inquilino que exige a categorização
// ("o inquilino deve selecionar a natureza da solicitação", pedido do
// cliente).

import type { Pool, PoolClient } from 'pg';
import { calcularPrazoSla } from '../atendimento/prazoSla';

export type NaturezaChamado = 'emergencia' | 'financeiro' | 'contratual' | 'manutencao' | 'juridico';
export type UrgenciaChamado = 'baixa' | 'media' | 'alta' | 'urgente';

export interface AbrirChamadoInput {
  pessoaId: string;
  imovelId: string;
  natureza: NaturezaChamado;
  categoria: string;
  descricao?: string;
  urgencia?: UrgenciaChamado;
  anexosUrls?: string[];
}

export interface ResultadoAbrirChamado {
  ordemServicoId: string;
  protocolo: string;
  slaPrazoEm: Date;
  /** null quando não foi encontrado contrato ativo do inquilino para o imóvel — o chamado é aberto mesmo assim. */
  contratoId: string | null;
}

export class ChamadoInvalidoError extends Error {}

// Aceita `Pool` (uso avulso) ou `PoolClient` (quando outra função já abriu
// uma transação e precisa que esta abertura de chamado participe dela —
// ver server/integracao/solicitarImagensCameras.ts).
export async function abrirChamado(pool: Pool | PoolClient, input: AbrirChamadoInput): Promise<ResultadoAbrirChamado> {
  const { rows: politicaRows } = await pool.query<{ prazo_horas: string; horas_uteis: boolean }>(
    `select prazo_horas, horas_uteis from sla_politicas where natureza = $1`,
    [input.natureza],
  );
  if (politicaRows.length === 0) {
    throw new ChamadoInvalidoError(`Nenhuma política de SLA cadastrada para a natureza "${input.natureza}"`);
  }

  const { rows: contratoRows } = await pool.query<{ id: string }>(
    `select c.id
     from contratos c
     join contrato_partes cp on cp.contrato_id = c.id
     where c.imovel_id = $1 and cp.pessoa_id = $2 and cp.papel = 'locatario_principal' and c.status = 'ativo'
     order by c.data_inicio desc
     limit 1`,
    [input.imovelId, input.pessoaId],
  );
  const contratoId = contratoRows[0]?.id ?? null;

  const slaPrazoEm = calcularPrazoSla(new Date(), {
    prazoHoras: Number(politicaRows[0].prazo_horas),
    horasUteis: politicaRows[0].horas_uteis,
  });

  const { rows: osRows } = await pool.query<{ id: string; protocolo: string }>(
    `insert into ordens_servico
       (imovel_id, contrato_id, aberto_por_pessoa_id, categoria, descricao, urgencia, natureza, anexos_urls, sla_prazo_em)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, protocolo`,
    [
      input.imovelId,
      contratoId,
      input.pessoaId,
      input.categoria,
      input.descricao ?? null,
      input.urgencia ?? 'media',
      input.natureza,
      input.anexosUrls ?? [],
      slaPrazoEm,
    ],
  );

  return {
    ordemServicoId: osRows[0].id,
    protocolo: osRows[0].protocolo,
    slaPrazoEm,
    contratoId,
  };
}
