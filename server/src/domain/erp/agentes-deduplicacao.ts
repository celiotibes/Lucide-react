/**
 * Sistema de deduplicação para agentes econômicos
 * Fase 20: Detecção e resolução de duplicatas
 *
 * Estratégia de detecção:
 * 1. Primeiro: Match exato CNPJ/CPF (100 pontos)
 * 2. Segundo: Fuzzy-match no nome (Levenshtein distance)
 * 3. Terceiro: Similaridade de endereço + tipo de entidade
 *
 * Scoring final: CNPJ match (100pts) + name similarity (70pts threshold)
 * Threshold geral: >85% accuracy para aprovação automática
 */

import type { Database } from "better-sqlite3";

// =====================================================================
// TIPOS E INTERFACES
// =====================================================================

export interface DuplicateAgentCandidate {
  agente_id_2: string;
  nome_2: string;
  cpf_cnpj_2: string;
  tipo_entidade_2: string;
  papel_2: string;
  score: number;
  score_cpf_cnpj: number;
  score_nome: number;
  score_endereco: number;
  confidence_level: "EXACT" | "HIGH" | "MEDIUM" | "LOW";
  motivos: string[];
  detalhes: {
    tipo_match: string;
    percentual_similaridade: number;
    diferenca_endereco: string | null;
  };
}

export interface MergeAgentRequest {
  agente_primario_id: string;
  agente_duplicado_id: string;
  motivo: string;
  detalhes?: Record<string, any>;
}

export interface MergeResult {
  id: string;
  sucesso: boolean;
  agente_primario_id: string;
  agente_duplicado_id: string;
  agentes_migrados: number;
  transacoes_migradas: number;
  audit_trail: string;
  timestamp: string;
}

export interface DuplicataAuditTrail {
  id: string;
  tipo_operacao: "MERGE" | "UNMERGE" | "REVIEW";
  agente_primario_id: string;
  agente_secundario_id: string;
  estado_anterior: Record<string, any>;
  estado_posterior: Record<string, any>;
  criado_em: string;
  criado_por: string;
  descricao: string;
}

// =====================================================================
// FUNÇÕES AUXILIARES - Cálculo de Similaridade
// =====================================================================

/**
 * Calcula distância de Levenshtein entre duas strings
 * Retorna um número entre 0 e 1 onde 1.0 = idêntico
 */
function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distancia = levenshteinDistance(s1, s2);
  return 1 - (distancia / maxLen);
}

/**
 * Implementação da distância de Levenshtein
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  const matriz: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matriz[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matriz[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const custo = s1[i - 1] === s2[j - 1] ? 0 : 1;

      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1, // deleção
        matriz[i][j - 1] + 1, // inserção
        matriz[i - 1][j - 1] + custo // substituição
      );
    }
  }

  return matriz[len1][len2];
}

/**
 * Normaliza CPF/CNPJ para comparação (remove caracteres especiais)
 */
function normalizarCPFCNPJ(cpfCnpj: string): string {
  return cpfCnpj.replace(/[^\d]/g, "");
}

/**
 * Calcula score para endereços (match de componentes principais)
 */
