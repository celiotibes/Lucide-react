/**
 * Database-backed Audit Trail Service (Phase 2)
 * Persists audit logs to database for compliance and forensics
 *
 * Replaces in-memory AuditTrailService with persistent storage
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { randomUUID } from "crypto";
import type { ContextoAutenticacao } from "./auth-service";

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
  | "criar_usuario"
  | "atualizar_permissoes"
  | "acesso_negado"
  | "acl_concessao"
  | "acl_reativacao"
  | "acl_revogacao"
  | "lgpd_acesso_dados"
  | "lgpd_exclusao_conta"
  | "portal_publicacao"
  | "prestador_apontamento_recebido"
  | "prestador_apontamento_conferencia";

export interface RegistroAuditoria {
  id: string;
  timestamp: string;
  /** null quando a ação não tem usuário autenticado associado (ex: login
   * que falhou porque o e-mail nem existe) — nunca uma string inventada
   * tipo "sistema", que violaria a FOREIGN KEY para usuarios(id). */
  usuario_id: string | null;
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
 * Database-backed Audit Trail Service
 */
export class AuditTrailServiceDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Registra uma ação de usuário
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
    const registro: RegistroAuditoria = {
      id: `audit_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      // null (não uma string tipo "sistema"): a coluna usuario_id tem
      // FOREIGN KEY para usuarios(id) — uma string inventada que não é PK
      // de nenhum usuário derrubaria o INSERT com "FOREIGN KEY constraint
      // failed" sempre que a ação não tiver usuário autenticado (ex: login
      // que falhou porque o e-mail nem existe). NULL é exatamente o que a
      // constraint já prevê (ON DELETE SET NULL).
      usuario_id: contexto.usuario?.id ?? null,
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
    };

    try {
      const stmt = this.db.prepare(
        `INSERT INTO auditoria (
          id, timestamp, usuario_id, usuario_nome, usuario_email, usuario_role,
          tipo_acao, recurso, recurso_id, prestador_id, descricao,
          valores_antigos, valores_novos, endereco_ip, user_agent,
          resultado, motivo_falha
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        registro.id,
        registro.timestamp,
        registro.usuario_id,
        registro.usuario_nome,
        registro.usuario_email,
        registro.usuario_role,
        tipo_acao,
        recurso,
        recurso_id,
        opcoes?.prestador_id,
        registro.descricao,
        JSON.stringify(opcoes?.valores_antigos || null),
        JSON.stringify(opcoes?.valores_novos || null),
        opcoes?.endereco_ip,
        opcoes?.user_agent,
        opcoes?.resultado || "sucesso",
        opcoes?.motivo_falha
      );

      // Log para console em desenvolvimento
      if (process.env.NODE_ENV !== "production") {
        logger.info(
          `[AUDITORIA] ${registro.usuario_nome} (${registro.usuario_role}): ${tipo_acao} em ${recurso_id}`
        );
      }

      return registro;
    } catch (erro) {
      logger.error("Erro ao registrar auditoria:", erro);
      throw erro;
    }
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
    return this.registrarAcao(contexto, "acesso_negado", recurso, `${recurso}_${operacao}`, {
      descricao: `Tentativa de acesso negado: ${operacao} em ${recurso}. Motivo: ${motivo}`,
      resultado: "negado",
      motivo_falha: motivo,
    });
  }

  /**
   * Obtém histórico de ações de um usuário
   */
  obterHistoricoUsuario(usuario_id: string, limite: number = 100): RegistroAuditoria[] {
    try {
      const stmt = this.db.prepare(
        `SELECT * FROM auditoria
         WHERE usuario_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      );
      const registros = stmt.all(usuario_id, limite) as any[];
      return this.parseRegistros(registros);
    } catch (erro) {
      logger.error("Erro ao obter histórico de usuário:", erro);
      return [];
    }
  }

  /**
   * Obtém histórico de alterações de um recurso
   */
  obterHistoricoRecurso(recurso: string, limite: number = 100): RegistroAuditoria[] {
    try {
      const stmt = this.db.prepare(
        `SELECT * FROM auditoria
         WHERE recurso = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      );
      const registros = stmt.all(recurso, limite) as any[];
      return this.parseRegistros(registros);
    } catch (erro) {
      logger.error("Erro ao obter histórico de recurso:", erro);
      return [];
    }
  }

  /**
   * Get all audit records with optional filtering
   *
   * @param filtros Optional filter parameters:
   *   - tipo_acao: Filter by action type
   *   - resultado: Filter by result/outcome
   *   - usuario_id: Filter by user who performed the action
   *
   * @returns List of audit records, sorted by timestamp (newest first)
   */
  obterTodos(filtros?: {
    tipo_acao?: TipoAcao;
    resultado?: string;
    usuario_id?: string;
  }): RegistroAuditoria[] {
    try {
      let query = "SELECT * FROM auditoria WHERE 1=1";
      // Type-safe parameter array for SQL query
      const params: string[] = [];

      if (filtros?.tipo_acao) {
        query += " AND tipo_acao = ?";
        params.push(filtros.tipo_acao);
      }
      if (filtros?.resultado) {
        query += " AND resultado = ?";
        params.push(filtros.resultado);
      }
      if (filtros?.usuario_id) {
        query += " AND usuario_id = ?";
        params.push(filtros.usuario_id);
      }

      query += " ORDER BY timestamp DESC";

      const stmt = this.db.prepare(query);
      const registros = stmt.all(...params) as RegistroAuditoria[];
      return this.parseRegistros(registros);
    } catch (erro) {
      logger.error("Erro ao obter registros de auditoria:", erro);
      return [];
    }
  }

  /**
   * Calcula estatísticas de auditoria
   */
  obterEstatisticas(periodo_horas: number = 24): EstatisticasAuditoria {
    try {
      const data_limite = new Date(Date.now() - periodo_horas * 60 * 60 * 1000).toISOString();

      // Total de registros
      const totalStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM auditoria WHERE timestamp > ?"
      );
      const totalResult = totalStmt.get(data_limite) as any;

      // Acessos negados
      const negadosStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM auditoria WHERE timestamp > ? AND resultado = 'negado'"
      );
      const negadosResult = negadosStmt.get(data_limite) as any;

      // Ação mais comum
      const acaoStmt = this.db.prepare(
        `SELECT tipo_acao, COUNT(*) as count FROM auditoria
         WHERE timestamp > ?
         GROUP BY tipo_acao
         ORDER BY count DESC
         LIMIT 1`
      );
      const acaoResult = acaoStmt.get(data_limite) as any;

      // Usuário mais ativo
      const usuarioStmt = this.db.prepare(
        `SELECT usuario_id, COUNT(*) as count FROM auditoria
         WHERE timestamp > ?
         GROUP BY usuario_id
         ORDER BY count DESC
         LIMIT 1`
      );
      const usuarioResult = usuarioStmt.get(data_limite) as any;

      return {
        total_registros: totalResult.count || 0,
        total_acessos_negados: negadosResult.count || 0,
        usuario_mais_ativo: usuarioResult?.usuario_id || "N/A",
        acao_mais_comum: (acaoResult?.tipo_acao as TipoAcao) || "login",
        periodo: `${periodo_horas}h`,
      };
    } catch (erro) {
      logger.error("Erro ao obter estatísticas:", erro);
      return {
        total_registros: 0,
        total_acessos_negados: 0,
        usuario_mais_ativo: "N/A",
        acao_mais_comum: "login",
        periodo: `${periodo_horas}h`,
      };
    }
  }

  /**
   * Gera relatório de segurança para um período
   */
  gerarRelatorioPeriodo(data_inicio: Date, data_fim: Date) {
    try {
      const inicio = data_inicio.toISOString();
      const fim = data_fim.toISOString();

      const stmt = this.db.prepare(
        `SELECT * FROM auditoria
         WHERE timestamp BETWEEN ? AND ?
         ORDER BY timestamp DESC`
      );
      const registros = stmt.all(inicio, fim) as any[];

      const acessosNegados = registros.filter((r) => r.resultado === "negado");
      const usuariosUnicos = new Set(registros.map((r) => r.usuario_id));

      // Eventos por tipo
      const eventosPorTipo: Record<string, number> = {};
      registros.forEach((r) => {
        eventosPorTipo[r.tipo_acao] = (eventosPorTipo[r.tipo_acao] || 0) + 1;
      });

      return {
        periodo: `${inicio} até ${fim}`,
        total_eventos: registros.length,
        usuarios_ativos: usuariosUnicos.size,
        acessos_negados: acessosNegados.length,
        eventos_por_tipo: eventosPorTipo,
        acessos_negados_detalhes: acessosNegados.map((r) => ({
          usuario: r.usuario_nome,
          timestamp: r.timestamp,
          recurso: r.recurso,
          motivo: r.motivo_falha,
        })),
      };
    } catch (erro) {
      logger.error("Erro ao gerar relatório:", erro);
      return {
        periodo: "",
        total_eventos: 0,
        usuarios_ativos: 0,
        acessos_negados: 0,
        eventos_por_tipo: {},
        acessos_negados_detalhes: [],
      };
    }
  }

  /**
   * Parse JSON fields from database
   */
  private parseRegistros(registros: any[]): RegistroAuditoria[] {
    return registros.map((r) => ({
      ...r,
      valores_antigos: r.valores_antigos ? JSON.parse(r.valores_antigos) : undefined,
      valores_novos: r.valores_novos ? JSON.parse(r.valores_novos) : undefined,
    }));
  }
}
