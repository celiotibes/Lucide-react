// src/modules/timesheet/routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { TimesheetService } from './timesheet.service';
import { Database } from '@/database';
import { verifyToken } from '@/middlewares';
import { z } from 'zod';

const router = Router();

export function setupTimesheetRoutes(db: Database): Router {
  const timesheetService = new TimesheetService(db);

  /**
   * POST /timesheet/entries
   * Criar lançamento de tempo
   */
  router.post(
    '/timesheet/entries',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const entrySchema = z.object({
          caseId: z.string().uuid(),
          taskType: z.enum([
            'research',
            'drafting',
            'meeting',
            'court_appearance',
            'review',
            'other',
          ]),
          description: z.string().min(1),
          startTime: z.coerce.date(),
          endTime: z.coerce.date(),
          billable: z.boolean().optional(),
          tags: z.array(z.string()).optional(),
        });

        const validated = entrySchema.parse(req.body);

        const entry = await timesheetService.createTimeEntry(
          req.user!.id,
          {
            ...validated,
            startTime: new Date(validated.startTime),
            endTime: new Date(validated.endTime),
          }
        );

        res.json({
          success: true,
          entry: {
            id: entry.id,
            taskType: entry.taskType,
            durationMinutes: entry.durationMinutes,
            amount: (entry.durationMinutes / 60) * entry.hourlyRate,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /timesheet/entries/:caseId
   * Listar lançamentos do caso
   */
  router.get(
    '/timesheet/entries/:caseId',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const entries = await timesheetService.listTimeEntriesByCase(
          req.params.caseId
        );
        res.json({ entries });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /timesheet/report
   * Gerar relatório de tempo
   */
  router.get(
    '/timesheet/report',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { from, to } = req.query;

        if (!from || !to) {
          return res.status(400).json({
            error: 'Parâmetros "from" e "to" obrigatórios (YYYY-MM-DD)',
          });
        }

        const report = await timesheetService.generateTimesheetReport(
          req.user!.id,
          new Date(String(from)),
          new Date(String(to))
        );

        res.json({ report });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /timesheet/invoice
   * Gerar invoice automaticamente
   */
  router.post(
    '/timesheet/invoice',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const invoiceSchema = z.object({
          caseId: z.string().uuid(),
          clientId: z.string().uuid(),
          from: z.coerce.date(),
          to: z.coerce.date(),
          description: z.string().optional(),
        });

        const validated = invoiceSchema.parse(req.body);

        const invoice = await timesheetService.generateInvoiceFromTimesheet({
          caseId: validated.caseId,
          clientId: validated.clientId,
          period: {
            from: new Date(validated.from),
            to: new Date(validated.to),
          },
          description: validated.description,
        });

        res.json({
          success: true,
          invoice: {
            id: invoice.id,
            total: invoice.total,
            itemCount: invoice.items.length,
            dueDate: invoice.dueDate,
            status: invoice.status,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