function calcularScoreEndereco(
  endereco1: unknown,
  endereco2: unknown
): { score: number; diferenca: string | null } {
  if (!endereco1 || !endereco2) {
    return { score: 0, diferenca: "Endereço ausente em um dos agentes" };
  }

  let pontos = 0;
  const diferenças: string[] = [];

  // Comparar logradouro
  if (
    endereco1.logradouro &&
    endereco2.logradouro &&
    endereco1.logradouro.toLowerCase() ===
      endereco2.logradouro.toLowerCase()
  ) {
    pontos += 20;
  } else if (endereco1.logradouro && endereco2.logradouro) {
    const sim = calcularSimilaridade(
      endereco1.logradouro,
      endereco2.logradouro
    );
    if (sim >= 0.8) pontos += 15;
    else diferenças.push("Logradouros diferentes");
  }

  // Comparar número
  if (endereco1.numero && endereco2.numero) {
    if (endereco1.numero === endereco2.numero) {
      pontos += 15;
    } else {
      diferenças.push("Números diferentes");
    }
  }

  // Comparar cidade
  if (
    endereco1.cidade &&
    endereco2.cidade &&
    endereco1.cidade.toLowerCase() === endereco2.cidade.toLowerCase()
  ) {
    pontos += 15;
  } else if (endereco1.cidade && endereco2.cidade) {
    diferenças.push("Cidades diferentes");
  }

  // Comparar CEP
  if (
    endereco1.cep &&
    endereco2.cep &&
    endereco1.cep === endereco2.cep
  ) {
    pontos += 15;
  } else if (endereco1.cep && endereco2.cep) {
    diferenças.push("CEPs diferentes");
  }

  return {
    score: pontos,
    diferenca:
      diferenças.length > 0 ? diferenças.join("; ") : null,
  };
}

// =====================================================================
// SERVIÇO PRINCIPAL DE DEDUPLICAÇÃO
// =====================================================================

export class AgentesDeduplicacaoService {
  constructor(private db: Database) {}

  /**
   * Detecta duplicatas potenciais para um agente
   * Retorna lista de candidatos ordenados por score
   */
  detectarDuplicatasAgente(
    agenteId: string,
    usuarioId: string
  ): DuplicateAgentCandidate[] {
    try {
      // Buscar agente principal
      const stmt = this.db.prepare(
        `SELECT * FROM agentes_economicos WHERE id = ?`
      );
      const agente1 = stmt.get(agenteId) as unknown;

      if (!agente1) {
        throw new Error(`Agente ${agenteId} não encontrado`);
      }

      // Buscar possíveis duplicatas (mesma entidade, CPF/CNPJ, ou semelhantes)
      const queryDuplicatas = `
        SELECT id, nome, cpf_cnpj, tipo_entidade, papel,
               endereco_logradouro, endereco_numero, endereco_cidade,
               endereco_cep, email, telefone
        FROM agentes_economicos
        WHERE id != ?
        AND ativo = true
        AND tipo_entidade = ?
        AND id NOT IN (
          SELECT CASE
            WHEN agente_id_1 = ? THEN agente_id_2
            ELSE agente_id_1
          END
          FROM agentes_duplicatas_suspeitas
          WHERE status = 'mesclada'
          AND (agente_id_1 = ? OR agente_id_2 = ?)
        )
        ORDER BY nome
        LIMIT 100
      `;

      const stmtDuplicatas = this.db.prepare(queryDuplicatas);
      const agentes = stmtDuplicatas.all(
        agenteId,
        agente1.tipo_entidade,
        agenteId,
        agenteId,
        agenteId
      ) as unknown[];

      const candidatos: DuplicateAgentCandidate[] = [];

      for (const agente2 of agentes) {
        const resultado = this._calcularScoreDuplicata(
          agente1,
          agente2
        );

        // Filtrar apenas candidatos com score >= 50 (mínimo razoável)
        if (resultado.score >= 50) {
          candidatos.push(resultado);
        }
      }

      // Ordenar por score descendente
      return candidatos.sort((a, b) => b.score - a.score);
    } catch (erro) {
      console.error(
        "Erro ao detectar duplicatas de agente:",
        erro
      );
      throw erro;
    }
  }

