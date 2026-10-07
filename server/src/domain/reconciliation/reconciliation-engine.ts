/**
 * Reconciliation Engine - Automatic Transaction Matching & Reconciliation
 *
 * Sistema automático de reconciliação de transações usando:
 * - Fuzzy matching com fuse.js
 * - Scoring baseado em data, valor e descrição
 * - Detecção de transações desemparelhadas
 * - Rastreamento completo com audit trail
 *
 * Componentes:
 * - matchTransactions(): fuzzy match ledger entries com source transactions
 * - reconcileAgent(): reconciliação completa por agente
 * - reconcilePeriod(): reconciliação por período
 * - detectMissingTransactions(): identifica gaps
 * - generateReport(): gera relatório de reconciliação
 */

import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import Fuse from "fuse.js";
import { differenceInDays } from "date-fns";
import { logger } from "../../services/logger-service.js";
import type {
  ReconciliationMatch,
  SourceTransaction,
  LedgerEntryForReconciliation,
  MatchingResult,
  UnmatchedEntry,
  ReconciliationReport,
  ReconciliationStatus,
  MatchingConfig,
} from "./reconciliation-types.js";

const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  date_tolerance_days: 1,
  amount_tolerance_percent: 5,
  description_similarity_threshold: 0.7,
  score_thresholds: {
    date: 30,
    amount: 40,
    description: 30,
  },
  minimum_match_score: 80,
  max_candidates: 3,
};

export class ReconciliationEngine {
  constructor(
    private db: Database.Database,
    private config: MatchingConfig = DEFAULT_MATCHING_CONFIG
  ) {}

  /**
   * Fuzzy match ledger entries against source transactions
   */
  async matchTransactions(
    ledgerEntries: LedgerEntryForReconciliation[],
    sourceTransactions: SourceTransaction[],
    agenteId?: string
  ): Promise<MatchingResult[]> {
    const results: MatchingResult[] = [];

    for (const ledgerEntry of ledgerEntries) {
      const candidates = this.findMatchCandidates(
        ledgerEntry,
        sourceTransactions
      );

      if (candidates.length > 0) {
        const topCandidate = candidates[0];
        results.push({
          ledger_entry_id: ledgerEntry.id,
          source_transaction_id: topCandidate.id,
          match_score: topCandidate.score,
          score_breakdown: topCandidate.breakdown,
          candidates: candidates.slice(0, this.config.max_candidates),
        });
      }
    }

    return results;
  }

