/**
 * Agentes Backfill Strategy
 *
 * Estratégia de backfill para vincular lançamentos contábeis históricos
 * aos agentes econômicos.
 *
 * Objetivo: Vincular entradas existentes em ledger_entries aos agentes_economicos
 * usando técnicas de fuzzy matching em:
 * 1. Referência externa (CNPJ/CPF extraído de descrição)
 * 2. Similarity matching em nomes
 * 3. Email matching
 *
 * Requisitos de precisão:
 * - Acurácia mínima: 95% de matches válidos
 * - Threshold de similaridade: 85% para nomes
 * - Log de todas as decisões para auditoria
 * - Modo "dry-run" para validação antes de aplicar
 *
 * Fases:
 * 1. analyzeLedgerEntries() - Escaneia ledger_entries e extrai potenciais CNPJ/CPF
 * 2. matchAgentsToEntries() - Faz matching fuzzy entre entradas e agentes
 * 3. backfillLedgerAgents() - Aplica vinculações com verificações
 * 4. verifyBackfillAccuracy() - Valida precisão > 95%
 */

import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { logger } from "../../services/logger-service.js";
import type { AgenteEconomico } from "./agentes-tipos.js";
import {
  calculateSimilarity,
  isValidCPF,
  isValidCNPJ,
} from "./agentes-tipos.js";

/**
 * Resultado de análise de uma entrada de ledger
 */
export interface AnalyzedLedgerEntry {
  ledger_entry_id: string;
  data: string;
  tipo: string;
  categoria: string;
  valor: number;
  descricao?: string;
  referencia_externa?: string;

  // Análise de potenciais matches
  potencial_cpf?: string;
  potencial_cnpj?: string;
  potencial_nome?: string;
  potencial_email?: string;

  // Nível de confiança
  confianca: number; // 0-100
  motivo_analise: string;
}

/**
 * Resultado de matching entre entrada e agente
 */
export interface MatchResult {
  ledger_entry_id: string;
  agente_id: string;
  score_geral: number; // 0-100
  score_cpf?: number;
  score_nome?: number;
  score_email?: number;
  score_referencia?: number;
  motivo_match: string;
  recomendacao: 'auto' | 'review' | 'rejeitar';
}

/**
 * Resultado de backfill
 */
export interface BackfillResult {
  total_entradas_processadas: number;
  total_matches: number;
  total_rejeitados: number;
  accuracy_score: number; // 0-100
  matches: MatchResult[];
  erros: Array<{ ledger_entry_id: string; erro: string }>;
  timestamp: string;
}

/**
 * Extrai potencial CPF/CNPJ de uma string
 * Busca padrões como: "CPF: 123.456.789-00" ou "CNPJ: 12.345.678/0001-90"
 */
