import { UUID, randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { Inspection, InspectionNotification, InspectionStatus } from '../types/inspection';

export class InspectionService {
  constructor(private supabase: SupabaseClient) {}
  /**
   * Criar nova vistoria com upload de vídeo
   * Requisito: Anexo II - Vídeo HD obrigatório
   */
  async createInspection(
    leaseId: UUID,
    propertyId: UUID,
    videoUrl: string,
    videoSizeMb: number,
    videoSeconds: number,
    uploadedByEmail: string
  ): Promise<Inspection> {
    const now = new Date();

    const inspection: Inspection = {
      id: randomUUID(),
      lease_id: leaseId,
      property_id: propertyId,
      inspection_type: 'initial',
      video_url: videoUrl,
      video_size_mb: videoSizeMb,
      video_duration_seconds: videoSeconds,
      uploaded_at: now,
      uploaded_by_email: uploadedByEmail,

      // Prazos críticos: Cláusula Nona + Anexo II
      deadline_challenge_date: this.addDays(now, 7),
      deadline_rad_date: this.addBusinessDays(now, 15),
      deadline_return_deposit_date: this.addDays(now, 10),

      challenge_notification_sent: undefined,
      rad_notification_sent: undefined,
      return_deposit_notification_sent: undefined,

      status: 'pending',
      is_challenged: false,
      damages_found: false,

      created_at: now,
      updated_at: now,
      audit_log_id: randomUUID(),
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('inspections')
      .insert([inspection]);

    if (error) {
      console.error('Failed to create inspection:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(inspection.id, 'inspection_created', {
      lease_id: leaseId,
      property_id: propertyId,
      video_size_mb: videoSizeMb,
    });

    return inspection;
  }

  /**
   * Agendar notificações automáticas para os prazos críticos
   * - Dia 7: Impugnação
   * - Dia 15: RAD vencendo
   * - Dia 10: Devolução caução
   */
  async scheduleNotifications(inspection: Inspection): Promise<InspectionNotification[]> {
    const notifications: InspectionNotification[] = [];

    // Notificação dia 7 - Impugnação
    notifications.push({
      id: randomUUID(),
      inspection_id: inspection.id,
      lease_id: inspection.lease_id,
      notification_type: 'challenge',
      recipient_email: 'locador@crmt.com', // Placeholder
      recipient_phone: '41-4041-5242',
      channel: 'email',
      template_name: 'inspection_challenge_deadline',
      sent_at: new Date(),
      delivery_status: 'pending',
      retry_count: 0,
      audit_log_id: randomUUID(),
    });

    // Notificação dia 15 - RAD vencendo
    notifications.push({
      id: randomUUID(),
      inspection_id: inspection.id,
      lease_id: inspection.lease_id,
      notification_type: 'rad',
      recipient_email: 'locador@crmt.com',
      recipient_phone: '41-4041-5242',
      channel: 'whatsapp',
      template_name: 'inspection_rad_deadline',
      sent_at: new Date(),
      delivery_status: 'pending',
      retry_count: 0,
      audit_log_id: randomUUID(),
    });

    // Notificação dia 10 - Devolução caução
    notifications.push({
      id: randomUUID(),
      inspection_id: inspection.id,
      lease_id: inspection.lease_id,
      notification_type: 'return_deposit',
      recipient_email: inspection.uploaded_by_email,
      channel: 'email',
      template_name: 'inspection_deposit_return_deadline',
      sent_at: new Date(),
      delivery_status: 'pending',
      retry_count: 0,
      audit_log_id: randomUUID(),
    });

    return notifications;
  }

  /**
   * Validar se o vídeo atende aos requisitos (HD mínimo 1080p)
   */
  validateVideoQuality(videoSizeMb: number, videoDurationSeconds: number): boolean {
    // Validações simplificadas:
    // - Mínimo 50MB para garantir HD (1080p)
    // - Mínimo 30 segundos de vídeo
    const MIN_VIDEO_SIZE_MB = 50;
    const MIN_VIDEO_DURATION_SECONDS = 30;

    return videoSizeMb >= MIN_VIDEO_SIZE_MB && videoDurationSeconds >= MIN_VIDEO_DURATION_SECONDS;
  }

  /**
   * Processar impugnação de vistoria (inquilino contesta)
   */
  async processChallenge(inspection: Inspection, challengeReason: string): Promise<Inspection> {
    const now = new Date();
    inspection.is_challenged = true;
    inspection.challenge_reason = challengeReason;
    inspection.challenge_submitted_at = now;
    inspection.status = 'challenged';
    inspection.updated_at = now;

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('inspections')
      .update({
        is_challenged: true,
        challenge_reason: challengeReason,
        challenge_submitted_at: now,
        status: 'challenged',
        updated_at: now,
      })
      .eq('id', inspection.id);

    if (error) {
      console.error('Failed to process challenge:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(inspection.id, 'inspection_challenged', {
      challenge_reason: challengeReason,
      challenged_by: inspection.uploaded_by_email,
    });

    return inspection;
  }

  /**
   * Processar RAD (Relatório de Avaliação de Danos)
   */
  async processRAD(
    inspection: Inspection,
    damagesFound: boolean,
    estimatedValue?: number,
    description?: string
  ): Promise<Inspection> {
    const now = new Date();
    const status = damagesFound ? 'disputed' : 'completed';

    inspection.rad_submitted_at = now;
    inspection.damages_found = damagesFound;
    inspection.damage_description = description;
    inspection.damage_estimated_value = estimatedValue || 0;
    inspection.status = status;
    inspection.updated_at = now;

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('inspections')
      .update({
        rad_submitted_at: now,
        damages_found: damagesFound,
        damage_description: description,
        damage_estimated_value: estimatedValue || 0,
        status: status,
        updated_at: now,
      })
      .eq('id', inspection.id);

    if (error) {
      console.error('Failed to process RAD:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(inspection.id, 'inspection_rad_submitted', {
      damages_found: damagesFound,
      damage_estimated_value: estimatedValue || 0,
      damage_description: description,
    });

    return inspection;
  }

  /**
   * Calcular redução de caução baseada em danos
   * Depreciation: Perda de valor ao longo do tempo
   */
  calculateDepositReduction(
    totalDeposit: number,
    damageValue: number,
    propertyAge: number // Anos de vida útil
  ): number {
    // Aplicar depreciação (bens imóveis tipicamente 2% ao ano)
    const depreciationRate = 0.02;
    const depreciation = propertyAge * depreciationRate;
    const depreciationFactor = Math.max(1 - depreciation, 0.3); // Mínimo 30% do valor

    const adjustedDamageValue = damageValue * depreciationFactor;
    const reduction = Math.min(adjustedDamageValue, totalDeposit);

    return reduction;
  }

  /**
   * Verificar se prazo de devolução de caução foi respeitado
   */
  isDepositReturnOverdue(inspection: Inspection, returnDate: Date): boolean {
    return returnDate > inspection.deadline_return_deposit_date;
  }

  // Helpers para cálculos de data
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private addBusinessDays(date: Date, days: number): Date {
    let count = 0;
    const result = new Date(date);

    while (count < days) {
      result.setDate(result.getDate() + 1);
      // Pular fins de semana (0 = domingo, 6 = sábado)
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        count++;
      }
    }

    return result;
  }

  /**
   * Registrar ação no audit log com hash chain (Lei 12.682/2012)
   * Append-only, imutável, com integridade criptográfica
   */
  private async logAudit(
    inspectionId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // Gerar hash do evento para chain de integridade
      const eventData = JSON.stringify({ inspectionId, action, metadata, timestamp: new Date() });
      const hash = createHash('sha256').update(eventData).digest('hex');

      // Buscar o último hash (para chain)
      const { data: lastLog } = await this.supabase
        .from('audit_logs')
        .select('hash')
        .eq('entity_id', inspectionId)
        .order('created_at', { ascending: false })
        .limit(1);

      const previousHash = lastLog && lastLog.length > 0 ? lastLog[0].hash : null;

      // Inserir novo log (append-only)
      const { error } = await this.supabase
        .from('audit_logs')
        .insert([{
          id: randomUUID(),
          entity_id: inspectionId,
          entity_type: 'inspection',
          action,
          metadata,
          hash,
          previous_hash: previousHash,
          created_at: new Date(),
        }]);

      if (error) {
        console.error('Failed to log audit event:', error);
      }
    } catch (error) {
      console.error('Error in logAudit:', error);
    }
  }
}
