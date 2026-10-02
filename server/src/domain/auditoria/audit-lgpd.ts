/**
 * LGPD Audit Trail Service
 *
 * Implementa auditoria completa em conformidade com LGPD (Lei Geral de Proteção de Dados).
 * Rastreia todos os acessos, alterações e processamento de dados pessoais.
 *
 * Documentação: Lei 13.709/2018 (Lei Geral de Proteção de Dados)
 */

import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

export interface RegistroAuditLGPD {
  id: string;
  usuario_id: string | null; // NULL se ação do sistema
  acao: string; // INSERT, UPDATE, DELETE, VIEW, EXPORT, ANONIMIZAR, etc
  tabela: string; // Tabela afetada
  registro_id: string | null; // ID do registro afetado
  dados_antigos: Record<string, unknown> | null; // JSON antes (para UPDATE/DELETE)
  dados_novos: Record<string, unknown> | null; // JSON depois (para INSERT/UPDATE)
  ip_address: string | null;
  user_agent: string | null;
  endpoint: string | null;
  contem_dados_sensveis: boolean;
  tipo_dado_sensvel: string | null; // CPF, EMAIL, TELEFONE, etc
  criado_em: Date;
}

export interface ConfiguracaoAuditLGPD {
  db: Database.Database;
  registrarDadosSensveis?: boolean; // Default: true
  dadosSensiveis?: string[]; // Lista de campos considerados sensíveis
}

/**
 * Serviço de auditoria LGPD
 */
export class AuditLGPD {
  private db: Database.Database;
  private registrarDadosSensveis: boolean;
  private dadosSensiveis: Set<string>;

  // Regex para detectar dados sensíveis comuns
  private static readonly REGEX_CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
  private static readonly REGEX_EMAIL =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly REGEX_TELEFONE = /^\(\d{2}\)\s?9?\d{4}-\d{4}$/;

  constructor(config: ConfiguracaoAuditLGPD) {
    this.db = config.db;
    this.registrarDadosSensveis = config.registrarDadosSensveis !== false;

    // Define campos sensíveis
    this.dadosSensiveis = new Set([
      "cpf",
      "cnpj",
      "email",
      "telefone",
      "senha",
      "senha_hash",
      "endereco",
      "data_nascimento",
      "numero_cartao",
      "token",
      "api_key",
      ...config.dadosSensiveis || [],
    ]);
  }

