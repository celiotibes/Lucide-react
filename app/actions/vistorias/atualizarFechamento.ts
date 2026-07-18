'use server';

import { obterPool } from '@/server/integracao/db';
import { z } from 'zod';

const ItemFechamentoSchema = z.object({
  descricao: z.string(),
  origem: z.enum(['previsto_em_contrato', 'orcamento', 'estimativa', 'encargo_aberto', 'multa', 'caucao', 'adiantamento', 'saldo_a_favor']),
  valor: z.number().positive(),
  tipo: z.enum(['debito', 'credito']),
});

const AtualizarFechamentoSchema = z.object({
  vistoriaSaidaId: z.string(),
  itens: z.array(ItemFechamentoSchema),
  caucaoValorManual: z.number().nonnegative().optional(),
});

export async function atualizarFechamento(input: z.infer<typeof AtualizarFechamentoSchema>) {
  try {
    const validado = AtualizarFechamentoSchema.parse(input);
    const pool = obterPool();

    // Buscar ou criar fechamento
    let fechamento = await pool.query(
      'SELECT id FROM fechamentos_contrato WHERE vistoria_saida_id = $1',
      [validado.vistoriaSaidaId]
    );

    let fechamentoId: string;

    if (fechamento.rows.length > 0) {
      fechamentoId = fechamento.rows[0].id;
      // Deletar itens existentes para recriar
      await pool.query('DELETE FROM itens_fechamento WHERE fechamento_id = $1', [fechamentoId]);
    } else {
      // Criar novo fechamento
      fechamentoId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO fechamentos_contrato (id, vistoria_saida_id, status, created_at)
         VALUES ($1, $2, $3, $4)`,
        [fechamentoId, validado.vistoriaSaidaId, 'draft', new Date().toISOString()]
      );
    }

    // Calcular totais
    let totalDebitos = 0;
    let totalCreditos = 0;

    // Inserir itens
    for (const item of validado.itens) {
      const valor = item.valor;

      if (item.tipo === 'debito') {
        totalDebitos += valor;
      } else {
        totalCreditos += valor;
      }

      await pool.query(
        `INSERT INTO itens_fechamento (id, fechamento_id, descricao, tipo, origem, valor, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          fechamentoId,
          item.descricao,
          item.tipo,
          item.origem,
          valor,
          new Date().toISOString(),
        ]
      );
    }

    // Aplicar caução manual se fornecida
    if (validado.caucaoValorManual !== undefined) {
      totalCreditos += validado.caucaoValorManual;

      await pool.query(
        `INSERT INTO itens_fechamento (id, fechamento_id, descricao, tipo, origem, valor, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          fechamentoId,
          'Caução (extrato manual)',
          'credito',
          'caucao',
          validado.caucaoValorManual,
          new Date().toISOString(),
        ]
      );
    }

    // Calcular saldo final
    const saldoFinal = totalCreditos - totalDebitos;

    // Atualizar totais no fechamento
    await pool.query(
      `UPDATE fechamentos_contrato
       SET total_debitos = $1, total_creditos = $2, saldo_final = $3, updated_at = $4
       WHERE id = $5`,
      [totalDebitos, totalCreditos, saldoFinal, new Date().toISOString(), fechamentoId]
    );

    return {
      data: {
        fechamentoId,
        totalDebitos,
        totalCreditos,
        saldoFinal,
      },
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { error: mensagem };
  }
}
