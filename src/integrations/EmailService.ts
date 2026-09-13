import { Resend } from 'resend';

interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
}

export class EmailService {
  private resend: Resend;
  private fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@crmt.com.br';

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  /**
   * Enviar notificação de vencimento (dia 10)
   */
  async sendDueDateNotification(recipientEmail: string, variables: {
    due_date: string;
    value: number;
    aluguel: number;
    custeio: number;
  }): Promise<string> {
    const template = this.getDueDateTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar notificação de atraso e SPC/SERASA (dia 30)
   */
  async sendSerASANotification(recipientEmail: string, variables: {
    days_late: number;
    value: number;
    late_fee: number;
    serasa_date: string;
  }): Promise<string> {
    const template = this.getSerASATemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar notificação de ação de execução (dia 40+)
   */
  async sendExecutionNotification(recipientEmail: string, variables: {
    days_late: number;
    value: number;
    notary_name: string;
    notary_contact: string;
  }): Promise<string> {
    const template = this.getExecutionTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar notificação de aviso de impugnação (7 dias)
   */
  async sendInspectionChallengeNotification(recipientEmail: string, variables: {
    deadline_date: string;
    property_address: string;
  }): Promise<string> {
    const template = this.getInspectionChallengeTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar notificação de RAD (Relatório de Avaliação de Danos)
   */
  async sendRADNotification(recipientEmail: string, variables: {
    rad_deadline: string;
    damages_found: boolean;
    estimated_value?: number;
  }): Promise<string> {
    const template = this.getRADTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar notificação de devolução de caução
   */
  async sendDepositReturnNotification(recipientEmail: string, variables: {
    return_deadline: string;
    deposit_amount: number;
    reduction_amount?: number;
  }): Promise<string> {
    const template = this.getDepositReturnTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar aviso de violação de ocupação
   */
  async sendOccupancyViolationNotification(recipientEmail: string, variables: {
    violation_type: string;
    detection_method: string;
    fine_amount: number;
    cure_deadline: string;
  }): Promise<string> {
    const template = this.getOccupancyViolationTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar aviso de renovação de contrato (60 dias)
   */
  async sendRenewalNoticeNotification(recipientEmail: string, variables: {
    lease_end_date: string;
    renewal_decision_deadline: string;
  }): Promise<string> {
    const template = this.getRenewalNoticeTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  /**
   * Enviar aviso de violação de franquia de lavanderia
   */
  async sendLaundryViolationNotification(recipientEmail: string, variables: {
    violation_description: string;
    fine_amount: number;
  }): Promise<string> {
    const template = this.getLaundryViolationTemplate(variables);
    return await this.send(recipientEmail, template);
  }

  // ============= TEMPLATES =============

  private getDueDateTemplate(vars: any): EmailTemplate {
    return {
      name: 'payment_due_day10',
      subject: `Aviso de Vencimento - ${vars.due_date}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Aviso de Vencimento</h2>
          <p>Seu aluguel vence em <strong>${vars.due_date}</strong></p>
          <ul>
            <li>Aluguel Efetivo: R$ ${vars.aluguel.toFixed(2)}</li>
            <li>Cota de Custeio: R$ ${vars.custeio.toFixed(2)}</li>
            <li><strong>Total: R$ ${vars.value.toFixed(2)}</strong></li>
          </ul>
          <p>Favor realizar o pagamento até a data de vencimento.</p>
        </div>
      `,
    };
  }

  private getSerASATemplate(vars: any): EmailTemplate {
    return {
      name: 'payment_late_30d_serasa',
      subject: `⚠️ URGENTE: Débito Registrado em SPC/SERASA - ${vars.serasa_date}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ff6b6b;">
          <h2>⚠️ Aviso Urgente</h2>
          <p style="color: #d63031;">Seu débito foi <strong>registrado em SPC/SERASA</strong> em ${vars.serasa_date}</p>
          <ul>
            <li>Dias em atraso: <strong>${vars.days_late}</strong></li>
            <li>Valor total: R$ ${vars.value.toFixed(2)}</li>
            <li>Multa por atraso: R$ ${vars.late_fee.toFixed(2)}</li>
          </ul>
          <p><strong>Contate nossa equipe imediatamente para resolver esta situação.</strong></p>
        </div>
      `,
    };
  }

  private getExecutionTemplate(vars: any): EmailTemplate {
    return {
      name: 'payment_execution_day40',
      subject: `⛔ AÇÃO DE EXECUÇÃO INICIADA`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8d7da; border-left: 4px solid #721c24;">
          <h2>⛔ Ação Judicial de Execução</h2>
          <p style="color: #721c24;"><strong>Uma ação de execução foi iniciada contra você.</strong></p>
          <ul>
            <li>Dias em atraso: ${vars.days_late}</li>
            <li>Valor total devido: R$ ${vars.value.toFixed(2)}</li>
            <li>Responsável: ${vars.notary_name}</li>
            <li>Contato: ${vars.notary_contact}</li>
          </ul>
          <p><strong>Procure orientação jurídica imediatamente.</strong></p>
        </div>
      `,
    };
  }

  private getInspectionChallengeTemplate(vars: any): EmailTemplate {
    return {
      name: 'inspection_challenge_deadline',
      subject: `Prazo para Impugnação de Vistoria - ${vars.deadline_date}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Aviso: Prazo para Impugnação de Vistoria</h2>
          <p>Você tem até <strong>${vars.deadline_date}</strong> para impugnar a vistoria realizada.</p>
          <p>Imóvel: ${vars.property_address}</p>
          <p>Caso deseje contestar os apontamentos, favor entrar em contato conosco.</p>
        </div>
      `,
    };
  }

  private getRADTemplate(vars: any): EmailTemplate {
    return {
      name: 'inspection_rad_deadline',
      subject: `Prazo para RAD - ${vars.rad_deadline}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Relatório de Avaliação de Danos (RAD)</h2>
          <p>Prazo para RAD: <strong>${vars.rad_deadline}</strong></p>
          <p>Danos encontrados: ${vars.damages_found ? 'Sim' : 'Não'}</p>
          ${vars.estimated_value ? `<p>Valor estimado: R$ ${vars.estimated_value.toFixed(2)}</p>` : ''}
          <p>Favor completar o processo dentro do prazo estabelecido.</p>
        </div>
      `,
    };
  }

  private getDepositReturnTemplate(vars: any): EmailTemplate {
    return {
      name: 'inspection_deposit_return_deadline',
      subject: `Devolução de Caução - ${vars.return_deadline}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Aviso de Devolução de Caução</h2>
          <p>Sua caução será devolvida até <strong>${vars.return_deadline}</strong></p>
          <ul>
            <li>Valor original: R$ ${vars.deposit_amount.toFixed(2)}</li>
            ${vars.reduction_amount ? `<li>Redução por danos: R$ ${vars.reduction_amount.toFixed(2)}</li>` : ''}
            <li><strong>Valor a receber: R$ ${(vars.deposit_amount - (vars.reduction_amount || 0)).toFixed(2)}</strong></li>
          </ul>
        </div>
      `,
    };
  }

  private getOccupancyViolationTemplate(vars: any): EmailTemplate {
    return {
      name: 'occupancy_violation_notice',
      subject: `⚠️ Violação de Ocupação Detectada`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ff6b6b;">
          <h2>⚠️ Violação de Ocupação</h2>
          <p>Foi detectada uma <strong>${vars.violation_type}</strong> no imóvel.</p>
          <ul>
            <li>Método de detecção: ${vars.detection_method}</li>
            <li>Multa aplicada: R$ ${vars.fine_amount.toFixed(2)}</li>
            <li>Prazo para regularização: ${vars.cure_deadline}</li>
          </ul>
          <p><strong>Esta multa será adicionada à próxima fatura.</strong></p>
        </div>
      `,
    };
  }

  private getRenewalNoticeTemplate(vars: any): EmailTemplate {
    return {
      name: 'lease_renewal_notice',
      subject: `Aviso: Decisão sobre Renovação do Contrato`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Aviso de Renovação de Contrato</h2>
          <p>Seu contrato de locação termina em <strong>${vars.lease_end_date}</strong></p>
          <p>Por favor, confirme até <strong>${vars.renewal_decision_deadline}</strong> se deseja renovar o contrato.</p>
          <p>Caso não haja confirmação, será considerado como não-renovação.</p>
        </div>
      `,
    };
  }

  private getLaundryViolationTemplate(vars: any): EmailTemplate {
    return {
      name: 'laundry_violation_notice',
      subject: `Violação de Franquia de Lavanderia`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Aviso de Violação de Franquia de Lavanderia</h2>
          <p>Foi detectado: <strong>${vars.violation_description}</strong></p>
          <p>Multa aplicada: R$ ${vars.fine_amount.toFixed(2)}</p>
          <p>Esta multa será adicionada à sua próxima fatura.</p>
        </div>
      `,
    };
  }

  // ============= INTERNAL =============

  private async send(recipientEmail: string, template: EmailTemplate): Promise<string> {
    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
      });

      if (result.error) {
        throw new Error(`Resend error: ${result.error.message}`);
      }

      return result.data?.id || 'unknown';
    } catch (error) {
      console.error(`Failed to send email to ${recipientEmail}:`, error);
      throw error;
    }
  }
}
