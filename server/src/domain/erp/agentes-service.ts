/**
 * Serviço de domínio para gerenciamento de agentes econômicos
 *
 * Responsabilidades:
 * - CRUD de agentes (pessoas físicas e jurídicas)
 * - Validação de CPF/CNPJ e duplicatas
 * - Detecção de duplicatas usando Levenshtein distance
 * - Soft delete (desativação) de agentes
 * - Auditoria de operações
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { logger } from "../../services/logger-service.js";
import {
  AgenteEconomico,
  CriarAgenteEconomicoSchema,
  AtualizarAgenteEconomicoSchema,
  calculateDuplicataScore,
  cleanCPFCNPJ,
  calculateSimilarity,
  StatusDuplicata,
} from "./agentes-tipos.js";

/**
 * Schemas de validação para entrada
 */
export const ListAgenteSchema = z.object({
  papel: z.string().optional(),
  ativo: z.coerce.boolean().optional(),
  tipo_entidade: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  busca: z.string().optional(), // Nome ou CPF/CNPJ
});

export type ListAgenteQuery = z.infer<typeof ListAgenteSchema>;
export type CriarAgenteInput = z.infer<typeof CriarAgenteEconomicoSchema>;
export type AtualizarAgenteInput = z.infer<typeof AtualizarAgenteEconomicoSchema>;

export interface ListAgenteResponse {
  agentes: AgenteEconomico[];
  total: number;
  offset: number;
  limit: number;
}

export interface DuplicataResponse {
  id: string;
  agente_id_1: string;
  agente_id_2: string;
  score: number;
  motivo: string;
  status: string;
  agente_1?: AgenteEconomico;
  agente_2?: AgenteEconomico;
}

/**
 * Serviço de agentes econômicos
 */
export class AgenteService {
  constructor(private db: Database.Database) {}

