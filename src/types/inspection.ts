import { UUID } from 'crypto';

export type InspectionStatus = 'pending' | 'challenged' | 'rad_pending' | 'completed' | 'disputed';
export type EvidenceGrade = 'A' | 'D' | 'estimated' | 'pending';

export interface Inspection {
  id: UUID;
  lease_id: UUID;
  property_id: UUID;
  inspection_type: 'initial' | 'final';
  video_url: string; // S3 path to HD video (min 1080p)
  video_size_mb: number;
  video_duration_seconds: number;
  uploaded_at: Date;
  uploaded_by_email: string;

  // Prazos críticos (Anexo II)
  deadline_challenge_date: Date; // +7 dias
  deadline_rad_date: Date; // +15 dias úteis
  deadline_return_deposit_date: Date; // +10 dias

  // Notificações
  challenge_notification_sent?: Date;
  rad_notification_sent?: Date;
  return_deposit_notification_sent?: Date;

  // Status e Relatório
  status: InspectionStatus;
  is_challenged: boolean;
  challenge_reason?: string;
  challenge_submitted_at?: Date;

  // RAD (Relatório Avaliação de Danos)
  rad_submitted_at?: Date;
  rad_file_url?: string;
  damages_found: boolean;
  damage_description?: string;
  damage_estimated_value?: number;

  // Auditoria
  created_at: Date;
  updated_at: Date;
  audit_log_id: UUID; // Referência para append-only audit_log
}

export interface InspectionDamage {
  id: UUID;
  inspection_id: UUID;
  item_name: string;
  depreciation_percentage: number;
  replacement_value: number;
  actual_value: number;
  evidence_grade: EvidenceGrade;
  photo_url?: string;
  notes: string;
  created_at: Date;
}

export interface InspectionNotification {
  id: UUID;
  inspection_id: UUID;
  lease_id: UUID;
  notification_type: 'challenge' | 'rad' | 'return_deposit';
  recipient_email: string;
  recipient_phone?: string;
  channel: 'email' | 'whatsapp' | 'sms';
  template_name: string;
  sent_at: Date;
  delivered_at?: Date;
  delivery_status: 'pending' | 'delivered' | 'failed';
  retry_count: number;
  last_error?: string;
  audit_log_id: UUID;
}
