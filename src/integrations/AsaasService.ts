/**
 * Asaas Payment Service
 * Integração com Asaas para processamento de pagamentos
 * - Laundry extra packages
 * - Additional charges (fines, violations)
 * - Monthly billing
 */

interface AsaasCustomer {
  id: string;
  email: string;
  name: string;
  cpfCnpj: string;
}

interface AsaasPayment {
  id: string;
  customer: string;
  description: string;
  value: number;
  dueDate: string;
  status: 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'DELETED' | 'EXPIRED' | 'PARTIALLY_PAID';
}

export class AsaasService {
  private apiKey: string;
  private baseUrl: string = 'https://api.asaas.com/v3';

  constructor() {
    this.apiKey = process.env.ASAAS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('ASAAS_API_KEY must be set');
    }
  }

  /**
   * Criar cliente no Asaas
   */
  async createCustomer(data: {
    name: string;
    email: string;
    cpf: string;
    phone?: string;
  }): Promise<AsaasCustomer> {
    try {
      const response = await fetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          cpfCnpj: data.cpf.replace(/\D/g, ''),
          phone: data.phone,
        }),
      });

      if (!response.ok) {
        throw new Error(`Asaas error: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        email: result.email,
        name: result.name,
        cpfCnpj: result.cpfCnpj,
      };
    } catch (error) {
      console.error('Failed to create Asaas customer:', error);
      throw error;
    }
  }

  /**
   * Cobrar pacote extra de lavanderia
   * Retorna ID do pagamento para rastreamento
   */
  async chargeExtraLaundryPackage(data: {
    tenantName: string;
    tenantEmail: string;
    tenantCpf: string;
    packageType: 'p2' | 'p4' | 'p6' | 'p10';
    price: number;
    dueDate: string; // YYYY-MM-DD
  }): Promise<AsaasPayment> {
    try {
      const customer = await this.createCustomer({
        name: data.tenantName,
        email: data.tenantEmail,
        cpf: data.tenantCpf,
      });

      const packageNames = {
        p2: '2 ciclos extras de lavanderia',
        p4: '4 ciclos extras de lavanderia',
        p6: '6 ciclos extras de lavanderia',
        p10: '10 ciclos extras de lavanderia',
      };

      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: JSON.stringify({
          customer: customer.id,
          description: packageNames[data.packageType],
          value: data.price,
          dueDate: data.dueDate,
          billingType: 'BOLETO', // Boleto bancário padrão
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create Asaas payment: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        customer: result.customer,
        description: result.description,
        value: result.value,
        dueDate: result.dueDate,
        status: result.status,
      };
    } catch (error) {
      console.error('Failed to charge laundry package:', error);
      throw error;
    }
  }

  /**
   * Cobrar multa por violação (AirBnB, sublocação, etc)
   */
  async chargeViolationFine(data: {
    tenantName: string;
    tenantEmail: string;
    tenantCpf: string;
    violationType: 'airbnb' | 'booking' | 'sublet' | 'laundry' | 'overcrowding';
    fineAmount: number;
    dueDate: string; // YYYY-MM-DD
  }): Promise<AsaasPayment> {
    try {
      const customer = await this.createCustomer({
        name: data.tenantName,
        email: data.tenantEmail,
        cpf: data.tenantCpf,
      });

      const violationDescriptions = {
        airbnb: 'Multa por violação - AirBnB não autorizado',
        booking: 'Multa por violação - Booking.com não autorizado',
        sublet: 'Multa por violação - Sublocação não autorizada',
        laundry: 'Multa por violação - Uso de lavanderia vizinha',
        overcrowding: 'Multa por violação - Limite de ocupantes excedido',
      };

      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: JSON.stringify({
          customer: customer.id,
          description: violationDescriptions[data.violationType],
          value: data.fineAmount,
          dueDate: data.dueDate,
          billingType: 'BOLETO',
          chargeType: 'DEBIT', // Débito automático opcional
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create violation fine payment: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        customer: result.customer,
        description: result.description,
        value: result.value,
        dueDate: result.dueDate,
        status: result.status,
      };
    } catch (error) {
      console.error('Failed to charge violation fine:', error);
      throw error;
    }
  }

  /**
   * Cobrar multa por atraso (late fee)
   * Adicionado ao ciclo de pagamento mensal
   */
  async chargeLateFee(data: {
    tenantName: string;
    tenantEmail: string;
    tenantCpf: string;
    lateFeeAmount: number;
    daysLate: number;
    billingMonth: number;
    billingYear: number;
    dueDate: string; // YYYY-MM-DD
  }): Promise<AsaasPayment> {
    try {
      const customer = await this.createCustomer({
        name: data.tenantName,
        email: data.tenantEmail,
        cpf: data.tenantCpf,
      });

      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: JSON.stringify({
          customer: customer.id,
          description: `Multa por atraso - ${data.daysLate} dias (${data.billingMonth}/${data.billingYear})`,
          value: data.lateFeeAmount,
          dueDate: data.dueDate,
          billingType: 'BOLETO',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create late fee payment: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        customer: result.customer,
        description: result.description,
        value: result.value,
        dueDate: result.dueDate,
        status: result.status,
      };
    } catch (error) {
      console.error('Failed to charge late fee:', error);
      throw error;
    }
  }

  /**
   * Obter status de pagamento
   */
  async getPaymentStatus(paymentId: string): Promise<AsaasPayment> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'access_token': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch payment status: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        customer: result.customer,
        description: result.description,
        value: result.value,
        dueDate: result.dueDate,
        status: result.status,
      };
    } catch (error) {
      console.error('Failed to get payment status:', error);
      throw error;
    }
  }

  /**
   * Listar pagamentos de um cliente
   */
  async listCustomerPayments(customerId: string): Promise<AsaasPayment[]> {
    try {
      const response = await fetch(`${this.baseUrl}/payments?customer=${customerId}`, {
        method: 'GET',
        headers: {
          'access_token': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list payments: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Failed to list customer payments:', error);
      throw error;
    }
  }
}
