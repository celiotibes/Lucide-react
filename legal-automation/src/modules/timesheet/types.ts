// src/modules/timesheet/types.ts
export type TaskType = 'research' | 'drafting' | 'meeting' | 'court_appearance' | 'review' | 'other';

export interface TimeEntry {
  id: string;
  lawyerId: string;
  caseId: string;
  taskType: TaskType;
  description: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  billable: boolean;
  hourlyRate: number;
  tags: string[];
  linkedDocuments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TimesheetReport {
  lawyerId: string;
  period: { from: Date; to: Date };
  totalHours: number;
  totalBillable: number;
  totalAmount: number;
  entries: TimeEntry[];
  byTaskType: { [key in TaskType]: { hours: number; amount: number } };
  byCase: Array<{
    caseId: string;
    caseName: string;
    hours: number;
    amount: number;
  }>;
}

export interface InvoiceRequest {
  caseId: string;
  period: { from: Date; to: Date };
  clientId: string;
  description?: string;
}

export interface Invoice {
  id: string;
  caseId: string;
  clientId: string;
  period: { from: Date; to: Date };
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  total: number;
  createdAt: Date;
  dueDate: Date;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
}

export interface InvoiceItem {
  timeEntryId: string;
  taskType: TaskType;
  description: string;
  hours: number;
  hourlyRate: number;
  amount: number;
}

export interface TimeEntryRequest {
  caseId: string;
  taskType: TaskType;
  description: string;
  startTime: Date;
  endTime: Date;
  billable?: boolean;
  tags?: string[];
  linkedDocuments?: string[];
}
