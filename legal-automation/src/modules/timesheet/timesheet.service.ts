// src/modules/timesheet/timesheet.service.ts
import crypto from 'crypto';
import { Database } from '@/database';
import { logger } from '@/utils';
import {
  TimeEntry,
  TimeEntryRequest,
  TimesheetReport,
  InvoiceRequest,
  Invoice,
  InvoiceItem,
  TaskType,
} from './types';

export class TimesheetService {
  private db: Database;
  private defaultHourlyRate: number = 300; // R$ 300/hora padrão

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Criar lançamento de tempo
   */
  async createTimeEntry(
    lawyerId: string,
    request: TimeEntryRequest
  ): Promise<TimeEntry> {
    try {
      logger.info(
        `[Timesheet] Criando entry: ${request.taskType} para caso ${request.caseId}`
      );

      // 1. Validar caso
      const caseCheck = await this.db.query(
        'SELECT id FROM cases WHERE id = $1',
        [request.caseId]
      );

      if (caseCheck.rows.length === 0) {
        throw new Error('Caso não encontrado');
      }

      // 2. Calcular duração
      const durationMinutes = Math.round(
        (request.endTime.getTime() - request.startTime.getTime()) / 60000
      );

      if (durationMinutes <= 0) {
        throw new Error('Duração deve ser positiva');
      }

      // 3. Obter taxa horária (de configuração do advogado ou padrão)
      const rateResult = await this.db.query(
        'SELECT hourly_rate FROM lawyers WHERE id = $1',
        [lawyerId]
      );

      const hourlyRate = rateResult.rows[0]?.hourly_rate || this.defaultHourlyRate;

      // 4. Inserir lançamento
      const entryId = crypto.randomUUID();
      const now = new Date();

      const result = await this.db.query(
        `INSERT INTO time_entries (
          id, lawyer_id, case_id, task_type, description,
          start_time, end_time, duration_minutes, billable,
          hourly_rate, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          entryId,
          lawyerId,
          request.caseId,
          request.taskType,
          request.description,
          request.startTime,
          request.endTime,
          durationMinutes,
          request.billable !== false,
          hourlyRate,
          now,
          now,
        ]
      );

      const entry = result.rows[0];

      // 5. Adicionar tags
      if (request.tags && request.tags.length > 0) {
        await this.addTags(entryId, request.tags);
      }

      // 6. Linkar documentos
      if (request.linkedDocuments && request.linkedDocuments.length > 0) {
        await this.linkDocuments(entryId, request.linkedDocuments);
      }

      logger.info(
        `[Timesheet] Entry ${entryId} criado: ${durationMinutes} minutos`
      );

      return this.toTimeEntryDTO(entry);
    } catch (error) {
      logger.error(`[Timesheet] Erro ao criar entry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar relatório de tempo
   */
  async generateTimesheetReport(
    lawyerId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<TimesheetReport> {
    try {
      logger.info(
        `[Timesheet] Gerando relatório para ${lawyerId}: ${fromDate} a ${toDate}`
      );

      // 1. Buscar todos os lançamentos do período
      const result = await this.db.query(
        `SELECT * FROM time_entries
         WHERE lawyer_id = $1
         AND DATE(start_time) >= $2
         AND DATE(start_time) <= $3
         ORDER BY start_time DESC`,
        [lawyerId, fromDate, toDate]
      );

      const entries = result.rows.map(row => this.toTimeEntryDTO(row));

      // 2. Calcular métricas
      const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
      const totalHours = totalMinutes / 60;

      const billableEntries = entries.filter(e => e.billable);
      const totalBillableMinutes = billableEntries.reduce(
        (sum, e) => sum + e.durationMinutes,
        0
      );
      const totalBillableHours = totalBillableMinutes / 60;
      const totalAmount = billableEntries.reduce(
        (sum, e) => sum + (e.durationMinutes / 60) * e.hourlyRate,
        0
      );

      // 3. Agrupar por tipo de tarefa
      const byTaskType: { [key in TaskType]: { hours: number; amount: number } } = {
        research: { hours: 0, amount: 0 },
        drafting: { hours: 0, amount: 0 },
        meeting: { hours: 0, amount: 0 },
        court_appearance: { hours: 0, amount: 0 },
        review: { hours: 0, amount: 0 },
        other: { hours: 0, amount: 0 },
      };

      for (const entry of entries) {
        const hours = entry.durationMinutes / 60;
        const amount = hours * entry.hourlyRate;
        byTaskType[entry.taskType].hours += hours;
        byTaskType[entry.taskType].amount += amount;
      }

      // 4. Agrupar por caso
      const casesMap = new Map<
        string,
        { name: string; hours: number; amount: number }
      >();

      for (const entry of billableEntries) {
        const caseResult = await this.db.query(
          'SELECT id, description FROM cases WHERE id = $1',
          [entry.caseId]
        );

        const caseName =
          caseResult.rows[0]?.description || entry.caseId.substring(0, 8);

        if (!casesMap.has(entry.caseId)) {
          casesMap.set(entry.caseId, { name: caseName, hours: 0, amount: 0 });
        }

        const caseData = casesMap.get(entry.caseId)!;
        const hours = entry.durationMinutes / 60;
        caseData.hours += hours;
        caseData.amount += hours * entry.hourlyRate;
      }

      const byCase = Array.from(casesMap).map(([caseId, data]) => ({
        caseId,
        caseName: data.name,
        hours: Math.round(data.hours * 100) / 100,
        amount: Math.round(data.amount * 100) / 100,
      }));

      return {
        lawyerId,
        period: { from: fromDate, to: toDate },
        totalHours: Math.round(totalHours * 100) / 100,
        totalBillable: Math.round(totalBillableHours * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        entries,
        byTaskType,
        byCase,
      };
    } catch (error) {
      logger.error(`[Timesheet] Erro ao gerar relatório: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar invoice automaticamente a partir de time entries
   */
  async generateInvoiceFromTimesheet(
    request: InvoiceRequest
  ): Promise<Invoice> {
    try {
      logger.info(`[Timesheet] Gerando invoice para caso ${request.caseId}`);

      // 1. Buscar todas as time entries faturáveis do caso no período
      const entriesResult = await this.db.query(
        `SELECT * FROM time_entries
         WHERE case_id = $1
         AND billable = true
         AND DATE(start_time) >= $2
         AND DATE(start_time) <= $3
         ORDER BY start_time ASC`,
        [request.caseId, request.period.from, request.period.to]
      );

      const entries = entriesResult.rows;

      if (entries.length === 0) {
        throw new Error(
          'Nenhuma time entry faturável encontrada no período'
        );
      }

      // 2. Criar itens da invoice
      const items: InvoiceItem[] = entries.map(entry => ({
        timeEntryId: entry.id,
        taskType: entry.task_type,
        description: entry.description,
        hours: entry.duration_minutes / 60,
        hourlyRate: entry.hourly_rate,
        amount: (entry.duration_minutes / 60) * entry.hourly_rate,
      }));

      // 3. Calcular totais
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const tax = subtotal * 0.15; // 15% de imposto simplificado
      const total = subtotal + tax;

      // 4. Criar invoice
      const invoiceId = crypto.randomUUID();
      const dueDate = new Date(request.period.to);
      dueDate.setDate(dueDate.getDate() + 15); // 15 dias para vencer

      const result = await this.db.query(
        `INSERT INTO invoices (
          id, case_id, client_id, period_from, period_to,
          subtotal, tax, total, due_date, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          invoiceId,
          request.caseId,
          request.clientId,
          request.period.from,
          request.period.to,
          Math.round(subtotal * 100) / 100,
          Math.round(tax * 100) / 100,
          Math.round(total * 100) / 100,
          dueDate,
          'DRAFT',
          new Date(),
          new Date(),
        ]
      );

      // 5. Criar itens da invoice
      for (const item of items) {
        await this.db.query(
          `INSERT INTO invoice_items (
            invoice_id, time_entry_id, description, hours,
            hourly_rate, amount, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            invoiceId,
            item.timeEntryId,
            item.description,
            Math.round(item.hours * 100) / 100,
            item.hourlyRate,
            Math.round(item.amount * 100) / 100,
            new Date(),
          ]
        );
      }

      logger.info(`[Timesheet] Invoice ${invoiceId} criada: R$ ${total}`);

      return {
        id: invoiceId,
        caseId: request.caseId,
        clientId: request.clientId,
        period: request.period,
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
        createdAt: new Date(),
        dueDate,
        status: 'DRAFT',
      };
    } catch (error) {
      logger.error(`[Timesheet] Erro ao gerar invoice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar time entries de um caso
   */
  async listTimeEntriesByCase(caseId: string): Promise<TimeEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM time_entries WHERE case_id = $1 ORDER BY start_time DESC`,
      [caseId]
    );

    return result.rows.map(row => this.toTimeEntryDTO(row));
  }

  /**
   * Listar time entries de um advogado
   */
  async listTimeEntriesByLawyer(
    lawyerId: string,
    limit: number = 50
  ): Promise<TimeEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM time_entries WHERE lawyer_id = $1
       ORDER BY start_time DESC LIMIT $2`,
      [lawyerId, limit]
    );

    return result.rows.map(row => this.toTimeEntryDTO(row));
  }

  /**
   * Adicionar tags a um lançamento
   */
  private async addTags(entryId: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.db.query(
        `INSERT INTO timesheet_tags (time_entry_id, tag, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [entryId, tag.toLowerCase(), new Date()]
      );
    }
  }

  /**
   * Linkar documentos a um lançamento
   */
  private async linkDocuments(
    entryId: string,
    documentIds: string[]
  ): Promise<void> {
    for (const docId of documentIds) {
      await this.db.query(
        `INSERT INTO timesheet_document_links (time_entry_id, document_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [entryId, docId, new Date()]
      );
    }
  }

  private toTimeEntryDTO(row: any): TimeEntry {
    return {
      id: row.id,
      lawyerId: row.lawyer_id,
      caseId: row.case_id,
      taskType: row.task_type,
      description: row.description,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      durationMinutes: row.duration_minutes,
      billable: row.billable,
      hourlyRate: row.hourly_rate,
      tags: [], // Buscar separadamente se necessário
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
