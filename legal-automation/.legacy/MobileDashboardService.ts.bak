import db from '@db/connection';
import { logger } from '@utils/logger';
import {
  MobileDashboardData,
  UserProfile,
  DashboardSummary,
  CaseCard,
  DeadlineAlert,
  ProcessUpdate,
  NotificationSummary,
  FinancialSummary,
  CaseDetailsMobile,
  MobileFilterOptions,
  CaseListResponse,
  MobileNotification,
} from '@/types/mobileDashboard';
import crypto from 'crypto';

export class MobileDashboardService {
  async getDashboardData(userId: string): Promise<MobileDashboardData> {
    try {
      logger.info(`Carregando dados de dashboard para usuário ${userId}`);

      const user = await this.getUserProfile(userId);
      const summary = await this.getDashboardSummary(userId);
      const recentCases = await this.getRecentCases(userId, 5);
      const urgentDeadlines = await this.getUrgentDeadlines(userId);
      const recentUpdates = await this.getRecentUpdates(userId, 10);
      const notifications = await this.getNotificationSummary(userId);
      const financials = await this.getFinancialSummary(userId);

      return {
        user,
        summary,
        recentCases,
        urgentDeadlines,
        recentUpdates,
        notifications,
        financials,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao carregar dashboard mobile');
      throw error;
    }
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const stmt = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, e.name as firm_name, e.id as department
        FROM users u
        LEFT JOIN escritorios e ON u.escritorio_id = e.id
        WHERE u.id = ?
      `);

      const result = stmt.get(userId) as any;

      return {
        id: result?.id || userId,
        name: result?.name || 'Usuário',
        role: result?.role || 'user',
        email: result?.email || '',
        firmName: result?.firm_name || 'N/A',
        department: result?.department || undefined,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter perfil do usuário');
      return {
        id: userId,
        name: 'Usuário',
        role: 'user',
        email: '',
        firmName: 'N/A',
      };
    }
  }

  async getDashboardSummary(userId: string): Promise<DashboardSummary> {
    try {
      const summary: any = {
        totalCases: 0,
        activeCases: 0,
        closedCases: 0,
        casesThisMonth: 0,
        urgentDeadlines: 0,
        overdueTasks: 0,
      };

      // Get case statistics
      const caseStats = db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'concluded' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) as this_month
        FROM cases
        WHERE created_by = ? OR assigned_to LIKE ?
      `,
        )
        .get(userId, `%${userId}%`) as any;

      if (caseStats) {
        summary.totalCases = caseStats.total || 0;
        summary.activeCases = caseStats.active || 0;
        summary.closedCases = caseStats.closed || 0;
        summary.casesThisMonth = caseStats.this_month || 0;
      }

      // Get deadline statistics
      const deadlineStats = db
        .prepare(
          `
        SELECT
          COUNT(*) as urgent,
          SUM(CASE WHEN completed = 0 AND due_date < datetime('now') THEN 1 ELSE 0 END) as overdue
        FROM deadlines
        WHERE (assigned_to LIKE ? OR case_id IN (SELECT id FROM cases WHERE created_by = ?))
        AND due_date > datetime('now', '-7 days')
        AND completed = 0
      `,
        )
        .get(`%${userId}%`, userId) as any;

      if (deadlineStats) {
        summary.urgentDeadlines = deadlineStats.urgent || 0;
        summary.overdueTasks = deadlineStats.overdue || 0;
      }

      // Get financial summary if available
      const financialStats = db
        .prepare(
          `
        SELECT
          SUM(amount) as total_revenue,
          (SELECT SUM(amount) FROM case_costs WHERE case_id IN (SELECT id FROM cases WHERE created_by = ?)) as total_costs
        FROM invoices
        WHERE created_by = ?
      `,
        )
        .get(userId, userId) as any;

      if (financialStats) {
        summary.totalRevenue = financialStats.total_revenue || 0;
        summary.totalCosts = financialStats.total_costs || 0;
        if (summary.totalRevenue && summary.totalCosts) {
          summary.profitMargin =
            summary.totalRevenue - summary.totalCosts;
        }
      }

      return summary;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter resumo do dashboard');
      return {
        totalCases: 0,
        activeCases: 0,
        closedCases: 0,
        casesThisMonth: 0,
        urgentDeadlines: 0,
        overdueTasks: 0,
      };
    }
  }

  async getRecentCases(
    userId: string,
    limit: number = 5,
  ): Promise<CaseCard[]> {
    try {
      const stmt = db.prepare(`
        SELECT
          c.id, c.case_number, c.process_number, c.client_name,
          c.status, c.priority, c.current_phase, c.last_updated,
          c.created_at,
          (SELECT due_date FROM deadlines
           WHERE case_id = c.id AND completed = 0
           ORDER BY due_date ASC LIMIT 1) as next_deadline
        FROM cases c
        WHERE c.created_by = ? OR c.assigned_to LIKE ?
        ORDER BY c.last_updated DESC
        LIMIT ?
      `);

      const results = stmt.all(userId, `%${userId}%`, limit) as any[];

      return results.map((row) => {
        const createdDate = new Date(row.created_at);
        const nowDate = new Date();
        const daysOpen = Math.floor(
          (nowDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: row.id,
          caseNumber: row.case_number,
          processNumber: row.process_number,
          clientName: row.client_name,
          status: row.status,
          priority: row.priority,
          currentPhase: row.current_phase,
          nextDeadline: row.next_deadline ? new Date(row.next_deadline) : undefined,
          lastUpdate: new Date(row.last_updated),
          daysOpen,
        };
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter casos recentes');
      return [];
    }
  }

  async getUrgentDeadlines(userId: string): Promise<DeadlineAlert[]> {
    try {
      const stmt = db.prepare(`
        SELECT
          d.id, d.case_id, c.case_number, d.title, d.description,
          d.due_date, d.priority, d.type, d.assigned_to, d.completed,
          d.completed_at, d.reminder
        FROM deadlines d
        JOIN cases c ON d.case_id = c.id
        WHERE (d.assigned_to LIKE ? OR c.created_by = ?)
        AND d.completed = 0
        AND d.due_date > datetime('now')
        AND d.due_date < datetime('now', '+7 days')
        ORDER BY d.due_date ASC
        LIMIT 10
      `);

      const results = stmt.all(`%${userId}%`, userId) as any[];

      return results.map((row) => {
        const dueDate = new Date(row.due_date);
        const nowDate = new Date();
        const daysUntil = Math.ceil(
          (dueDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: row.id,
          caseId: row.case_id,
          caseNumber: row.case_number,
          title: row.title,
          description: row.description,
          dueDate,
          daysUntil,
          priority: row.priority,
          type: row.type,
          assignedTo: row.assigned_to
            ? row.assigned_to.split(',').map((s: string) => s.trim())
            : [],
          completed: row.completed === 1,
          completedAt: row.completed_at
            ? new Date(row.completed_at)
            : undefined,
          reminder: row.reminder === 1,
        };
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter prazos urgentes');
      return [];
    }
  }

  async getRecentUpdates(
    userId: string,
    limit: number = 10,
  ): Promise<ProcessUpdate[]> {
    try {
      const stmt = db.prepare(`
        SELECT
          pm.id, c.id as case_id, c.case_number, pm.type, pm.description,
          pm.date, pm.origin
        FROM process_movements pm
        JOIN cases c ON pm.process_number = c.process_number
        WHERE c.created_by = ? OR c.assigned_to LIKE ?
        ORDER BY pm.date DESC
        LIMIT ?
      `);

      const results = stmt.all(userId, `%${userId}%`, limit) as any[];

      return results.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        caseNumber: row.case_number,
        type: 'movement' as const,
        title: row.type,
        description: row.description,
        timestamp: new Date(row.date),
        icon: this.getIconForMovement(row.type),
        color: this.getColorForMovement(row.type),
        read: false,
        data: { origin: row.origin },
      }));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter atualizações recentes');
      return [];
    }
  }

  async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    try {
      const total = db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM process_update_notifications
        WHERE case_id IN (SELECT id FROM cases WHERE created_by = ? OR assigned_to LIKE ?)
      `,
        )
        .get(userId, `%${userId}%`) as any;

      const unread = db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM process_update_notifications
        WHERE case_id IN (SELECT id FROM cases WHERE created_by = ? OR assigned_to LIKE ?)
        AND read = 0
      `,
        )
        .get(userId, `%${userId}%`) as any;

      const byType = db
        .prepare(
          `
        SELECT
          SUM(CASE WHEN update_type = 'new_movement' THEN 1 ELSE 0 END) as movements,
          SUM(CASE WHEN update_type = 'deadline_alert' THEN 1 ELSE 0 END) as deadlines,
          SUM(CASE WHEN update_type = 'new_document' THEN 1 ELSE 0 END) as documents,
          0 as messages,
          0 as tasks
        FROM process_update_notifications
        WHERE case_id IN (SELECT id FROM cases WHERE created_by = ? OR assigned_to LIKE ?)
      `,
        )
        .get(userId, `%${userId}%`) as any;

      return {
        total: total?.count || 0,
        unread: unread?.count || 0,
        byType: {
          movements: byType?.movements || 0,
          deadlines: byType?.deadlines || 0,
          messages: byType?.messages || 0,
          tasks: byType?.tasks || 0,
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter resumo de notificações');
      return {
        total: 0,
        unread: 0,
        byType: { movements: 0, deadlines: 0, messages: 0, tasks: 0 },
      };
    }
  }

  async getFinancialSummary(userId: string): Promise<FinancialSummary> {
    try {
      const monthData = db
        .prepare(
          `
        SELECT
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as revenue,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as costs
        FROM financial_transactions
        WHERE user_id = ?
        AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
      `,
        )
        .get(userId) as any;

      const yearData = db
        .prepare(
          `
        SELECT
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as revenue,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as costs
        FROM financial_transactions
        WHERE user_id = ?
        AND strftime('%Y', date) = strftime('%Y', 'now')
      `,
        )
        .get(userId) as any;

      const monthRevenue = monthData?.revenue || 0;
      const monthCosts = monthData?.costs || 0;
      const yearRevenue = yearData?.revenue || 0;
      const yearCosts = yearData?.costs || 0;

      return {
        monthRevenue,
        monthCosts,
        monthProfit: monthRevenue - monthCosts,
        yearRevenue,
        yearCosts,
        yearProfit: yearRevenue - yearCosts,
        pendingInvoices: 0,
        overdueBills: 0,
        marginPercentage: monthRevenue > 0
          ? Math.round(((monthRevenue - monthCosts) / monthRevenue) * 100)
          : 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter resumo financeiro');
      return {
        monthRevenue: 0,
        monthCosts: 0,
        monthProfit: 0,
        yearRevenue: 0,
        yearCosts: 0,
        yearProfit: 0,
        pendingInvoices: 0,
        overdueBills: 0,
        marginPercentage: 0,
      };
    }
  }

  async getCaseDetails(caseId: string, userId: string): Promise<CaseDetailsMobile | null> {
    try {
      const caseData = db
        .prepare(
          `
        SELECT * FROM cases
        WHERE id = ? AND (created_by = ? OR assigned_to LIKE ?)
      `,
        )
        .get(caseId, userId, `%${userId}%`) as any;

      if (!caseData) {
        return null;
      }

      const deadlines = await this.getUrgentDeadlines(userId);
      const caseDeadlines = deadlines.filter((d) => d.caseId === caseId);

      return {
        id: caseData.id,
        caseNumber: caseData.case_number,
        processNumber: caseData.process_number,
        client: {
          name: caseData.client_name,
          email: caseData.client_email || '',
          phone: caseData.client_phone || '',
        },
        tribunal: {
          code: caseData.tribunal_code || '',
          name: caseData.tribunal_name || '',
          region: '',
        },
        status: caseData.status,
        phase: caseData.current_phase,
        deadlines: caseDeadlines,
        recentMovements: [],
        documents: [],
        team: [],
        financials: {
          totalInvoiced: 0,
          totalCosts: 0,
          profitMargin: 0,
        },
        timeline: [],
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter detalhes do caso ${caseId}`);
      return null;
    }
  }

  async getCaseList(
    userId: string,
    filters?: MobileFilterOptions,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<CaseListResponse> {
    try {
      let query = `
        SELECT * FROM cases
        WHERE created_by = ? OR assigned_to LIKE ?
      `;

      const params: any[] = [userId, `%${userId}%`];

      if (filters?.caseStatus && filters.caseStatus.length > 0) {
        const statuses = filters.caseStatus.map(() => '?').join(',');
        query += ` AND status IN (${statuses})`;
        params.push(...filters.caseStatus);
      }

      if (filters?.priority && filters.priority.length > 0) {
        const priorities = filters.priority.map(() => '?').join(',');
        query += ` AND priority IN (${priorities})`;
        params.push(...filters.priority);
      }

      if (filters?.searchText) {
        query += ` AND (case_number LIKE ? OR client_name LIKE ?)`;
        params.push(`%${filters.searchText}%`, `%${filters.searchText}%`);
      }

      // Get total count
      const countStmt = db.prepare(
        query.replace('SELECT *', 'SELECT COUNT(*) as count'),
      );
      const countResult = countStmt.get(...params) as any;
      const total = countResult?.count || 0;

      // Get paginated results
      const offset = (page - 1) * pageSize;
      query += ` ORDER BY last_updated DESC LIMIT ? OFFSET ?`;
      params.push(pageSize, offset);

      const stmt = db.prepare(query);
      const results = stmt.all(...params) as any[];

      const cases = results.map((row) => {
        const createdDate = new Date(row.created_at);
        const nowDate = new Date();
        const daysOpen = Math.floor(
          (nowDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: row.id,
          caseNumber: row.case_number,
          processNumber: row.process_number,
          clientName: row.client_name,
          status: row.status,
          priority: row.priority,
          currentPhase: row.current_phase,
          lastUpdate: new Date(row.last_updated),
          daysOpen,
        };
      });

      return {
        cases,
        total,
        page,
        pageSize,
        hasMore: offset + pageSize < total,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter lista de casos');
      return {
        cases: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE process_update_notifications
        SET read = 1, read_at = ?
        WHERE id = ?
      `);

      stmt.run(new Date().toISOString(), notificationId);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao marcar notificação como lida');
    }
  }

  // Private helper methods

  private getIconForMovement(type: string): string {
    const iconMap: Record<string, string> = {
      'Initial Petition': 'file-text',
      'Response': 'reply',
      'Decision': 'gavel',
      'Appeal': 'arrow-up',
      'Hearing': 'calendar',
      'Document': 'document',
      'Status Change': 'refresh',
    };
    return iconMap[type] || 'info';
  }

  private getColorForMovement(type: string): string {
    const colorMap: Record<string, string> = {
      'Initial Petition': '#3B82F6',
      'Response': '#10B981',
      'Decision': '#F59E0B',
      'Appeal': '#EF4444',
      'Hearing': '#8B5CF6',
      'Document': '#6366F1',
      'Status Change': '#14B8A6',
    };
    return colorMap[type] || '#6B7280';
  }
}

export default new MobileDashboardService();
