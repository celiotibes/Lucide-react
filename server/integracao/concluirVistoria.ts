// Lógica de conclusão de vistoria, separada da action 'use server'
// (app/contratos/[id]/vistorias/actions.ts) para ser testável diretamente —
// mesmo padrão de app/contratos/logicaCadastro.ts. Só a vistoria de saída
// calcula retenção de caução (server/financeiro/calcularRetencaoCaucao.ts);
// entrada e periódica só marcam status='concluida'.

import type { Pool, PoolClient } from 'pg';
import { totalDanosChecklist, type ChecklistVistoria } from '../vistorias/checklist';
import { calcularRetencaoCaucao } from '../financeiro/calcularRetencaoCaucao';

export interface ResultadoConcluirVistoria {
  sucesso: boolean;
  erro?: string;
  confissaoDividaId?: string;
}

export async function concluirVistoria(pool: Pool, vistoriaId: string, contratoId: string): Promise<ResultadoConcluirVistoria> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query<{ tipo: string; checklist_json: ChecklistVistoria; status: string }>(
      `select tipo, checklist_json, status from vistorias where id = $1 for update`,
      [vistoriaId],
    );
    const vistoria = rows[0];
    if (!vistoria) {
      await client.query('rollback');
      return { sucesso: false, erro: 'Vistoria não encontrada' };
    }
    if (vistoria.status === 'concluida') {
      await client.query('rollback');
      return { sucesso: false, erro: 'Esta vistoria já foi concluída' };
    }

    let checklist = vistoria.checklist_json;
    let confissaoDividaId: string | undefined;

    if (vistoria.tipo === 'saida') {
      const totalDanos = totalDanosChecklist(checklist);
      const { rows: garantiaRows } = await client.query<{ valor: string }>(
        `select valor from garantias where contrato_id = $1 and tipo = 'caucao' order by criado_em desc limit 1`,
        [contratoId],
      );
      const valorCaucao = garantiaRows[0] ? Number(garantiaRows[0].valor) : 0;
      const retencao = calcularRetencaoCaucao(valorCaucao, totalDanos);

      checklist = { ...checklist, retencaoCaucao: retencao };

      if (retencao.saldoDevedor > 0) {
        const { rows: confissaoRows } = await client.query<{ id: string }>(
          `insert into confissoes_divida (vistoria_id, contrato_id, valor_principal, status)
           values ($1, $2, $3, 'pendente')
           returning id`,
          [vistoriaId, contratoId, retencao.saldoDevedor],
        );
        confissaoDividaId = confissaoRows[0].id;
      }
    }

    await client.query(`update vistorias set status = 'concluida', checklist_json = $1 where id = $2`, [
      JSON.stringify(checklist),
      vistoriaId,
    ]);

    await client.query('commit');
    return { sucesso: true, confissaoDividaId };
  } catch (erro) {
    await client.query('rollback');
    return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro ao concluir vistoria' };
  } finally {
    client.release();
  }
}
