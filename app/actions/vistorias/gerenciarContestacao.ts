'use server';

import { obterPool } from '@/server/integracao/db';
import { z } from 'zod';

const ContestacaoSchema = z.object({
  vistoriaSaidaId: z.string(),
  itemVistoriaId: z.string(),
  motivo: z.string().min(10),
  descricaoDesacordo: z.string().min(20),
  fotoEvidencia?: z.string(), // URL
  contatoInquilino: z.string().email(),
});

const AprovarContestaçaoSchema = z.object({
  contestacaoId: z.string(),
  aceitar: z.boolean(),
  justificativa: z.string(),
});

const AtualizarStatusReparoSchema = z.object({
  reparoId: z.string(),
  novoStatus: z.enum([
    'pendente',
    'orcado',
    'aprovado',
    'rejeitado',
    'agendado',
    'em_execucao',
    'concluido',
    'desistido',
  ]),
  detalhes?: z.string(),
});

/**
 * Registra contestação de dano conforme Lei 8.245/91
 * Inquilino discorda de item cobrável e abre prazo de 5 dias úteis
 */
export async function registrarContestacao(
  input: z.infer<typeof ContestacaoSchema>
): Promise<{ success: boolean; contestacaoId?: string; preclusaolimite?: string; erro?: string }> {
  try {
    const validado = ContestacaoSchema.parse(input);
    const pool = obterPool();

    // Validar vistoria
    const vistoriaResult = await pool.query(
      `select v.id, v.contrato_id, c.inquilino_id, c.data_inicio
       from vistorias v
       join contratos c on c.id = v.contrato_id
       where v.id = $1 and v.modo = 'saida'`,
      [validado.vistoriaSaidaId]
    );

    if (vistoriaResult.rows.length === 0) {
      return { success: false, erro: 'Vistoria de saída não encontrada' };
    }

    const vistoria = vistoriaResult.rows[0];

    // Criar contestação
    const contestacaoId = `contest-${Date.now()}`;

    const contestacaoResult = await pool.query(
      `insert into contestacoes (
        id, vistoria_saida_id, item_vistoria_id, motivo, descricao_desacordo,
        foto_evidencia, contato_inquilino, status, data_abertura
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       returning id, preclusao_data_limite`,
      [
        contestacaoId,
        validado.vistoriaSaidaId,
        validado.itemVistoriaId,
        validado.motivo,
        validado.descricaoDesacordo,
        validado.fotoEvidencia,
        validado.contatoInquilino,
        'aberta',
      ]
    );

    const contestacao = contestacaoResult.rows[0];

    // Registrar em auditoria
    await pool.query(
      `insert into auditoria_contestacao (
        contestacao_id, acao, usuario_id, detalhes, dados_depois
      ) values ($1, $2, $3, $4, $5)`,
      [
        contestacaoId,
        'CONTESTACAO_ABERTA',
        `inquilino-${vistoria.inquilino_id}`,
        `Contestação aberta via portal de inquilino`,
        JSON.stringify({
          motivo: validado.motivo,
          descricaoDesacordo: validado.descricaoDesacordo,
          fotoEvidencia: validado.fotoEvidencia,
        }),
      ]
    );

    // Notificar gestor
    await pool.query(
      `insert into notificacoes_vistoria (id, vistoria_id, tipo, titulo, mensagem, lida, criada_em)
       values ($1, $2, $3, $4, $5, false, now())`,
      [
        `notif-${Date.now()}`,
        validado.vistoriaSaidaId,
        'contestacao_aberta',
        'Nova contestação recebida',
        `Inquilino contestou item: ${validado.motivo}`,
      ]
    );

    return {
      success: true,
      contestacaoId,
      preclusaolimite: contestacao.preclusao_data_limite?.toISOString(),
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem };
  }
}

/**
 * Gestor avalia contestação e aceita ou rejeita
 */