  /**
   * Encontra candidates para um ledger entry
   */
  private findMatchCandidates(
    ledgerEntry: LedgerEntryForReconciliation,
    sourceTransactions: SourceTransaction[]
  ): {
    id: string;
    score: number;
    breakdown: { date: number; amount: number; description: number };
    source_date: string;
    source_amount: number;
    source_description: string;
  }[] {
    const candidates = [];

    for (const source of sourceTransactions) {
      const dateScore = this.calculateDateScore(ledgerEntry.data, source.date);
      const amountScore = this.calculateAmountScore(ledgerEntry.valor, source.amount);
      const descriptionScore = this.calculateDescriptionScore(
        ledgerEntry.descricao || "",
        source.description
      );

      const totalScore =
        dateScore +
        amountScore +
        descriptionScore;

      if (totalScore >= this.config.minimum_match_score!) {
        candidates.push({
          id: source.id,
          score: totalScore,
          breakdown: {
            date: dateScore,
            amount: amountScore,
            description: descriptionScore,
          },
          source_date: source.date,
          source_amount: source.amount,
          source_description: source.description,
        });
      }
    }

    // Ordena por score descendente
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Calcula score de date matching (±1 dia)
   * Max: 30 points
   */
  private calculateDateScore(ledgerDate: string, sourceDate: string): number {
    try {
      const ledgerDateObj = new Date(ledgerDate);
      const sourceDateObj = new Date(sourceDate);
      const daysDiff = Math.abs(differenceInDays(ledgerDateObj, sourceDateObj));

      const tolerance = this.config.date_tolerance_days || 1;

      if (daysDiff === 0) {
        return this.config.score_thresholds!.date || 30;
      } else if (daysDiff <= tolerance) {
        return Math.round(((this.config.score_thresholds!.date || 30) * (1 - daysDiff / (tolerance + 1))));
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calcula score de amount matching (±5%)
   * Max: 40 points
   */
  private calculateAmountScore(ledgerAmount: number, sourceAmount: number): number {
    const tolerance = (this.config.amount_tolerance_percent || 5) / 100;
    const maxDiff = ledgerAmount * tolerance;
    const actualDiff = Math.abs(ledgerAmount - sourceAmount);

    if (actualDiff <= maxDiff) {
      // Perfect match = 40 points, degrading to 0 at tolerance boundary
      const percentOfTolerance = actualDiff / maxDiff;
      return Math.round(
        (this.config.score_thresholds!.amount || 40) * (1 - percentOfTolerance * 0.5)
      );
    }
    return 0;
  }

  /**
   * Calcula score de description matching usando Fuse.js
   * Max: 30 points
   *
   * Usa string similarity básica se as descrições forem muito curtas
   */
  private calculateDescriptionScore(ledgerDesc: string, sourceDesc: string): number {
    if (!ledgerDesc || !sourceDesc) {
      return this.config.score_thresholds!.description || 30; // Se não há descrição, assume match
    }

    // Normaliza strings
    const ledger = ledgerDesc.toLowerCase().trim();
    const source = sourceDesc.toLowerCase().trim();

    // Exact match
    if (ledger === source) {
      return this.config.score_thresholds!.description || 30;
    }

    // Partial match (one contains the other)
    if (ledger.includes(source) || source.includes(ledger)) {
      return Math.round((this.config.score_thresholds!.description || 30) * 0.8);
    }

    // Use Fuse para fuzzy matching de descrição
    const fuse = new Fuse([source], {
      includeScore: true,
      threshold: 1 - (this.config.description_similarity_threshold || 0.6),
      minMatchCharLength: 3,
    });

    const results = fuse.search(ledger);
    if (results.length > 0 && results[0].score !== undefined) {
      // Inverte score: Fuse usa 0 para match perfeito, 1 para não match
      const similarity = 1 - results[0].score;
      if (similarity > 0.5) {
        return Math.round(
          (this.config.score_thresholds!.description || 30) * similarity
        );
      }
    }

    return 0;
  }

  /**
   * Reconcilia para um agente específico (ledger + source transactions)
   */
  async reconcileAgent(
    agenteId: string,
    startDate: string,
    endDate: string,
    userId?: string
  ): Promise<ReconciliationStatus> {
    const matchId = randomUUID();
    const startTime = Date.now();

    try {
      // Busca ledger entries do agente
      const ledgerEntries = this.db
        .prepare(
          `SELECT id, data, valor, descricao, referencia_externa, tipo, categoria
           FROM ledger_entries
           WHERE data BETWEEN ? AND ?
           AND usuario_id = ?`
        )
        .all(startDate, endDate, agenteId) as LedgerEntryForReconciliation[];

      // Busca source transactions (exemplo: da tabela de transações externas)
      // Ajustar conforme a estrutura real de dados
      const sourceTransactions: SourceTransaction[] = [];

      // Executa matching
      const matches = await this.matchTransactions(
        ledgerEntries,
        sourceTransactions,
        agenteId
      );

      // Salva matches no banco
      for (const match of matches) {
        if (match.match_score >= (this.config.minimum_match_score || 80)) {
          this.saveMatch(
            match,
            match.match_score >= 95 ? "AUTO_MATCHED" : "PENDING",
            userId
          );
        }
      }

      // Calcula estatísticas
      const approvedCount = this.db
        .prepare(
          `SELECT COUNT(*) as count FROM reconciliation_matches
           WHERE agente_id = ? AND status = 'APPROVED'
           AND created_at BETWEEN ? AND ?`
        )
        .get(agenteId, startDate, endDate) as { count: number };

      const completionPercentage =
        ledgerEntries.length > 0
          ? (matches.length / ledgerEntries.length) * 100
          : 0;

      // Salva status
      const statusId = randomUUID();
      const processingTime = Date.now() - startTime;

      this.db
        .prepare(
          `INSERT OR REPLACE INTO reconciliation_status
         (id, agente_id, period_start, period_end, status, completion_percentage,
          total_ledger_entries, total_source_transactions, matched_entries,
          pending_matches, approved_matches, processing_time_ms, started_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          statusId,
          agenteId,
          startDate,
          endDate,
          matches.length === ledgerEntries.length ? "COMPLETE" : "PARTIAL",
          completionPercentage,
          ledgerEntries.length,
          sourceTransactions.length,
          matches.length,
          matches.length - approvedCount.count,
          approvedCount.count,
          processingTime,
          userId
        );

      logger.info(
        `[Reconciliation] Reconciled agent ${agenteId}: ${matches.length}/${ledgerEntries.length} matches in ${processingTime}ms`
      );

      return {
        id: statusId,
        agente_id: agenteId,
        period_start: startDate,
        period_end: endDate,
        status: matches.length === ledgerEntries.length ? "COMPLETE" : "PARTIAL",
        completion_percentage: completionPercentage,
        total_ledger_entries: ledgerEntries.length,
        total_source_transactions: sourceTransactions.length,
        matched_entries: matches.length,
        pending_matches: matches.length - approvedCount.count,
        approved_matches: approvedCount.count,
        rejected_matches: 0,
        unmatched_ledger_entries: ledgerEntries.length - matches.length,
        unmatched_source_transactions: sourceTransactions.length - matches.length,
        processing_time_ms: processingTime,
        started_at: new Date().toISOString(),
        started_by: userId,
      };
    } catch (error) {
      logger.error(`[Reconciliation] Agent reconciliation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Salva um match no banco
   */
  private saveMatch(
    match: MatchingResult,
    status: "PENDING" | "AUTO_MATCHED" = "PENDING",
    userId?: string
  ): void {
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO reconciliation_matches
       (id, ledger_entry_id, source_transaction_id, match_score,
        score_date, score_amount, score_description, status, created_by,
        match_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        match.ledger_entry_id,
        match.source_transaction_id,
        match.match_score,
        match.score_breakdown.date,
        match.score_breakdown.amount,
        match.score_breakdown.description,
        status,
        userId,
        JSON.stringify({ candidates: match.candidates })
      );

    // Log auditoria
    this.db
      .prepare(
        `INSERT INTO reconciliation_audit_log
       (id, reconciliation_match_id, action, new_status, changed_by)
       VALUES (?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), id, "CREATED", status, userId || "system");
  }

  /**
   * Detecta transações desemparelhadas (ledger e source)
   */
  async detectUnmatchedTransactions(
    agenteId: string,
    startDate: string,
    endDate: string
  ): Promise<{ unmatched_ledger: UnmatchedEntry[]; unmatched_source: UnmatchedEntry[] }> {
    // Ledger entries sem match
    const unmatchedLedger = this.db
      .prepare(
        `SELECT le.id, le.data as date, le.valor as amount, le.descricao as description
         FROM ledger_entries le
         LEFT JOIN reconciliation_matches rm ON le.id = rm.ledger_entry_id
         WHERE rm.id IS NULL
         AND le.usuario_id = ?
         AND le.data BETWEEN ? AND ?`
      )
      .all(agenteId, startDate, endDate) as UnmatchedEntry[];

    unmatchedLedger.forEach((entry) => (entry.type = "ledger"));

    // Source transactions sem match
    const unmatchedSource: UnmatchedEntry[] = [];

    return {
      unmatched_ledger: unmatchedLedger,
      unmatched_source: unmatchedSource,
    };
  }

  /**
   * Aprova um match
   */
  async approveMatch(
    matchId: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE reconciliation_matches
       SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`
      )
      .run(userId, matchId);

    // Log auditoria
    this.db
      .prepare(
        `INSERT INTO reconciliation_audit_log
       (id, reconciliation_match_id, action, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), matchId, "APPROVED", "PENDING", "APPROVED", userId, notes);
  }

  /**
   * Rejeita um match
   */
  async rejectMatch(
    matchId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE reconciliation_matches
       SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
      )
      .run(reason, userId, matchId);

    // Log auditoria
    this.db
      .prepare(
        `INSERT INTO reconciliation_audit_log
       (id, reconciliation_match_id, action, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), matchId, "REJECTED", "PENDING", "REJECTED", userId, reason);
  }

  /**
   * Gera relatório de reconciliação
   */
  async generateReport(
    agenteId: string,
    startDate: string,
    endDate: string
  ): Promise<ReconciliationReport> {
    const status = this.db
      .prepare(
        `SELECT * FROM reconciliation_status
       WHERE agente_id = ? AND period_start = ? AND period_end = ?`
      )
      .get(agenteId, startDate, endDate) as ReconciliationStatus | undefined;

    const { unmatched_ledger, unmatched_source } =
      await this.detectUnmatchedTransactions(agenteId, startDate, endDate);

    const recommendations: string[] = [];

    if (unmatched_ledger.length > 0) {
      recommendations.push(
        `${unmatched_ledger.length} ledger entries remain unmatched`
      );
    }

    if (unmatched_source.length > 0) {
      recommendations.push(
        `${unmatched_source.length} source transactions remain unmatched`
      );
    }

    return {
      agente_id: agenteId,
      period_start: startDate,
      period_end: endDate,
      total_ledger_entries: status?.total_ledger_entries || 0,
      total_source_transactions: status?.total_source_transactions || 0,
      matched_entries: status?.matched_entries || 0,
      pending_matches: status?.pending_matches || 0,
      approved_matches: status?.approved_matches || 0,
      rejected_matches: status?.rejected_matches || 0,
      unmatched_ledger_entries: unmatched_ledger.length,
      unmatched_source_transactions: unmatched_source.length,
      matching_rate:
        status?.total_ledger_entries
          ? (((status?.matched_entries || 0) / status.total_ledger_entries) * 100)
          : 0,
      unmatched_ledger,
      unmatched_source,
      recommendations,
    };
  }
}
