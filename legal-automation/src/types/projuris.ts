// ============ CLIENT MANAGEMENT ============

export interface ContactInfo {
  email?: string;
  phone?: string;
  cellphone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface Client {
  id: string;
  name: string;
  type: 'individual' | 'company';
  documentId: string; // CPF or CNPJ
  contact: ContactInfo;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  tags?: string[];
  notes?: string;
}

export interface ClientStats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalInvoiced: number;
  averageInvoiceValue: number;
  pendingPayments: number;
  overdueCases: number;
}

// ============ ESCRITÓRIO ORGANIZATION ============

export interface Escritorio {
  id: string;
  name: string;
  registrationNumber?: string; // CNPJ
  type: 'solo' | 'partnership' | 'firm';
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  owner: string; // userId
}

export interface Department {
  id: string;
  escritorioId: string;
  name: string;
  description?: string;
  head?: string; // userId
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  escritorioId: string;
  userId: string;
  role: 'partner' | 'associate' | 'intern' | 'administrative';
  departments: string[]; // department IDs
  status: 'active' | 'inactive';
  joinDate: Date;
}

// ============ CASE/PROCESS TRACKING ============

export interface CaseParticipant {
  type: 'client' | 'opposing' | 'third_party';
  clientId?: string;
  name: string;
  documentId?: string;
}

export interface CaseDeadline {
  id: string;
  description: string;
  dueDate: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'completed' | 'overdue';
  completedAt?: Date;
}

export interface CaseUpdate {
  id: string;
  timestamp: Date;
  type: 'status_change' | 'document_upload' | 'hearing_scheduled' | 'decision' | 'note';
  description: string;
  document?: {
    id: string;
    name: string;
    type: string;
  };
  updatedBy: string; // userId
}

export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  tribunal: string;
  status: 'draft' | 'filed' | 'pending' | 'in_progress' | 'appealed' | 'concluded';
  phase: string; // 'inicial' | 'recursal' | 'etc'
  clientId: string;
  escritorioId: string;
  departmentId?: string;
  assignedTo: string[]; // userId array
  participants: CaseParticipant[];
  processValue?: number;
  filingDate?: Date;
  expectedClosingDate?: Date;
  closingDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  deadlines: CaseDeadline[];
  updates: CaseUpdate[];
  tags?: string[];
}

export interface CaseStats {
  totalCases: number;
  casesByStatus: Record<string, number>;
  casesByPhase: Record<string, number>;
  overdueCases: number;
  upcomingDeadlines: number;
  averageProcessValue: number;
  pendingDocuments: number;
}

// ============ WORKFLOW TRACKING ============

export interface CaseTask {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  type: 'review_documents' | 'prepare_petition' | 'schedule_hearing' | 'respond_to_opposition' | 'file_appeal' | 'other';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string; // userId
  createdAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
}

export interface CaseWorkflow {
  id: string;
  caseId: string;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  tasks: CaseTask[];
  createdAt: Date;
  completedAt?: Date;
  progress: number; // 0-100
}

export interface WorkflowStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  totalEstimatedHours: number;
  totalActualHours: number;
}

// ============ ANALYTICS & REPORTING ============

export interface CaseMetrics {
  caseId: string;
  duration: number; // days
  successRate: number; // 0-100
  costPerDay: number;
  documentsCount: number;
  interactionsCount: number;
  tasksCompleted: number;
  deadlinesMet: number;
}

export interface EscritorioMetrics {
  escritorioId: string;
  totalCases: number;
  activeCases: number;
  successRate: number;
  averageCaseDuration: number;
  totalRevenue: number;
  totalCosts: number;
  profitMargin: number;
  casesByPhase: Record<string, number>;
  casesByStatus: Record<string, number>;
}

export interface DashboardStats {
  escritorioId: string;
  totalCases: number;
  activeCases: number;
  overdueCases: number;
  upcomingDeadlines: number;
  totalClients: number;
  newClientsThisMonth: number;
  totalRevenue: number;
  pendingPayments: number;
  teamUtilization: number; // percentage
  caseDistributionByTeam: Record<string, number>;
}

// ============ REQUESTS ============

export interface CreateClientRequest {
  name: string;
  type: 'individual' | 'company';
  documentId: string;
  contact: ContactInfo;
  tags?: string[];
  notes?: string;
}

export interface UpdateClientRequest {
  name?: string;
  contact?: ContactInfo;
  status?: 'active' | 'inactive' | 'suspended';
  tags?: string[];
  notes?: string;
}

export interface CreateCaseRequest {
  caseNumber: string;
  title: string;
  description?: string;
  tribunal: string;
  clientId: string;
  departmentId?: string;
  assignedTo: string[];
  participants: CaseParticipant[];
  processValue?: number;
  filingDate?: Date;
}

export interface UpdateCaseRequest {
  title?: string;
  status?: string;
  assignedTo?: string[];
  participants?: CaseParticipant[];
  expectedClosingDate?: Date;
  tags?: string[];
}

export interface CreateCaseTaskRequest {
  caseId: string;
  title: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
  dueDate?: Date;
  estimatedHours?: number;
}

export interface UpdateCaseTaskRequest {
  title?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  dueDate?: Date;
  actualHours?: number;
}
