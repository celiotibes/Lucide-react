import { UUID, randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  OccupancyRules,
  RegisteredOccupant,
  OccupancyViolation,
  OccupancyMonitoring,
} from '../types/occupancy';
import { CPFValidationService } from './CPFValidationService';

export class OccupancyService {
  private cpfValidation: CPFValidationService;

  constructor(private supabase: SupabaseClient) {
    this.cpfValidation = new CPFValidationService();
  }
  /**
   * Criar regras de ocupação para um imóvel
   * Requisito: Contrato residencial proíbe AirBnB, Booking, sublocação
   */
  async createOccupancyRules(propertyId: UUID, maxOccupants: number): Promise<OccupancyRules> {
    const now = new Date();
    const rules: OccupancyRules = {
      id: randomUUID(),
      property_id: propertyId,

      max_occupants: maxOccupants,
      allow_guests_overnight: true,
      max_guest_days_per_month: 30,

      allow_airbnb: false,
      allow_booking: false,
      allow_temporary_rent: false,
      allow_sublet: false,

      violation_fine_percentage: 10,
      allow_termination_on_violation: true,

      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('occupancy_rules')
      .insert([rules]);

    if (error) {
      console.error('Failed to create occupancy rules:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(rules.id, 'occupancy_rules_created', {
      property_id: propertyId,
      max_occupants: maxOccupants,
    });

    return rules;
  }

  /**
   * Registrar ocupante (primário ou secundário)
   */
  async registerOccupant(
    leaseId: UUID,
    name: string,
    cpf: string,
    role: 'primary' | 'secondary',
    idDocumentUrl: string,
    moveInDate: Date,
    phone?: string,
    email?: string
  ): Promise<RegisteredOccupant | null> {
    if (!this.cpfValidation.isValidCPF(cpf)) {
      const feedback = this.cpfValidation.validateWithFeedback(cpf);
      throw new Error(`CPF inválido: ${feedback.errors.join(', ')}`);
    }

    const now = new Date();
    const occupant: RegisteredOccupant = {
      id: randomUUID(),
      lease_id: leaseId,
      name,
      cpf,
      phone,
      email,
      role,
      move_in_date: moveInDate,
      id_document_url: idDocumentUrl,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('registered_occupants')
      .insert([occupant]);

    if (error) {
      console.error('Failed to register occupant:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(occupant.id, 'occupant_registered', {
      lease_id: leaseId,
      role,
      name,
    });

    return occupant;
  }

  /**
   * Validar limite de ocupantes
   */
  validateOccupantLimit(occupants: RegisteredOccupant[], maxAllowed: number): boolean {
    const activeOccupants = occupants.filter((o) => o.is_active).length;
    return activeOccupants <= maxAllowed;
  }

  /**
   * Registrar violação de ocupação
   * Tipos: AirBnB, Booking, sublocação, overcrowding
   */
  async reportViolation(
    leaseId: UUID,
    propertyId: UUID,
    aluguelEfetivo: number,
    violationType: 'airbnb' | 'booking' | 'sublet' | 'overcrowding',
    detectionEvidence: string,
    detectionMethod: 'neighbor_complaint' | 'airbnb_api' | 'booking_api' | 'property_inspection' | 'manual_report'
  ): Promise<OccupancyViolation> {
    const now = new Date();
    const violation: OccupancyViolation = {
      id: randomUUID(),
      lease_id: leaseId,
      property_id: propertyId,
      violation_type: violationType as any,

      detected_date: now,
      detection_method: detectionMethod,
      detection_evidence: detectionEvidence,

      verified: false,

      notification_sent_date: undefined,
      fine_amount_brl: aluguelEfetivo * 0.1,
      fine_status: 'pending',

      lease_termination_initiated: false,

      audit_log_id: randomUUID(),
      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('occupancy_violations')
      .insert([violation]);

    if (error) {
      console.error('Failed to report violation:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(violation.id, 'occupancy_violation_reported', {
      lease_id: leaseId,
      property_id: propertyId,
      violation_type: violationType,
      detection_method: detectionMethod,
      fine_amount_brl: aluguelEfetivo * 0.1,
    });

    return violation;
  }

  /**
   * Verificar violação de AirBnB/Booking
   * (Integração com APIs públicas - simulada aqui)
   */
  async checkForSTRListings(propertyAddress: string): Promise<{
    airbnbFound: boolean;
    bookingFound: boolean;
    airbnbUrl?: string;
    bookingUrl?: string;
  }> {
    // Em produção, integrar com APIs de AirBnB/Booking
    // Por enquanto, retorna template
    return {
      airbnbFound: false,
      bookingFound: false,
      airbnbUrl: undefined,
      bookingUrl: undefined,
    };
  }

  /**
   * Aplicar multa por violação
   */
  async applyViolationFine(violation: OccupancyViolation): Promise<void> {
    const now = new Date();
    violation.fine_status = 'applied';
    violation.fine_applied_date = now;
    violation.updated_at = now;

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('occupancy_violations')
      .update({
        fine_status: 'applied',
        fine_applied_date: now,
        updated_at: now,
      })
      .eq('id', violation.id);

    if (error) {
      console.error('Failed to apply violation fine:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(violation.id, 'violation_fine_applied', {
      fine_amount_brl: violation.fine_amount_brl,
    });
  }

  /**
   * Iniciar rescisão de contrato por violação
   */
  async initiateTermination(violation: OccupancyViolation, reason: string): Promise<void> {
    const now = new Date();
    const terminationEffectiveDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    violation.lease_termination_initiated = true;
    violation.termination_notice_date = now;
    violation.termination_effective_date = terminationEffectiveDate;
    violation.resolution_notes = reason;
    violation.updated_at = now;

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('occupancy_violations')
      .update({
        lease_termination_initiated: true,
        termination_notice_date: now,
        termination_effective_date: terminationEffectiveDate,
        resolution_notes: reason,
        updated_at: now,
      })
      .eq('id', violation.id);

    if (error) {
      console.error('Failed to initiate termination:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(violation.id, 'lease_termination_initiated', {
      reason,
      termination_effective_date: terminationEffectiveDate,
    });
  }

  /**
   * Criar monitoramento automático de ocupação
   */
  async createMonitoring(
    propertyId: UUID,
    leaseId: UUID
  ): Promise<OccupancyMonitoring> {
    const now = new Date();
    const monitoring: OccupancyMonitoring = {
      id: randomUUID(),
      property_id: propertyId,
      lease_id: leaseId,

      last_airbnb_check: now,
      last_booking_check: now,
      airbnb_listing_found: false,
      booking_listing_found: false,

      last_occupancy_verification: now,
      current_occupant_count: 1,
      occupant_names_list: 'Gustavo Pereira Natal',

      monitoring_active: true,
      alert_level: 'none',

      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('occupancy_monitoring')
      .insert([monitoring]);

    if (error) {
      console.error('Failed to create monitoring:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(monitoring.id, 'occupancy_monitoring_created', {
      property_id: propertyId,
      lease_id: leaseId,
    });

    return monitoring;
  }

  /**
   * Atualizar status de monitoramento
   */
  async updateMonitoringStatus(
    monitoring: OccupancyMonitoring,
    airbnbFound: boolean,
    bookingFound: boolean,
    occupantCount: number,
    occupantNames: string
  ): Promise<void> {
    const now = new Date();
    let alertLevel: string;

    if (airbnbFound || bookingFound || occupantCount > 2) {
      alertLevel = 'critical';
    } else if (occupantCount === 2) {
      alertLevel = 'warning';
    } else {
      alertLevel = 'none';
    }

    monitoring.last_airbnb_check = now;
    monitoring.last_booking_check = now;
    monitoring.airbnb_listing_found = airbnbFound;
    monitoring.booking_listing_found = bookingFound;
    monitoring.current_occupant_count = occupantCount;
    monitoring.occupant_names_list = occupantNames;
    monitoring.alert_level = alertLevel;
    monitoring.updated_at = now;

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('occupancy_monitoring')
      .update({
        last_airbnb_check: now,
        last_booking_check: now,
        airbnb_listing_found: airbnbFound,
        booking_listing_found: bookingFound,
        current_occupant_count: occupantCount,
        occupant_names_list: occupantNames,
        alert_level: alertLevel,
        updated_at: now,
      })
      .eq('id', monitoring.id);

    if (error) {
      console.error('Failed to update monitoring status:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(monitoring.id, 'occupancy_monitoring_updated', {
      airbnb_found: airbnbFound,
      booking_found: bookingFound,
      occupant_count: occupantCount,
      alert_level: alertLevel,
    });
  }

  // Note: isValidCPF removed - now use this.cpfValidation.isValidCPF() directly

  /**
   * Registrar ação no audit log com hash chain (Lei 12.682/2012)
   */
  private async logAudit(
    entityId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const eventData = JSON.stringify({ entityId, action, metadata, timestamp: new Date() });
      const hash = createHash('sha256').update(eventData).digest('hex');

      const { data: lastLog } = await this.supabase
        .from('audit_logs')
        .select('hash')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(1);

      const previousHash = lastLog && lastLog.length > 0 ? lastLog[0].hash : null;

      const { error } = await this.supabase
        .from('audit_logs')
        .insert([{
          id: randomUUID(),
          entity_id: entityId,
          entity_type: 'occupancy_entity',
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
