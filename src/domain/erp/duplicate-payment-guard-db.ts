/**
 * Database-backed Duplicate Payment Protection Service
 * Phase 2: Uses database UNIQUE constraint for enforcement
 *
 * Prevents submitting payment for the same prestador + month combination twice
 * unless the previous submission was rejected (allowing resubmission)
 */

import type Database from "better-sqlite3";
import { ContextoAutenticacao } from "../auth/auth-service";

export interface PagamentoSubmetido {
  id: string;
  prestador_id: number;
  mes_referencia: string; // YYYY-MM format
  data_submissao: string; // ISO timestamp
  usuario_id: string;
  total_pagar: number;
  status: "pendente" | "aprovado" | "rejeitado"; // Rejeições podem ser resubmetidas
  data_aprovacao?: string;
  usuario_aprovacao_id?: string;
  motivo_rejeicao?: string;
}

/**
 * Database-backed service to prevent duplicate payment submissions
 */
export class DuplicatePaymentGuardDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Verifica se há pagamento pendente/aprovado para este prestador + mês
   * Rejeições podem ser resubmetidas
   */
  verificarDuplicacao(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string
  ): {
    duplicado: boolean;
    pagamentoAnterior?: PagamentoSubmetido;
    motivo?: string;
  } {
    if (!contexto.autenticado || !contexto.usuario) {
      return {
        duplicado: false,
        motivo: "Usuário não autenticado",
      };
    }

    // Verificar autorização - prestador só pode submeter seus dados
    if (
      contexto.usuario.role === "prestador" &&
      contexto.usuario.prestador_id !== prestador_id
    ) {
      return {
        duplicado: true,
        motivo: "Prestador tentando submeter dados de outro prestador",
      };
    }

    try {
      // Check for existing non-rejected payment
      // The UNIQUE constraint in the database prevents pendente/aprovado duplicates
      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE prestador_id = ? AND mes_referencia = ? AND status != 'rejeitado'
         ORDER BY data_submissao DESC
         LIMIT 1`
      );

      const pagamentoAnterior = stmt.get(prestador_id, mes_referencia) as
        | PagamentoSubmetido
        | undefined;

      if (pagamentoAnterior) {
        return {
          duplicado: true,
          pagamentoAnterior,
          motivo: `Pagamento já existe com status '${pagamentoAnterior.status}'`,
        };
      }

      // Check if there's a rejected payment (to allow resubmission)
      const rejeitadoStmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE prestador_id = ? AND mes_referencia = ? AND status = 'rejeitado'
         ORDER BY data_submissao DESC
         LIMIT 1`
      );

      const pagamentoRejeitado = rejeitadoStmt.get(
        prestador_id,
        mes_referencia
      ) as PagamentoSubmetido | undefined;

      if (pagamentoRejeitado) {
        return {
          duplicado: false,
          pagamentoAnterior: pagamentoRejeitado,
          motivo: "Pagamento anterior foi rejeitado - resubmissão permitida",
        };
      }

      return { duplicado: false };
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao verificar duplicação:", erro);
      throw erro;
    }
  }

  /**
   * Registra um novo pagamento submetido no banco
   */
  registrarPagamento(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string,
    total_pagar: number,
    status: "pendente" | "aprovado" | "rejeitado" = "pendente"
  ): PagamentoSubmetido {
    if (!contexto.autenticado || !contexto.usuario) {
      throw new Error("Usuário não autenticado");
    }

    try {
      const pagamento_id = `pag_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`;

      const stmt = this.db.prepare(
        `INSERT INTO pagamentos_apontamentos
         (id, prestador_id, mes_referencia, total_pagar, status, usuario_submissao_id, data_submissao)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );

      stmt.run(
        pagamento_id,
        prestador_id,
        mes_referencia,
        total_pagar,
        status,
        contexto.usuario.id
      );

      // Retrieve the created record
      const selectStmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE id = ?`
      );

      const pagamento = selectStmt.get(pagamento_id) as PagamentoSubmetido;
      return pagamento;
    } catch (erro) {
      if (
        erro instanceof Error &&
        erro.message.includes("UNIQUE constraint failed")
      ) {
        throw new Error(
          "Já existe um pagamento pendente/aprovado para este período"
        );
      }
      console.error("[DuplicatePaymentGuardDB] Erro ao registrar pagamento:", erro);
      throw erro;
    }
  }

  /**
   * Atualiza status de um pagamento (aprova ou rejeita)
   */
  atualizarStatus(
    prestador_id: number,
    mes_referencia: string,
    novoStatus: "pendente" | "aprovado" | "rejeitado",
    usuario_aprovacao_id?: string,
    motivo_rejeicao?: string
  ): boolean {
    try {
      const stmt = this.db.prepare(
        `UPDATE pagamentos_apontamentos
         SET status = ?,
             usuario_aprovacao_id = ?,
             data_aprovacao = CASE
               WHEN ? = 'aprovado' THEN CURRENT_TIMESTAMP
               ELSE NULL
             END,
             motivo_rejeicao = ?
         WHERE prestador_id = ? AND mes_referencia = ? AND status != 'rejeitado'`
      );

      const result = stmt.run(
        novoStatus,
        usuario_aprovacao_id,
        novoStatus,
        motivo_rejeicao,
        prestador_id,
        mes_referencia
      );

      return (result.changes || 0) > 0;
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao atualizar status:", erro);
      throw erro;
    }
  }

  /**
   * Obtém histórico de pagamentos de um prestador
   */
  obterHistoricoPrestador(
    prestador_id: number,
    limite: number = 100
  ): PagamentoSubmetido[] {
    try {
      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE prestador_id = ?
         ORDER BY data_submissao DESC
         LIMIT ?`
      );

      return stmt.all(prestador_id, limite) as PagamentoSubmetido[];
    } catch (erro) {
      console.error(
        "[DuplicatePaymentGuardDB] Erro ao obter histórico:",
        erro
      );
      return [];
    }
  }

  /**
   * Obtém pagamentos pendentes de aprovação
   */
  obterPendentes(): PagamentoSubmetido[] {
    try {
      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE status = 'pendente'
         ORDER BY data_submissao ASC`
      );

      return stmt.all() as PagamentoSubmetido[];
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao obter pendentes:", erro);
      return [];
    }
  }

  /**
   * Obtém pagamentos de um período específico
   */
  obterPorPeriodo(
    data_inicio: Date,
    data_fim: Date
  ): PagamentoSubmetido[] {
    try {
      const inicio = data_inicio.toISOString();
      const fim = data_fim.toISOString();

      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE data_submissao BETWEEN ? AND ?
         ORDER BY data_submissao DESC`
      );

      return stmt.all(inicio, fim) as PagamentoSubmetido[];
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao obter por período:", erro);
      return [];
    }
  }

  /**
   * Obtém todos os pagamentos
   * IMPORTANT: Para testes/desenvolvimento apenas
   */
  obterTodos(): PagamentoSubmetido[] {
    try {
      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         ORDER BY data_submissao DESC`
      );

      return stmt.all() as PagamentoSubmetido[];
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao obter todos:", erro);
      return [];
    }
  }

  /**
   * Obtém um pagamento específico por ID
   */
  obterPorId(pagamento_id: string): PagamentoSubmetido | null {
    try {
      const stmt = this.db.prepare(
        `SELECT id, prestador_id, mes_referencia, data_submissao, usuario_id,
                total_pagar, status, data_aprovacao, usuario_aprovacao_id, motivo_rejeicao
         FROM pagamentos_apontamentos
         WHERE id = ?`
      );

      return (stmt.get(pagamento_id) as PagamentoSubmetido) || null;
    } catch (erro) {
      console.error("[DuplicatePaymentGuardDB] Erro ao obter por ID:", erro);
      return null;
    }
  }
}
