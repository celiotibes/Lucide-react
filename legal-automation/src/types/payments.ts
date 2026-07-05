// ============ PAYMENT TYPES ============

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded';

export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'pix' | 'debit_card';

export type PaymentProcessor = 'stripe' | 'paypal' | 'mercado_pago';

export type RefundReason =
  | 'requested_by_customer'
  | 'duplicate'
  | 'fraudulent'
  | 'service_not_provided'
  | 'other';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'paused';

export interface PaymentRequest {
  invoiceId: string;
  amount: number;
  currency: 'BRL' | 'USD' | 'EUR';
  method: PaymentMethod;
  processor: PaymentProcessor;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
  customerEmail: string;
  customerName: string;
  description: string;
  returnUrl?: string;
  notificationUrl?: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  processor: PaymentProcessor;
  processorTransactionId: string;
  status: PaymentStatus;
  processorResponse: Record<string, any>;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface PaymentCard {
  id: string;
  userId: string;
  cardholderName: string;
  last4: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard';
  expiryMonth: number;
  expiryYear: number;
  processorCardId: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecipient {
  id: string;
  userId: string;
  bankName: string;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
  cpfCnpj: string;
  processorRecipientId: string;
  isVerified: boolean;
  verificationToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: RefundReason;
  status: 'requested' | 'processing' | 'succeeded' | 'failed';
  processorRefundId?: string;
  description?: string;
  requestedAt: Date;
  processedAt?: Date;
  updatedAt: Date;
}

export interface PaymentWebhook {
  id: string;
  processor: PaymentProcessor;
  type: string;
  data: Record<string, any>;
  processorEventId: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  accountId?: string;
  apiVersion?: string;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  mode: 'sandbox' | 'production';
}

export interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  notificationUrl: string;
}

export interface PixKey {
  id: string;
  userId: string;
  keyType: 'cpf' | 'email' | 'phone' | 'random';
  key: string;
  ownerName: string;
  ownerCpf: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentReconciliation {
  id: string;
  transactionId: string;
  invoiceId: string;
  processedAt: Date;
  status: 'reconciled' | 'discrepancy' | 'pending';
  discrepancyReason?: string;
  discrepancyAmount?: number;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  processorSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt?: Date;
  cancelReason?: string;
  paymentMethod: PaymentMethod;
  processor: PaymentProcessor;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  trialPeriodDays?: number;
  processorPlanId: string;
  isActive: boolean;
  features: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'canceled';
  dueDate: Date;
  paidAt?: Date;
  description?: string;
  items: InvoiceItem[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ============ ERROR TYPES ============

export class PaymentError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class PaymentProcessingError extends PaymentError {
  constructor(message: string, statusCode: number = 402) {
    super('PAYMENT_PROCESSING_ERROR', message, statusCode);
    this.name = 'PaymentProcessingError';
  }
}

export class PaymentGatewayError extends PaymentError {
  constructor(message: string, statusCode: number = 502) {
    super('PAYMENT_GATEWAY_ERROR', message, statusCode);
    this.name = 'PaymentGatewayError';
  }
}

export class PaymentAuthenticationError extends PaymentError {
  constructor(message: string) {
    super('PAYMENT_AUTH_ERROR', message, 401);
    this.name = 'PaymentAuthenticationError';
  }
}

export class RefundError extends PaymentError {
  constructor(message: string) {
    super('REFUND_ERROR', message, 400);
    this.name = 'RefundError';
  }
}

export class WebhookVerificationError extends PaymentError {
  constructor(message: string) {
    super('WEBHOOK_VERIFICATION_ERROR', message, 401);
    this.name = 'WebhookVerificationError';
  }
}