  /**
   * Detecta todas as possíveis duplicatas no sistema
   * Retorna mapa de agente para lista de candidatos
   */
  detectarTodasDuplicatas(
    usuarioId: string,
    scoreMinimo: number = 70
  ): Map<string, DuplicateAgentCandidate[]> {
    const resultado = new Map<
      string,
      DuplicateAgentCandidate[]
    >();

    try {
      // Buscar todos os agentes ativos
      const stmtAgentes = this.db.prepare(
        `SELECT id, nome, cpf_cnpj, tipo_entidade, papel,
                endereco_logradouro, endereco_numero, endereco_cidade,
                endereco_cep, email, telefone
         FROM agentes_economicos
         WHERE ativo = true
         ORDER BY tipo_entidade, nome`
      );

      const agentes = stmtAgentes.all() as unknown[];

      // Para cada agente, buscar duplicatas
      for (let i = 0; i < agentes.length; i++) {
        const agente1 = agentes[i];
        const candidatos: DuplicateAgentCandidate[] = [];

        // Comparar com agentes subsequentes (evita comparações duplicadas)
        for (let j = i + 1; j < agentes.length; j++) {
          const agente2 = agentes[j];

          const resultado = this._calcularScoreDuplicata(
            agente1,
            agente2
          );

          if (resultado.score >= scoreMinimo) {
            candidatos.push(resultado);
          }
        }

        if (candidatos.length > 0) {
          resultado.set(agente1.id, candidatos);
        }
      }

      return resultado;
    } catch (erro) {
      console.error("Erro ao detectar todas as duplicatas:", erro);
      throw erro;
    }
  }

  /**
   * Calcula score de duplicata entre dois agentes
   * Estratégia:
   * 1. CPF/CNPJ exato = 100 pontos
   * 2. Nome similar = até 70 pontos
   * 3. Endereço similar = até 15 pontos
   * 4. Email/Telefone = até 15 pontos
   */
  private _calcularScoreDuplicata(
    agente1: unknown,
    agente2: unknown
  ): DuplicateAgentCandidate {
    const motivos: string[] = [];
    let score = 0;
    let scoreCpfCnpj = 0;
    let scoreNome = 0;
    let scoreEndereco = 0;
    let tipoMatch = "DESCONHECIDO";

    // ESTRATÉGIA 1: Match exato CNPJ/CPF
    const cpf1 = normalizarCPFCNPJ(agente1.cpf_cnpj);
    const cpf2 = normalizarCPFCNPJ(agente2.cpf_cnpj);

    if (cpf1 === cpf2) {
      scoreCpfCnpj = 100;
      score += 100;
      tipoMatch = "EXACT_CPF_CNPJ";
      motivos.push("CPF/CNPJ idêntico (100% duplicata)");
    }

    // ESTRATÉGIA 2: Fuzzy-match no nome (apenas se não foi match exato)
    if (scoreCpfCnpj === 0) {
      const similaridadeNome = calcularSimilaridade(
        agente1.nome,
        agente2.nome
      );

      if (similaridadeNome >= 0.95) {
        scoreNome = 70;
        score += 70;
        tipoMatch = "EXACT_NAME";
        motivos.push(
          `Nome muito similar (${(similaridadeNome * 100).toFixed(1)}%)`
        );
      } else if (similaridadeNome >= 0.85) {
        scoreNome = 50;
        score += 50;
        tipoMatch = "HIGH_NAME_SIMILARITY";
        motivos.push(
          `Nome similar (${(similaridadeNome * 100).toFixed(1)}%)`
        );
      } else if (similaridadeNome >= 0.75) {
        scoreNome = 30;
        score += 30;
        tipoMatch = "MEDIUM_NAME_SIMILARITY";
        motivos.push(
          `Nome parcialmente similar (${(similaridadeNome * 100).toFixed(1)}%)`
        );
      } else if (similaridadeNome >= 0.65) {
        scoreNome = 15;
        score += 15;
        motivos.push(
          `Nome ligeiramente similar (${(similaridadeNome * 100).toFixed(1)}%)`
        );
      }
    }

    // ESTRATÉGIA 3: Similaridade de endereço + tipo
    if (agente1.tipo_entidade === agente2.tipo_entidade) {
      const { score: scoreEnd, diferenca } =
        calcularScoreEndereco(agente1, agente2);
      scoreEndereco = scoreEnd;
      score += scoreEnd;

      if (scoreEnd > 0) {
        motivos.push(`Endereço similar (${scoreEnd} pontos)`);
      }
      if (diferenca) {
        motivos.push(`Diferenças: ${diferenca}`);
      }
    }

    // Verificar email/telefone idêntico
    if (
      agente1.email &&
      agente2.email &&
      agente1.email.toLowerCase() === agente2.email.toLowerCase()
    ) {
      score += 10;
      motivos.push("Email idêntico");
    }

    if (
      agente1.telefone &&
      agente2.telefone &&
      agente1.telefone === agente2.telefone
    ) {
      score += 5;
      motivos.push("Telefone idêntico");
    }

    // Determinar nível de confiança
    let confidenceLevel: "EXACT" | "HIGH" | "MEDIUM" | "LOW" =
      "LOW";
    if (score >= 95) {
      confidenceLevel = "EXACT";
    } else if (score >= 85) {
      confidenceLevel = "HIGH";
    } else if (score >= 70) {
      confidenceLevel = "MEDIUM";
    }

    return {
      agente_id_2: agente2.id,
      nome_2: agente2.nome,
      cpf_cnpj_2: agente2.cpf_cnpj,
      tipo_entidade_2: agente2.tipo_entidade,
      papel_2: agente2.papel,
      score: Math.min(score, 100),
      score_cpf_cnpj: scoreCpfCnpj,
      score_nome: scoreNome,
      score_endereco: scoreEndereco,
      confidence_level: confidenceLevel,
      motivos,
      detalhes: {
        tipo_match: tipoMatch,
        percentual_similaridade: score,
        diferenca_endereco: null,
      },
    };
  }

