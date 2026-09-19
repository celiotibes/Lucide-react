/**
 * Audit Trail Service
 * Registra todas as ações de usuários para conformidade e segurança
 *
 * C-7: Audit trail is immutable in Phase 1
 * - Registros are stored in a private array with no external modification path
 * - All returned arrays are copies to prevent external mutation
 * - Phase 2 will persist to database, making this fully immutable and durable
 */

import { ContextoAutenticacao } from "./auth-service";

export type TipoAcao =
  | "criar_apontamento"
  | "atualizar_apontamento"
  | "deletar_apontamento"
  | "criar_pagamento"
  | "aprovar_pagamento"
  | "rejeitar_pagamento"
  | "modificar_parametro"
  | "login"
  | "logout"
  | "acesso_negado";

export interface RegistroAuditoria {
  id: string;
  timestamp: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_email: string;
  usuario_role: string;
  tipo_acao: TipoAcao;
  recurso: string;
  recurso_id: string;
  prestador_id?: number;
  descricao: string;
  valores_antigos?: Record<string, any>;
  valores_novos?: Record<string, any>;
  endereco_ip?: string;
  user_agent?: string;
  resultado: "sucesso" | "falha" | "negado";
  motivo_falha?: string;
}

export interface EstatisticasAuditoria {
  total_registros: number;
  total_acessos_negados: number;
  usuario_mais_ativo: string;
  acao_mais_comum: TipoAcao;
  periodo: string;
}

/**
 * Service de Audit Trail
 * C-7: Immutable in Phase 1 - all arrays are frozen and copied on access
 */
export class AuditTrailService {
  private registros: ReadonlyArray<RegistroAuditoria> = Object.freeze([]);
  private indiceUsuario: Map<string, ReadonlyArray<RegistroAuditoria>> =
    new Map();
  private indiceRecurso: Map<string, ReadonlyArray<RegistroAuditoria>> =
    new Map();

  /**
   * Registra uma ação de usuário
   * C-7: Creates immutable record and updates frozen arrays
   * C-8: Uses import.meta.env for browser environment
   */
  registrarAcao(
    contexto: ContextoAutenticacao,
    tipo_acao: TipoAcao,
    recurso: string,
    recurso_id: string,
    opcoes?: {
      descricao?: string;
      valores_antigos?: Record<string, any>;
      valores_novos?: Record<string, any>;
      endereco_ip?: string;
      user_agent?: string;
      resultado?: "sucesso" | "falha" | "negado";
      motivo_falha?: string;
      prestador_id?: number;
    }
  ): RegistroAuditoria {
    // C-7: Create immutable record (freeze object)
    const registro: RegistroAuditoria = Object.freeze({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      usuario_id: contexto.usuario?.id || "sistema",
      usuario_nome: contexto.usuario?.nome || "Sistema",
      usuario_email: contexto.usuario?.email || "sistema@local",
      usuario_role: contexto.usuario?.role || "guest",
      tipo_acao,
      recurso,
      recurso_id,
      prestador_id: opcoes?.prestador_id,
      descricao: opcoes?.descricao || `${tipo_acao} em ${recurso}`,
      valores_antigos: opcoes?.valores_antigos,
      valores_novos: opcoes?.valores_novos,
      endereco_ip: opcoes?.endereco_ip,
      user_agent: opcoes?.user_agent,
      resultado: opcoes?.resultado || "sucesso",
      motivo_falha: opcoes?.motivo_falha,
    });

    // C-7: Create new frozen array instead of mutating
    this.registros = Object.freeze([...(this.registros as any[]), registro]);

    // Atualizar índices para busca rápida
    const usuario_id = contexto.usuario?.id || "sistema";
    const usuarioArray =
      this.indiceUsuario.get(usuario_id) || Object.freeze([]);
    this.indiceUsuario.set(
      usuario_id,
      Object.freeze([...(usuarioArray as any[]), registro])
    );

    const recursoArray =
      this.indiceRecurso.get(recurso) || Object.freeze([]);
    this.indiceRecurso.set(
      recurso,
      Object.freeze([...(recursoArray as any[]), registro])
    );

    // C-8: Log para console em desenvolvimento
    // Use import.meta.env for Vite/browser, process.env for Node
    let isDev = false;
    try {
      // Check for Vite environment (browser)
      isDev = (import.meta as any)?.env?.DEV === true;
    } catch {
      // Check for Node environment
      isDev = typeof process !== "undefined" &&
        process.env?.NODE_ENV !== "production";
    }

    if (isDev) {
      console.log(
        `[AUDITORIA] ${registro.usuario_nome} (${registro.usuario_role}): ${tipo_acao} em ${recurso_id}`
      );
    }

    return registro;
  }

