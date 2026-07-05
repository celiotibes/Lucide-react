import db from '@db/connection';
import { logger } from '@utils/logger';

export interface TimesheetEntry {
  id: string;
  caseId: string;
  lawyerId: string;
  description: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  hourlyRate: number;
  amount: number;
  status: 'running' | 'paused' | 'completed';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyTimesheet {
  date: Date;
  lawyerId: string;
  entries: TimesheetEntry[];
  totalHours: number;
  totalAmount: number;
}

export interface TimesheetMetrics {
  period: { startDate: Date; endDate: Date };
  lawyerId: string;
  totalHours: number;
  totalAmount: number;
  entriesCount: number;
  averageHourlyRate: number;
  entriesByCase: Array<{
    caseId: string;
    caseTitle: string;
    hours: number;
    amount: number;
  }>;
  dailyProgress: Array<{
    date: Date;
    hours: number;
    amount: number;
    target: number;
    progress: number;
  }>;
}

export class TimesheetService {
  async startTimer(
    lawyerId: string,
    caseId: string,
    description: string,
    hourlyRate: number,
    tags?: string[],
  ): Promise<TimesheetEntry> {
    logger.info(`Iniciando timer para caso ${caseId}, advogado ${lawyerId}`);

    try {
      const result = await db.query(
        `INSERT INTO timesheet_entries (
          lawyer_id, case_id, description, start_time, status, hourly_rate, tags
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6) RETURNING *`,
        [lawyerId, caseId, description, 'running', hourlyRate, JSON.stringify(tags || [])],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        lawyerId: row.lawyer_id,
        description: row.description,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMinutes: row.duration_minutes || 0,
        hourlyRate: row.hourly_rate,
        amount: row.amount || 0,
        status: row.status,
        tags: row.tags || [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao iniciar timer');
      throw error;
    }
  }

  async stopTimer(lawyerId: string, entryId: string): Promise<TimesheetEntry> {
    logger.info(`Parando timer ${entryId}`);

    try {
      // Get entry
      const getResult = await db.query(
        `SELECT * FROM timesheet_entries WHERE id = $1 AND lawyer_id = $2`,
        [entryId, lawyerId],
      );

      if (getResult.rows.length === 0) {
        throw new Error(`Entrada de timesheet não encontrada`);
      }

      const entry = getResult.rows[0];
      const startTime = new Date(entry.start_time);
      const endTime = new Date();

      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      const durationHours = durationMinutes / 60;
      const amount = Math.round(durationHours * entry.hourly_rate * 100) / 100;

      // Update entry
      const result = await db.query(
        `UPDATE timesheet_entries SET
          end_time = $1, duration_minutes = $2, amount = $3, status = $4, updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [endTime, durationMinutes, amount, 'completed', entryId],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        lawyerId: row.lawyer_id,
        description: row.description,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMinutes: row.duration_minutes,
        hourlyRate: row.hourly_rate,
        amount: row.amount,
        status: row.status,
        tags: row.tags || [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao parar timer');
      throw error;
    }
  }

  async getDailyTimesheet(lawyerId: string, date: Date): Promise<DailyTimesheet> {
    logger.info(`Obtendo timesheet diário para ${lawyerId} em ${date.toISOString()}`);

    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await db.query(
        `SELECT * FROM timesheet_entries
         WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY start_time DESC`,
        [lawyerId, startOfDay, endOfDay],
      );

      const entries = result.rows.map((row: any) => ({
        id: row.id,
        caseId: row.case_id,
        lawyerId: row.lawyer_id,
        description: row.description,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMinutes: row.duration_minutes,
        hourlyRate: row.hourly_rate,
        amount: row.amount,
        status: row.status,
        tags: row.tags || [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));

      const totalMinutes = entries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
      const totalAmount = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

      return {
        date,
        lawyerId,
        entries,
        totalHours: Math.round((totalMinutes / 60) * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter timesheet diário');
      throw error;
    }
  }

  async getTimesheetMetrics(
    lawyerId: string,
    period: { startDate: Date; endDate: Date },
  ): Promise<TimesheetMetrics> {
    logger.info(`Obtendo métricas de timesheet para ${lawyerId}`);

    try {
      // Get all entries for period
      const entriesResult = await db.query(
        `SELECT * FROM timesheet_entries
         WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY start_time`,
        [lawyerId, period.startDate, period.endDate],
      );

      const entries = entriesResult.rows.map((row: any) => ({
        id: row.id,
        caseId: row.case_id,
        lawyerId: row.lawyer_id,
        description: row.description,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMinutes: row.duration_minutes || 0,
        hourlyRate: row.hourly_rate,
        amount: row.amount || 0,
        status: row.status,
        tags: row.tags || [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));

      // Aggregate by case
      const entriesByCase: Record<string, any> = {};
      for (const entry of entries) {
        if (!entriesByCase[entry.caseId]) {
          entriesByCase[entry.caseId] = {
            caseId: entry.caseId,
            caseTitle: '', // Will be populated from cases table
            totalMinutes: 0,
            totalAmount: 0,
          };
        }
        entriesByCase[entry.caseId].totalMinutes += entry.durationMinutes;
        entriesByCase[entry.caseId].totalAmount += entry.amount;
      }

      // Get case titles
      const caseIds = Object.keys(entriesByCase);
      let caseTitles: Record<string, string> = {};
      if (caseIds.length > 0) {
        const casesResult = await db.query(
          `SELECT id, subject FROM cases WHERE id = ANY($1)`,
          [caseIds],
        );
        caseTitles = Object.fromEntries(casesResult.rows.map((row: any) => [row.id, row.subject]));
      }

      const entriesByCaseArray = Object.values(entriesByCase).map((item: any) => ({
        caseId: item.caseId,
        caseTitle: caseTitles[item.caseId] || 'Caso sem título',
        hours: Math.round((item.totalMinutes / 60) * 100) / 100,
        amount: Math.round(item.totalAmount * 100) / 100,
      }));

      // Calculate daily progress
      const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
      const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
      const averageHourlyRate =
        entries.length > 0
          ? Math.round(
              (entries.reduce((sum, e) => sum + e.hourlyRate, 0) / entries.length) * 100,
            ) / 100
          : 0;

      // Daily progress
      const dailyMap: Record<string, any> = {};
      for (const entry of entries) {
        const dayKey = new Date(entry.startTime).toISOString().split('T')[0];
        if (!dailyMap[dayKey]) {
          dailyMap[dayKey] = {
            date: new Date(dayKey),
            minutes: 0,
            amount: 0,
          };
        }
        dailyMap[dayKey].minutes += entry.durationMinutes;
        dailyMap[dayKey].amount += entry.amount;
      }

      const dailyProgress = Object.values(dailyMap)
        .map((day: any) => ({
          date: day.date,
          hours: Math.round((day.minutes / 60) * 100) / 100,
          amount: Math.round(day.amount * 100) / 100,
          target: 8, // 8 horas por dia
          progress: Math.round(((day.minutes / 60) / 8) * 100),
        }))
        .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

      return {
        period,
        lawyerId,
        totalHours: Math.round((totalMinutes / 60) * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        entriesCount: entries.length,
        averageHourlyRate,
        entriesByCase: entriesByCaseArray,
        dailyProgress,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter métricas de timesheet');
      throw error;
    }
  }

  async getActiveTimer(lawyerId: string): Promise<TimesheetEntry | null> {
    logger.info(`Obtendo timer ativo para ${lawyerId}`);

    try {
      const result = await db.query(
        `SELECT * FROM timesheet_entries
         WHERE lawyer_id = $1 AND status = 'running'
         ORDER BY start_time DESC LIMIT 1`,
        [lawyerId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        lawyerId: row.lawyer_id,
        description: row.description,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMinutes: row.duration_minutes || 0,
        hourlyRate: row.hourly_rate,
        amount: row.amount || 0,
        status: row.status,
        tags: row.tags || [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter timer ativo');
      throw error;
    }
  }
}

export const timesheetService = new TimesheetService();
