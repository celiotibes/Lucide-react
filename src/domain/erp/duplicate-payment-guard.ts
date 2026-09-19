/**
 * Duplicate Payment Protection Service
 * Prevents submitting payment for the same prestador + month combination twice
 *
 * Security Features:
 * - C-3: Fails securely when unauthenticated (returns duplicado: true)
 * - C-4: Checks authorization before mutations
 *
 * Phase 1: In-memory tracking with session-level cache
 * Phase 2: Database UNIQUE constraint on (prestador_id, mes_referencia, status)
 */

import { ContextoAutenticacao } from "../auth/auth-service";

export interface PagamentoSubmetido {
  prestador_id: number;
  mes_referencia: string; // YYYY-MM format
  data_submissao: string; // ISO timestamp
  usuario_id: string;
  total_pagar: number;
  status: "pendente" | "aprovado" | "rejeitado"; // Rejeições podem ser resubmetidas
}

/**
 * Service to prevent duplicate payment submissions
 * C-3: Fails securely on missing authentication
 * C-4: Checks authorization on mutations
 */
export class DuplicatePaymentGuard {
  private pagamentosSubmetidos: PagamentoSubmetido[] = [];
  private indicePrestadorMes: Map<string, PagamentoSubmetido> = new Map();

  /**
   * Verifica se há pagamento pendente/aprovado para este prestador + mês
   * Rejeições podem ser resubmetidas
   * C-3: Returns duplicado: true if context is invalid (fail-closed)
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
    // C-3: Check authentication FIRST - fail closed
    if (!contexto.autenticado || !contexto.usuario) {
      return {
        duplicado: true,
        motivo: "Não autenticado - acesso negado",
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

    const chave = this.gerarChave(prestador_id, mes_referencia);
    const pagamentoAnterior = this.indicePrestadorMes.get(chave);

    if (pagamentoAnterior) {
      // Se foi rejeitado, permite resubmissão
      if (pagamentoAnterior.status === "rejeitado") {
        return {
          duplicado: false,
          pagamentoAnterior,
          motivo: "Pagamento anterior foi rejeitado - resubmissão permitida",
        };
      }

      // Se está pendente ou aprovado, bloqueia
      return {
        duplicado: true,
        pagamentoAnterior,
        motivo: `Pagamento já existe com status '${pagamentoAnterior.status}'`,
      };
    }

    return { duplicado: false };
  }

  /**
   * Registra um novo pagamento submetido
   * C-4: Verifica autorização antes de registrar
   */
  registrarPagamento(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string,
    total_pagar: number,
    status: "pendente" | "aprovado" | "rejeitado" = "pendente"
  ): {
    sucesso: boolean;
    pagamento?: PagamentoSubmetido;
    erro?: string;
  } {
    // C-4: Check authentication first
    if (!contexto.autenticado || !contexto.usuario) {
      return {
        sucesso: false,
        erro: "Usuário não autenticado",
      };
    }

    // C-4: Check authorization
    if (contexto.usuario.role === "prestador") {
      // Prestador can only submit for themselves with "pendente" status
      if (contexto.usuario.prestador_id !== prestador_id) {
        return {
          sucesso: false,
          erro: "Prestador não autorizado a submeter para outro prestador",
        };
      }
      if (status !== "pendente") {
        return {
          sucesso: false,
          erro: "Prestador só pode submeter pagamentos com status pendente",
        };
      }
    } else if (
      contexto.usuario.role === "gestor" ||
      contexto.usuario.role === "admin"
    ) {
      // Gestor/Admin can create payments with any status
      // Allowed
    } else {
      return {
        sucesso: false,
        erro: "Usuário não autorizado a registrar pagamentos",
      };
    }

    const pagamento: PagamentoSubmetido = {
      prestador_id,
      mes_referencia,
      data_submissao: new Date().toISOString(),
      usuario_id: contexto.usuario.id,
      total_pagar,
      status,
    };

    this.pagamentosSubmetidos.push(pagamento);

    const chave = this.gerarChave(prestador_id, mes_referencia);
    this.indicePrestadorMes.set(chave, pagamento);

    return { sucesso: true, pagamento };
  }

  /**
   * Atualiza status de um pagamento (aprova ou rejeita)
   * C-4: Verifica autorização antes de atualizar
   */
  atualizarStatus(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string,
    novoStatus: "pendente" | "aprovado" | "rejeitado"
  ): { sucesso: boolean; erro?: string } {
    // C-4: Check authentication
    if (!contexto.autenticado || !contexto.usuario) {
      return {
        sucesso: false,
        erro: "Usuário não autenticado",
      };
    }

    // Only admin and gestor can update payment status
    if (
      contexto.usuario.role !== "admin" &&
      contexto.usuario.role !== "gestor"
    ) {
      return {
        sucesso: false,
        erro: "Usuário não autorizado a atualizar status de pagamentos",
      };
    }

    const chave = this.gerarChave(prestador_id, mes_referencia);
    const pagamento = this.indicePrestadorMes.get(chave);

    if (!pagamento) {
      return {
        sucesso: false,
        erro: "Pagamento não encontrado",
      };
    }

    pagamento.status = novoStatus;
    return { sucesso: true };
  }

  /**
   * Obtém histórico de pagamentos de um prestador
   */
  obterHistoricoPrestador(
    prestador_id: number,
    limite: number = 100
  ): PagamentoSubmetido[] {
    return this.pagamentosSubmetidos
      .filter((p) => p.prestador_id === prestador_id)
      .slice(-limite);
  }

  /**
   * Obtém pagamentos pendentes de aprovação
   */
  obterPendentes(): PagamentoSubmetido[] {
    return this.pagamentosSubmetidos.filter((p) => p.status === "pendente");
  }

  /**
   * Obtém pagamentos de um período específico
   */
  obterPorPeriodo(
    data_inicio: Date,
    data_fim: Date
  ): PagamentoSubmetido[] {
    return this.pagamentosSubmetidos.filter((p) => {
      const data = new Date(p.data_submissao);
      return data >= data_inicio && data <= data_fim;
    });
  }

  /**
   * IMPORTANTE: Este método é para testes/desenvolvimento apenas
   * Deve ser removido em produção
   */
  obterTodos(): PagamentoSubmetido[] {
    return [...this.pagamentosSubmetidos];
  }

  private gerarChave(prestador_id: number, mes_referencia: string): string {
    return `${prestador_id}_${mes_referencia}`;
  }
}

// Singleton global para fase 1 (em memória)
export const duplicatePaymentGuard = new DuplicatePaymentGuard();