export async function avaliarContestacao(
  input: z.infer<typeof AprovarContestaçaoSchema>
): Promise<{ success: boolean; statusNovoReparo?: string; erro?: string }> {
  try {
    const validado = AprovarContestaçaoSchema.parse(input);
    const pool = obterPool();

    // Atualizar contestação
    const statusNovo = validado.aceitar ? 'aceita' : 'rejeitada';

    await pool.query(
      `update contestacoes
       set status = $1,
           data_aceitacao = case when $1 = 'aceita' then now() else null end,
           data_rejeicao = case when $1 = 'rejeitada' then now() else null end,
           motivo_rejeicao = case when $1 = 'rejeitada' then $2 else null end,
           notas_auditor = $2
       where id = $3`,
      [statusNovo, validado.justificativa, validado.contestacaoId]
    );

    // Se aceita, criar registro de reparo
    let statusNovoReparo = null;

    if (validado.aceitar) {
      const contestacao = await pool.query(
        `select vistoria_saida_id from contestacoes where id = $1`,
        [validado.contestacaoId]
      );

      if (contestacao.rows.length > 0) {
        const reparoId = `reparo-${Date.now()}`;

        await pool.query(
          `insert into reparos_vistoria (id, contestacao_id, status)
           values ($1, $2, $3)`,
          [reparoId, validado.contestacaoId, 'pendente']
        );

        statusNovoReparo = 'pendente';

        // Atualizar status da contestação
        await pool.query(
          `update contestacoes set status_reparo = $1 where id = $2`,
          ['pendente', validado.contestacaoId]
        );
      }
    }

    // Registrar auditoria
    await pool.query(
      `insert into auditoria_contestacao (
        contestacao_id, acao, usuario_id, detalhes, dados_depois
      ) values ($1, $2, $3, $4, $5)`,
      [
        validado.contestacaoId,
        validado.aceitar ? 'CONTESTACAO_ACEITA' : 'CONTESTACAO_REJEITADA',
        `gestor-${Date.now()}`,
        validado.justificativa,
        JSON.stringify({
          statusNovo,
          justificativa: validado.justificativa,
        }),
      ]
    );

    return {
      success: true,
      statusNovoReparo,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem };
  }
}

/**
 * Atualiza status de reparo no workflow
 */
export async function atualizarStatusReparo(
  input: z.infer<typeof AtualizarStatusReparoSchema>
): Promise<{ success: boolean; statusAtualizado?: string; erro?: string }> {
  try {
    const validado = AtualizarStatusReparoSchema.parse(input);
    const pool = obterPool();

    const novaData: Record<string, any> = { atualizado_em: 'now()' };

    // Mapear status para campos de data
    switch (validado.novoStatus) {
      case 'orcado':
        novaData.orcamento_data = 'now()';
        break;
      case 'agendado':
        novaData.data_agendamento = 'now()';
        break;
      case 'em_execucao':
        novaData.data_inicio_execucao = 'now()';
        break;
      case 'concluido':
        novaData.data_conclusao_execucao = 'now()';
        novaData.descricao_trabalho_realizado = validado.detalhes;
        break;
    }

    // Construir query dinamicamente
    const setClauses = Object.entries(novaData)
      .map(([key], idx) => `${key} = ${key === 'atualizado_em' ? 'now()' : `$${idx + 1}`}`)
      .join(', ');

    const values = Object.entries(novaData)
      .filter(([key]) => key !== 'atualizado_em')
      .map(([, val]) => val);

    values.push(validado.reparoId);

    await pool.query(
      `update reparos_vistoria
       set status = $${values.length}, ${setClauses}
       where id = $${values.length}`,
      [validado.novoStatus, ...values]
    );

    // Atualizar status na contestação
    const reparo = await pool.query(
      `select contestacao_id from reparos_vistoria where id = $1`,
      [validado.reparoId]
    );

    if (reparo.rows.length > 0) {
      const statusReparoMap: Record<string, string> = {
        pendente: 'pendente',
        orcado: 'orcamento_recebido',
        aprovado: 'reparo_agendado',
        rejeitado: 'rejeitado',
        agendado: 'reparo_agendado',
        em_execucao: 'reparo_em_execucao',
        concluido: 'reparo_concluido',
        desistido: 'rejeitado',
      };

      await pool.query(
        `update contestacoes
         set status_reparo = $1
         where id = $2`,
        [statusReparoMap[validado.novoStatus], reparo.rows[0].contestacao_id]
      );
    }

    return {
      success: true,
      statusAtualizado: validado.novoStatus,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem };
  }
}

/**
 * Lista todas as contestações em aberto com dias úteis restantes
 */
export async function listarContestacôesEmAberto() {
  try {
    const pool = obterPool();

    const resultado = await pool.query(
      `select
        c.id, c.vistoria_saida_id, c.motivo, c.descricao_desacordo,
        c.data_abertura, c.preclusao_data_limite, c.dias_uteis_restantes,
        c.status, c.status_reparo,
        v.imovel_id, i.identificacao as imovel,
        count(r.id) as reparo_count
       from contestacoes c
       join vistorias v on v.id = c.vistoria_saida_id
       join imoveis i on i.id = v.imovel_id
       left join reparos_vistoria r on r.contestacao_id = c.id
       where c.status in ('aberta', 'aceita')
       group by c.id, v.imovel_id, i.identificacao
       order by c.dias_uteis_restantes asc nulls last`
    );

    return {
      success: true,
      contestacoes: resultado.rows.map((r) => ({
        id: r.id,
        vistoriaSaidaId: r.vistoria_saida_id,
        imovel: r.imovel,
        motivo: r.motivo,
        dataAbertura: r.data_abertura,
        preclusaoLimite: r.preclusao_data_limite,
        diasUteisRestantes: r.dias_uteis_restantes,
        status: r.status,
        statusReparo: r.status_reparo,
        reparosPendentes: r.reparo_count,
      })),
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem, contestacoes: [] };
  }
}
