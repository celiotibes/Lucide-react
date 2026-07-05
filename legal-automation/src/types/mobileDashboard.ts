// ============ MOBILE DASHBOARD TYPES ============

export interface MobileDashboardData {
  user: UserProfile;
  summary: DashboardSummary;
  recentCases: CaseCard[];
  urgentDeadlines: DeadlineAlert[];
  recentUpdates: ProcessUpdate[];
  notifications: NotificationSummary;
  financials: FinancialSummary;
}

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  firmName: string;
  avatar?: string;
  department?: string;
}

export interface DashboardSummary {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  casesThisMonth: number;
  urgentDeadlines: number;
  overdueTasks: number;
  totalRevenue?: number;
  totalCosts?: number;
  profitMargin?: number;
  workingHours?: number;
  billableHours?: number;
  utilization?: number;
}

export interface CaseCard {
  id: string;
  caseNumber: string;
  processNumber: string;
  clientName: string;
  status: 'active' | 'pending' | 'concluded' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  currentPhase: string;
  nextDeadline?: Date;
  lastUpdate: Date;
  daysOpen: number;
  avatar?: string;
  tags?: string[];
}

export interface DeadlineAlert {
  id: string;
  caseId: string;
  caseNumber: string;
  title: string;
  description: string;
  dueDate: Date;
  daysUntil: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'court_deadline' | 'task_deadline' | 'client_deadline' | 'internal';
  assignedTo: string[];
  completed: boolean;
  completedAt?: Date;
  reminder?: boolean;
}

export interface ProcessUpdate {
  id: string;
  caseId: string;
  caseNumber: string;
  type: 'movement' | 'document' | 'deadline' | 'status' | 'assignment';
  title: string;
  description: string;
  timestamp: Date;
  icon: string;
  color: string;
  read: boolean;
  data?: Record<string, any>;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: {
    movements: number;
    deadlines: number;
    messages: number;
    tasks: number;
  };
  lastNotification?: ProcessUpdate;
}

export interface FinancialSummary {
  monthRevenue: number;
  monthCosts: number;
  monthProfit: number;
  yearRevenue: number;
  yearCosts: number;
  yearProfit: number;
  pendingInvoices: number;
  overdueBills: number;
  marginPercentage: number;
  chartData?: ChartDataPoint[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface MobileMenuOption {
  id: string;
  label: string;
  icon: string;
  action: string;
  badge?: number;
  color?: string;
}

export interface CaseDetailsMobile {
  id: string;
  caseNumber: string;
  processNumber: string;
  client: {
    name: string;
    email: string;
    phone: string;
  };
  tribunal: {
    code: string;
    name: string;
    region: string;
  };
  status: 'active' | 'pending' | 'concluded' | 'archived';
  phase: string;
  deadlines: DeadlineAlert[];
  recentMovements: ProcessMovement[];
  documents: DocumentPreview[];
  team: TeamMember[];
  financials: {
    totalInvoiced: number;
    totalCosts: number;
    profitMargin: number;
  };
  timeline: TimelineEvent[];
}

export interface ProcessMovement {
  id: string;
  date: Date;
  type: string;
  description: string;
  icon: string;
}

export interface DocumentPreview {
  id: string;
  name: string;
  type: string;
  date: Date;
  icon: string;
  url: string;
  size: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  email: string;
}

export interface TimelineEvent {
  id: string;
  date: Date;
  type: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface QuickActionMenu {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: string;
  color: string;
  badge?: number;
}

export interface MobileNotification {
  id: string;
  type: 'case_update' | 'deadline' | 'task' | 'message' | 'alert';
  title: string;
  body: string;
  caseId?: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  priority: 'low' | 'normal' | 'high';
}

export interface MobileSettings {
  userId: string;
  notifications: {
    enabled: boolean;
    deadlines: boolean;
    movements: boolean;
    messages: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'auto';
    fontSize: 'small' | 'normal' | 'large';
    compactMode: boolean;
  };
  sync: {
    autoSync: boolean;
    syncInterval: number; // minutes
    wifiOnly: boolean;
    syncOnOpen: boolean;
  };
  privacy: {
    faceIdEnabled: boolean;
    biometricEnabled: boolean;
    offlineMode: boolean;
  };
}

export interface MobileFilterOptions {
  caseStatus: ('active' | 'pending' | 'concluded' | 'archived')[];
  priority: ('low' | 'medium' | 'high' | 'critical')[];
  tribunals: string[];
  dateRange: {
    from: Date;
    to: Date;
  };
  searchText?: string;
}

export interface CaseListResponse {
  cases: CaseCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface DashboardLoadingState {
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date;
  error?: string;
}

export interface OfflineDataSync {
  lastSync: Date;
  pendingChanges: number;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
  lastError?: string;
}
