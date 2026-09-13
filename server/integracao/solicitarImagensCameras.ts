// Pedido de imagens de câmera de segurança. O Anexo III (item B.2) do
// contrato de Florianópolis veda a solicitação de imagens por inquilinos
// para fins particulares, exceto sob ordem judicial ou policial — o
// cliente confirmou que o pedido não é aprovado pelo admin, e sim
// encaminhado ao jurídico para verificar se há uma exceção legal
// aplicável, mantendo a regra do anexo como padrão. Por isso esta função
// nunca libera nada: só abre o chamado (natureza 'juridico') e grava o
// pedido em 'em_analise_juridica' — a decisão em si (deferir por exceção
// ou indeferir pela regra padrão) é um passo humano separado, feito por
// quem tem competência jurídica, nunca automático.

import type { Pool } from 'pg';
import { abrirChamado } from './abrirChamado';

export interface SolicitarImagensCamerasInput {
  pessoaId: string;
  imovelId: string;
  dataSolicitada: string; // YYYY-MM-DD, dia da gravação pedida
  horarioSolicitado: string;
  justificativa: string;
}

export interface ResultadoSolicitarImagensCameras {
  ordemServicoId: string;
  protocolo: string;
  solicitacaoId: string;
  status: 'em_analise_juridica';
}

export class SolicitacaoImagensCamerasInvalidaError extends Error {}

export async function solicitarImagensCameras(
  pool: Pool,
  input: SolicitarImagensCamerasInput,
): Promise<ResultadoSolicitarImagensCameras> {
  if (!input.justificativa.trim()) {
    throw new SolicitacaoImagensCamerasInvalidaError('Justificativa é obrigatória para pedido de imagens de câmera');
  }
  if (!input.dataSolicitada || !input.horarioSolicitado.trim()) {
    throw new SolicitacaoImagensCamerasInvalidaError('Dia e horário da gravação pedida são obrigatórios');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const chamado = await abrirChamado(client, {
      pessoaId: input.pessoaId,
      imovelId: input.imovelId,
      natureza: 'juridico',
      categoria: 'imagens_cameras_seguranca',
      descricao: `Pedido de imagens de câmera — ${input.dataSolicitada} ${input.horarioSolicitado}`,
    });

    const { rows } = await client.query<{ id: string }>(
      `insert into solicitacoes_imagens_cameras (ordem_servico_id, data_solicitada, horario_solicitado, justificativa)
       values ($1, $2, $3, $4)
       returning id`,
      [chamado.ordemServicoId, input.dataSolicitada, input.horarioSolicitado, input.justificativa],
    );

    await client.query('COMMIT');

    return {
      ordemServicoId: chamado.ordemServicoId,
      protocolo: chamado.protocolo,
      solicitacaoId: rows[0].id,
      status: 'em_analise_juridica',
    };
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}
