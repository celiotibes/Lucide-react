/**
 * Right to Be Forgotten (Direito ao Esquecimento)
 *
 * Implementa GDPR/LGPD Right to Be Forgotten.
 * Anonimiza dados pessoais enquanto mantém histórico financeiro para auditoria.
 *
 * Documentação:
 * - GDPR Article 17 (Right to Erasure)
 * - LGPD Art. 16 (Direito de Acesso)
 */

import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

export interface ConfiguracaoDireitoEsquecimento {
  db: Database.Database;
}

export interface ResultadoAnonimizacao {
  sucesso: boolean;
  pessoa_id: string;
  pessoa_tipo: string;
  campos_anonimizados: string[];
  timestamp: Date;
  mensagem_erro?: string;
}

export interface CamposSensiveis {
  nome: string;
  email: string;
  telefone: string;
  cpf_cnpj: string;
  endereco: string;
  data_nascimento: string;
  numero_cartao?: string;
  [key: string]: unknown;
}

/**
 * Serviço de direito ao esquecimento
 */
export class DireitoAoEsquecimento {
  private db: Database.Database;

  constructor(config: ConfiguracaoDireitoEsquecimento) {
    this.db = config.db;
  }

  /**
   * Anonimiza uma pessoa (inquilino/prestador/fornecedor)
   * Mantém histórico financeiro, remove dados pessoais
   *
   * @param pessoa_tipo Tipo de pessoa (INQUILINO, PRESTADOR, FORNECEDOR)
   * @param pessoa_id ID da pessoa na tabela
   * @param usuario_solicitante_id Quem solicitou a anonimização
   * @returns Resultado da anonimização
   */
  async anonimizarPessoa(
    pessoa_tipo: string,
    pessoa_id: string,
    usuario_solicitante_id?: string
  ): Promise<ResultadoAnonimizacao> {
    const transaction = this.db.transaction(() => {
      try {
        // Valida inputs
        if (!pessoa_tipo || !pessoa_id) {
          throw new Error("pessoa_tipo and pessoa_id are required");
        }

        const tiposValidos = ["INQUILINO", "PRESTADOR", "FORNECEDOR"];
        if (!tiposValidos.includes(pessoa_tipo)) {
          throw new Error(`Invalid pessoa_tipo: ${pessoa_tipo}`);
        }

        // 1. Busca dados originais antes de anonimizar
        const dados_originais = this.obterDadosOriginais(
          pessoa_tipo,
          pessoa_id
        );

        if (!dados_originais) {
          throw new Error(
            `Person not found: ${pessoa_tipo}/${pessoa_id}`
          );
        }

        // 2. Anonimiza na tabela principal
        const campos_anonimizados = this.anonimizarNaTabela(
          pessoa_tipo,
          pessoa_id
        );

        // 3. Registra na tabela de anonimizações
        const id_anonimizacao = uuid();
        const stmt_anon = this.db.prepare(`
          INSERT INTO pessoas_anonimizadas (
            id,
            pessoa_tipo,
            pessoa_id,
            dados_originais_json,
            motivo_solicitacao,
            usuario_id_solicitante,
            anonimizado_em,
            versao_anonimizacao,
            gdpr_compliant,
            auditado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt_anon.run(
          id_anonimizacao,
          pessoa_tipo,
          pessoa_id,
          JSON.stringify(dados_originais),
          "Direito ao esquecimento (GDPR/LGPD)",
          usuario_solicitante_id || null,
          new Date().toISOString(),
          "1.0",
          1, // GDPR compliant
          0  // Não auditado ainda
        );

        return {
          sucesso: true,
          pessoa_id,
          pessoa_tipo,
          campos_anonimizados,
          timestamp: new Date(),
        };
      } catch (erro) {
        const mensagem =
          erro instanceof Error ? erro.message : "Unknown error";
        throw new Error(`Failed to anonymize person: ${mensagem}`);
      }
    });

    try {
      return transaction();
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      return {
        sucesso: false,
        pessoa_id,
        pessoa_tipo,
        campos_anonimizados: [],
        timestamp: new Date(),
        mensagem_erro: mensagem,
      };
    }
  }

  /**
   * Exporta todos os dados de uma pessoa (direito de acesso)
   */
  async exportarDadosPessoa(
    pessoa_tipo: string,
    pessoa_id: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const dados: Record<string, unknown> = {
        pessoa_tipo,
        pessoa_id,
        tabelas: {},
      };

      // Define tabelas a buscar por tipo
      const tabelasMap: Record<string, string[]> = {
        INQUILINO: [
          "inquilinos",
          "cobrancas_inquilino",
          "contratos_aluguel",
        ],
        PRESTADOR: [
          "prestadores",
          "pagamentos_prestadores",
          "relacoes_prestador",
        ],
        FORNECEDOR: [
          "fornecedores",
          "pedidos_fornecedor",
          "pagamentos_fornecedor",
        ],
      };

      const tabelas = tabelasMap[pessoa_tipo] || [];

      for (const tabela of tabelas) {
        // Verifica se tabela existe
        const temTabela = this.db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
          )
          .get(tabela);

        if (!temTabela) {
          continue;
        }

        try {
          const registros = this.db
            .prepare(`SELECT * FROM ${tabela} WHERE pessoa_id = ?`)
            .all(pessoa_id);

          dados.tabelas = {
            ...dados.tabelas,
            [tabela]: registros,
          };
        } catch {
          // Tabela pode ter coluna com nome diferente
          continue;
        }
      }

      // Busca auditoria relacionada
      const auditoria = this.db
        .prepare(`
          SELECT * FROM audit_log_lgpd
          WHERE
            (usuario_id = ? OR dados_novos LIKE ?)
            AND criado_em >= datetime('now', '-1 year')
          ORDER BY criado_em DESC
          LIMIT 500
        `)
        .all(pessoa_id, `%${pessoa_id}%`);

      dados.auditoria = auditoria;

      return dados;
    } catch (erro) {
      console.error("Error exporting person data:", erro);
      return null;
    }
  }

  /**
   * Obtém dados originais antes de anonimizar
   */
  private obterDadosOriginais(
    pessoa_tipo: string,
    pessoa_id: string
  ): Record<string, unknown> | null {
    try {
      // Map de tabela por tipo de pessoa
      const tabelaMap: Record<string, string> = {
        INQUILINO: "inquilinos",
        PRESTADOR: "prestadores",
        FORNECEDOR: "fornecedores",
      };

      const tabela = tabelaMap[pessoa_tipo];
      if (!tabela) return null;

      // Verifica se tabela existe
      const temTabela = this.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tabela);

      if (!temTabela) return null;

      // Busca registro
      try {
        const registro = this.db
          .prepare(`SELECT * FROM ${tabela} WHERE id = ?`)
          .get(pessoa_id);

        return registro || null;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Anonimiza dados na tabela principal
   */
  private anonimizarNaTabela(
    pessoa_tipo: string,
    pessoa_id: string
  ): string[] {
    const tabelaMap: Record<string, string> = {
      INQUILINO: "inquilinos",
      PRESTADOR: "prestadores",
      FORNECEDOR: "fornecedores",
    };

    const tabela = tabelaMap[pessoa_tipo];
    const campos_anonimizados: string[] = [];

    if (!tabela) return campos_anonimizados;

    try {
      // Verifica se tabela existe
      const temTabela = this.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tabela);

      if (!temTabela) return campos_anonimizados;

      // Busca esquema da tabela
      const colunas = this.db
        .prepare(`PRAGMA table_info(${tabela})`)
        .all() as Array<{ name: string }>;

      // Campos sensíveis a anonimizar
      const camposSensiveis = [
        "nome",
        "email",
        "telefone",
        "cpf",
        "cnpj",
        "endereco",
        "data_nascimento",
        "numero_cartao",
      ];

      // Constrói UPDATE dinâmico
      const updates: string[] = [];

      for (const coluna of colunas) {
        if (camposSensiveis.includes(coluna.name.toLowerCase())) {
          updates.push(`${coluna.name} = NULL`);
          campos_anonimizados.push(coluna.name);
        }
      }

      // Anonimiza nome se existir
      if (
        colunas.some((c) => c.name.toLowerCase() === "nome") &&
        !updates.some((u) => u.includes("nome"))
      ) {
        updates.push(`nome = 'Pessoa #' || id`);
        campos_anonimizados.push("nome");
      }

      if (updates.length > 0) {
        const sql = `UPDATE ${tabela} SET ${updates.join(", ")} WHERE id = ?`;
        this.db.prepare(sql).run(pessoa_id);
      }

      return campos_anonimizados;
    } catch (erro) {
      console.error(`Error anonymizing in ${tabela}:`, erro);
      return campos_anonimizados;
    }
  }

  /**
   * Consulta se pessoa foi anonimizada
   */
  foiAnonimizado(pessoa_tipo: string, pessoa_id: string): boolean {
    try {
      const resultado = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM pessoas_anonimizadas
        WHERE pessoa_tipo = ? AND pessoa_id = ?
      `
        )
        .get(pessoa_tipo, pessoa_id) as { count: number };

      return resultado.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Obtém histórico de anonimizações
   */
  obterHistoricoAnonimizacoes(
    pessoa_tipo?: string,
    limite: number = 100
  ): Array<Record<string, unknown>> {
    try {
      let sql = `
        SELECT
          id,
          pessoa_tipo,
          pessoa_id,
          motivo_solicitacao,
          usuario_id_solicitante,
          anonimizado_em,
          gdpr_compliant,
          auditado
        FROM pessoas_anonimizadas
      `;

      if (pessoa_tipo) {
        sql += ` WHERE pessoa_tipo = ?`;
      }

      sql += ` ORDER BY anonimizado_em DESC LIMIT ?`;

      const stmt = this.db.prepare(sql);
      return pessoa_tipo
        ? (stmt.all(pessoa_tipo, limite) as Array<Record<string, unknown>>)
        : (stmt.all(limite) as Array<Record<string, unknown>>);
    } catch (erro) {
      console.error("Error fetching anonymization history:", erro);
      return [];
    }
  }
}

/**
 * Factory para criar instância
 */
export function criarDireitoAoEsquecimento(
  db: Database.Database
): DireitoAoEsquecimento {
  return new DireitoAoEsquecimento({ db });
}