  /**
   * Registra uma ação na auditoria LGPD
   */
  registrarAcao(opcoes: {
    usuario_id?: string | null;
    acao: string;
    tabela: string;
    registro_id?: string | null;
    dados_antigos?: Record<string, unknown> | null;
    dados_novos?: Record<string, unknown> | null;
    ip_address?: string | null;
    user_agent?: string | null;
    endpoint?: string | null;
  }): RegistroAuditLGPD {
    try {
      const id = uuid();

      // Detecta dados sensíveis
      const { contem_sensivel, tipos } = this.detectarDadosSensveis({
        ...opcoes.dados_antigos,
        ...opcoes.dados_novos,
      });

      // Prepara statement SQL
      const stmt = this.db.prepare(`
        INSERT INTO audit_log_lgpd (
          id,
          usuario_id,
          acao,
          tabela,
          registro_id,
          dados_antigos,
          dados_novos,
          ip_address,
          user_agent,
          endpoint,
          contem_dados_sensveis,
          tipo_dado_sensvel,
          criado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        opcoes.usuario_id || null,
        opcoes.acao,
        opcoes.tabela,
        opcoes.registro_id || null,
        opcoes.dados_antigos ? JSON.stringify(opcoes.dados_antigos) : null,
        opcoes.dados_novos ? JSON.stringify(opcoes.dados_novos) : null,
        opcoes.ip_address || null,
        opcoes.user_agent || null,
        opcoes.endpoint || null,
        contem_sensivel ? 1 : 0,
        tipos.length > 0 ? tipos.join(",") : null,
        new Date().toISOString()
      );

      // Retorna registro criado
      return {
        id,
        usuario_id: opcoes.usuario_id || null,
        acao: opcoes.acao,
        tabela: opcoes.tabela,
        registro_id: opcoes.registro_id || null,
        dados_antigos: opcoes.dados_antigos || null,
        dados_novos: opcoes.dados_novos || null,
        ip_address: opcoes.ip_address || null,
        user_agent: opcoes.user_agent || null,
        endpoint: opcoes.endpoint || null,
        contem_dados_sensveis: contem_sensivel,
        tipo_dado_sensvel: tipos.length > 0 ? tipos.join(",") : null,
        criado_em: new Date(),
      };
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error during audit";
      throw new Error(`Failed to register audit log: ${mensagem}`);
    }
  }

  /**
   * Obtém histórico de auditoria de um registro
   */
  obterHistorico(
    tabela: string,
    registro_id: string,
    limite: number = 100
  ): RegistroAuditLGPD[] {
    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          usuario_id,
          acao,
          tabela,
          registro_id,
          dados_antigos,
          dados_novos,
          ip_address,
          user_agent,
          endpoint,
          contem_dados_sensveis,
          tipo_dado_sensvel,
          criado_em
        FROM audit_log_lgpd
        WHERE tabela = ? AND registro_id = ?
        ORDER BY criado_em DESC
        LIMIT ?
      `);

      const registros = stmt.all(tabela, registro_id, limite) as Array<{
        id: string;
        usuario_id: string | null;
        acao: string;
        tabela: string;
        registro_id: string | null;
        dados_antigos: string | null;
        dados_novos: string | null;
        ip_address: string | null;
        user_agent: string | null;
        endpoint: string | null;
        contem_dados_sensveis: number;
        tipo_dado_sensvel: string | null;
        criado_em: string;
      }>;

      return registros.map((r) => ({
        id: r.id,
        usuario_id: r.usuario_id,
        acao: r.acao,
        tabela: r.tabela,
        registro_id: r.registro_id,
        dados_antigos: r.dados_antigos ? JSON.parse(r.dados_antigos) : null,
        dados_novos: r.dados_novos ? JSON.parse(r.dados_novos) : null,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        endpoint: r.endpoint,
        contem_dados_sensveis: r.contem_dados_sensveis === 1,
        tipo_dado_sensvel: r.tipo_dado_sensvel,
        criado_em: new Date(r.criado_em),
      }));
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error fetching history";
      throw new Error(`Failed to fetch audit history: ${mensagem}`);
    }
  }

