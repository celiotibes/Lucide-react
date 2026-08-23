import { UUID, randomUUID } from 'crypto';
import {
  OccupancyRules,
  RegisteredOccupant,
  OccupancyViolation,
  OccupancyMonitoring,
} from '../types/occupancy';

export class OccupancyService {
  /**
   * Criar regras de ocupação para um imóvel
   * Requisito: Contrato residencial proíbe AirBnB, Booking, sublocação
   */
  async createOccupancyRules(propertyId: UUID, maxOccupants: number): Promise<OccupancyRules> {
    const rules: OccupancyRules = {
      id: randomUUID(),
      property_id: propertyId,

      // Limites contratuais
      max_occupants: maxOccupants, // 1-2 para kitnet
      allow_guests_overnight: true,
      max_guest_days_per_month: 30,

      // Vedações absolutas (Cláusula de Ocupação)
      allow_airbnb: false,
      allow_booking: false,
      allow_temporary_rent: false,
      allow_sublet: false,

      // Penalidade por violação (10% aluguel efetivo)
      violation_fine_percentage: 10,
      allow_termination_on_violation: true,

      created_at: new Date(),
      updated_at: new Date(),
    };

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
    // Validar CPF (formato básico)
    if (!this.isValidCPF(cpf)) {
      throw new Error(`CPF inválido: ${cpf}`);
    }

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
      created_at: new Date(),
      updated_at: new Date(),
    };

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
    const violation: OccupancyViolation = {
      id: randomUUID(),
      lease_id: leaseId,
      property_id: propertyId,
      violation_type: violationType as any,

      detected_date: new Date(),
      detection_method: detectionMethod,
      detection_evidence: detectionEvidence,

      verified: false,

      notification_sent_date: undefined,
      fine_amount_brl: aluguelEfetivo * 0.1, // 10%
      fine_status: 'pending',

      lease_termination_initiated: false,

      audit_log_id: randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    // TODO: Notificar locador com urgência
    // TODO: Agendar verificação de 24-48 horas

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
  applyViolationFine(violation: OccupancyViolation): void {
    violation.fine_status = 'applied';
    violation.fine_applied_date = new Date();
    violation.updated_at = new Date();

    // TODO: Gerar débito na próxima fatura do inquilino
  }

  /**
   * Iniciar rescisão de contrato por violação
   */
  async initiateTermination(violation: OccupancyViolation, reason: string): Promise<void> {
    violation.lease_termination_initiated = true;
    violation.termination_notice_date = new Date();
    violation.termination_effective_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
    violation.resolution_notes = reason;
    violation.updated_at = new Date();

    // TODO: Enviar notificação formal ao inquilino com prazo de 30 dias
    // TODO: Registrar em auditoria para prova processual
  }

  /**
   * Criar monitoramento automático de ocupação
   */
  async createMonitoring(
    propertyId: UUID,
    leaseId: UUID
  ): Promise<OccupancyMonitoring> {
    const monitoring: OccupancyMonitoring = {
      id: randomUUID(),
      property_id: propertyId,
      lease_id: leaseId,

      last_airbnb_check: new Date(),
      last_booking_check: new Date(),
      airbnb_listing_found: false,
      booking_listing_found: false,

      last_occupancy_verification: new Date(),
      current_occupant_count: 1,
      occupant_names_list: 'Gustavo Pereira Natal',

      monitoring_active: true,
      alert_level: 'none',

      created_at: new Date(),
      updated_at: new Date(),
    };

    // TODO: Agendar verificações semanais/mensais

    return monitoring;
  }

  /**
   * Atualizar status de monitoramento
   */
  updateMonitoringStatus(
    monitoring: OccupancyMonitoring,
    airbnbFound: boolean,
    bookingFound: boolean,
    occupantCount: number,
    occupantNames: string
  ): void {
    monitoring.last_airbnb_check = new Date();
    monitoring.last_booking_check = new Date();
    monitoring.airbnb_listing_found = airbnbFound;
    monitoring.booking_listing_found = bookingFound;
    monitoring.current_occupant_count = occupantCount;
    monitoring.occupant_names_list = occupantNames;
    monitoring.updated_at = new Date();

    // Atualizar nível de alerta
    if (airbnbFound || bookingFound || occupantCount > 2) {
      monitoring.alert_level = 'critical';
    } else if (occupantCount === 2) {
      monitoring.alert_level = 'warning';
    } else {
      monitoring.alert_level = 'none';
    }
  }

  // Helpers
  private isValidCPF(cpf: string): boolean {
    // Validação simplificada de CPF
    const cleaned = cpf.replace(/\D/g, '');
    return cleaned.length === 11 && !this.isAllSameDigit(cleaned);
  }

  private isAllSameDigit(str: string): boolean {
    return /^(\d)\1*$/.test(str);
  }
}
