/**
 * Ledger Agent Integration Service
 *
 * Gerencia a relação entre lançamentos contábeis (ledger_entries) e agentes econômicos.
 * Fornece operações para:
 *
 * 1. createLedgerEntryWithAgent() - Cria entrada vinculada a agente
 * 2. getAgentLedger() - Recupera todas as entradas de um agente
 * 3. getAgentBalance() - Calcula saldo por agente
 * 4. generateAgentReport() - Gera relatório P&L por agente
 * 5. linkLedgerToAgent() - Vincula entrada existente a agente
 * 6. unlinkLedgerFromAgent() - Desvincula entrada (com auditoria)
 * 7. getAgentAging() - Análise de envelhecimento de valores
 */

import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { logger } from "../../services/logger-service.js";
import type {
  LedgerEntry,
  TipoLancamento,
  CategoriaLancamento,
} from "./ledger-types.js";
import { registrarLancamento, registrarAuditoria } from "./ledger-service.js";
import type { AgenteEconomico } from "../erp/agentes-tipos.js";
import { PapelAgente } from "../erp/agentes-tipos.js";

/**
 * Interface para entrada de ledger com dados do agente denormalizado
 */
export interface LedgerEntryWithAgent extends LedgerEntry {
  agente_id?: string;
  agente_papel?: string;
  agente_nome?: string;
  agente_cpf_cnpj?: string;
}

/**
 * Saldo de agente por tipo (receita/despesa)
 */
export interface AgentBalance {
  agente_id: string;
  agente_nome: string;
  agente_papel: string;
  total_receitas: number;
  total_despesas: number;
  saldo_liquido: number;
}

/**
 * Relatório P&L por agente
 */
export interface AgentProfitLoss {
  agente_id: string;
  agente_nome: string;
  agente_papel: string;
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  receitas: Record<string, number>; // categoria -> valor
  despesas: Record<string, number>;
  total_receitas: number;
  total_despesas: number;
  resultado_liquido: number;
  margem_operacional: number; // em percentual
}

/**
 * Análise de envelhecimento (aging)
 */
export interface AgingAnalysis {
  agente_id: string;
  agente_nome: string;
  faixa_dias: string; // "0-30", "31-60", "61-90", "90+"
  quantidade_movimentacoes: number;
  valor_total: number;
  percentual_do_total: number;
}

/**
 * Cria lançamento contábil vinculado a agente
 * Se CNPJ/CPF está presente no descricao, auto-vincula a agente
 */
