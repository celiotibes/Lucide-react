// ============ FINANCIAL MANAGEMENT ============

export interface Invoice {
  id: string;
  caseId: string;
  clientId: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  taxes: number;
  discounts: number;
  notes?: string;
  createdAt: Date;
}

export interface CaseCost {
  id: string;
  caseId: string;
  description: string;
  category: 'hourly_work' | 'expertise' | 'travel' | 'filing_fees' | 'other';
  amount: number;
  date: Date;
  billable: boolean;
  createdAt: Date;
}

export interface CaseFinancials {
  caseId: string;
  totalInvoiced: number;
  totalCosts: number;
  profitMargin: number;
  hourlyRate: number;
  estimatedProfit: number;
  costBreakdown: Record<string, number>;
  invoicesSent: number;
  invoicesPending: number;
  invoicesPaid: number;
}

export interface FinancialMetrics {
  totalRevenue: number;
  totalCosts: number;
  netProfit: number;
  profitMargin: number; // percentage
  averageCaseRevenue: number;
  averageCaseCost: number;
  accountsReceivable: number; // pending payments
  accountsPayable: number; // pending expenses
  cashFlow: number;
}

// ============ DEADLINE MANAGEMENT (Gestão de Prazos) ============

export interface Deadline {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  dueDate: Date;
  type: 'inicial' | 'recurso' | 'execucao' | 'outro';
  priority: 'baixa' | 'média' | 'alta' | 'crítica';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'extended';
  assignedTo: string[];
  notificationDays: number[];
  remindersSent: Date[];
  completedAt?: Date;
  extendedTo?: Date;
  extendReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeadlineAlert {
  id: string;
  deadlineId: string;
  userId: string;
  type: 'notification' | 'email' | 'sms';
  message: string;
  sentAt: Date;
  read: boolean;
}

export interface DeadlineMetrics {
  totalDeadlines: number;
  completedOnTime: number;
  completedLate: number;
  pending: number;
  onTimePercentage: number;
  averageDaysLate: number;
}

// ============ ADVANCED ANALYTICS ============

export interface KPI {
  id: string;
  name: string;
  category: 'financial' | 'operational' | 'quality';
  value: number;
  target?: number;
  unit: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trend: 'up' | 'down' | 'stable';
  changePercentage: number;
  calculatedAt: Date;
}

export interface CaseMetricsAnalysis {
  caseId: string;
  duration: number; // days
  profitability: number; // percentage
  efficiency: number; // percentage (work hours vs billable hours)
  clientSatisfaction?: number; // 1-5
  resourceUtilization: number; // percentage
  riskLevel: 'low' | 'medium' | 'high';
  deadlineCompliance: number; // percentage
}

export interface TeamPerformance {
  teamMemberId: string;
  name: string;
  casesHandled: number;
  successRate: number; // percentage
  averageHoursPerCase: number;
  billableHoursRatio: number; // percentage
  clientSatisfaction: number;
  profitPerCase: number;
  efficiency: number; // percentage
}

export interface FinancialForecast {
  period: string; // 'next_30_days' | 'next_90_days' | 'next_year'
  projectedRevenue: number;
  projectedCosts: number;
  projectedProfit: number;
  confidence: number; // percentage
  assumptions: string[];
  lastUpdated: Date;
}

export interface ReportData {
  title: string;
  period: string;
  generatedAt: Date;
  metrics: {
    financial: FinancialMetrics;
    cases: CaseMetrics;
    deadlines: DeadlineMetrics;
    team: TeamPerformance[];
  };
}

export interface CaseMetrics {
  totalCases: number;
  casesByStatus: Record<string, number>;
  averageDuration: number;
  successRate: number;
  totalValue: number;
  averageValue: number;
}

// ============ BILLING & TIMEKEEPING ============

export interface TimeEntry {
  id: string;
  caseId: string;
  userId: string;
  description: string;
  hours: number;
  minutes: number;
  date: Date;
  billable: boolean;
  category: 'research' | 'writing' | 'meetings' | 'court' | 'other';
  createdAt: Date;
}

export interface BillingSchedule {
  id: string;
  escritorioId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  autoInvoice: boolean;
  createdAt: Date;
}

// ============ REQUESTS ============

export interface CreateInvoiceRequest {
  caseId: string;
  clientId: string;
  description: string;
  amount: number;
  dueDate: Date;
  taxes?: number;
  discounts?: number;
  notes?: string;
}

export interface UpdateInvoiceRequest {
  status?: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
  amount?: number;
  dueDate?: Date;
  paidDate?: Date;
  notes?: string;
}

export interface CreateDeadlineRequest {
  caseId: string;
  title: string;
  dueDate: Date;
  type: string;
  priority: string;
  description?: string;
  assignedTo?: string[];
  notificationDays?: number[];
}

export interface UpdateDeadlineRequest {
  title?: string;
  dueDate?: Date;
  status?: string;
  priority?: string;
  extendTo?: Date;
  extendReason?: string;
}

export interface CreateTimeEntryRequest {
  caseId: string;
  description: string;
  hours: number;
  minutes?: number;
  date: Date;
  billable: boolean;
  category: string;
}

export interface CreateCaseCostRequest {
  caseId: string;
  description: string;
  category: string;
  amount: number;
  billable?: boolean;
  date?: Date;
}
