// Ação: Registrar hospedagem Airbnb/Booking e criar vistorias simplificadas de entrada/saída
// (docs/40 seção 5 — Phase 2 item 5, com Airbnb integration)
//
// Fluxo:
// 1. Validar imovel_id e comodo_id (se fornecido)
// 2. Criar registro em airbnb_hospedagens
// 3. Auto-criar vistoria tipo='hospedagem_temporaria' de entrada (status='concluida')
// 4. Auto-criar vistoria tipo='hospedagem_temporaria' de saída (status='em_andamento', com data futura)
// 5. Linkar ambas à hospedagem
//
// Retorna IDs criados para confirmação.

import { obterPool } from './db';

export interface RequisicaoRegistrarHospedagem {
  imovelId: string;
  comodoDid?: string | null;
  periodoInicio: Date;
  periodoFim: Date;
  diasHospedados: number;
  valorDiaria: number;
  plataforma: 'airbnb' | 'booking' | 'outro';
  platformaIdExterno?: string;
}

export interface ResultadoRegistrarHospedagem {
  hospedagemId: string | null;
  vistoriaEntradaId: string | null;
  vistoriaSaidaId: string | null;
  status: 'criada' | 'erro';
  mensagem: string;
}

interface LinhaImovel {
  id: string;
  status: string;
  permite_temporada: boolean;
}

interface LinhaComodo {
  id: string;
  imovel_id: string;
}

export async function registrarHospedagemAirbnb(
  requisicao: RequisicaoRegistrarHospedagem,
): Promise<ResultadoRegistrarHospedagem> {
  const pool = obterPool();

  try {
    // 1. Validar imovel
    const { rows: imovelRows } = await pool.query<LinhaImovel>(
      `select id, status, permite_temporada from imoveis where id = $1`,
      [requisicao.imovelId],
    );

    if (imovelRows.length === 0) {
      return {
        hospedagemId: null,
        vistoriaEntradaId: null,
        vistoriaSaidaId: null,
        status: 'erro',
        mensagem: `Imóvel ${requisicao.imovelId} não encontrado.`,
      };
    }

    const imovel = imovelRows[0];

    if (!imovel.permite_temporada) {
      return {
        hospedagemId: null,
        vistoriaEntradaId: null,
        vistoriaSaidaId: null,
        status: 'erro',
        mensagem: `Imóvel não permite temporada (Airbnb/Booking).`,
      };
    }

    let comodoDid: string | null = null;

    // 2. Validar comodo (se fornecido)
    if (requisicao.comodoDid) {
      const { rows: comodoDRows } = await pool.query<LinhaComodo>(
        `select id, imovel_id from comodos where id = $1`,
        [requisicao.comodoDid],
      );

      if (comodoDRows.length === 0) {
        return {
          hospedagemId: null,
          vistoriaEntradaId: null,
          vistoriaSaidaId: null,
          status: 'erro',
          mensagem: `Cômodo ${requisicao.comodoDid} não encontrado.`,
        };
      }

      const comodo = comodoDRows[0];
      if (comodo.imovel_id !== requisicao.imovelId) {
        return {
          hospedagemId: null,
          vistoriaEntradaId: null,
          vistoriaSaidaId: null,
          status: 'erro',
          mensagem: `Cômodo não pertence a este imóvel.`,
        };
      }

      comodoDid = requisicao.comodoDid;
    }

    // 3. Criar hospedagem
    const receita = requisicao.diasHospedados * requisicao.valorDiaria;
    const dataInicio = requisicao.periodoInicio.toISOString().split('T')[0];
    const dataFim = requisicao.periodoFim.toISOString().split('T')[0];

    const { rows: hospedagemRows } = await pool.query<{ id: string }>(
      `insert into airbnb_hospedagens (
         imovel_id, comodo_id, periodo_inicio, periodo_fim,
         dias_hospedados, valor_diaria, receita_total,
         plataforma, plataforma_id_externo
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        requisicao.imovelId,
        comodoDid,
        dataInicio,
        dataFim,
        requisicao.diasHospedados,
        requisicao.valorDiaria,
        receita,
        requisicao.plataforma,
        requisicao.platformaIdExterno || null,
      ],
    );

    const hospedagemId = hospedagemRows[0]?.id;

    if (!hospedagemId) {
      return {
        hospedagemId: null,
        vistoriaEntradaId: null,
        vistoriaSaidaId: null,
        status: 'erro',
        mensagem: 'Falha ao criar hospedagem.',
      };
    }

    // 4. Criar vistoria de entrada (tipo='hospedagem_temporaria', status='concluida')
    const dataAgora = new Date().toISOString();
    const { rows: vistoriaEntradaRows } = await pool.query<{ id: string }>(
      `insert into vistorias (
         imovel_id, airbnb_hospedagem_id, tipo, status,
         data, checklist_json
       )
       values ($1, $2, 'hospedagem_temporaria', 'concluida', $3, '{"itens": [], "entrada": true}')
       returning id`,
      [requisicao.imovelId, hospedagemId, dataAgora],
    );

    const vistoriaEntradaId = vistoriaEntradaRows[0]?.id || null;

    // 5. Criar vistoria de saída (tipo='hospedagem_temporaria', status='em_andamento', data futura)
    const dataSaidaPlaneada = new Date(requisicao.periodoFim);
    dataSaidaPlaneada.setDate(dataSaidaPlaneada.getDate() + 1); // Dia após checkout

    const { rows: vistoriaSaidaRows } = await pool.query<{ id: string }>(
      `insert into vistorias (
         imovel_id, airbnb_hospedagem_id, tipo, status,
         data, checklist_json
       )
       values ($1, $2, 'hospedagem_temporaria', 'em_andamento', $3, '{"itens": [], "entrada": false}')
       returning id`,
      [requisicao.imovelId, hospedagemId, dataSaidaPlaneada.toISOString()],
    );

    const vistoriaSaidaId = vistoriaSaidaRows[0]?.id || null;

    // Linkar vistorias à hospedagem
    if (vistoriaEntradaId) {
      await pool.query(
        `update airbnb_hospedagens set vistoria_entrada_id = $1 where id = $2`,
        [vistoriaEntradaId, hospedagemId],
      );
    }

    if (vistoriaSaidaId) {
      await pool.query(
        `update airbnb_hospedagens set vistoria_saida_id = $1 where id = $2`,
        [vistoriaSaidaId, hospedagemId],
      );
    }

    return {
      hospedagemId,
      vistoriaEntradaId,
      vistoriaSaidaId,
      status: 'criada',
      mensagem: `Hospedagem registrada com sucesso (${requisicao.diasHospedados} dias, R$ ${receita.toFixed(2)}). Vistorias simplificadas criadas: entrada concluída, saída agendada para ${dataSaidaPlaneada.toLocaleDateString('pt-BR')}.`,
    };
  } catch (erro) {
    console.error('[registrarHospedagemAirbnb] Erro:', erro);
    return {
      hospedagemId: null,
      vistoriaEntradaId: null,
      vistoriaSaidaId: null,
      status: 'erro',
      mensagem: `Erro ao registrar hospedagem: ${erro instanceof Error ? erro.message : 'desconhecido'}`,
    };
  }
}