  /**
   * Registra uma suspeita de duplicata
   */
  registrarSuspeitaDuplicata(
    agenteId1: string,
    agenteId2: string,
    candidato: DuplicateAgentCandidate,
    usuarioId: string
  ): string {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas (
          agente_id_1, agente_id_2, score, motivo,
          score_cpf, score_nome, score_endereco,
          status, criado_por, criado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING id`
      );

      const motivo = candidato.motivos[0] || "Duplicata suspeita";
      const resultado = stmt.get(
        agenteId1,
        agenteId2,
        candidato.score,
        motivo,
        candidato.score_cpf_cnpj,
        candidato.score_nome,
        candidato.score_endereco,
        "pendente",
        usuarioId
      ) as { id: string };

      return resultado.id;
    } catch (erro) {
      console.error("Erro ao registrar suspeita de duplicata:", erro);
      throw erro;
    }
  }

  /**
   * Funde dois agentes (merge)
   * Mantém o agente primário e migra referências do duplicado
   */
  fundirAgentes(
    request: MergeAgentRequest,
    usuarioId: string
  ): MergeResult {
    const transaction = this.db.transaction(() => {
      try {
        // 1. Validar agentes
        const stmtGet = this.db.prepare(
          "SELECT * FROM agentes_economicos WHERE id = ?"
        );
        const agentePrimario = stmtGet.get(
          request.agente_primario_id
        ) as unknown;
        const agenteDuplicado = stmtGet.get(
          request.agente_duplicado_id
        ) as unknown;

        if (!agentePrimario || !agenteDuplicado) {
          throw new Error("Um ou ambos os agentes não encontrados");
        }

        const estadoAnterior = {
          agente_primario: agentePrimario,
          agente_duplicado: agenteDuplicado,
        };

        // 2. Contar referências antes da migração
        const totalAgentsMigrados = 1;
        let totalTransacoesMigradas = 0;

        // Migrar referências em ledger_entries (se houver coluna agente_id)
        try {
          const stmtLedger = this.db.prepare(
            `UPDATE ledger_entries
             SET agente_id = ?, atualizado_em = CURRENT_TIMESTAMP
             WHERE agente_id = ?`
          );
          stmtLedger.run(
            request.agente_primario_id,
            request.agente_duplicado_id
          );

          const changesLedger = this.db.exec(
            "SELECT changes() as count"
          ) as unknown;
          totalTransacoesMigradas = changesLedger[0]?.count || 0;
        } catch (e) {
          // Se a coluna não existir, ignorar
          console.log(
            "Nota: ledger_entries não possui coluna agente_id"
          );
        }

        // 3. Desativar agente duplicado
        const stmtUpdate = this.db.prepare(
          `UPDATE agentes_economicos
           SET ativo = false, atualizado_em = CURRENT_TIMESTAMP, atualizado_por = ?
           WHERE id = ?`
        );
        stmtUpdate.run(usuarioId, request.agente_duplicado_id);

        // 4. Registrar merge na tabela de duplicatas
        const stmtRegistro = this.db.prepare(
          `INSERT INTO agentes_duplicatas_suspeitas (
            agente_id_1, agente_id_2, score, motivo, status,
            analisado_em, analisado_por, decisao, criado_por, criado_em
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
          RETURNING id`
        );

        const registroMerge = stmtRegistro.get(
          request.agente_primario_id,
          request.agente_duplicado_id,
          100,
          "Merge aprovado",
          "mesclada",
          usuarioId,
          `Fundidos em ${new Date().toISOString()}`,
          usuarioId
        ) as { id: string };

        // 5. Criar audit trail
        const auditId = this._criarAuditTrail(
          "MERGE",
          request.agente_primario_id,
          request.agente_duplicado_id,
          estadoAnterior,
          {
            agente_primario: agentePrimario,
            agente_duplicado: { ...agenteDuplicado, ativo: false },
          },
          usuarioId,
          request.motivo
        );

        return {
          id: registroMerge.id,
          sucesso: true,
          agente_primario_id: request.agente_primario_id,
          agente_duplicado_id: request.agente_duplicado_id,
          agentes_migrados: totalAgentsMigrados,
          transacoes_migradas: totalTransacoesMigradas,
          audit_trail: auditId,
          timestamp: new Date().toISOString(),
        };
      } catch (erro) {
        console.error("Erro ao fundir agentes:", erro);
        throw erro;
      }
    });

    return transaction();
  }

  /**
   * Desfaz um merge (restaura agente duplicado)
   */
  desfazerMerge(
    idMerge: string,
    usuarioId: string
  ): MergeResult {
    const transaction = this.db.transaction(() => {
      try {
        // 1. Buscar registro do merge
        const stmtGet = this.db.prepare(
          "SELECT * FROM agentes_duplicatas_suspeitas WHERE id = ? AND status = 'mesclada'"
        );
        const registroMerge = stmtGet.get(idMerge) as unknown;

        if (!registroMerge) {
          throw new Error("Merge não encontrado ou já desfeito");
        }

        // 2. Buscar trail de auditoria
        const stmtTrail = this.db.prepare(
          `SELECT * FROM agentes_duplicatas_audit_trail
           WHERE id = ? AND tipo_operacao = 'MERGE'
           ORDER BY criado_em DESC LIMIT 1`
        );
        const trail = stmtTrail.get(
          registroMerge.id
        ) as DuplicataAuditTrail;

        if (!trail) {
          throw new Error(
            "Auditoria de merge não encontrada"
          );
        }

        // 3. Restaurar agente duplicado
        const stmtRestore = this.db.prepare(
          `UPDATE agentes_economicos
           SET ativo = true, atualizado_em = CURRENT_TIMESTAMP, atualizado_por = ?
           WHERE id = ?`
        );
        stmtRestore.run(
          usuarioId,
          registroMerge.agente_id_2
        );

        // 4. Reverter migração de referências
        try {
          const stmtLedgerRev = this.db.prepare(
            `UPDATE ledger_entries
             SET agente_id = ?, atualizado_em = CURRENT_TIMESTAMP
             WHERE agente_id = ?`
          );
          stmtLedgerRev.run(
            registroMerge.agente_id_2,
            registroMerge.agente_id_1
          );
        } catch (e) {
          // Ignorar se coluna não existir
        }

        // 5. Atualizar status do merge
        const stmtUpdate = this.db.prepare(
          `UPDATE agentes_duplicatas_suspeitas
           SET status = 'refutada', analisado_em = CURRENT_TIMESTAMP, analisado_por = ?
           WHERE id = ?`
        );
        stmtUpdate.run(usuarioId, idMerge);

        // 6. Criar novo trail para UNMERGE
        const unmergeId = this._criarAuditTrail(
          "UNMERGE",
          registroMerge.agente_id_1,
          registroMerge.agente_id_2,
          trail.estado_posterior,
          trail.estado_anterior,
          usuarioId,
          `Desfazendo merge ${idMerge}`
        );

        return {
          id: unmergeId,
          sucesso: true,
          agente_primario_id: registroMerge.agente_id_1,
          agente_duplicado_id: registroMerge.agente_id_2,
          agentes_migrados: 1,
          transacoes_migradas: 0,
          audit_trail: unmergeId,
          timestamp: new Date().toISOString(),
        };
      } catch (erro) {
        console.error("Erro ao desfazer merge:", erro);
        throw erro;
      }
    });

    return transaction();
  }

  /**
   * Aprova uma suspeita de duplicata sem fazer merge automático
   */
  aprovarDuplicata(
    idDuplicata: string,
    usuarioId: string,
    decisao: string
  ): void {
    try {
      const stmt = this.db.prepare(
        `UPDATE agentes_duplicatas_suspeitas
         SET status = 'confirmada', analisado_em = CURRENT_TIMESTAMP,
             analisado_por = ?, decisao = ?
         WHERE id = ?`
      );
      stmt.run(usuarioId, decisao, idDuplicata);
    } catch (erro) {
      console.error("Erro ao aprovar duplicata:", erro);
      throw erro;
    }
  }

  /**
   * Rejeita uma suspeita de duplicata
   */
  rejeitarDuplicata(
    idDuplicata: string,
    usuarioId: string,
    motivo: string
  ): void {
    try {
      const stmt = this.db.prepare(
        `UPDATE agentes_duplicatas_suspeitas
         SET status = 'refutada', analisado_em = CURRENT_TIMESTAMP,
             analisado_por = ?, decisao = ?
         WHERE id = ?`
      );
      stmt.run(usuarioId, motivo, idDuplicata);
    } catch (erro) {
      console.error("Erro ao rejeitar duplicata:", erro);
      throw erro;
    }
  }

  /**
   * Busca duplicatas para análise manual
   */
  buscarDuplicatasParaRevisao(
    status: "pendente" | "confirmada" = "pendente",
    limite: number = 50
  ): unknown[] {
    try {
      const stmt = this.db.prepare(
        `SELECT
          d.id,
          d.agente_id_1,
          a1.nome as agente_1_nome,
          a1.cpf_cnpj as agente_1_cpf_cnpj,
          d.agente_id_2,
          a2.nome as agente_2_nome,
          a2.cpf_cnpj as agente_2_cpf_cnpj,
          d.score,
          d.motivo,
          d.score_cpf,
          d.score_nome,
          d.score_email,
          d.score_telefone,
          d.score_endereco,
          d.status,
          d.criado_em
        FROM agentes_duplicatas_suspeitas d
        JOIN agentes_economicos a1 ON d.agente_id_1 = a1.id
        JOIN agentes_economicos a2 ON d.agente_id_2 = a2.id
        WHERE d.status = ?
        ORDER BY d.score DESC
        LIMIT ?`
      );

      return stmt.all(status, limite) as unknown[];
    } catch (erro) {
      console.error("Erro ao buscar duplicatas para revisão:", erro);
      throw erro;
    }
  }

  /**
   * Cria entrada de auditoria
   */
  private _criarAuditTrail(
    tipo: "MERGE" | "UNMERGE" | "REVIEW",
    agentePrimarIoId: string,
    agenteSecundarioId: string,
    estadoAnterior: Record<string, any>,
    estadoPosterior: Record<string, any>,
    usuarioId: string,
    descricao: string
  ): string {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO agentes_duplicatas_audit_trail (
          tipo_operacao, agente_primario_id, agente_secundario_id,
          estado_anterior, estado_posterior, criado_por, criado_em, descricao
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        RETURNING id`
      );

      const resultado = stmt.get(
        tipo,
        agentePrimarIoId,
        agenteSecundarioId,
        JSON.stringify(estadoAnterior),
        JSON.stringify(estadoPosterior),
        usuarioId,
        descricao
      ) as { id: string };

      return resultado.id;
    } catch (erro) {
      console.error("Erro ao criar audit trail:", erro);
      throw erro;
    }
  }
}

