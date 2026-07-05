import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { timesheetService } from '@services/TimesheetService';

const router = Router();

// Iniciar Timer
router.post('/timer/start', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, description, hourlyRate, tags } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !description || !hourlyRate) {
      throw new AppError(400, 'caseId, description e hourlyRate são obrigatórios');
    }

    logger.info(`Iniciando timer para caso ${caseId}`);

    const entry = await timesheetService.startTimer(userId, caseId, description, hourlyRate, tags);

    res.status(201).json({
      status: 'success',
      data: entry,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao iniciar timer');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Parar Timer
router.post('/timer/:entryId/stop', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { entryId } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Parando timer ${entryId}`);

    const entry = await timesheetService.stopTimer(userId, entryId);

    res.json({
      status: 'success',
      data: entry,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao parar timer');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Timer Ativo
router.get('/timer/active', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Obtendo timer ativo para ${userId}`);

    const entry = await timesheetService.getActiveTimer(userId);

    res.json({
      status: 'success',
      data: entry,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter timer ativo');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Timesheet Diário
router.get('/daily/:date', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { date } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!date) {
      throw new AppError(400, 'Date é obrigatório');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new AppError(400, 'Date inválido. Use formato ISO 8601');
    }

    logger.debug(`Obtendo timesheet diário para ${userId} em ${date}`);

    const timesheet = await timesheetService.getDailyTimesheet(userId, parsedDate);

    res.json({
      status: 'success',
      data: timesheet,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter timesheet diário');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Métricas de Timesheet
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { startDate, endDate, period = '30d' } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    logger.debug(`Obtendo métricas de timesheet para ${userId}`);

    const metrics = await timesheetService.getTimesheetMetrics(userId, {
      startDate: start,
      endDate: end,
    });

    res.json({
      status: 'success',
      data: metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas de timesheet');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
