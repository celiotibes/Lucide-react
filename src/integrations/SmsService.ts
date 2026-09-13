import twilio from 'twilio';

export class SmsService {
  private client: twilio.Twilio;
  private twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '+5541999999999';

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
    }

    this.client = twilio(accountSid, authToken);
  }

  /**
   * Enviar SMS de notificação de vencimento (dia 10)
   */
  async sendDueDateSMS(phoneNumber: string, variables: {
    due_date: string;
    value: number;
  }): Promise<string> {
    const message = `CRMT: Seu aluguel de R$ ${variables.value.toFixed(2)} vence em ${variables.due_date}. Favor realizar o pagamento até a data.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS urgente de SPC/SERASA (dia 30)
   */
  async sendSerASASMS(phoneNumber: string, variables: {
    days_late: number;
    value: number;
    late_fee: number;
  }): Promise<string> {
    const message = `⚠️ CRMT URGENTE: Débito de R$ ${variables.value.toFixed(2)} com multa de R$ ${variables.late_fee.toFixed(2)} registrado em SPC/SERASA após ${variables.days_late} dias de atraso. Contate-nos imediatamente.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS de ação de execução (dia 40+)
   */
  async sendExecutionSMS(phoneNumber: string, variables: {
    days_late: number;
    value: number;
  }): Promise<string> {
    const message = `⛔ CRMT: Ação de execução iniciada. Débito: R$ ${variables.value.toFixed(2)}. Atrasado há ${variables.days_late} dias. Procure orientação jurídica imediatamente.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS de aviso de impugnação de vistoria (7 dias)
   */
  async sendInspectionChallengeSMS(phoneNumber: string, variables: {
    deadline_date: string;
    property_address: string;
  }): Promise<string> {
    const message = `CRMT: Prazo para impugnação de vistoria de ${variables.property_address} vence em ${variables.deadline_date}. Contate-nos se houver contestação.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS de violação de ocupação
   */
  async sendOccupancyViolationSMS(phoneNumber: string, variables: {
    violation_type: string;
    fine_amount: number;
  }): Promise<string> {
    const message = `⚠️ CRMT: Violação de ${variables.violation_type} detectada. Multa de R$ ${variables.fine_amount.toFixed(2)} será adicionada à próxima fatura.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS de aviso de renovação (60 dias)
   */
  async sendRenewalNoticeSMS(phoneNumber: string, variables: {
    lease_end_date: string;
    decision_deadline: string;
  }): Promise<string> {
    const message = `CRMT: Seu contrato de locação termina em ${variables.lease_end_date}. Confirme até ${variables.decision_deadline} se deseja renovar.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar SMS de violação de lavanderia
   */
  async sendLaundryViolationSMS(phoneNumber: string, variables: {
    violation_description: string;
    fine_amount: number;
  }): Promise<string> {
    const message = `CRMT: ${variables.violation_description}. Multa de R$ ${variables.fine_amount.toFixed(2)} será adicionada à próxima fatura.`;
    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Enviar WhatsApp de notificação urgente (SPC/SERASA)
   */
  async sendSerASAWhatsApp(phoneNumber: string, variables: {
    days_late: number;
    value: number;
    late_fee: number;
    serasa_date: string;
  }): Promise<string> {
    const message = `⚠️ CRMT URGENTE\n\nSeu débito foi *registrado em SPC/SERASA* em ${variables.serasa_date}\n\n• Dias em atraso: ${variables.days_late}\n• Valor: R$ ${variables.value.toFixed(2)}\n• Multa: R$ ${variables.late_fee.toFixed(2)}\n\n*Contate-nos imediatamente para resolver esta situação.*`;
    return await this.sendWhatsApp(phoneNumber, message);
  }

  /**
   * Enviar WhatsApp de execução (dia 40+)
   */
  async sendExecutionWhatsApp(phoneNumber: string, variables: {
    days_late: number;
    value: number;
    notary_name: string;
  }): Promise<string> {
    const message = `⛔ CRMT - AÇÃO JUDICIAL\n\nUma *ação de execução* foi iniciada contra você.\n\n• Dias em atraso: ${variables.days_late}\n• Valor total: R$ ${variables.value.toFixed(2)}\n• Responsável: ${variables.notary_name}\n\n*Procure orientação jurídica imediatamente.*`;
    return await this.sendWhatsApp(phoneNumber, message);
  }

  // ============= INTERNAL =============

  private async sendSMS(phoneNumber: string, message: string): Promise<string> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.twilioPhoneNumber,
        to: phoneNumber,
      });

      return result.sid;
    } catch (error) {
      console.error(`Failed to send SMS to ${phoneNumber}:`, error);
      throw error;
    }
  }

  private async sendWhatsApp(phoneNumber: string, message: string): Promise<string> {
    try {
      // Format phone number for WhatsApp (whatsapp:+5541999999999)
      const whatsappNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;

      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.twilioPhoneNumber}`,
        to: whatsappNumber,
      });

      return result.sid;
    } catch (error) {
      console.error(`Failed to send WhatsApp to ${phoneNumber}:`, error);
      throw error;
    }
  }
}