  /**
   * Registra uma tentativa de acesso negado
   */
  registrarAcessoNegado(
    contexto: ContextoAutenticacao,
    recurso: string,
    operacao: string,
    motivo: string
  ): RegistroAuditoria {
    return this.registrarAcao(
      contexto,
      "acesso_negado",
      recurso,
      `${recurso}_${operacao}`,
      {
        descricao: `Tentativa de acesso negado: ${operacao} em ${recurso}. Motivo: ${motivo}`,
        resultado: "negado",
        motivo_falha: motivo,
      }
    );
  }

  /**
   * Obtém histórico de ações de um usuário
   * C-7: Returns a copy to prevent external mutation of internal state
   */
  obterHistoricoUsuario(
    usuario_id: string,
    limite: number = 100
  ): RegistroAuditoria[] {
    return Array.from(this.indiceUsuario.get(usuario_id) || []).slice(
      -limite
    );
  }

  /**
   * Obtém histórico de alterações de um recurso
   * C-7: Returns a copy to prevent external mutation of internal state
   */
  obterHistoricoRecurso(recurso: string, limite: number = 100): RegistroAuditoria[] {
    return Array.from(this.indiceRecurso.get(recurso) || []).slice(-limite);
  }

  /**
   * Obtém todos os registros de auditoria
   * C-7: Returns a copy to prevent external mutation of internal state
   */
  obterTodos(filtros?: {
    tipo_acao?: TipoAcao;
    resultado?: string;
    usuario_id?: string;
  }): RegistroAuditoria[] {
    const todos = Array.from(this.registros);
    if (!filtros) {
      return todos;
    }

    return todos.filter((r) => {
      if (filtros.tipo_acao && r.tipo_acao !== filtros.tipo_acao)
        return false;
      if (filtros.resultado && r.resultado !== filtros.resultado) return false;
      if (filtros.usuario_id && r.usuario_id !== filtros.usuario_id)
        return false;
      return true;
    });
  }

  /**
   * Calcula estatísticas de auditoria
   */
  obterEstatisticas(periodo_horas: number = 24): EstatisticasAuditoria {
    const agora = new Date();
    const limiteData = new Date(
      agora.getTime() - periodo_horas * 60 * 60 * 1000
    );

    const registrosPeriodo = Array.from(this.registros).filter(
      (r) => new Date(r.timestamp) > limiteData
    );

    const acessosNegados = registrosPeriodo.filter(
      (r) => r.resultado === "negado"
    ).length;

    const acoesPorTipo = new Map<TipoAcao, number>();
    const acoesPorUsuario = new Map<string, number>();

    registrosPeriodo.forEach((r) => {
      acoesPorTipo.set(r.tipo_acao, (acoesPorTipo.get(r.tipo_acao) || 0) + 1);
      acoesPorUsuario.set(
        r.usuario_id,
        (acoesPorUsuario.get(r.usuario_id) || 0) + 1
      );
    });

    // Encontrar mais comuns
    let acao_mais_comum: TipoAcao = "login";
    let max_acoes = 0;
    acoesPorTipo.forEach((count, tipo) => {
      if (count > max_acoes) {
        max_acoes = count;
        acao_mais_comum = tipo;
      }
    });

    let usuario_mais_ativo = "N/A";
    let max_usuario = 0;
    acoesPorUsuario.forEach((count, usuario) => {
      if (count > max_usuario) {
        max_usuario = count;
        usuario_mais_ativo = usuario;
      }
    });

    return {
      total_registros: registrosPeriodo.length,
      total_acessos_negados: acessosNegados,
      usuario_mais_ativo,
      acao_mais_comum,
      periodo: `${periodo_horas}h`,
    };
  }

  /**
   * Gera relatório de segurança
   * C-7: Works with immutable arrays
   */
  gerarRelatorioPeriodo(data_inicio: Date, data_fim: Date) {
    const registrosPeriodo = Array.from(this.registros).filter((r) => {
      const data = new Date(r.timestamp);
      return data >= data_inicio && data <= data_fim;
    });

    const acessosNegados = registrosPeriodo.filter(
      (r) => r.resultado === "negado"
    );

    const usuariosUnicos = new Set(registrosPeriodo.map((r) => r.usuario_id));

    return {
      periodo: `${data_inicio.toISOString()} até ${data_fim.toISOString()}`,
      total_eventos: registrosPeriodo.length,
      usuarios_ativos: usuariosUnicos.size,
      acessos_negados: acessosNegados.length,
      eventos_por_tipo: Object.fromEntries(
        Array.from(
          new Map(
            registrosPeriodo.reduce(
              (acc, r) => {
                const existing = acc.find((e) => e[0] === r.tipo_acao);
                if (existing) {
                  existing[1]++;
                } else {
                  acc.push([r.tipo_acao, 1]);
                }
                return acc;
              },
              [] as [TipoAcao, number][]
            )
          )
        )
      ),
      acessos_negados_detalhes: acessosNegados.map((r) => ({
        usuario: r.usuario_nome,
        timestamp: r.timestamp,
        recurso: r.recurso,
        motivo: r.motivo_falha,
      })),
    };
  }
}

// Singleton global
export const auditTrail = new AuditTrailService();
