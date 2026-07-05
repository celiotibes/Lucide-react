import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { ValidationError } from '@utils/errors';
import { AdapterFactory } from '@adapters/index';
import { verifyToken } from '@middlewares/authMiddleware';

const router = Router();

// GET /tribunals - List all supported tribunals
router.get('/tribunals', async (req: Request, res: Response) => {
  try {
    const adapters = AdapterFactory.getAdaptersInfo();
    const health = await AdapterFactory.checkAllHealth();

    const tribunals = adapters.map(adapter => ({
      code: adapter.code,
      name: adapter.name,
      baseUrl: adapter.baseUrl,
      status: health.get(adapter.code) ? 'healthy' : 'unhealthy',
    }));

    res.json({
      status: 'success',
      supported: AdapterFactory.listAdapters(),
      count: tribunals.length,
      tribunals,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar tribunais');
    res.status(500).json({
      error: 'Erro ao listar tribunais suportados',
    });
  }
});

// GET /:tribunal/health - Check tribunal health
router.get('/:tribunal/health', async (req: Request, res: Response) => {
  try {
    const { tribunal } = req.params;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    const healthy = await AdapterFactory.getHealth(tribunal);

    res.json({
      status: 'success',
      tribunal,
      healthy,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar saúde do tribunal');
    res.status(500).json({
      error: 'Erro ao verificar saúde do tribunal',
    });
  }
});

// GET /:tribunal/processes/:number - Get process by number
router.get('/:tribunal/processes/:number', verifyToken, async (req: Request, res: Response) => {
  try {
    const { tribunal, number } = req.params;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    const adapter = AdapterFactory.getAdapter(tribunal);
    const process = await adapter.getProcess(number);

    res.json({
      status: 'success',
      tribunal,
      process,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao buscar processo no ${req.params.tribunal}`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao buscar processo',
    });
  }
});

// POST /:tribunal/processes/search - Search processes
router.post('/:tribunal/processes/search', verifyToken, async (req: Request, res: Response) => {
  try {
    const { tribunal } = req.params;
    const { partyName, subject, startDate, endDate, limit } = req.body;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    const adapter = AdapterFactory.getAdapter(tribunal);
    const processes = await adapter.searchProcesses({
      partyName,
      subject,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
    });

    res.json({
      status: 'success',
      tribunal,
      count: processes.length,
      processes,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao buscar processos no ${req.params.tribunal}`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao buscar processos',
    });
  }
});

// GET /:tribunal/processes/:number/movements - Get process movements
router.get('/:tribunal/processes/:number/movements', verifyToken, async (req: Request, res: Response) => {
  try {
    const { tribunal, number } = req.params;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    const adapter = AdapterFactory.getAdapter(tribunal);
    const movements = await adapter.getMovements(number);

    res.json({
      status: 'success',
      tribunal,
      processNumber: number,
      count: movements.length,
      movements,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao obter movimentações no ${req.params.tribunal}`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao obter movimentações',
    });
  }
});

// POST /:tribunal/petitions - Submit petition to tribunal
router.post('/:tribunal/petitions', verifyToken, async (req: Request, res: Response) => {
  try {
    const { tribunal } = req.params;
    const { processNumber, title, content, subject, certificateFingerprint, certificatePassword } = req.body;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    if (!processNumber || !content) {
      throw new ValidationError('Número do processo e conteúdo são obrigatórios');
    }

    const adapter = AdapterFactory.getAdapter(tribunal);
    const result = await adapter.submitPetition(
      {
        processNumber,
        title,
        content,
        subject,
      },
      certificateFingerprint || '',
      certificatePassword || '',
    );

    if (result.sucesso) {
      res.json({
        status: 'success',
        tribunal,
        protocol: result.protocolo,
        protocolDate: result.dataProtocolo,
        message: result.mensagem,
      });
    } else {
      res.status(400).json({
        status: 'failed',
        tribunal,
        error: result.mensagem,
        errors: result.erros,
      });
    }
  } catch (error) {
    logger.error({ err: error }, `Erro ao enviar petição no ${req.params.tribunal}`);
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro ao enviar petição',
    });
  }
});

// GET /:tribunal/petitions/:protocol/status - Check petition status
router.get('/:tribunal/petitions/:protocol/status', verifyToken, async (req: Request, res: Response) => {
  try {
    const { tribunal, protocol } = req.params;

    if (!AdapterFactory.isSupported(tribunal)) {
      return res.status(404).json({
        error: `Tribunal ${tribunal} não suportado`,
      });
    }

    const adapter = AdapterFactory.getAdapter(tribunal);
    const status = await adapter.getPetitionStatus(protocol);

    res.json({
      status: 'success',
      tribunal,
      petitionStatus: status,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao consultar status no ${req.params.tribunal}`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao consultar status',
    });
  }
});

export default router;
