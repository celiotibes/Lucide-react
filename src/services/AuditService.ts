/**
 * Audit Service
 * Gerencia logs de auditoria com conformidade Lei 12.682/2012
 * Implementa retry logic, integridade criptográfica e alertas de falha
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

export class AuditService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 100;

  constructor(private supabase: SupabaseClient) {}

  /**
   * Registrar ação no audit log com retry e validação
   * Lança exceção se falhar após retries (não falha silenciosa)
   * Lei 12.682/2012: Exige que TODAS operações sejam auditadas
   */
  async logAuditWithRetry(
    entityId: string,
    entityType: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        await this.insertAuditLog(entityId, entityType, action, metadata);
        return; // Sucesso
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[AUDIT RETRY ${attempt + 1}/${this.MAX_RETRIES}] Falha ao registrar auditoria: ${lastError.message}`
        );

        // Esperar antes de tentar novamente (exponential backoff)
        if (attempt < this.MAX_RETRIES - 1) {
          await this.delay(this.RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    // Se chegou aqui, falhou após todas as tentativas
    const errorMessage = `[CRITICAL AUDIT FAILURE] Falha ao registrar auditoria após ${this.MAX_RETRIES} tentativas. Entidade: ${entityId}, Ação: ${action}. Erro: ${lastError?.message}`;
    console.error(errorMessage);

    // Registrar falha de auditoria (meta-audit)
    await this.logAuditFailure(entityId, action, lastError);

    // Lançar exceção - o caller deve decidir se continua ou aborta
    throw new Error(errorMessage);
  }

  /**
   * Inserir log de auditoria com hash chain
   * Private - chamado por logAuditWithRetry com retry logic
   */
  private async insertAuditLog(
    entityId: string,
    entityType: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    // Gerar hash do evento (Lei 12.682/2012 - integridade criptográfica)
    const eventData = JSON.stringify({
      entityId,
      entityType,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    });
    const hash = createHash('sha256').update(eventData).digest('hex');

    // Buscar o último hash (para chain de integridade)
    const { data: lastLog, error: queryError } = await this.supabase
      .from('audit_logs')
      .select('hash')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (queryError) {
      throw new Error(`Falha ao buscar hash anterior: ${queryError.message}`);
    }

    const previousHash = lastLog && lastLog.length > 0 ? lastLog[0].hash : null;

    // Inserir novo log (append-only)
    const { error: insertError } = await this.supabase
      .from('audit_logs')
      .insert([
        {
          id: randomUUID(),
          entity_id: entityId,
          entity_type: entityType,
          action,
          metadata,
          hash,
          previous_hash: previousHash,
          created_at: new Date().toISOString(),
        },
      ]);

    if (insertError) {
      throw new Error(`Falha ao inserir log: ${insertError.message}`);
    }
  }

  /**
   * Registrar falha de auditoria (meta-audit)
   * Tenta registrar se a auditoria principal falhou
   */
  private async logAuditFailure(
    entityId: string,
    action: string,
    error: Error | null
  ): Promise<void> {
    try {
      await this.supabase.from('audit_logs_meta').insert([
        {
          id: randomUUID(),
          audit_log_id: randomUUID(), // Placeholder - não tem log_id correspondente
          change_type: 'audit_failure',
          detected_at: new Date().toISOString(),
          details: {
            entity_id: entityId,
            action,
            error: error?.message,
            timestamp: new Date().toISOString(),
          },
        },
      ]);
    } catch (metaError) {
      console.error(
        '[META AUDIT FAILURE] Falha ao registrar falha de auditoria:',
        metaError
      );
    }
  }

  /**
   * Verificar integridade da chain de hash
   * Detecta tampering ou corrupção
   */
  async verifyAuditIntegrity(entityId: string): Promise<{
    valid: boolean;
    breaches: number;
  }> {
    const { data: logs, error } = await this.supabase
      .from('audit_logs_integrity')
      .select('id, chain_status')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Falha ao verificar integridade: ${error.message}`);
    }

    const breaches = logs?.filter((log) => log.chain_status === 'INTEGRITY_VIOLATION').length || 0;

    return {
      valid: breaches === 0,
      breaches,
    };
  }

  /**
   * Exportar trail de auditoria para arquivo (conformidade regulatória)
   */
  async exportAuditTrail(entityId: string): Promise<string> {
    const { data: logs, error } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Falha ao exportar trail: ${error.message}`);
    }

    return JSON.stringify(logs, null, 2);
  }

  /**
   * Helper: delay para retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
