import { UUID } from 'crypto';

export type CriticalDateType = 'due_date' | 'late_20d' | 'late_30d_serasa' | 'late_40d_execution' | 'renewal_60d_notice' | 'renewal_notice_final';
export type PaymentStatus = 'on_time' | 'late_20d' | 'late_30d' | 'serasa_included' | 'execution_initiated' | 'collected';
export type NotificationChannel = 'email' | 'sms' | 'whatsapp';

export interface CriticalDate {
  id: UUID;
  lease_id: UUID;
  property_id: UUID;
  date_type: CriticalDateType;

  // Data crítica
  target_date: Date;
  trigger_date: Date; // Quando o sistema deve executar a ação
  description: string;

  // Ação a executar
  action_type: 'notify' | 'register_serasa' | 'initiate_collection' | 'send_renewal_notice';
  action_executed: boolean;
  action_executed_at?: Date;

  // Resultado
  execution_status: 'pending' | 'completed' | 'failed';
  error_message?: string;
  retry_count: number;
  last_retry_at?: Date;

  audit_log_id: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentCycle {
  id: UUID;
  lease_id: UUID;
  property_id: UUID;

  // Data do ciclo
  billing_month: number;
  billing_year: number;
  due_date: Date; // Dia 10 (Cláusula Terceira)
  value_brl: number;

  // Componentes
  aluguel_efetivo: number; // 55%
  cota_custeio: number; // 45%

  // Status de pagamento
  payment_status: PaymentStatus;
  payment_received_date?: Date;
  payment_amount_received?: number;
  days_late: number; // Calculado se não pago

  // Prazos críticos já acionados
  day_10_notification_sent: boolean;
  day_30_notification_sent: boolean;
  day_30_serasa_registered: boolean;
  day_30_serasa_registration_date?: Date;
  day_40_notification_sent: boolean;
  day_40_collection_action_initiated: boolean;
  day_40_collection_action_date?: Date;

  // Multa por atraso (1% a.m.)
  late_fee_percentage: number; // 1.0 (1% ao mês)
  late_fee_amount: number;
  late_fee_applied: boolean;
  late_fee_applied_date?: Date;

  created_at: Date;
  updated_at: Date;
}

export interface CriticalDateNotification {
  id: UUID;
  payment_cycle_id: UUID;
  lease_id: UUID;
  critical_date_id: UUID;

  notification_type: 'due_date' | 'late_20d' | 'late_30d_serasa' | 'late_40d_execution' | 'renewal_notice';
  recipient_email: string;
  recipient_phone?: string;
  channel: NotificationChannel;

  // Template
  template_name: string;
  template_variables: Record<string, unknown>; // { due_date, value, days_late, etc }

  // Status
  sent_at: Date;
  delivered_at?: Date;
  delivery_status: 'pending' | 'delivered' | 'failed' | 'bounced';
  retry_count: number;
  max_retries: number;
  last_error?: string;
  last_retry_at?: Date;

  audit_log_id: UUID;
}

export interface SerASARegistration {
  id: UUID;
  lease_id: UUID;
  payment_cycle_id: UUID;

  // Registro SPC/SERASA
  registration_date: Date;
  registration_number?: string; // ID retornado pelo SPC
  registration_status: 'pending' | 'registered' | 'failed';
  registration_error?: string;

  // Dados do registro
  debtor_cpf: string;
  debtor_name: string;
  debt_amount: number;
  debt_description: string;

  // Comprovação
  proof_document_url?: string;
  proof_received_date?: Date;

  audit_log_id: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface CollectionAction {
  id: UUID;
  lease_id: UUID;
  payment_cycle_id: UUID;

  // Ação de execução
  action_initiated_date: Date;
  action_type: 'administrative' | 'judicial';

  // Notificação de execução
  notification_sent_date: Date;
  notification_method: 'email' | 'notary' | 'both';
  notary_name?: string;
  notary_contact?: string;

  // Comprovação
  notification_proof_url?: string;
  proof_received_date?: Date;

  // Status
  collection_status: 'initiated' | 'in_progress' | 'resolved' | 'abandoned';
  amount_collected?: number;
  collection_date?: Date;

  audit_log_id: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface LeaseRenewalNotice {
  id: UUID;
  lease_id: UUID;
  property_id: UUID;

  // Contrato atual
  current_lease_end_date: Date;
  renewal_notice_required_date: Date; // 60 dias antes

  // Status
  notice_type: 'renewal' | 'non_renewal';
  notice_sent_date?: Date;
  notice_sent_channel: NotificationChannel;
  delivery_status: 'pending' | 'delivered' | 'failed';

  // Para não-renovação
  non_renewal_reason?: string;
  non_renewal_effective_date?: Date;

  audit_log_id: UUID;
  created_at: Date;
  updated_at: Date;
}