  /**
   * Criar novo agente
   * @throws Error se CPF/CNPJ já existir ou validação falhar
   */
  async criar(
    input: CriarAgenteInput,
    usuarioId: string,
  ): Promise<AgenteEconomico> {
    // Validar entrada com Zod
    const parsed = CriarAgenteEconomicoSchema.safeParse(input);
    if (!parsed.success) {
      const erro = parsed.error.issues[0];
      throw new Error(`Validação falhou: ${erro.path.join(".")}: ${erro.message}`);
    }

    // Limpar CPF/CNPJ
    const cpfCnpj = cleanCPFCNPJ(parsed.data.cpf_cnpj);

    // Verificar duplicidade
    const existente = this.db
      .prepare("SELECT id FROM agentes_economicos WHERE cpf_cnpj = ?")
      .get(cpfCnpj);

    if (existente) {
      throw new Error(`CPF/CNPJ ${cpfCnpj} já existe no sistema`);
    }

    const id = uuidv4();
    const agora = new Date().toISOString();

    try {
      this.db.exec("BEGIN");

      // Inserir agente
      const stmt = this.db.prepare(`
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, nome_fantasia,
          pessoa_fisica_pf_nome_mae, papel, regime_tributario,
          inscricao_estadual, inscricao_municipal, classificacao_nfse,
          email, telefone, celular,
          endereco_logradouro, endereco_numero, endereco_complemento,
          endereco_bairro, endereco_cidade, endereco_estado, endereco_cep,
          endereco_pais, ativo, observacoes, tags, validado,
          criado_em, criado_por, atualizado_em, atualizado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        parsed.data.tipo_entidade,
        cpfCnpj,
        parsed.data.nome,
        parsed.data.nome_fantasia ?? null,
        parsed.data.pessoa_fisica_pf_nome_mae ?? null,
        parsed.data.papel,
        parsed.data.regime_tributario ?? null,
        parsed.data.inscricao_estadual ?? null,
        parsed.data.inscricao_municipal ?? null,
        parsed.data.classificacao_nfse ?? null,
        parsed.data.email ?? null,
        parsed.data.telefone ?? null,
        parsed.data.celular ?? null,
        parsed.data.endereco?.logradouro ?? null,
        parsed.data.endereco?.numero ?? null,
        parsed.data.endereco?.complemento ?? null,
        parsed.data.endereco?.bairro ?? null,
        parsed.data.endereco?.cidade ?? null,
        parsed.data.endereco?.estado ?? null,
        parsed.data.endereco?.cep ?? null,
        parsed.data.endereco?.pais ?? "Brasil",
        1, // ativo = true
        parsed.data.observacoes ?? null,
        parsed.data.tags ?? null,
        0, // validado = false
        agora,
        usuarioId,
        agora,
        usuarioId,
      );

      // Detectar possíveis duplicatas
      await this.detectarDuplicatas(id, usuarioId);

      this.db.exec("COMMIT");

      logger.info(`Agente criado: ${id}`, { usuarioId });

      return this.obterPorId(id)!;
    } catch (erro) {
      this.db.exec("ROLLBACK");
      throw erro;
    }
  }

  /**
   * Listar agentes com filtros e paginação
   */
  listar(filtros: ListAgenteQuery): ListAgenteResponse {
    const parsed = ListAgenteSchema.safeParse(filtros);
    if (!parsed.success) {
      throw new Error(`Filtros inválidos: ${parsed.error.issues[0]?.message}`);
    }

    const { papel, ativo, tipo_entidade, offset, limit, busca } = parsed.data;

    let query = "SELECT * FROM agentes_economicos WHERE 1=1";
    const params: unknown[] = [];

    if (ativo !== undefined) {
      query += " AND ativo = ?";
      params.push(ativo ? 1 : 0);
    }

    if (papel) {
      query += " AND papel = ?";
      params.push(papel);
    }

    if (tipo_entidade) {
      query += " AND tipo_entidade = ?";
      params.push(tipo_entidade);
    }

    if (busca) {
      query += ` AND (LOWER(nome) LIKE ? OR cpf_cnpj LIKE ?)`;
      params.push(`%${busca.toLowerCase()}%`);
      params.push(`%${busca}%`);
    }

    // Contar total
    const countStmt = this.db.prepare(
      query.replace("SELECT *", "SELECT COUNT(*) as total"),
    );
    const { total } = countStmt.get(...params) as { total: number };

    // Buscar página
    query += " ORDER BY criado_em DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const listStmt = this.db.prepare(query);
    const rows = listStmt.all(...params) as unknown[];

    const agentes = rows.map((row) => this.mapearLinha(row));

    return { agentes, total, offset, limit };
  }

  /**
   * Obter agente por ID
   */
  obterPorId(id: string): AgenteEconomico | null {
    const stmt = this.db.prepare("SELECT * FROM agentes_economicos WHERE id = ?");
    const row = stmt.get(id) as unknown;
    return row ? this.mapearLinha(row) : null;
  }

  /**
   * Atualizar agente
   * @throws Error se não encontrado ou validação falhar
   */
  async atualizar(
    id: string,
    input: AtualizarAgenteInput,
    usuarioId: string,
  ): Promise<AgenteEconomico> {
    // Validar entrada
    const parsed = AtualizarAgenteEconomicoSchema.safeParse(input);
    if (!parsed.success) {
      const erro = parsed.error.issues[0];
      throw new Error(`Validação falhou: ${erro.path.join(".")}: ${erro.message}`);
    }

    // Verificar existência
    const agente = this.obterPorId(id);
    if (!agente) {
      throw new Error(`Agente ${id} não encontrado`);
    }

    // Se CPF/CNPJ foi alterado, verificar duplicidade
    if (parsed.data.cpf_cnpj) {
      const cpfCnpj = cleanCPFCNPJ(parsed.data.cpf_cnpj);
      const existente = this.db
        .prepare("SELECT id FROM agentes_economicos WHERE cpf_cnpj = ? AND id != ?")
        .get(cpfCnpj, id);

      if (existente) {
        throw new Error(`CPF/CNPJ ${cpfCnpj} já existe no sistema`);
      }
    }

    const agora = new Date().toISOString();
    const campos: string[] = [];
    const valores: unknown[] = [];

    // Montar UPDATE dinâmico
    if (parsed.data.nome !== undefined) {
      campos.push("nome = ?");
      valores.push(parsed.data.nome);
    }
    if (parsed.data.nome_fantasia !== undefined) {
      campos.push("nome_fantasia = ?");
      valores.push(parsed.data.nome_fantasia);
    }
    if (parsed.data.pessoa_fisica_pf_nome_mae !== undefined) {
      campos.push("pessoa_fisica_pf_nome_mae = ?");
      valores.push(parsed.data.pessoa_fisica_pf_nome_mae);
    }
    if (parsed.data.papel !== undefined) {
      campos.push("papel = ?");
      valores.push(parsed.data.papel);
    }
    if (parsed.data.regime_tributario !== undefined) {
      campos.push("regime_tributario = ?");
      valores.push(parsed.data.regime_tributario);
    }
    if (parsed.data.inscricao_estadual !== undefined) {
      campos.push("inscricao_estadual = ?");
      valores.push(parsed.data.inscricao_estadual);
    }
    if (parsed.data.inscricao_municipal !== undefined) {
      campos.push("inscricao_municipal = ?");
      valores.push(parsed.data.inscricao_municipal);
    }
    if (parsed.data.classificacao_nfse !== undefined) {
      campos.push("classificacao_nfse = ?");
      valores.push(parsed.data.classificacao_nfse);
    }
    if (parsed.data.email !== undefined) {
      campos.push("email = ?");
      valores.push(parsed.data.email);
    }
    if (parsed.data.telefone !== undefined) {
      campos.push("telefone = ?");
      valores.push(parsed.data.telefone);
    }
    if (parsed.data.celular !== undefined) {
      campos.push("celular = ?");
      valores.push(parsed.data.celular);
    }
    if (parsed.data.endereco !== undefined) {
      campos.push("endereco_logradouro = ?");
      valores.push(parsed.data.endereco?.logradouro ?? null);
      campos.push("endereco_numero = ?");
      valores.push(parsed.data.endereco?.numero ?? null);
      campos.push("endereco_complemento = ?");
      valores.push(parsed.data.endereco?.complemento ?? null);
      campos.push("endereco_bairro = ?");
      valores.push(parsed.data.endereco?.bairro ?? null);
      campos.push("endereco_cidade = ?");
      valores.push(parsed.data.endereco?.cidade ?? null);
      campos.push("endereco_estado = ?");
      valores.push(parsed.data.endereco?.estado ?? null);
      campos.push("endereco_cep = ?");
      valores.push(parsed.data.endereco?.cep ?? null);
      campos.push("endereco_pais = ?");
      valores.push(parsed.data.endereco?.pais ?? "Brasil");
    }
    if (parsed.data.observacoes !== undefined) {
      campos.push("observacoes = ?");
      valores.push(parsed.data.observacoes);
    }
    if (parsed.data.tags !== undefined) {
      campos.push("tags = ?");
      valores.push(parsed.data.tags);
    }

    // Sempre atualizar timestamps de auditoria
    campos.push("atualizado_em = ?");
    valores.push(agora);
    campos.push("atualizado_por = ?");
    valores.push(usuarioId);

    valores.push(id);

    const query = `UPDATE agentes_economicos SET ${campos.join(", ")} WHERE id = ?`;
    this.db.prepare(query).run(...valores);

    logger.info(`Agente atualizado: ${id}`, { usuarioId });

    return this.obterPorId(id)!;
  }

  /**
   * Desativar agente (soft delete)
   */
  desativar(id: string, usuarioId: string): AgenteEconomico {
    const agente = this.obterPorId(id);
    if (!agente) {
      throw new Error(`Agente ${id} não encontrado`);
    }

    const agora = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE agentes_economicos SET ativo = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?`,
      )
      .run(0, agora, usuarioId, id);

    logger.info(`Agente desativado: ${id}`, { usuarioId });

    return this.obterPorId(id)!;
  }

  /**
   * Buscar suspeitas de duplicata para um agente
   */
  listarDuplicatas(agenteId: string): DuplicataResponse[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agentes_duplicatas_suspeitas
      WHERE agente_id_1 = ? OR agente_id_2 = ?
      ORDER BY score DESC
    `);

    const rows = stmt.all(agenteId, agenteId) as unknown[];

    return rows.map((row) => {
      const agente1 = this.obterPorId(row.agente_id_1);
      const agente2 = this.obterPorId(row.agente_id_2);

      return {
        id: row.id,
        agente_id_1: row.agente_id_1,
        agente_id_2: row.agente_id_2,
        score: row.score,
        motivo: row.motivo,
        status: row.status,
        agente_1: agente1 || undefined,
        agente_2: agente2 || undefined,
      };
    });
  }

  /**
   * Detectar duplicatas usando Levenshtein distance
   * Comparação lógica: CPF/CNPJ idêntico OU email idêntico OU score alto (>60)
   */
  private async detectarDuplicatas(novoAgenteId: string, usuarioId: string): Promise<void> {
    const novoAgente = this.obterPorId(novoAgenteId);
    if (!novoAgente) return;

    // Buscar todos os outros agentes ativos
    const outros = this.db
      .prepare("SELECT * FROM agentes_economicos WHERE id != ? AND ativo = ?")
      .all(novoAgenteId, 1) as unknown[];

    const agora = new Date().toISOString();

    for (const outro of outros) {
      const outroAgente = this.mapearLinha(outro);

      // Calcular score
      const score = calculateDuplicataScore(novoAgente, outroAgente);

      // Verificar critérios de duplicata
      const cpfIdentico = novoAgente.cpf_cnpj === outroAgente.cpf_cnpj;
      const emailIdentico =
        novoAgente.email &&
        outroAgente.email &&
        novoAgente.email.toLowerCase() === outroAgente.email.toLowerCase();
      const scoreAlto = score > 60;

      // Registrar se for suspeita potencial
      if (cpfIdentico || emailIdentico || scoreAlto) {
        const motivo = cpfIdentico
          ? "cpf_cnpj_similar"
          : emailIdentico
            ? "email_identico"
            : "nome_similar";

        // Verificar se já existe registro
        const existe = this.db
          .prepare(
            `
            SELECT id FROM agentes_duplicatas_suspeitas
            WHERE (agente_id_1 = ? AND agente_id_2 = ?) OR (agente_id_1 = ? AND agente_id_2 = ?)
          `,
          )
          .get(novoAgenteId, outroAgente.id, outroAgente.id, novoAgenteId);

        if (!existe) {
          const nomeSimilarity = novoAgente.nome && outroAgente.nome
            ? calculateSimilarity(novoAgente.nome, outroAgente.nome)
            : 0;
          const emailScore = emailIdentico ? 100 : 0;
          const cpfScore = cpfIdentico ? 100 : 0;
          const phoneScore =
            novoAgente.telefone &&
            outroAgente.telefone &&
            novoAgente.telefone === outroAgente.telefone
              ? 100
              : 0;

          const id = uuidv4();
          this.db
            .prepare(`
              INSERT INTO agentes_duplicatas_suspeitas (
                id, agente_id_1, agente_id_2, score, motivo, status,
                score_nome, score_email, score_cpf, score_telefone,
                criado_em, criado_por
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              id,
              novoAgenteId,
              outroAgente.id,
              Math.round(score),
              motivo,
              StatusDuplicata.PENDENTE,
              nomeSimilarity,
              emailScore,
              cpfScore,
              phoneScore,
              agora,
              usuarioId,
            );

          logger.warn(`Duplicata suspeita detectada: ${novoAgenteId} vs ${outroAgente.id}`, {
            score,
            motivo,
          });
        }
      }
    }
  }

  /**
   * Mapear linha do banco para objeto AgenteEconomico
   */
  private mapearLinha(row: unknown): AgenteEconomico {
    return {
      id: row.id,
      tipo_entidade: row.tipo_entidade,
      cpf_cnpj: row.cpf_cnpj,
      nome: row.nome,
      nome_fantasia: row.nome_fantasia,
      pessoa_fisica_pf_nome_mae: row.pessoa_fisica_pf_nome_mae,
      papel: row.papel,
      regime_tributario: row.regime_tributario,
      inscricao_estadual: row.inscricao_estadual,
      inscricao_municipal: row.inscricao_municipal,
      classificacao_nfse: row.classificacao_nfse,
      email: row.email,
      telefone: row.telefone,
      celular: row.celular,
      endereco: {
        logradouro: row.endereco_logradouro,
        numero: row.endereco_numero,
        complemento: row.endereco_complemento,
        bairro: row.endereco_bairro,
        cidade: row.endereco_cidade,
        estado: row.endereco_estado,
        cep: row.endereco_cep,
        pais: row.endereco_pais || "Brasil",
      },
      ativo: Boolean(row.ativo),
      criado_em: new Date(row.criado_em),
      criado_por: row.criado_por,
      atualizado_em: new Date(row.atualizado_em),
      atualizado_por: row.atualizado_por,
      observacoes: row.observacoes,
      tags: row.tags,
      validado: Boolean(row.validado),
      validado_em: row.validado_em ? new Date(row.validado_em) : null,
      validado_por: row.validado_por,
    };
  }
}