// =====================================================================
// SERVIÇO DE DEDUPLICAÇÃO DE TRANSAÇÕES
// =====================================================================

export class TransacoesDeduplicacaoService {
  constructor(private db: Database) {}

  /**
   * Verifica se uma transação é duplicata de outra
   * Critérios: agente_id + valor + data + descrição
   */
  isDuplicate(
    novaTransacao: {
      agente_id?: string;
      valor: number;
      data: string;
      descricao: string;
    },
    usuarioId: string,
    janelaDias: number = 3
  ): {
    isDuplicate: boolean;
    transacao_id?: string;
    score: number;
    motivo?: string;
  } {
    try {
      // Buscar transações similares (mesma data ± janela, valor similar, descrição similar)
      const stmt = this.db.prepare(
        `SELECT
          id, agente_id, valor, data, descricao,
          abs(julianday(?) - julianday(data)) as dias_diff,
          abs(? - CAST(valor AS REAL)) / abs(CAST(valor AS REAL) + 0.01) as valor_diff_pct
        FROM ledger_entries
        WHERE usuario_id = ?
        AND abs(julianday(?) - julianday(data)) <= ?
        AND abs(CAST(valor AS REAL) - ?) / abs(CAST(valor AS REAL) + 0.01) <= 0.05
        ORDER BY abs(julianday(?) - julianday(data)) ASC,
                 abs(CAST(valor AS REAL) - ?) ASC
        LIMIT 10`
      );

      const candidatos = stmt.all(
        novaTransacao.data,
        novaTransacao.valor,
        usuarioId,
        novaTransacao.data,
        janelaDias,
        novaTransacao.valor,
        novaTransacao.data,
        novaTransacao.valor
      ) as unknown[];

      if (candidatos.length === 0) {
        return {
          isDuplicate: false,
          score: 0,
        };
      }

      // Calcular score de duplicata para o melhor candidato
      const melhor = candidatos[0];

      let score = 0;

      // Score por data (max 30 pontos)
      if (melhor.dias_diff === 0) {
        score += 30;
      } else if (melhor.dias_diff === 1) {
        score += 25;
      } else if (melhor.dias_diff <= 2) {
        score += 15;
      } else {
        score += 5;
      }

      // Score por valor (max 40 pontos)
      if (melhor.valor_diff_pct === 0) {
        score += 40;
      } else if (melhor.valor_diff_pct <= 0.01) {
        score += 38;
      } else if (melhor.valor_diff_pct <= 0.03) {
        score += 35;
      } else if (melhor.valor_diff_pct <= 0.05) {
        score += 30;
      }

      // Score por descrição (max 30 pontos)
      const similaridadeDescricao = calcularSimilaridade(
        novaTransacao.descricao,
        melhor.descricao
      );

      if (similaridadeDescricao >= 0.95) {
        score += 30;
      } else if (similaridadeDescricao >= 0.85) {
        score += 25;
      } else if (similaridadeDescricao >= 0.75) {
        score += 20;
      } else if (similaridadeDescricao >= 0.65) {
        score += 12;
      } else if (similaridadeDescricao >= 0.50) {
        score += 5;
      }

      const isDuplicate = score >= 80;

      return {
        isDuplicate,
        transacao_id: melhor.id,
        score: Math.min(score, 100),
        motivo: isDuplicate
          ? `Duplicata potencial (score: ${score})`
          : undefined,
      };
    } catch (erro) {
      console.error("Erro ao verificar duplicata de transação:", erro);
      return {
        isDuplicate: false,
        score: 0,
      };
    }
  }
}
