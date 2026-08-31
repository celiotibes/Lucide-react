// Ação: Encerrar contrato antigo e ligar novo (substituição de morador em coliving)
// (docs/40 seção 4 — Phase 2 item 3)
//
// Fluxo:
// 1. Validar que contratoAntigoId existe, está ativo, tem comodo_id (per-room)
// 2. Se novoContratoCandidatoId: validar que tem mesmo imovel_id e comodo_id
// 3. Marcar antigo como status='encerrado', motivo_encerramento
// 4. Auto-criar vistoria de saída (tipo='saida') para o contrato antigo
// 5. Novo contrato já ativo automaticamente linkará via visibilidade cruzada (sem ação extra)
//
// Retorna IDs criados para confirmação na UI.

import { obterPool } from './db';

export interface RequisicaoEncerrarPorSubstituicao {
  contratoAntigoId: string;
  novoContratoCandidatoId?: string | null;
  motivoEncerramento: 'substituicao' | 'desistencia' | 'outro';
  observacoes?: string;
}

export interface ResultadoEncerrarPorSubstituicao {
  contratoEncerradoId: string;
  vistoriaIdCriada: string | null;
  novoContratoId: string | null;
  status: 'encerrado_com_vistoria' | 'encerrado_sem_vistoria' | 'erro';
  mensagem: string;
}

interface LinhaContrato {
  id: string;
  imovel_id: string;
  comodo_id: string | null;
  status: string;
}

interface LinhaNovoContrato {
  id: string;
  imovel_id: string;
  comodo_id: string | null;
}

export async function encerrarContratoPorSubstituicao(
  requisicao: RequisicaoEncerrarPorSubstituicao,
): Promise<ResultadoEncerrarPorSubstituicao> {
  const pool = obterPool();

  try {
    // 1. Validar contrato antigo
    const { rows: contratoAntigoRows } = await pool.query<LinhaContrato>(
      `select id, imovel_id, comodo_id, status from contratos where id = $1`,
      [requisicao.contratoAntigoId],
    );

    if (contratoAntigoRows.length === 0) {
      return {
        contratoEncerradoId: requisicao.contratoAntigoId,
        vistoriaIdCriada: null,
        novoContratoId: null,
        status: 'erro',
        mensagem: `Contrato antigo ${requisicao.contratoAntigoId} não encontrado.`,
      };
    }

    const contratoAntigo = contratoAntigoRows[0];

    if (contratoAntigo.status !== 'ativo') {
      return {
        contratoEncerradoId: requisicao.contratoAntigoId,
        vistoriaIdCriada: null,
        novoContratoId: null,
        status: 'erro',
        mensagem: `Contrato antigo já está ${contratoAntigo.status}, não pode ser encerrado.`,
      };
    }

    if (contratoAntigo.comodo_id === null) {
      return {
        contratoEncerradoId: requisicao.contratoAntigoId,
        vistoriaIdCriada: null,
        novoContratoId: null,
        status: 'erro',
        mensagem: 'Encerramento por substituição é apenas para contratos de coliving (por quarto). Este é contrato do imóvel inteiro.',
      };
    }

    let novoContratoId: string | null = null;

    // 2. Se novoContratoCandidatoId fornecido, validar
    if (requisicao.novoContratoCandidatoId) {
      const { rows: novoContratoRows } = await pool.query<LinhaNovoContrato>(
        `select id, imovel_id, comodo_id from contratos where id = $1`,
        [requisicao.novoContratoCandidatoId],
      );

      if (novoContratoRows.length === 0) {
        return {
          contratoEncerradoId: requisicao.contratoAntigoId,
          vistoriaIdCriada: null,
          novoContratoId: null,
          status: 'erro',
          mensagem: `Novo contrato ${requisicao.novoContratoCandidatoId} não encontrado.`,
        };
      }

      const novoContrato = novoContratoRows[0];

      if (novoContrato.imovel_id !== contratoAntigo.imovel_id) {
        return {
          contratoEncerradoId: requisicao.contratoAntigoId,
          vistoriaIdCriada: null,
          novoContratoId: null,
          status: 'erro',
          mensagem: `Novo contrato está em imóvel diferente (${novoContrato.imovel_id} vs ${contratoAntigo.imovel_id}).`,
        };
      }

      if (novoContrato.comodo_id !== contratoAntigo.comodo_id) {
        return {
          contratoEncerradoId: requisicao.contratoAntigoId,
          vistoriaIdCriada: null,
          novoContratoId: null,
          status: 'erro',
          mensagem: `Novo contrato é para quarto diferente (${novoContrato.comodo_id} vs ${contratoAntigo.comodo_id}).`,
        };
      }

      novoContratoId = requisicao.novoContratoCandidatoId;
    }

    // 3. Marcar contrato antigo como encerrado
    await pool.query(
      `update contratos
       set status = $2,
           motivo_encerramento = $3,
           atualizado_em = now()
       where id = $1`,
      [requisicao.contratoAntigoId, 'encerrado', requisicao.motivoEncerramento],
    );

    // 4. Auto-criar vistoria de saída (tipo='saida', status='em_andamento')
    const dataAgora = new Date().toISOString();
    const { rows: vistoriaRows } = await pool.query<{ id: string }>(
      `insert into vistorias (contrato_id, imovel_id, tipo, status, data, checklist_json)
       values ($1, $2, 'saida', 'em_andamento', $3, '{"itens": [], "chavesDevolvidas": null}')
       returning id`,
      [requisicao.contratoAntigoId, contratoAntigo.imovel_id, dataAgora],
    );

    const vistoriaIdCriada = vistoriaRows.length > 0 ? vistoriaRows[0].id : null;

    return {
      contratoEncerradoId: requisicao.contratoAntigoId,
      vistoriaIdCriada,
      novoContratoId,
      status: vistoriaIdCriada ? 'encerrado_com_vistoria' : 'encerrado_sem_vistoria',
      mensagem: `Contrato encerrado por ${requisicao.motivoEncerramento}. Vistoria de saída ${vistoriaIdCriada ? 'criada' : 'falhou ao criar'}${novoContratoId ? `, novo contrato linkado automaticamente` : ''}. Acesse a vistoria de saída para registrar retenção de caução.`,
    };
  } catch (erro) {
    console.error('[encerrarContratoPorSubstituicao] Erro:', erro);
    return {
      contratoEncerradoId: requisicao.contratoAntigoId,
      vistoriaIdCriada: null,
      novoContratoId: null,
      status: 'erro',
      mensagem: `Erro ao encerrar contrato: ${erro instanceof Error ? erro.message : 'desconhecido'}`,
    };
  }
}
