import { Pool } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import {
  Client,
  ClientStats,
  Case,
  CaseStats,
  CaseTask,
  CaseDeadline,
  CaseUpdate,
  CaseMetrics,
  DashboardStats,
  CreateClientRequest,
  UpdateClientRequest,
  CreateCaseRequest,
  UpdateCaseRequest,
  CreateCaseTaskRequest,
  UpdateCaseTaskRequest,
} from 'projuris';
import { eventEmitterService } from './EventEmitterService';

export class ProjurisService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database_url,
    });
  }

  // ============ CLIENT MANAGEMENT ============

  async createClient(userId: string, request: CreateClientRequest): Promise<Client> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `INSERT INTO clients
         (user_id, name, type, document_id, email, phone, cellphone,
          address, city, state, zip_code, tags, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, name, type, document_id, email, phone, cellphone,
                   address, city, state, zip_code, status, tags, notes,
                   created_at, updated_at`,
        [
          userId,
          request.name,
          request.type,
          request.documentId,
          request.contact.email || null,
          request.contact.phone || null,
          request.contact.cellphone || null,
          request.contact.address || null,
          request.contact.city || null,
          request.contact.state || null,
          request.contact.zipCode || null,
          request.tags || [],
          request.notes || null,
        ],
      );

      logger.info({ userId, clientName: request.name }, 'Cliente criado');

      return this.mapRowToClient(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getClient(userId: string, clientId: string): Promise<Client | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, name, type, document_id, email, phone, cellphone,
                address, city, state, zip_code, status, tags, notes,
                created_at, updated_at
         FROM clients
         WHERE id = $1 AND user_id = $2`,
        [clientId, userId],
      );

      return result.rows.length > 0 ? this.mapRowToClient(result.rows[0]) : null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter cliente');
      return null;
    }
  }

  async listClients(userId: string, filter?: { status?: string; search?: string }): Promise<Client[]> {
    try {
      let query = `SELECT id, name, type, document_id, email, phone, cellphone,
                          address, city, state, zip_code, status, tags, notes,
                          created_at, updated_at
                   FROM clients
                   WHERE user_id = $1`;
      const params: any[] = [userId];

      if (filter?.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(filter.status);
      }

      if (filter?.search) {
        query += ` AND (name ILIKE $${params.length + 1} OR document_id LIKE $${params.length + 1})`;
        params.push(`%${filter.search}%`);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.mapRowToClient(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar clientes');
      return [];
    }
  }

  async updateClient(
    userId: string,
    clientId: string,
    request: UpdateClientRequest,
  ): Promise<Client | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `UPDATE clients
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             cellphone = COALESCE($4, cellphone),
             address = COALESCE($5, address),
             city = COALESCE($6, city),
             state = COALESCE($7, state),
             zip_code = COALESCE($8, zip_code),
             status = COALESCE($9, status),
             tags = COALESCE($10, tags),
             notes = COALESCE($11, notes),
             updated_at = NOW()
         WHERE id = $12 AND user_id = $13
         RETURNING id, name, type, document_id, email, phone, cellphone,
                   address, city, state, zip_code, status, tags, notes,
                   created_at, updated_at`,
        [
          request.name,
          request.contact?.email,
          request.contact?.phone,
          request.contact?.cellphone,
          request.contact?.address,
          request.contact?.city,
          request.contact?.state,
          request.contact?.zipCode,
          request.status,
          request.tags,
          request.notes,
          clientId,
          userId,
        ],
      );

      if (result.rows.length === 0) {
        throw new Error('Cliente não encontrado');
      }

      logger.info({ userId, clientId }, 'Cliente atualizado');

      return this.mapRowToClient(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getClientStats(userId: string, clientId: string): Promise<ClientStats> {
    try {
      const result = await this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'concluded') as active_cases,
           COUNT(*) FILTER (WHERE status = 'concluded') as closed_cases,
           COUNT(*) as total_cases,
           COALESCE(SUM(process_value), 0) as total_invoiced,
           COALESCE(AVG(process_value), 0) as average_invoice_value
         FROM cases
         WHERE client_id = $1`,
        [clientId],
      );

      const row = result.rows[0];
      const pendingPaymentsResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM case_deadlines
         WHERE case_id IN (
           SELECT id FROM cases WHERE client_id = $1
         ) AND status = 'pending' AND due_date < NOW()`,
        [clientId],
      );

      return {
        totalCases: parseInt(row.total_cases) || 0,
        activeCases: parseInt(row.active_cases) || 0,
        closedCases: parseInt(row.closed_cases) || 0,
        totalInvoiced: parseFloat(row.total_invoiced) || 0,
        averageInvoiceValue: parseFloat(row.average_invoice_value) || 0,
        pendingPayments: 0,
        overdueCases: parseInt(pendingPaymentsResult.rows[0]?.count) || 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas do cliente');
      return {
        totalCases: 0,
        activeCases: 0,
        closedCases: 0,
        totalInvoiced: 0,
        averageInvoiceValue: 0,
        pendingPayments: 0,
        overdueCases: 0,
      };
    }
  }

  // ============ CASE MANAGEMENT ============

  async createCase(userId: string, escritorioId: string, request: CreateCaseRequest): Promise<Case> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const caseResult = await client.query(
        `INSERT INTO cases
         (case_number, title, description, tribunal, client_id, escritorio_id,
          department_id, process_value, filing_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, case_number, title, description, tribunal, status, phase,
                   client_id, escritorio_id, department_id, process_value,
                   filing_date, expected_closing_date, closing_date,
                   created_at, updated_at, tags`,
        [
          request.caseNumber,
          request.title,
          request.description || null,
          request.tribunal,
          request.clientId,
          escritorioId,
          request.departmentId || null,
          request.processValue || null,
          request.filingDate || null,
        ],
      );

      const caseId = caseResult.rows[0].id;

      // Add case assignments
      for (const userId of request.assignedTo) {
        await client.query(
          `INSERT INTO case_assignments (case_id, user_id) VALUES ($1, $2)`,
          [caseId, userId],
        );
      }

      // Add case participants
      for (const participant of request.participants) {
        await client.query(
          `INSERT INTO case_participants (case_id, type, client_id, name, document_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            caseId,
            participant.type,
            participant.clientId || null,
            participant.name,
            participant.documentId || null,
          ],
        );
      }

      await client.query('COMMIT');

      logger.info(
        { userId, caseNumber: request.caseNumber },
        'Caso criado',
      );

      return this.mapRowToCase(caseResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Erro ao criar caso');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCase(userId: string, caseId: string): Promise<Case | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, case_number, title, description, tribunal, status, phase,
                client_id, escritorio_id, department_id, process_value,
                filing_date, expected_closing_date, closing_date,
                created_at, updated_at, tags
         FROM cases
         WHERE id = $1`,
        [caseId],
      );

      if (result.rows.length === 0) return null;

      const caseData = this.mapRowToCase(result.rows[0]);

      // Load related data
      const deadlinesResult = await this.pool.query(
        `SELECT id, description, due_date, priority, status, completed_at
         FROM case_deadlines WHERE case_id = $1`,
        [caseId],
      );

      const updatesResult = await this.pool.query(
        `SELECT id, type, description, document_id, document_name,
                document_type, updated_by, created_at
         FROM case_updates WHERE case_id = $1 ORDER BY created_at DESC`,
        [caseId],
      );

      caseData.deadlines = deadlinesResult.rows.map(row => ({
        id: row.id,
        description: row.description,
        dueDate: new Date(row.due_date),
        priority: row.priority,
        status: row.status,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      }));

      caseData.updates = updatesResult.rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.created_at),
        type: row.type,
        description: row.description,
        document: row.document_id ? {
          id: row.document_id,
          name: row.document_name,
          type: row.document_type,
        } : undefined,
        updatedBy: row.updated_by,
      }));

      return caseData;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter caso');
      return null;
    }
  }

  async listCases(userId: string, escritorioId: string, filter?: {
    status?: string;
    clientId?: string;
  }): Promise<Case[]> {
    try {
      let query = `SELECT id, case_number, title, description, tribunal, status, phase,
                          client_id, escritorio_id, department_id, process_value,
                          filing_date, expected_closing_date, closing_date,
                          created_at, updated_at, tags
                   FROM cases
                   WHERE escritorio_id = $1`;
      const params: any[] = [escritorioId];

      if (filter?.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(filter.status);
      }

      if (filter?.clientId) {
        query += ` AND client_id = $${params.length + 1}`;
        params.push(filter.clientId);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.mapRowToCase(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar casos');
      return [];
    }
  }

  async updateCase(
    userId: string,
    caseId: string,
    request: UpdateCaseRequest,
  ): Promise<Case | null> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE cases
         SET title = COALESCE($1, title),
             status = COALESCE($2, status),
             expected_closing_date = COALESCE($3, expected_closing_date),
             tags = COALESCE($4, tags),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, case_number, title, description, tribunal, status, phase,
                   client_id, escritorio_id, department_id, process_value,
                   filing_date, expected_closing_date, closing_date,
                   created_at, updated_at, tags`,
        [
          request.title,
          request.status,
          request.expectedClosingDate,
          request.tags,
          caseId,
        ],
      );

      if (result.rows.length === 0) {
        throw new Error('Caso não encontrado');
      }

      // Update case assignments if provided
      if (request.assignedTo) {
        await client.query(`DELETE FROM case_assignments WHERE case_id = $1`, [caseId]);
        for (const userId of request.assignedTo) {
          await client.query(
            `INSERT INTO case_assignments (case_id, user_id) VALUES ($1, $2)`,
            [caseId, userId],
          );
        }
      }

      await client.query('COMMIT');

      logger.info({ userId, caseId }, 'Caso atualizado');

      return this.mapRowToCase(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Erro ao atualizar caso');
      throw error;
    } finally {
      client.release();
    }
  }

  async addCaseUpdate(
    userId: string,
    caseId: string,
    type: string,
    description: string,
    documentId?: string,
  ): Promise<CaseUpdate> {
    try {
      const result = await this.pool.query(
        `INSERT INTO case_updates (case_id, type, description, document_id, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, type, description, document_id, updated_by, created_at`,
        [caseId, type, description, documentId || null, userId],
      );

      logger.info({ userId, caseId }, 'Atualização de caso registrada');

      const row = result.rows[0];
      return {
        id: row.id,
        timestamp: new Date(row.created_at),
        type: row.type,
        description: row.description,
        updatedBy: row.updated_by,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao adicionar atualização de caso');
      throw error;
    }
  }

  async getCaseStats(caseId: string): Promise<CaseStats> {
    try {
      const statusResult = await this.pool.query(
        `SELECT status, COUNT(*) as count
         FROM cases WHERE id = $1
         GROUP BY status`,
        [caseId],
      );

      const deadlinesResult = await this.pool.query(
        `SELECT COUNT(*) as overdue FROM case_deadlines
         WHERE case_id = $1 AND status = 'pending' AND due_date < NOW()`,
        [caseId],
      );

      const upcomingResult = await this.pool.query(
        `SELECT COUNT(*) as upcoming FROM case_deadlines
         WHERE case_id = $1 AND status = 'pending' AND due_date >= NOW()
         AND due_date <= NOW() + INTERVAL '7 days'`,
        [caseId],
      );

      return {
        totalCases: 1,
        casesByStatus: {},
        casesByPhase: {},
        overdueCases: parseInt(deadlinesResult.rows[0]?.overdue) || 0,
        upcomingDeadlines: parseInt(upcomingResult.rows[0]?.upcoming) || 0,
        averageProcessValue: 0,
        pendingDocuments: 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas do caso');
      return {
        totalCases: 0,
        casesByStatus: {},
        casesByPhase: {},
        overdueCases: 0,
        upcomingDeadlines: 0,
        averageProcessValue: 0,
        pendingDocuments: 0,
      };
    }
  }

  // ============ TASK MANAGEMENT ============

  async createTask(userId: string, request: CreateCaseTaskRequest): Promise<CaseTask> {
    try {
      const result = await this.pool.query(
        `INSERT INTO case_tasks
         (case_id, title, description, type, priority, assigned_to, due_date, estimated_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, case_id, title, description, type, status, priority,
                   assigned_to, due_date, estimated_hours, actual_hours,
                   created_at, completed_at`,
        [
          request.caseId,
          request.title,
          request.title,
          request.type,
          request.priority,
          request.assignedTo,
          request.dueDate || null,
          request.estimatedHours || null,
        ],
      );

      logger.info({ userId, caseId: request.caseId }, 'Tarefa de caso criada');

      return this.mapRowToTask(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar tarefa');
      throw error;
    }
  }

  async updateTask(
    userId: string,
    taskId: string,
    request: UpdateCaseTaskRequest,
  ): Promise<CaseTask | null> {
    try {
      const result = await this.pool.query(
        `UPDATE case_tasks
         SET title = COALESCE($1, title),
             status = COALESCE($2, status),
             priority = COALESCE($3, priority),
             assigned_to = COALESCE($4, assigned_to),
             due_date = COALESCE($5, due_date),
             actual_hours = COALESCE($6, actual_hours),
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
         WHERE id = $7
         RETURNING id, case_id, title, description, type, status, priority,
                   assigned_to, due_date, estimated_hours, actual_hours,
                   created_at, completed_at`,
        [
          request.title,
          request.status,
          request.priority,
          request.assignedTo,
          request.dueDate,
          request.actualHours,
          taskId,
        ],
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info({ userId, taskId }, 'Tarefa atualizada');

      return this.mapRowToTask(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar tarefa');
      throw error;
    }
  }

  async getTaskStats(caseId: string): Promise<{ completed: number; pending: number; overdue: number }> {
    try {
      const result = await this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'completed') as completed,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'pending' AND due_date < NOW()) as overdue
         FROM case_tasks
         WHERE case_id = $1`,
        [caseId],
      );

      const row = result.rows[0];
      return {
        completed: parseInt(row.completed) || 0,
        pending: parseInt(row.pending) || 0,
        overdue: parseInt(row.overdue) || 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas de tarefas');
      return { completed: 0, pending: 0, overdue: 0 };
    }
  }

  // ============ DASHBOARD & ANALYTICS ============

  async getDashboardStats(escritorioId: string): Promise<DashboardStats> {
    try {
      const casesResult = await this.pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status != 'concluded') as active,
           COUNT(*) FILTER (WHERE status = 'concluded') as closed
         FROM cases WHERE escritorio_id = $1`,
        [escritorioId],
      );

      const clientsResult = await this.pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new
         FROM clients WHERE user_id IN (
           SELECT user_id FROM team_members WHERE escritorio_id = $1
         )`,
        [escritorioId],
      );

      const deadlinesResult = await this.pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending' AND due_date < NOW()) as overdue,
                COUNT(*) FILTER (WHERE status = 'pending' AND due_date >= NOW()
                  AND due_date <= NOW() + INTERVAL '7 days') as upcoming
         FROM case_deadlines cd
         INNER JOIN cases c ON cd.case_id = c.id
         WHERE c.escritorio_id = $1`,
        [escritorioId],
      );

      const revenueResult = await this.pool.query(
        `SELECT COALESCE(SUM(process_value), 0) as total
         FROM cases WHERE escritorio_id = $1`,
        [escritorioId],
      );

      const casesRow = casesResult.rows[0];
      const clientsRow = clientsResult.rows[0];
      const deadlineRow = deadlinesResult.rows[0];
      const revenueRow = revenueResult.rows[0];

      return {
        escritorioId,
        totalCases: parseInt(casesRow.total) || 0,
        activeCases: parseInt(casesRow.active) || 0,
        overdueCases: parseInt(deadlineRow.overdue) || 0,
        upcomingDeadlines: parseInt(deadlineRow.upcoming) || 0,
        totalClients: parseInt(clientsRow.total) || 0,
        newClientsThisMonth: parseInt(clientsRow.new) || 0,
        totalRevenue: parseFloat(revenueRow.total) || 0,
        pendingPayments: 0,
        teamUtilization: 0,
        caseDistributionByTeam: {},
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas do dashboard');
      return {
        escritorioId,
        totalCases: 0,
        activeCases: 0,
        overdueCases: 0,
        upcomingDeadlines: 0,
        totalClients: 0,
        newClientsThisMonth: 0,
        totalRevenue: 0,
        pendingPayments: 0,
        teamUtilization: 0,
        caseDistributionByTeam: {},
      };
    }
  }

  // ============ PRIVATE HELPERS ============

  private mapRowToClient(row: any): Client {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      documentId: row.document_id,
      contact: {
        email: row.email,
        phone: row.phone,
        cellphone: row.cellphone,
        address: row.address,
        city: row.city,
        state: row.state,
        zipCode: row.zip_code,
      },
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userId: row.user_id,
      tags: row.tags || [],
      notes: row.notes,
    };
  }

  private mapRowToCase(row: any): Case {
    return {
      id: row.id,
      caseNumber: row.case_number,
      title: row.title,
      description: row.description,
      tribunal: row.tribunal,
      status: row.status,
      phase: row.phase,
      clientId: row.client_id,
      escritorioId: row.escritorio_id,
      departmentId: row.department_id,
      assignedTo: [],
      participants: [],
      processValue: row.process_value,
      filingDate: row.filing_date ? new Date(row.filing_date) : undefined,
      expectedClosingDate: row.expected_closing_date ? new Date(row.expected_closing_date) : undefined,
      closingDate: row.closing_date ? new Date(row.closing_date) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deadlines: [],
      updates: [],
      tags: row.tags || [],
    };
  }

  private mapRowToTask(row: any): CaseTask {
    return {
      id: row.id,
      caseId: row.case_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      priority: row.priority,
      assignedTo: row.assigned_to,
      createdAt: new Date(row.created_at),
      dueDate: row.due_date ? new Date(row.due_date) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      estimatedHours: row.estimated_hours,
      actualHours: row.actual_hours,
    };
  }
}

export const projurisService = new ProjurisService();