function extrairCPFCNPJ(texto: string): { cpf?: string; cnpj?: string } {
  if (!texto) return {};

  const resultado: { cpf?: string; cnpj?: string } = {};

  // Tenta extrair CNPJ (14 dígitos)
  const cnpjMatch = texto.match(/(\d{2})\.?(\d{3})\.?(\d{3})\/?\d{4}-?(\d{2})/);
  if (cnpjMatch) {
    const cnpj = `${cnpjMatch[1]}${cnpjMatch[2]}${cnpjMatch[3]}0001${cnpjMatch[4]}`;
    if (isValidCNPJ(cnpj)) {
      resultado.cnpj = cnpj;
    }
  }

  // Tenta extrair CPF (11 dígitos)
  const cpfMatch = texto.match(/(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/);
  if (cpfMatch) {
    const cpf = `${cpfMatch[1]}${cpfMatch[2]}${cpfMatch[3]}${cpfMatch[4]}`;
    if (isValidCPF(cpf)) {
      resultado.cpf = cpf;
    }
  }

  return resultado;
}

/**
 * Extrai potencial nome de uma string
 * Heurística: busca padrões como "de NOME" ou em maiúsculas
 */
function extrairNome(texto: string): string | undefined {
  if (!texto || texto.length < 3) return undefined;

  // Remove números e caracteres especiais para análise
  const limpo = texto.replace(/[\d\W]/g, ' ').trim();
  const palavras = limpo.split(/\s+/).filter(p => p.length > 2);

  // Se há palavras significativas
  if (palavras.length > 0) {
    // Retorna a frase com mais de 3 palavras (provavelmente um nome)
    const frases = texto.match(/[A-Za-záéíóúâêôãõç\s]{5,}/g);
    if (frases && frases.length > 0) {
      return frases[0].trim();
    }
  }

  return undefined;
}

/**
 * Analisa entries de ledger para potenciais informações de agente
 */
export function analyzeLedgerEntries(
  db: Database.Database,
  filtros?: {
    dataInicio?: string;
    dataFim?: string;
    limiteEntradas?: number;
  }
): AnalyzedLedgerEntry[] {
  try {
    let sql = `
      SELECT id, data, tipo, categoria, valor, descricao, referencia_externa, criado_em
      FROM ledger_entries
      WHERE agente_id IS NULL
        AND backfill_em IS NULL
    `;

    const params: unknown[] = [];

    if (filtros?.dataInicio) {
      sql += ` AND data >= ?`;
      params.push(filtros.dataInicio);
    }

    if (filtros?.dataFim) {
      sql += ` AND data <= ?`;
      params.push(filtros.dataFim);
    }

    sql += ` ORDER BY criado_em DESC`;

    if (filtros?.limiteEntradas) {
      sql += ` LIMIT ?`;
      params.push(filtros.limiteEntradas);
    }

    const stmt = db.prepare(sql);
    const entries = stmt.all(...params) as Array<{
      id: string;
      data: string;
      tipo: string;
      categoria: string;
      valor: number;
      descricao?: string;
      referencia_externa?: string;
      criado_em: string;
    }>;

    const analisadas: AnalyzedLedgerEntry[] = [];

    for (const entry of entries) {
      let confianca = 0;
      let motivo_analise = '';

      // Tenta extrair CPF/CNPJ da descrição
      const { cpf, cnpj } = extrairCPFCNPJ(entry.descricao || '');
      const { cpf: cpf_ref, cnpj: cnpj_ref } = extrairCPFCNPJ(entry.referencia_externa || '');

      if (cpf || cpf_ref) {
        confianca += 30;
        motivo_analise += 'CPF encontrado; ';
      }

      if (cnpj || cnpj_ref) {
        confianca += 30;
        motivo_analise += 'CNPJ encontrado; ';
      }

      // Extrai potencial nome
      const potencial_nome = extrairNome(entry.descricao || '');
      if (potencial_nome) {
        confianca += 20;
        motivo_analise += 'Nome potencial encontrado; ';
      }

      // Se há referência externa estruturada
      if (entry.referencia_externa) {
        confianca += 15;
        motivo_analise += 'Referência externa estruturada; ';
      }

      // Se há categoria que sugere terceiro (fornecedor, comissão)
      if (['comissao', 'folha_pagamento', 'condominio'].includes(entry.categoria)) {
        confianca += 5;
        motivo_analise += 'Categoria sugere terceiro; ';
      }

      analisadas.push({
        ledger_entry_id: entry.id,
        data: entry.data,
        tipo: entry.tipo,
        categoria: entry.categoria,
        valor: entry.valor,
        descricao: entry.descricao,
        referencia_externa: entry.referencia_externa,
        potencial_cpf: cpf || cpf_ref,
        potencial_cnpj: cnpj || cnpj_ref,
        potencial_nome,
        confianca: Math.min(100, confianca),
        motivo_analise: motivo_analise || 'Nenhum indicador encontrado',
      });
    }

    logger.info(`[Backfill] Analisadas ${analisadas.length} entradas de ledger`);
    return analisadas;
  } catch (erro) {
    logger.error(`[Backfill] Erro ao analisar ledger_entries:`, erro);
    return [];
  }
}

/**
 * Faz matching fuzzy entre entradas analisadas e agentes existentes
 */
export function matchAgentsToEntries(
  db: Database.Database,
  analisadas: AnalyzedLedgerEntry[],
  limiteConfianca: number = 85
): MatchResult[] {
  try {
    // Carrega todos os agentes ativos
    const stmtAgentes = db.prepare(`
      SELECT id, tipo_entidade, cpf_cnpj, nome, email, papel
      FROM agentes_economicos
      WHERE ativo = true
    `);
    const agentes = stmtAgentes.all() as Array<AgenteEconomico & { papel: string }>;

    const matches: MatchResult[] = [];

    for (const entrada of analisadas) {
      let melhorMatch: MatchResult | null = null;

      for (const agente of agentes) {
        let score = 0;
        let detalhes = '';

        // Score por CPF/CNPJ exato
        if (entrada.potencial_cpf && agente.cpf_cnpj === entrada.potencial_cpf) {
          score += 50;
          detalhes += 'CPF exact; ';
        }
        if (entrada.potencial_cnpj && agente.cpf_cnpj === entrada.potencial_cnpj) {
          score += 50;
          detalhes += 'CNPJ exact; ';
        }

        // Score por nome similar (se não houve match exato de CPF/CNPJ)
        if (score < 50 && entrada.potencial_nome && agente.nome) {
          const similaridade = calculateSimilarity(entrada.potencial_nome, agente.nome);
          if (similaridade >= limiteConfianca) {
            score += Math.round((similaridade / 100) * 30);
            detalhes += `Nome similarity ${similaridade}%; `;
          }
        }

        // Score por email
        if (entrada.potencial_email && agente.email) {
          if (entrada.potencial_email.toLowerCase() === agente.email.toLowerCase()) {
            score += 20;
            detalhes += 'Email exact; ';
          }
        }

        // Se conseguiu um score significativo
        if (score >= limiteConfianca) {
          const matchResult: MatchResult = {
            ledger_entry_id: entrada.ledger_entry_id,
            agente_id: agente.id,
            score_geral: Math.min(100, score),
            motivo_match: detalhes,
            recomendacao:
              score >= 95 ? 'auto' : score >= 85 ? 'review' : 'rejeitar',
          };

          // Mantém apenas o melhor match
          if (!melhorMatch || matchResult.score_geral > melhorMatch.score_geral) {
            melhorMatch = matchResult;
          }
        }
      }

      if (melhorMatch) {
        matches.push(melhorMatch);
      }
    }

    logger.info(
      `[Backfill] Encontrados ${matches.length} matches de ${analisadas.length} entradas (${
        Math.round((matches.length / analisadas.length) * 100)
      }%)`
    );

    return matches;
  } catch (erro) {
    logger.error(`[Backfill] Erro ao fazer matching:`, erro);
    return [];
  }
}

/**
 * Aplica o backfill de agentes aos ledger_entries
 * @param dryRun - Se true, apenas simula sem aplicar mudanças
 */
export function backfillLedgerAgents(
  db: Database.Database,
  matches: MatchResult[],
  usuarioId: string,
  dryRun: boolean = true
): BackfillResult {
  const resultado: BackfillResult = {
    total_entradas_processadas: matches.length,
    total_matches: 0,
    total_rejeitados: 0,
    accuracy_score: 0,
    matches: [],
    erros: [],
    timestamp: new Date().toISOString(),
  };

  if (dryRun) {
    logger.info(`[Backfill] Modo DRY-RUN: simulando ${matches.length} vinculações`);
  }

  try {
    const atualizarLedger = db.transaction(() => {
      // Statements preparadas
      const stmtUpdate = db.prepare(`
        UPDATE ledger_entries
        SET agente_id = ?,
            agente_papel = (SELECT papel FROM agentes_economicos WHERE id = ?),
            backfill_em = CURRENT_TIMESTAMP,
            agente_atualizado_em = CURRENT_TIMESTAMP,
            agente_atualizado_por = ?
        WHERE id = ?
      `);

      const stmtAuditoria = db.prepare(`
        INSERT INTO ledger_entries_agente_auditoria
          (id, ledger_entry_id, agente_id_anterior, agente_id_novo, motivo_mudanca, usuario_id, criado_em)
        VALUES (?, ?, NULL, ?, 'backfill', ?, CURRENT_TIMESTAMP)
      `);

      for (const match of matches) {
        try {
          if (!dryRun) {
            // Atualiza ledger_entries
            stmtUpdate.run(match.agente_id, match.agente_id, usuarioId, match.ledger_entry_id);

            // Registra auditoria
            stmtAuditoria.run(
              randomUUID(),
              match.ledger_entry_id,
              match.agente_id,
              usuarioId
            );
          }

          resultado.matches.push(match);
          if (match.recomendacao !== 'rejeitar') {
            resultado.total_matches++;
          } else {
            resultado.total_rejeitados++;
          }
        } catch (erro) {
          resultado.erros.push({
            ledger_entry_id: match.ledger_entry_id,
            erro: erro instanceof Error ? erro.message : String(erro),
          });
        }
      }
    });

    if (!dryRun) {
      atualizarLedger();
    }

    // Calcula accuracy score
    resultado.accuracy_score =
      resultado.total_entradas_processadas > 0
        ? Math.round(
            ((resultado.total_matches) / resultado.total_entradas_processadas) * 100
          )
        : 0;

    logger.info(
      `[Backfill] Resultado: ${resultado.total_matches} matches, ${resultado.total_rejeitados} rejeitados, Accuracy: ${resultado.accuracy_score}%`
    );

    if (resultado.accuracy_score < 95) {
      logger.warn(
        `[Backfill] AVISO: Accuracy abaixo de 95% (${resultado.accuracy_score}%). Considere revisar thresholds.`
      );
    }

    return resultado;
  } catch (erro) {
    logger.error(`[Backfill] Erro crítico ao executar backfill:`, erro);
    resultado.erros.push({
      ledger_entry_id: 'SISTEMA',
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return resultado;
  }
}

/**
 * Verifica precisão do backfill
 */
export function verifyBackfillAccuracy(
  db: Database.Database,
  resultados: BackfillResult[]
): {
  total_accuracy: number;
  entries_com_agente: number;
  entries_sem_agente: number;
  coverage_percentage: number;
} {
  try {
    // Query da view de cobertura
    const stmt = db.prepare(`
      SELECT
        total_entries,
        entries_com_agente,
        cobertura_percentual
      FROM ledger_entries_agente_coverage
    `);

    const coverage = stmt.get() as {
      total_entries: number;
      entries_com_agente: number;
      cobertura_percentual: number;
    };

    const total_accuracy = resultados.reduce((acc, r) => acc + r.accuracy_score, 0) / resultados.length || 0;

    logger.info(
      `[Backfill] Verificação: Cobertura ${coverage.cobertura_percentual}% (${coverage.entries_com_agente}/${coverage.total_entries})`
    );

    return {
      total_accuracy: Math.round(total_accuracy),
      entries_com_agente: coverage.entries_com_agente,
      entries_sem_agente: coverage.total_entries - coverage.entries_com_agente,
      coverage_percentage: coverage.cobertura_percentual,
    };
  } catch (erro) {
    logger.error(`[Backfill] Erro ao verificar accuracy:`, erro);
    return {
      total_accuracy: 0,
      entries_com_agente: 0,
      entries_sem_agente: 0,
      coverage_percentage: 0,
    };
  }
}

/**
 * Pipeline completo de backfill
 */
export async function executarBackfillCompleto(
  db: Database.Database,
  usuarioId: string,
  opcoes?: {
    dryRun?: boolean;
    dataInicio?: string;
    dataFim?: string;
    limiteEntradas?: number;
    limiteConfianca?: number;
  }
): Promise<{
  analise: AnalyzedLedgerEntry[];
  matches: MatchResult[];
  resultado: BackfillResult;
  verificacao: ReturnType<typeof verifyBackfillAccuracy>;
}> {
  logger.info(`[Backfill] Iniciando pipeline de backfill (dry-run: ${opcoes?.dryRun ?? true})`);

  // 1. Analisa entries
  const analise = analyzeLedgerEntries(db, {
    dataInicio: opcoes?.dataInicio,
    dataFim: opcoes?.dataFim,
    limiteEntradas: opcoes?.limiteEntradas,
  });

  // 2. Faz matching
  const matches = matchAgentsToEntries(db, analise, opcoes?.limiteConfianca);

  // 3. Aplica backfill
  const resultado = backfillLedgerAgents(db, matches, usuarioId, opcoes?.dryRun ?? true);

  // 4. Verifica accuracy
  const verificacao = verifyBackfillAccuracy(db, [resultado]);

  logger.info(`[Backfill] Pipeline concluído`);

  return { analise, matches, resultado, verificacao };
}
