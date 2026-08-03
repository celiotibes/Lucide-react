import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { dataJudClient } from '@datajud/client';
import { aiService } from '@/ai/aiService';
import { AppError, ValidationError } from '@utils/errors';

const router = Router();

// Buscar Processo por Número
router.get('/search/:number', async (req: Request, res: Response) => {
  try {
    const { number } = req.params;

    if (!number) {
      throw new ValidationError('Número do processo é obrigatório');
    }

    logger.debug(`Buscando processo: ${number}`);

    const process = await dataJudClient.getProcessByNumber(number);

    res.json({
      status: 'success',
      process,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar processo');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Processos por Parte
router.get('/search-party', async (req: Request, res: Response) => {
  try {
    const { partyName, limit } = req.query;

    if (!partyName) {
      throw new ValidationError('Nome da parte é obrigatório');
    }

    logger.debug(`Buscando processos da parte: ${partyName}`);

    const processes = await dataJudClient.searchByParty(
      String(partyName),
      parseInt(String(limit)) || 10,
    );

    res.json({
      status: 'success',
      processes,
      total: processes.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar processos por parte');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Processos por Assunto
router.get('/search-subject', async (req: Request, res: Response) => {
  try {
    const { subject, limit } = req.query;

    if (!subject) {
      throw new ValidationError('Assunto é obrigatório');
    }

    logger.debug(`Buscando processos por assunto: ${subject}`);

    const processes = await dataJudClient.searchBySubject(
      String(subject),
      parseInt(String(limit)) || 10,
    );

    res.json({
      status: 'success',
      processes,
      total: processes.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar processos por assunto');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Processos por Intervalo de Datas
router.get('/search-date-range', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate e endDate são obrigatórios (YYYY-MM-DD)');
    }

    logger.debug(`Buscando processos entre ${startDate} e ${endDate}`);

    const processes = await dataJudClient.searchByDateRange(
      new Date(String(startDate)),
      new Date(String(endDate)),
      parseInt(String(limit)) || 50,
    );

    res.json({
      status: 'success',
      processes,
      total: processes.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar processos por data');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Movimentações de Processo
router.get('/:number/movements', async (req: Request, res: Response) => {
  try {
    const { number } = req.params;

    if (!number) {
      throw new ValidationError('Número do processo é obrigatório');
    }

    logger.debug(`Obtendo movimentações: ${number}`);

    const movements = await dataJudClient.getMovements(number);

    res.json({
      status: 'success',
      movements,
      total: movements.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter movimentações');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Analisar Movimentações com IA
router.post('/:number/analyze-movements', async (req: Request, res: Response) => {
  try {
    const { number } = req.params;

    const movements = await dataJudClient.getMovements(number);

    if (movements.length === 0) {
      throw new AppError(404, 'Nenhuma movimentação encontrada');
    }

    const analysis = await aiService.analyzeMovements(number, movements);

    logger.info(`Movimentações analisadas: ${number}`);

    res.json({
      status: 'success',
      analysis,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao analisar movimentações');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Pesquisa Avançada
router.post('/search/advanced', async (req: Request, res: Response) => {
  try {
    const { numeroProcesso, parteNome, dataRegistroInicio, dataRegistroFim, assunto, limit } = req.body;

    logger.debug('Pesquisa avançada de processos');

    const processes = await dataJudClient.searchProcesses({
      numeroProcesso,
      parteNome,
      dataRegistroInicio,
      dataRegistroFim,
      assunto,
      limite: limit || 50,
    });

    res.json({
      status: 'success',
      processes,
      total: processes.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro na pesquisa avançada');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