  /**
   * Obtém histórico de acessos de um usuário
   */
  obterAcessosUsuario(
    usuario_id: string,
    dias: number = 30,
    limite: number = 1000
  ): RegistroAuditLGPD[] {
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const stmt = this.db.prepare(`
        SELECT
          id,
          usuario_id,
          acao,
          tabela,
          registro_id,
          dados_antigos,
          dados_novos,
          ip_address,
          user_agent,
          endpoint,
          contem_dados_sensveis,
          tipo_dado_sensvel,
          criado_em
        FROM audit_log_lgpd
        WHERE usuario_id = ? AND criado_em >= ?
        ORDER BY criado_em DESC
        LIMIT ?
      `);

      const registros = stmt.all(
        usuario_id,
        dataLimite.toISOString(),
        limite
      ) as Array<{
        id: string;
        usuario_id: string | null;
        acao: string;
        tabela: string;
        registro_id: string | null;
        dados_antigos: string | null;
        dados_novos: string | null;
        ip_address: string | null;
        user_agent: string | null;
        endpoint: string | null;
        contem_dados_sensveis: number;
        tipo_dado_sensvel: string | null;
        criado_em: string;
      }>;

      return registros.map((r) => ({
        id: r.id,
        usuario_id: r.usuario_id,
        acao: r.acao,
        tabela: r.tabela,
        registro_id: r.registro_id,
        dados_antigos: r.dados_antigos ? JSON.parse(r.dados_antigos) : null,
        dados_novos: r.dados_novos ? JSON.parse(r.dados_novos) : null,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        endpoint: r.endpoint,
        contem_dados_sensveis: r.contem_dados_sensveis === 1,
        tipo_dado_sensvel: r.tipo_dado_sensvel,
        criado_em: new Date(r.criado_em),
      }));
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error fetching accesses";
      throw new Error(`Failed to fetch user accesses: ${mensagem}`);
    }
  }

  /**
   * Obtém registros com dados sensíveis acessados
   */
  obterAcessosDadosSensveis(
    dias: number = 30,
    limite: number = 500
  ): RegistroAuditLGPD[] {
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const stmt = this.db.prepare(`
        SELECT
          id,
          usuario_id,
          acao,
          tabela,
          registro_id,
          dados_antigos,
          dados_novos,
          ip_address,
          user_agent,
          endpoint,
          contem_dados_sensveis,
          tipo_dado_sensvel,
          criado_em
        FROM audit_log_lgpd
        WHERE contem_dados_sensveis = 1 AND criado_em >= ?
        ORDER BY criado_em DESC
        LIMIT ?
      `);

      const registros = stmt.all(
        dataLimite.toISOString(),
        limite
      ) as Array<{
        id: string;
        usuario_id: string | null;
        acao: string;
        tabela: string;
        registro_id: string | null;
        dados_antigos: string | null;
        dados_novos: string | null;
        ip_address: string | null;
        user_agent: string | null;
        endpoint: string | null;
        contem_dados_sensveis: number;
        tipo_dado_sensvel: string | null;
        criado_em: string;
      }>;

      return registros.map((r) => ({
        id: r.id,
        usuario_id: r.usuario_id,
        acao: r.acao,
        tabela: r.tabela,
        registro_id: r.registro_id,
        dados_antigos: r.dados_antigos ? JSON.parse(r.dados_antigos) : null,
        dados_novos: r.dados_novos ? JSON.parse(r.dados_novos) : null,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        endpoint: r.endpoint,
        contem_dados_sensveis: r.contem_dados_sensveis === 1,
        tipo_dado_sensvel: r.tipo_dado_sensvel,
        criado_em: new Date(r.criado_em),
      }));
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Unknown error fetching sensitive data accesses";
      throw new Error(`Failed to fetch sensitive data accesses: ${mensagem}`);
    }
  }

  /**
   * Detecta dados sensíveis em um objeto
   */
  private detectarDadosSensveis(
    dados: Record<string, unknown> | null | undefined
  ): { contem_sensivel: boolean; tipos: string[] } {
    if (!dados || !this.registrarDadosSensveis) {
      return { contem_sensivel: false, tipos: [] };
    }

    const tipos = new Set<string>();

    for (const [chave, valor] of Object.entries(dados)) {
      // Verifica nome do campo
      if (this.dadosSensiveis.has(chave.toLowerCase())) {
        tipos.add(chave.toUpperCase());
        continue;
      }

      // Verifica conteúdo
      if (typeof valor === "string") {
        if (AuditLGPD.REGEX_CPF.test(valor)) {
          tipos.add("CPF");
        }
        if (AuditLGPD.REGEX_EMAIL.test(valor)) {
          tipos.add("EMAIL");
        }
        if (AuditLGPD.REGEX_TELEFONE.test(valor)) {
          tipos.add("TELEFONE");
        }
      }
    }

    return {
      contem_sensivel: tipos.size > 0,
      tipos: Array.from(tipos),
    };
  }
}

/**
 * Factory para criar instância
 */
export function criarAuditLGPD(
  db: Database.Database,
  opcoes?: Partial<ConfiguracaoAuditLGPD>
): AuditLGPD {
  return new AuditLGPD({
    db,
    ...opcoes,
  });
}
