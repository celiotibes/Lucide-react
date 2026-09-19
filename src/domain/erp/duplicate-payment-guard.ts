/**
 * Duplicate Payment Protection Service
 * Prevents submitting payment for the same prestador + month combination twice
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
 */
export class DuplicatePaymentGuard {
  private pagamentosSubmetidos: PagamentoSubmetido[] = [];
  private indicePrestadorMes: Map<string, PagamentoSubmetido> = new Map();

  /**
   * Verifica se há pagamento pendente/aprovado para este prestador + mês
   * Rejeições podem ser resubmetidas
   */
  verificarDuplicacao(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string
  ): { duplicado: boolean; pagamentoAnterior?: PagamentoSubmetido; motivo?: string } {
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
   */
  registrarPagamento(
    contexto: ContextoAutenticacao,
    prestador_id: number,
    mes_referencia: string,
    total_pagar: number,
    status: "pendente" | "aprovado" | "rejeitado" = "pendente"
  ): PagamentoSubmetido {
    const pagamento: PagamentoSubmetido = {
      prestador_id,
      mes_referencia,
      data_submissao: new Date().toISOString(),
      usuario_id: contexto.usuario?.id || "sistema",
      total_pagar,
      status,
    };

    this.pagamentosSubmetidos.push(pagamento);

    const chave = this.gerarChave(prestador_id, mes_referencia);
    this.indicePrestadorMes.set(chave, pagamento);

    return pagamento;
  }

  /**
   * Atualiza status de um pagamento (aprova ou rejeita)
   */
  atualizarStatus(
    prestador_id: number,
    mes_referencia: string,
    novoStatus: "pendente" | "aprovado" | "rejeitado"
  ): boolean {
    const chave = this.gerarChave(prestador_id, mes_referencia);
    const pagamento = this.indicePrestadorMes.get(chave);

    if (!pagamento) {
      return false;
    }

    pagamento.status = novoStatus;
    return true;
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