export function createLedgerEntryWithAgent(
  db: Database.Database,
  entrada: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> & { agente_id?: string },
  usuarioId?: string
): { sucesso: boolean; lancamento_id?: string; agente_id?: string; erro?: string } {
  try {
    const id = entrada.id || randomUUID();

    // Se já tem agente_id, vincula diretamente
    if (entrada.agente_id) {
      // Valida se agente existe
      const stmtAgente = db.prepare(
        `SELECT id, papel FROM agentes_economicos WHERE id = ? LIMIT 1`
      );
      const agente = stmtAgente.get(entrada.agente_id) as
        | { id: string; papel: string }
        | undefined;

      if (!agente) {
        return {
          sucesso: false,
          erro: `Agente ${entrada.agente_id} não encontrado`,
        };
      }

      // Insere na ledger com agente
      const stmt = db.prepare(`
        INSERT INTO ledger_entries
          (id, data, tipo, categoria, valor, descricao, referencia_externa, usuario_id, agente_id, agente_papel, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        id,
        entrada.data,
        entrada.tipo,
        entrada.categoria,
        entrada.valor,
        entrada.descricao || null,
        entrada.referencia_externa || null,
        usuarioId || entrada.usuario_id || null,
        entrada.agente_id,
        agente.papel
      );

      logger.info(
        `[Ledger-Agent] Lançamento criado com agente: ${id} -> ${entrada.agente_id}`
      );

      // Registra auditoria
      registrarAuditoriaAgente(db, {
        ledger_entry_id: id,
        agente_id_anterior: undefined,
        agente_id_novo: entrada.agente_id,
        agente_papel_anterior: undefined,
        agente_papel_novo: agente.papel,
        motivo_mudanca: 'integracao',
        usuario_id: usuarioId || entrada.usuario_id,
      });

      return {
        sucesso: true,
        lancamento_id: id,
        agente_id: entrada.agente_id,
      };
    }

    // Sem agente_id: insere sem vinculação, será feito via backfill
    const stmt = db.prepare(`
      INSERT INTO ledger_entries
        (id, data, tipo, categoria, valor, descricao, referencia_externa, usuario_id, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      entrada.data,
      entrada.tipo,
      entrada.categoria,
      entrada.valor,
      entrada.descricao || null,
      entrada.referencia_externa || null,
      usuarioId || entrada.usuario_id || null
    );

    logger.info(`[Ledger-Agent] Lançamento criado sem agente: ${id}`);

    return { sucesso: true, lancamento_id: id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[Ledger-Agent] Erro ao criar lançamento com agente:`, erro);
    return {
      sucesso: false,
      erro: `Erro ao criar lançamento: ${mensagem}`,
    };
  }
}

/**
 * Obtém todos os lançamentos de um agente
 */
export function getAgentLedger(
  db: Database.Database,
  agenteId: string,
  filtros?: {
    dataInicio?: string;
    dataFim?: string;
    tipo?: TipoLancamento;
    categoria?: CategoriaLancamento;
  }
): LedgerEntryWithAgent[] {
  try {
    let sql = `
      SELECT
        l.id,
        l.data,
        l.tipo,
        l.categoria,
        l.valor,
        l.descricao,
        l.referencia_externa,
        l.usuario_id,
        l.criado_em,
        l.atualizado_em,
        l.agente_id,
        l.agente_papel,
        a.nome as agente_nome,
        a.cpf_cnpj as agente_cpf_cnpj
      FROM ledger_entries l
      LEFT JOIN agentes_economicos a ON l.agente_id = a.id
      WHERE l.agente_id = ?
    `;

    const params: unknown[] = [agenteId];

    if (filtros?.dataInicio) {
      sql += ` AND l.data >= ?`;
      params.push(filtros.dataInicio);
    }

    if (filtros?.dataFim) {
      sql += ` AND l.data <= ?`;
      params.push(filtros.dataFim);
    }

    if (filtros?.tipo) {
      sql += ` AND l.tipo = ?`;
      params.push(filtros.tipo);
    }

    if (filtros?.categoria) {
      sql += ` AND l.categoria = ?`;
      params.push(filtros.categoria);
    }

    sql += ` ORDER BY l.data DESC, l.criado_em DESC`;

    const stmt = db.prepare(sql);
    return (stmt.all(...params) as unknown as LedgerEntryWithAgent[]) || [];
  } catch (erro) {
    logger.error(`[Ledger-Agent] Erro ao obter ledger do agente ${agenteId}:`, erro);
    return [];
  }
}

/**
 * Calcula saldo de um agente (receitas - despesas)
 */
export function getAgentBalance(
  db: Database.Database,
  agenteId: string,
  dataFim?: string
): AgentBalance | null {
  try {
    let sql = `
      SELECT
        l.agente_id,
        a.nome as agente_nome,
        l.agente_papel,
        SUM(CASE WHEN l.tipo = 'receita' THEN l.valor ELSE 0 END) as total_receitas,
        SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor ELSE 0 END) as total_despesas
      FROM ledger_entries l
      LEFT JOIN agentes_economicos a ON l.agente_id = a.id
      WHERE l.agente_id = ?
    `;

    const params: unknown[] = [agenteId];

    if (dataFim) {
      sql += ` AND l.data <= ?`;
      params.push(dataFim);
    }

    sql += ` GROUP BY l.agente_id`;

    const stmt = db.prepare(sql);
    const resultado = stmt.get(...params) as {
      agente_id: string;
      agente_nome: string;
      agente_papel: string;
      total_receitas: number;
      total_despesas: number;
    } | undefined;

    if (!resultado) {
      return null;
    }

    return {
      agente_id: resultado.agente_id,
      agente_nome: resultado.agente_nome,
      agente_papel: resultado.agente_papel,
      total_receitas: resultado.total_receitas || 0,
      total_despesas: resultado.total_despesas || 0,
      saldo_liquido: (resultado.total_receitas || 0) - (resultado.total_despesas || 0),
    };
  } catch (erro) {
    logger.error(`[Ledger-Agent] Erro ao calcular saldo do agente ${agenteId}:`, erro);
    return null;
  }
}

/**
 * Gera relatório P&L por agente para período
 */
export function generateAgentReport(
  db: Database.Database,
  agenteId: string,
  dataInicio: string,
  dataFim: string
): AgentProfitLoss | null {
  try {
    // Obtém dados do agente
    const stmtAgente = db.prepare(
      `SELECT id, nome, papel FROM agentes_economicos WHERE id = ? LIMIT 1`
    );
    const agente = stmtAgente.get(agenteId) as
      | { id: string; nome: string; papel: string }
      | undefined;

    if (!agente) {
      return null;
    }

    // Agrupa por categoria
    const sql = `
      SELECT
        categoria,
        tipo,
        SUM(valor) as valor_total,
        COUNT(*) as quantidade
      FROM ledger_entries
      WHERE agente_id = ?
        AND data >= ?
        AND data <= ?
      GROUP BY categoria, tipo
      ORDER BY categoria
    `;

    const stmt = db.prepare(sql);
    const linhas = stmt.all(agenteId, dataInicio, dataFim) as Array<{
      categoria: string;
      tipo: string;
      valor_total: number;
      quantidade: number;
    }>;

    const receitas: Record<string, number> = {};
    const despesas: Record<string, number> = {};
    let totalReceitas = 0;
    let totalDespesas = 0;

    for (const linha of linhas) {
      if (linha.tipo === 'receita') {
        receitas[linha.categoria] = linha.valor_total;
        totalReceitas += linha.valor_total;
      } else {
        despesas[linha.categoria] = linha.valor_total;
        totalDespesas += linha.valor_total;
      }
    }

    const resultadoLiquido = totalReceitas - totalDespesas;
    const margemOperacional =
      totalReceitas > 0 ? (resultadoLiquido / totalReceitas) * 100 : 0;

    return {
      agente_id: agente.id,
      agente_nome: agente.nome,
      agente_papel: agente.papel,
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },
      receitas,
      despesas,
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
      resultado_liquido: resultadoLiquido,
      margem_operacional: Math.round(margemOperacional * 100) / 100,
    };
  } catch (erro) {
    logger.error(
      `[Ledger-Agent] Erro ao gerar relatório do agente ${agenteId}:`,
      erro
    );
    return null;
  }
}

/**
 * Vincula um lançamento existente a um agente
 */
export function linkLedgerToAgent(
  db: Database.Database,
  ledgerId: string,
  agenteId: string,
  usuarioId: string
): { sucesso: boolean; erro?: string } {
  try {
    // Valida se ledger existe
    const stmtLedger = db.prepare(`
      SELECT id, agente_id FROM ledger_entries WHERE id = ? LIMIT 1
    `);
    const ledger = stmtLedger.get(ledgerId) as
      | { id: string; agente_id: string | null }
      | undefined;

    if (!ledger) {
      return { sucesso: false, erro: `Lançamento ${ledgerId} não encontrado` };
    }

    // Valida se agente existe
    const stmtAgente = db.prepare(`
      SELECT id, papel FROM agentes_economicos WHERE id = ? LIMIT 1
    `);
    const agente = stmtAgente.get(agenteId) as
      | { id: string; papel: string }
      | undefined;

    if (!agente) {
      return { sucesso: false, erro: `Agente ${agenteId} não encontrado` };
    }

    const agenteIdAnterior = ledger.agente_id;

    // Atualiza ledger
    const stmtUpdate = db.prepare(`
      UPDATE ledger_entries
      SET agente_id = ?,
          agente_papel = ?,
          agente_atualizado_em = CURRENT_TIMESTAMP,
          agente_atualizado_por = ?
      WHERE id = ?
    `);

    stmtUpdate.run(agenteId, agente.papel, usuarioId, ledgerId);

    logger.info(
      `[Ledger-Agent] Lançamento vinculado: ${ledgerId} -> ${agenteId}`
    );

    // Registra auditoria
    registrarAuditoriaAgente(db, {
      ledger_entry_id: ledgerId,
      agente_id_anterior: agenteIdAnterior || undefined,
      agente_id_novo: agenteId,
      agente_papel_anterior: undefined,
      agente_papel_novo: agente.papel,
      motivo_mudanca: 'manual',
      usuario_id: usuarioId,
    });

    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[Ledger-Agent] Erro ao vincular lançamento:`, erro);
    return { sucesso: false, erro: mensagem };
  }
}

/**
 * Desvincula um lançamento de um agente (mantém histórico)
 */
export function unlinkLedgerFromAgent(
  db: Database.Database,
  ledgerId: string,
  usuarioId: string,
  motivo?: string
): { sucesso: boolean; erro?: string } {
  try {
    const stmtLedger = db.prepare(`
      SELECT id, agente_id, agente_papel FROM ledger_entries WHERE id = ? LIMIT 1
    `);
    const ledger = stmtLedger.get(ledgerId) as
      | { id: string; agente_id: string | null; agente_papel: string | null }
      | undefined;

    if (!ledger) {
      return { sucesso: false, erro: `Lançamento ${ledgerId} não encontrado` };
    }

    if (!ledger.agente_id) {
      return { sucesso: false, erro: `Lançamento ${ledgerId} já não tem agente` };
    }

    // Desvincula
    const stmtUpdate = db.prepare(`
      UPDATE ledger_entries
      SET agente_id = NULL,
          agente_papel = NULL,
          agente_atualizado_em = CURRENT_TIMESTAMP,
          agente_atualizado_por = ?
      WHERE id = ?
    `);

    stmtUpdate.run(usuarioId, ledgerId);

    logger.info(`[Ledger-Agent] Lançamento desvinculado: ${ledgerId}`);

    // Registra auditoria
    registrarAuditoriaAgente(db, {
      ledger_entry_id: ledgerId,
      agente_id_anterior: ledger.agente_id || undefined,
      agente_id_novo: undefined,
      agente_papel_anterior: ledger.agente_papel || undefined,
      agente_papel_novo: undefined,
      motivo_mudanca: motivo || 'manual',
      usuario_id: usuarioId,
    });

    return { sucesso: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[Ledger-Agent] Erro ao desvincula lançamento:`, erro);
    return { sucesso: false, erro: mensagem };
  }
}

/**
 * Análise de envelhecimento (aging) de valores por agente
 */
export function getAgentAging(
  db: Database.Database,
  agenteId: string
): AgingAnalysis[] {
  try {
    const dataAtual = new Date().toISOString().split('T')[0];

    const sql = `
      SELECT
        ? as faixa_dias,
        COUNT(*) as quantidade,
        SUM(l.valor) as valor_total,
        SUM(
          SUM(l.valor)
        ) OVER () as valor_total_geral
      FROM ledger_entries l
      WHERE l.agente_id = ?
        AND l.data <= DATE(?, '-' ||
          CASE
            WHEN (julianday(?) - julianday(l.data)) <= 30 THEN '0 days'
            WHEN (julianday(?) - julianday(l.data)) <= 60 THEN '30 days'
            WHEN (julianday(?) - julianday(l.data)) <= 90 THEN '60 days'
            ELSE '90 days'
          END
        )
      GROUP BY faixa_dias
    `;

    // Implementação alternativa mais simples
    const faixas = [
      { dias: '0-30', dataLimite: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      { dias: '31-60', dataLimite: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      { dias: '61-90', dataLimite: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
    ];

    // Primeiro, get total geral
    const stmtTotal = db.prepare(`
      SELECT SUM(l.valor) as total
      FROM ledger_entries l
      WHERE l.agente_id = ?
    `);
    const totalResult = stmtTotal.get(agenteId) as { total: number } | undefined;
    const valorTotalGeral = totalResult?.total || 0;

    const agingAnalyses: AgingAnalysis[] = [];

    // Valores dentro de 30 dias
    const stmt30 = db.prepare(`
      SELECT COUNT(*) as quantidade, SUM(valor) as valor_total
      FROM ledger_entries
      WHERE agente_id = ? AND data >= date(?)
    `);
    const result30 = stmt30.get(
      agenteId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    ) as { quantidade: number; valor_total: number } | undefined;

    if (result30 && result30.quantidade > 0) {
      agingAnalyses.push({
        agente_id: agenteId,
        agente_nome: '',
        faixa_dias: '0-30',
        quantidade_movimentacoes: result30.quantidade,
        valor_total: result30.valor_total,
        percentual_do_total: (result30.valor_total / valorTotalGeral) * 100,
      });
    }

    // Valores entre 31-60 dias
    const stmt60 = db.prepare(`
      SELECT COUNT(*) as quantidade, SUM(valor) as valor_total
      FROM ledger_entries
      WHERE agente_id = ?
        AND data < date(?)
        AND data >= date(?)
    `);
    const result60 = stmt60.get(
      agenteId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    ) as { quantidade: number; valor_total: number } | undefined;

    if (result60 && result60.quantidade > 0) {
      agingAnalyses.push({
        agente_id: agenteId,
        agente_nome: '',
        faixa_dias: '31-60',
        quantidade_movimentacoes: result60.quantidade,
        valor_total: result60.valor_total,
        percentual_do_total: (result60.valor_total / valorTotalGeral) * 100,
      });
    }

    // Valores com mais de 90 dias
    const stmt90 = db.prepare(`
      SELECT COUNT(*) as quantidade, SUM(valor) as valor_total
      FROM ledger_entries
      WHERE agente_id = ?
        AND data < date(?)
    `);
    const result90 = stmt90.get(
      agenteId,
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    ) as { quantidade: number; valor_total: number } | undefined;

    if (result90 && result90.quantidade > 0) {
      agingAnalyses.push({
        agente_id: agenteId,
        agente_nome: '',
        faixa_dias: '90+',
        quantidade_movimentacoes: result90.quantidade,
        valor_total: result90.valor_total,
        percentual_do_total: (result90.valor_total / valorTotalGeral) * 100,
      });
    }

    return agingAnalyses;
  } catch (erro) {
    logger.error(`[Ledger-Agent] Erro ao calcular aging do agente ${agenteId}:`, erro);
    return [];
  }
}

/**
 * Registra auditoria de mudança de agente em ledger_entry
 */
function registrarAuditoriaAgente(
  db: Database.Database,
  auditoria: {
    ledger_entry_id: string;
    agente_id_anterior?: string;
    agente_id_novo?: string;
    agente_papel_anterior?: string;
    agente_papel_novo?: string;
    motivo_mudanca: string;
    usuario_id?: string;
  }
): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO ledger_entries_agente_auditoria
        (id, ledger_entry_id, agente_id_anterior, agente_id_novo, agente_papel_anterior, agente_papel_novo, motivo_mudanca, usuario_id, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      randomUUID(),
      auditoria.ledger_entry_id,
      auditoria.agente_id_anterior || null,
      auditoria.agente_id_novo || null,
      auditoria.agente_papel_anterior || null,
      auditoria.agente_papel_novo || null,
      auditoria.motivo_mudanca,
      auditoria.usuario_id || null
    );
  } catch (erro) {
    logger.warn(`[Ledger-Agent] Falha ao registrar auditoria:`, erro);
  }
}
