import { UUID } from 'crypto';

export type OccupancyViolationType = 'airbnb' | 'booking' | 'airbnb_and_booking' | 'temporary_rent' | 'sublet' | 'overcrowding';
export type OccupantRole = 'primary' | 'secondary' | 'dependent';

export interface OccupancyRules {
  id: UUID;
  property_id: UUID;

  // Limites contratuais
  max_occupants: number; // 1-2 para kitnet
  allow_guests_overnight: boolean;
  max_guest_days_per_month: number;

  // Proibições
  allow_airbnb: false; // Always false para contratos residenciais
  allow_booking: false;
  allow_temporary_rent: false;
  allow_sublet: false;

  // Penalidade por violação
  violation_fine_percentage: number; // 10% do aluguel efetivo
  allow_termination_on_violation: boolean; // Sim, rescisão imediata

  created_at: Date;
  updated_at: Date;
}

export interface RegisteredOccupant {
  id: UUID;
  lease_id: UUID;
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  role: OccupantRole;
  move_in_date: Date;
  move_out_date?: Date;

  // Documentação
  id_document_url: string; // RG/CNH
  proof_of_address?: string; // Comprovante endereço anterior

  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OccupancyViolation {
  id: UUID;
  lease_id: UUID;
  property_id: UUID;
  violation_type: OccupancyViolationType;

  // Detecção
  detected_date: Date;
  detection_method: 'neighbor_complaint' | 'airbnb_api' | 'booking_api' | 'property_inspection' | 'manual_report';
  detection_evidence: string; // Descrição ou URL

  // Verificação
  verified: boolean;
  verified_at?: Date;
  verified_by_email?: string;

  // Ação
  notification_sent_date?: Date;
  fine_amount_brl: number; // 10% aluguel efetivo
  fine_status: 'pending' | 'applied' | 'disputed' | 'waived';
  fine_applied_date?: Date;

  // Consequências
  lease_termination_initiated: boolean;
  termination_notice_date?: Date;
  termination_effective_date?: Date;

  // Auditoria
  resolved_at?: Date;
  resolution_notes?: string;
  audit_log_id: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface OccupancyMonitoring {
  id: UUID;
  property_id: UUID;
  lease_id: UUID;

  // Monitoramento STR (Short-Term Rental)
  last_airbnb_check: Date;
  last_booking_check: Date;
  airbnb_listing_found: boolean;
  booking_listing_found: boolean;
  airbnb_listing_url?: string;
  booking_listing_url?: string;

  // Monitoramento ocupação
  last_occupancy_verification: Date;
  current_occupant_count: number;
  occupant_names_list: string;

  // Status
  monitoring_active: boolean;
  alert_level: 'none' | 'warning' | 'critical';

  created_at: Date;
  updated_at: Date;
}

export interface OccupancyReport {
  id: UUID;
  property_id: UUID;
  lease_id: UUID;
  report_month: number;
  report_year: number;

  registered_occupants: RegisteredOccupant[];
  current_occupancy_count: number;
  compliance_status: 'compliant' | 'violation_detected' | 'violation_resolved';

  violations_this_period: OccupancyViolation[];
  violations_total_fine: number;

  notes: string;
  generated_at: Date;
}
