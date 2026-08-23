import { UUID, randomUUID } from 'crypto';
import {
  PaymentCycle,
  CriticalDate,
  CriticalDateNotification,
  SerASARegistration,
  CollectionAction,
} from '../types/critical-dates';

export class CriticalDatesService {
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
    // Calcular dia 10 do mês
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

      late_fee_percentage: 1.0, // 1% ao mês (Cláusula Quinta)
      late_fee_amount: 0,
      late_fee_applied: false,

      created_at: new Date(),
      updated_at: new Date(),
    };

    return cycle;
  }

  /**
   * Agendar notificação de vencimento (dia 10)
   * Requisito: Cláusula Quinta
   */
  async scheduleDay10Notification(cycle: PaymentCycle, recipientEmail: string): Promise<CriticalDateNotification> {
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

    cycle.day_10_notification_sent = true;
    cycle.updated_at = new Date();

    return notification;
  }

  /**
   * Processar atraso - Dia 30 (20 dias de atraso)
   * Requisito: Cláusula Quinta - Incluir em SPC/SERASA
   */
  async processDay30Late(cycle: PaymentCycle): Promise<CriticalDateNotification> {
    cycle.payment_status = 'late_30d';
    cycle.days_late = 30;

    // Calcular multa: 1% ao mês
    cycle.late_fee_amount = cycle.value_brl * (cycle.late_fee_percentage / 100);
    cycle.late_fee_applied = true;

    cycle.day_30_notification_sent = true;
    cycle.day_30_serasa_registered = true;
    cycle.day_30_serasa_registration_date = new Date();
    cycle.updated_at = new Date();

    // Notificação urgente
    const notification: CriticalDateNotification = {
      id: randomUUID(),
      payment_cycle_id: cycle.id,
      lease_id: cycle.lease_id,
      critical_date_id: randomUUID(),

      notification_type: 'late_30d_serasa',
      recipient_email: 'locador@crmt.com',
      recipient_phone: '41-4041-5242',
      channel: 'sms', // SMS urgente

      template_name: 'payment_late_30d_serasa',
      template_variables: {
        days_late: 30,
        value: cycle.value_brl,
        late_fee: cycle.late_fee_amount,
        serasa_date: new Date().toISOString().split('T')[0],
      },

      sent_at: new Date(),
      delivery_status: 'pending',
      retry_count: 0,
      max_retries: 5,

      audit_log_id: randomUUID(),
    };

    // TODO: Integrar com SPC/SERASA para registrar débito automaticamente

    return notification;
  }

  /**
   * Processar atraso extremo - Dia 40 (30+ dias de atraso)
   * Requisito: Cláusula Décima Terceira - Ação de execução
   */
  async processDay40Execution(cycle: PaymentCycle): Promise<CollectionAction> {
    cycle.payment_status = 'serasa_included';
    cycle.days_late = 40;
    cycle.day_40_collection_action_initiated = true;
    cycle.day_40_collection_action_date = new Date();
    cycle.updated_at = new Date();

    // Criar ação de execução
    const action: CollectionAction = {
      id: randomUUID(),
      lease_id: cycle.lease_id,
      payment_cycle_id: cycle.id,

      action_initiated_date: new Date(),
      action_type: 'judicial',

      notification_sent_date: new Date(),
      notification_method: 'notary',
      notary_name: 'Tabelião de Notas e Protestos',
      notary_contact: 'cartorio@example.com',

      collection_status: 'initiated',

      audit_log_id: randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    // TODO: Gerar documento de execução
    // TODO: Notificar tabelião
    // TODO: Registrar em auditoria com timestamp para prova processual

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
    const registration: SerASARegistration = {
      id: randomUUID(),
      lease_id: cycle.lease_id,
      payment_cycle_id: cycle.id,

      registration_date: new Date(),
      registration_status: 'pending', // Em produção, integrar com API SERASA

      debtor_cpf: debtorCPF,
      debtor_name: debtorName,
      debt_amount: cycle.value_brl + cycle.late_fee_amount,
      debt_description: `Aluguel ${cycle.billing_month}/${cycle.billing_year}`,

      audit_log_id: randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    // TODO: Integrar com SPC/SERASA API para registrar automaticamente

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
    cycle.payment_status = 'collected';
    cycle.payment_received_date = receiveDate;
    cycle.payment_amount_received = amountReceived;
    cycle.updated_at = new Date();

    // Se pagou em atraso, registrar comprovante
    if (receiveDate > cycle.due_date) {
      cycle.days_late = Math.floor(
        (receiveDate.getTime() - cycle.due_date.getTime()) / (1000 * 60 * 60 * 24)
      );
    } else {
      cycle.days_late = 0;
    }

    // TODO: Se estava em SERASA, solicitar exclusão

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
}
