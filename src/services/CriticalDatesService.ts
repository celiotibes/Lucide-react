import { UUID, randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  PaymentCycle,
  CriticalDate,
  CriticalDateNotification,
  SerASARegistration,
  CollectionAction,
} from '../types/critical-dates';
import { PaymentCalculationService } from './PaymentCalculationService';

export class CriticalDatesService {
  private paymentCalculation: PaymentCalculationService;

  constructor(private supabase: SupabaseClient) {
    this.paymentCalculation = new PaymentCalculationService();
  }
  /**
   * Criar ciclo de pagamento mensal
   * Requisito: Cláusula Terceira - Vencimento dia 10
   */
  async createPaymentCycle(
    leaseId: UUID,
    propertyId: UUID,
    billingMonth: number,
    billingYear: number,
    aluguelEfetivo: number,
    cotaCusteio: number
  ): Promise<PaymentCycle> {
    const now = new Date();
    const dueDate = new Date(billingYear, billingMonth - 1, 10);

    const cycle: PaymentCycle = {
      id: randomUUID(),
      lease_id: leaseId,
      property_id: propertyId,

      billing_month: billingMonth,
      billing_year: billingYear,
      due_date: dueDate,
      value_brl: aluguelEfetivo + cotaCusteio,

      aluguel_efetivo: aluguelEfetivo,
      cota_custeio: cotaCusteio,

      payment_status: 'on_time',
      days_late: 0,

      day_10_notification_sent: false,
      day_30_notification_sent: false,
      day_30_serasa_registered: false,
      day_40_notification_sent: false,
      day_40_collection_action_initiated: false,

      late_fee_percentage: 1.0,
      late_fee_amount: 0,
      late_fee_applied: false,

      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('payment_cycles')
      .insert([cycle]);

    if (error) {
      console.error('Failed to create payment cycle:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(cycle.id, 'payment_cycle_created', {
      lease_id: leaseId,
      property_id: propertyId,
      billing_month: billingMonth,
      billing_year: billingYear,
      value_brl: cycle.value_brl,
    });

    return cycle;
  }

  /**
   * Agendar notificação de vencimento (dia 10)
   * Requisito: Cláusula Quinta
   */
  async scheduleDay10Notification(cycle: PaymentCycle, recipientEmail: string): Promise<CriticalDateNotification> {
    const now = new Date();
    const notification: CriticalDateNotification = {
      id: randomUUID(),
      payment_cycle_id: cycle.id,
      lease_id: cycle.lease_id,
      critical_date_id: randomUUID(),

      notification_type: 'due_date',
      recipient_email: recipientEmail,
      recipient_phone: '41-4041-5242',
      channel: 'email',

      template_name: 'payment_due_day10',
      template_variables: {
        due_date: cycle.due_date.toISOString().split('T')[0],
        value: cycle.value_brl,
        aluguel: cycle.aluguel_efetivo,
        custeio: cycle.cota_custeio,
      },

      sent_at: cycle.due_date,
      delivery_status: 'pending',
      retry_count: 0,
      max_retries: 3,

      audit_log_id: randomUUID(),
    };

    // Inserir notificação no banco de dados
    const { error: notifError } = await this.supabase
      .from('critical_date_notifications')
      .insert([notification]);

    if (notifError) {
      console.error('Failed to schedule notification:', notifError);
      throw new Error(`Database insert failed: ${notifError.message}`);
    }

    // Atualizar ciclo
    cycle.day_10_notification_sent = true;
    cycle.updated_at = now;

    const { error: cycleError } = await this.supabase
      .from('payment_cycles')
      .update({
        day_10_notification_sent: true,
        updated_at: now,
      })
      .eq('id', cycle.id);

    if (cycleError) {
      console.error('Failed to update cycle:', cycleError);
      throw new Error(`Database update failed: ${cycleError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(cycle.id, 'day10_notification_scheduled', {
      recipient_email: recipientEmail,
    });

    return notification;
  }

  /**
   * Processar atraso - Dia 30 (20 dias de atraso)
   * Requisito: Cláusula Quinta - Incluir em SPC/SERASA
   */
  async processDay30Late(cycle: PaymentCycle): Promise<CriticalDateNotification> {
    const now = new Date();
    cycle.payment_status = 'late_30d';
    cycle.days_late = 30;

    // Calcular multa e juros conforme Lei 8.245/91
    const feeCalculation = this.paymentCalculation.calculateLateFeeAndInterest(
      cycle.aluguel_efetivo,
      30
    );
    cycle.late_fee_amount = feeCalculation.total;
    cycle.late_fee_applied = true;

    cycle.day_30_notification_sent = true;
    cycle.day_30_serasa_registered = true;
    cycle.day_30_serasa_registration_date = now;
    cycle.updated_at = now;

    // Notificação urgente
    const notification: CriticalDateNotification = {
      id: randomUUID(),
      payment_cycle_id: cycle.id,
      lease_id: cycle.lease_id,
      critical_date_id: randomUUID(),

      notification_type: 'late_30d_serasa',
      recipient_email: 'locador@crmt.com',
      recipient_phone: '41-4041-5242',
      channel: 'sms',

      template_name: 'payment_late_30d_serasa',
      template_variables: {
        days_late: 30,
        value: cycle.value_brl,
        late_fee: cycle.late_fee_amount,
        serasa_date: now.toISOString().split('T')[0],
      },

      sent_at: now,
      delivery_status: 'pending',
      retry_count: 0,
      max_retries: 5,

      audit_log_id: randomUUID(),
    };

    // Inserir notificação
    const { error: notifError } = await this.supabase
      .from('critical_date_notifications')
      .insert([notification]);

    if (notifError) {
      console.error('Failed to insert notification:', notifError);
      throw new Error(`Database insert failed: ${notifError.message}`);
    }

    // Atualizar ciclo
    const { error: cycleError } = await this.supabase
      .from('payment_cycles')
      .update({
        payment_status: 'late_30d',
        days_late: 30,
        late_fee_amount: cycle.late_fee_amount,
        late_fee_applied: true,
        day_30_notification_sent: true,
        day_30_serasa_registered: true,
        day_30_serasa_registration_date: now,
        updated_at: now,
      })
      .eq('id', cycle.id);

    if (cycleError) {
      console.error('Failed to update cycle:', cycleError);
      throw new Error(`Database update failed: ${cycleError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(cycle.id, 'day30_late_processed_serasa', {
      days_late: 30,
      late_fee_amount: cycle.late_fee_amount,
      serasa_registered_at: now,
    });

    return notification;
  }

  /**
   * Processar atraso extremo - Dia 40 (30+ dias de atraso)
   * Requisito: Cláusula Décima Terceira - Ação de execução
   */
  async processDay40Execution(cycle: PaymentCycle): Promise<CollectionAction> {
    const now = new Date();
    cycle.payment_status = 'serasa_included';
    cycle.days_late = 40;
    cycle.day_40_collection_action_initiated = true;
    cycle.day_40_collection_action_date = now;
    cycle.updated_at = now;

    const action: CollectionAction = {
      id: randomUUID(),
      lease_id: cycle.lease_id,
      payment_cycle_id: cycle.id,

      action_initiated_date: now,
      action_type: 'judicial',

      notification_sent_date: now,
      notification_method: 'notary',
      notary_name: 'Tabelião de Notas e Protestos',
      notary_contact: 'cartorio@example.com',

      collection_status: 'initiated',

      audit_log_id: randomUUID(),
      created_at: now,
      updated_at: now,
    };

    // Inserir ação de cobrança
    const { error: actionError } = await this.supabase
      .from('collection_actions')
      .insert([action]);

    if (actionError) {
      console.error('Failed to create collection action:', actionError);
      throw new Error(`Database insert failed: ${actionError.message}`);
    }

    // Atualizar ciclo
    const { error: cycleError } = await this.supabase
      .from('payment_cycles')
      .update({
        payment_status: 'serasa_included',
        days_late: 40,
        day_40_collection_action_initiated: true,
        day_40_collection_action_date: now,
        updated_at: now,
      })
      .eq('id', cycle.id);

    if (cycleError) {
      console.error('Failed to update cycle:', cycleError);
      throw new Error(`Database update failed: ${cycleError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(cycle.id, 'day40_execution_initiated', {
      days_late: 40,
      collection_action_id: action.id,
      action_type: 'judicial',
      notary_name: action.notary_name,
    });

    return action;
  }

  /**
   * Registrar SERASA (SPC)
   */
  async registerSERASA(
    cycle: PaymentCycle,
    debtorCPF: string,
    debtorName: string
  ): Promise<SerASARegistration> {
    const now = new Date();
    const registration: SerASARegistration = {
      id: randomUUID(),
      lease_id: cycle.lease_id,
      payment_cycle_id: cycle.id,

      registration_date: now,
      registration_status: 'pending',

      debtor_cpf: debtorCPF,
      debtor_name: debtorName,
      debt_amount: cycle.value_brl + cycle.late_fee_amount,
      debt_description: `Aluguel ${cycle.billing_month}/${cycle.billing_year}`,

      audit_log_id: randomUUID(),
      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('serasa_registrations')
      .insert([registration]);

    if (error) {
      console.error('Failed to register SERASA:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(registration.id, 'serasa_registration_created', {
      debtor_cpf: debtorCPF,
      debtor_name: debtorName,
      debt_amount: registration.debt_amount,
      payment_cycle_id: cycle.id,
    });

    return registration;
  }

  /**
   * Processar pagamento recebido
   */
  async processPaymentReceived(
    cycle: PaymentCycle,
    amountReceived: number,
    receiveDate: Date
  ): Promise<PaymentCycle> {
    const now = new Date();
    cycle.payment_status = 'collected';
    cycle.payment_received_date = receiveDate;
    cycle.payment_amount_received = amountReceived;
    cycle.updated_at = now;

    if (receiveDate > cycle.due_date) {
      cycle.days_late = Math.floor(
        (receiveDate.getTime() - cycle.due_date.getTime()) / (1000 * 60 * 60 * 24)
      );
    } else {
      cycle.days_late = 0;
    }

    // Atualizar no banco de dados
    const { error } = await this.supabase
      .from('payment_cycles')
      .update({
        payment_status: 'collected',
        payment_received_date: receiveDate,
        payment_amount_received: amountReceived,
        days_late: cycle.days_late,
        updated_at: now,
      })
      .eq('id', cycle.id);

    if (error) {
      console.error('Failed to process payment received:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(cycle.id, 'payment_received', {
      amount_received: amountReceived,
      received_date: receiveDate,
      days_late: cycle.days_late,
    });

    return cycle;
  }

  /**
   * Notificar não-renovação (60 dias antes)
   */
  async scheduleRenewalNotice(
    leaseId: UUID,
    propertyId: UUID,
    currentLeaseEndDate: Date,
    willRenew: boolean,
    nonRenewalReason?: string
  ): Promise<CriticalDateNotification> {
    const noticeDate = new Date(currentLeaseEndDate);
    noticeDate.setDate(noticeDate.getDate() - 60);

    const notification: CriticalDateNotification = {
      id: randomUUID(),
      payment_cycle_id: randomUUID(),
      lease_id: leaseId,
      critical_date_id: randomUUID(),

      notification_type: willRenew ? 'renewal_notice' : 'renewal_notice',
      recipient_email: 'inquilino@example.com',
      channel: 'email',

      template_name: willRenew ? 'lease_renewal_notice' : 'lease_non_renewal_notice',
      template_variables: {
        current_lease_end: currentLeaseEndDate.toISOString().split('T')[0],
        renewal_status: willRenew ? 'renovação confirmada' : 'não-renovação',
        reason: nonRenewalReason,
      },

      sent_at: noticeDate,
      delivery_status: 'pending',
      retry_count: 0,
      max_retries: 3,

      audit_log_id: randomUUID(),
    };

    return notification;
  }

  /**
   * Calcular multa por atraso (1% ao mês)
   */
  calculateLateFee(value: number, daysLate: number): number {
    // 1% ao mês = ~0.033% ao dia
    const monthsLate = daysLate / 30;
    return value * (1.0 / 100) * monthsLate;
  }

  /**
   * Verificar se está vencido
   */
  isOverdue(cycle: PaymentCycle, checkDate: Date = new Date()): boolean {
    return checkDate > cycle.due_date && !cycle.payment_received_date;
  }

  /**
   * Obter status de ciclo
   */
  getPaymentStatus(cycle: PaymentCycle, checkDate: Date = new Date()): string {
    if (cycle.payment_received_date) {
      return `✅ Pago em ${cycle.payment_received_date.toLocaleDateString('pt-BR')}`;
    }

    const daysSinceDue = Math.floor((checkDate.getTime() - cycle.due_date.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceDue <= 0) return '⏳ Vencimento em breve';
    if (daysSinceDue <= 20) return `⚠️ Atrasado ${daysSinceDue} dias`;
    if (daysSinceDue <= 30) return `🔴 Atrasado ${daysSinceDue} dias - Registrado em SPC`;
    return `⛔ Atrasado ${daysSinceDue} dias - Em cobrança judicial`;
  }

  /**
   * Registrar ação no audit log com hash chain (Lei 12.682/2012)
   */
  private async logAudit(
    cycleId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const eventData = JSON.stringify({ cycleId, action, metadata, timestamp: new Date() });
      const hash = createHash('sha256').update(eventData).digest('hex');

      const { data: lastLog } = await this.supabase
        .from('audit_logs')
        .select('hash')
        .eq('entity_id', cycleId)
        .order('created_at', { ascending: false })
        .limit(1);

      const previousHash = lastLog && lastLog.length > 0 ? lastLog[0].hash : null;

      const { error } = await this.supabase
        .from('audit_logs')
        .insert([{
          id: randomUUID(),
          entity_id: cycleId,
          entity_type: 'payment_cycle',
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
