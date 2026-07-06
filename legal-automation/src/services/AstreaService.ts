import { Pool } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import {
  Invoice,
  CaseCost,
  CaseFinancials,
  FinancialMetrics,
  Deadline,
  DeadlineMetrics,
  KPI,
  TimeEntry,
  FinancialForecast,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  CreateDeadlineRequest,
  UpdateDeadlineRequest,
  CreateTimeEntryRequest,
  CreateCaseCostRequest,
} from 'astrea';

export class AstreaService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database_url,
    });
  }

  // ============ INVOICE MANAGEMENT ============

  async createInvoice(userId: string, request: CreateInvoiceRequest): Promise<Invoice> {
    const client = await this.pool.connect();

    try {
      const invoiceNumber = await this.generateInvoiceNumber();

      const result = await client.query(
        `INSERT INTO invoices
         (case_id, client_id, invoice_number, description, amount, taxes, discounts, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, case_id, client_id, invoice_number, description, amount,
                   status, issue_date, due_date, paid_date, taxes, discounts, notes,
                   created_at`,
        [
          request.caseId,
          request.clientId,
          invoiceNumber,
          request.description,
          request.amount,
          request.taxes || 0,
          request.discounts || 0,
          request.dueDate,
        ],
      );

      logger.info({ userId, invoiceNumber }, 'Fatura criada');

      return this.mapRowToInvoice(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, case_id, client_id, invoice_number, description, amount,
                status, issue_date, due_date, paid_date, taxes, discounts, notes,
                created_at
         FROM invoices WHERE id = $1`,
        [invoiceId],
      );

      return result.rows.length > 0 ? this.mapRowToInvoice(result.rows[0]) : null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter fatura');
      return null;
    }
  }

  async listInvoices(caseId?: string, status?: string): Promise<Invoice[]> {
    try {
      let query = `SELECT id, case_id, client_id, invoice_number, description, amount,
                          status, issue_date, due_date, paid_date, taxes, discounts, notes,
                          created_at
                   FROM invoices WHERE 1=1`;
      const params: any[] = [];

      if (caseId) {
        query += ` AND case_id = $${params.length + 1}`;
        params.push(caseId);
      }

      if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY due_date DESC`;

      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.mapRowToInvoice(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar faturas');
      return [];
    }
  }

  async updateInvoice(userId: string, invoiceId: string, request: UpdateInvoiceRequest): Promise<Invoice | null> {
    try {
      const result = await this.pool.query(
        `UPDATE invoices
         SET status = COALESCE($1, status),
             amount = COALESCE($2, amount),
             due_date = COALESCE($3, due_date),
             paid_date = COALESCE($4, paid_date),
             notes = COALESCE($5, notes),
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, case_id, client_id, invoice_number, description, amount,
                   status, issue_date, due_date, paid_date, taxes, discounts, notes,
                   created_at`,
        [request.status, request.amount, request.dueDate, request.paidDate, request.notes, invoiceId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info({ userId, invoiceId }, 'Fatura atualizada');

      return this.mapRowToInvoice(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar fatura');
      throw error;
    }
  }

  // ============ COST MANAGEMENT ============

  async addCaseCost(userId: string, request: CreateCaseCostRequest): Promise<CaseCost> {
    try {
      const result = await this.pool.query(
        `INSERT INTO case_costs (case_id, description, category, amount, billable, cost_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, case_id, description, category, amount, billable, cost_date, created_at`,
        [
          request.caseId,
          request.description,
          request.category,
          request.amount,
          request.billable !== false,
          request.date || new Date(),
        ],
      );

      logger.info({ userId, caseId: request.caseId }, 'Custo de caso adicionado');

      return this.mapRowToCost(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao adicionar custo');
      throw error;
    }
  }

  async getCaseCosts(caseId: string): Promise<CaseCost[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, case_id, description, category, amount, billable, cost_date, created_at
         FROM case_costs
         WHERE case_id = $1
         ORDER BY cost_date DESC`,
        [caseId],
      );

      return result.rows.map(row => this.mapRowToCost(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter custos');
      return [];
    }
  }

  async getCaseFinancials(caseId: string): Promise<CaseFinancials> {
    try {
      const invoiceResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
         WHERE case_id = $1 AND status IN ('issued', 'paid')`,
        [caseId],
      );

      const costResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM case_costs
         WHERE case_id = $1`,
        [caseId],
      );

      const totalInvoiced = parseFloat(invoiceResult.rows[0].total) || 0;
      const totalCosts = parseFloat(costResult.rows[0].total) || 0;
      const profit = totalInvoiced - totalCosts;
      const profitMargin = totalInvoiced > 0 ? (profit / totalInvoiced) * 100 : 0;

      const invoiceStatsResult = await this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('issued', 'pending')) as sent,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'paid') as paid
         FROM invoices WHERE case_id = $1`,
        [caseId],
      );

      const stats = invoiceStatsResult.rows[0];

      return {
        caseId,
        totalInvoiced,
        totalCosts,
        profitMargin,
        hourlyRate: 0,
        estimatedProfit: profit,
        costBreakdown: {},
        invoicesSent: parseInt(stats.sent) || 0,
        invoicesPending: parseInt(stats.pending) || 0,
        invoicesPaid: parseInt(stats.paid) || 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter financeiros do caso');
      return {
        caseId,
        totalInvoiced: 0,
        totalCosts: 0,
        profitMargin: 0,
        hourlyRate: 0,
        estimatedProfit: 0,
        costBreakdown: {},
        invoicesSent: 0,
        invoicesPending: 0,
        invoicesPaid: 0,
      };
    }
  }

  async getFinancialMetrics(escritorioId: string): Promise<FinancialMetrics> {
    try {
      const invoiceResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
         WHERE case_id IN (
           SELECT id FROM cases WHERE escritorio_id = $1
         ) AND status IN ('issued', 'paid')`,
        [escritorioId],
      );

      const costResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM case_costs
         WHERE case_id IN (
           SELECT id FROM cases WHERE escritorio_id = $1
         )`,
        [escritorioId],
      );

      const totalRevenue = parseFloat(invoiceResult.rows[0].total) || 0;
      const totalCosts = parseFloat(costResult.rows[0].total) || 0;
      const netProfit = totalRevenue - totalCosts;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const arResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
         WHERE case_id IN (
           SELECT id FROM cases WHERE escritorio_id = $1
         ) AND status = 'pending'`,
        [escritorioId],
      );

      return {
        totalRevenue,
        totalCosts,
        netProfit,
        profitMargin,
        averageCaseRevenue: totalRevenue > 0 ? totalRevenue / 10 : 0, // Placeholder
        averageCaseCost: totalCosts > 0 ? totalCosts / 10 : 0,
        accountsReceivable: parseFloat(arResult.rows[0].total) || 0,
        accountsPayable: 0,
        cashFlow: netProfit,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter métricas financeiras');
      return {
        totalRevenue: 0,
        totalCosts: 0,
        netProfit: 0,
        profitMargin: 0,
        averageCaseRevenue: 0,
        averageCaseCost: 0,
        accountsReceivable: 0,
        accountsPayable: 0,
        cashFlow: 0,
      };
    }
  }

  // ============ DEADLINE MANAGEMENT ============

  async createDeadline(userId: string, request: CreateDeadlineRequest): Promise<Deadline> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO deadlines
         (case_id, title, description, due_date, type, priority, notification_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, case_id, title, description, due_date, type, priority,
                   status, notification_days, completed_at, created_at, updated_at`,
        [
          request.caseId,
          request.title,
          request.description || null,
          request.dueDate,
          request.type,
          request.priority,
          request.notificationDays || [7, 3, 1],
        ],
      );

      const deadlineId = result.rows[0].id;

      // Assign to users
      if (request.assignedTo && request.assignedTo.length > 0) {
        for (const userId of request.assignedTo) {
          await client.query(
            `INSERT INTO deadline_assignments (deadline_id, user_id) VALUES ($1, $2)`,
            [deadlineId, userId],
          );
        }
      }

      await client.query('COMMIT');

      logger.info({ userId, caseId: request.caseId }, 'Prazo criado');

      return this.mapRowToDeadline(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Erro ao criar prazo');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDeadline(
    userId: string,
    deadlineId: string,
    request: UpdateDeadlineRequest,
  ): Promise<Deadline | null> {
    try {
      const result = await this.pool.query(
        `UPDATE deadlines
         SET title = COALESCE($1, title),
             due_date = COALESCE($2, due_date),
             status = COALESCE($3, status),
             priority = COALESCE($4, priority),
             extended_to = COALESCE($5, extended_to),
             extend_reason = COALESCE($6, extend_reason),
             completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, case_id, title, description, due_date, type, priority,
                   status, notification_days, completed_at, created_at, updated_at`,
        [
          request.title,
          request.dueDate,
          request.status,
          request.priority,
          request.extendTo,
          request.extendReason,
          deadlineId,
        ],
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info({ userId, deadlineId }, 'Prazo atualizado');

      return this.mapRowToDeadline(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar prazo');
      throw error;
    }
  }

  async getDeadlineMetrics(caseId: string): Promise<DeadlineMetrics> {
    try {
      const result = await this.pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= due_date) as on_time,
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > due_date) as late,
           COUNT(*) FILTER (WHERE status = 'pending') as pending
         FROM deadlines WHERE case_id = $1`,
        [caseId],
      );

      const row = result.rows[0];
      const total = parseInt(row.total) || 0;
      const onTime = parseInt(row.on_time) || 0;
      const late = parseInt(row.late) || 0;
      const pending = parseInt(row.pending) || 0;

      return {
        totalDeadlines: total,
        completedOnTime: onTime,
        completedLate: late,
        pending,
        onTimePercentage: total > 0 ? (onTime / (total - pending)) * 100 : 0,
        averageDaysLate: late > 0 ? 2 : 0, // Placeholder
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter métricas de prazos');
      return {
        totalDeadlines: 0,
        completedOnTime: 0,
        completedLate: 0,
        pending: 0,
        onTimePercentage: 0,
        averageDaysLate: 0,
      };
    }
  }

  // ============ TIME TRACKING ============

  async addTimeEntry(userId: string, request: CreateTimeEntryRequest): Promise<TimeEntry> {
    try {
      const result = await this.pool.query(
        `INSERT INTO time_entries
         (case_id, user_id, description, hours, minutes, billable, category, entry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, case_id, user_id, description, hours, minutes, billable,
                   category, entry_date, created_at`,
        [
          request.caseId,
          userId,
          request.description,
          request.hours,
          request.minutes || 0,
          request.billable,
          request.category,
          request.date,
        ],
      );

      logger.info({ userId, caseId: request.caseId }, 'Registro de tempo adicionado');

      return this.mapRowToTimeEntry(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao adicionar registro de tempo');
      throw error;
    }
  }

  async getTimeEntries(caseId: string, billableOnly?: boolean): Promise<TimeEntry[]> {
    try {
      let query = `SELECT id, case_id, user_id, description, hours, minutes, billable,
                          category, entry_date, created_at
                   FROM time_entries
                   WHERE case_id = $1`;
      const params: any[] = [caseId];

      if (billableOnly) {
        query += ` AND billable = true`;
      }

      query += ` ORDER BY entry_date DESC`;

      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.mapRowToTimeEntry(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter registros de tempo');
      return [];
    }
  }

  // ============ KPI MANAGEMENT ============

  async recordKPI(escritorioId: string, kpi: Omit<KPI, 'id' | 'calculatedAt'>): Promise<KPI> {
    try {
      const result = await this.pool.query(
        `INSERT INTO kpis
         (escritorio_id, name, category, value, target, unit, period, trend, change_percentage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, category, value, target, unit, period, trend,
                   change_percentage, calculated_at`,
        [
          escritorioId,
          kpi.name,
          kpi.category,
          kpi.value,
          kpi.target || null,
          kpi.unit,
          kpi.period,
          kpi.trend,
          kpi.changePercentage,
        ],
      );

      logger.info({ escritorioId, kpiName: kpi.name }, 'KPI registrado');

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        value: parseFloat(row.value),
        target: row.target ? parseFloat(row.target) : undefined,
        unit: row.unit,
        period: row.period,
        trend: row.trend,
        changePercentage: parseFloat(row.change_percentage),
        calculatedAt: new Date(row.calculated_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao registrar KPI');
      throw error;
    }
  }

  async getKPIs(escritorioId: string, category?: string): Promise<KPI[]> {
    try {
      let query = `SELECT id, name, category, value, target, unit, period, trend,
                          change_percentage, calculated_at
                   FROM kpis WHERE escritorio_id = $1`;
      const params: any[] = [escritorioId];

      if (category) {
        query += ` AND category = $${params.length + 1}`;
        params.push(category);
      }

      query += ` ORDER BY calculated_at DESC LIMIT 100`;

      const result = await this.pool.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        value: parseFloat(row.value),
        target: row.target ? parseFloat(row.target) : undefined,
        unit: row.unit,
        period: row.period,
        trend: row.trend,
        changePercentage: parseFloat(row.change_percentage),
        calculatedAt: new Date(row.calculated_at),
      }));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter KPIs');
      return [];
    }
  }

  // ============ PRIVATE HELPERS ============

  private async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM invoices
       WHERE invoice_number LIKE $1`,
      [`${year}-${month}-%`],
    );

    const nextNumber = (parseInt(result.rows[0].count) + 1).toString().padStart(5, '0');
    return `${year}-${month}-${nextNumber}`;
  }

  private mapRowToInvoice(row: any): Invoice {
    return {
      id: row.id,
      caseId: row.case_id,
      clientId: row.client_id,
      invoiceNumber: row.invoice_number,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      issueDate: new Date(row.issue_date),
      dueDate: new Date(row.due_date),
      paidDate: row.paid_date ? new Date(row.paid_date) : undefined,
      taxes: parseFloat(row.taxes),
      discounts: parseFloat(row.discounts),
      notes: row.notes,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRowToCost(row: any): CaseCost {
    return {
      id: row.id,
      caseId: row.case_id,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      date: new Date(row.cost_date),
      billable: row.billable,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRowToDeadline(row: any): Deadline {
    return {
      id: row.id,
      caseId: row.case_id,
      title: row.title,
      description: row.description,
      dueDate: new Date(row.due_date),
      type: row.type,
      priority: row.priority,
      status: row.status,
      assignedTo: [],
      notificationDays: row.notification_days || [7, 3, 1],
      remindersSent: [],
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      extendedTo: row.extended_to ? new Date(row.extended_to) : undefined,
      extendReason: row.extend_reason,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToTimeEntry(row: any): TimeEntry {
    return {
      id: row.id,
      caseId: row.case_id,
      userId: row.user_id,
      description: row.description,
      hours: row.hours,
      minutes: row.minutes,
      date: new Date(row.entry_date),
      billable: row.billable,
      category: row.category,
      createdAt: new Date(row.created_at),
    };
  }
}

export const astreaService = new AstreaService();
