import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { dataEnrichmentService } from '@services/DataEnrichmentService';

const router = Router();

// Obter Processo Enriquecido com Todas as Fontes
router.get('/processes/:number/enriched', async (req: Request, res: Response) => {
  try {
    const { number } = req.params;

    if (!number) {
      throw new AppError(400, 'Número do processo é obrigatório');
    }

    logger.info(`Enriquecendo processo ${number}`);

    const enriched = await dataEnrichmentService.getProcessEnriched(number);

    res.json({
      status: 'success',
      data: enriched,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao enriquecer processo');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Status de Todas as Fontes de Dados
router.get('/sources/status', async (req: Request, res: Response) => {
  try {
    logger.debug('Obtendo status de todas as fontes');

    const status = await dataEnrichmentService.getSourcesStatus();

    const allHealthy = status.every((s) => s.disponivel);
    const avgVelocity = status.reduce((sum, s) => sum + s.velocidade, 0) / status.length;

    res.json({
      status: 'success',
      healthy: allHealthy,
      averageVelocity: avgVelocity,
      sources: status,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Monitorar Processo via JUDIT
router.post('/processes/:number/monitor', async (req: Request, res: Response) => {
  try {
    const { number } = req.params;
    const { webhookUrl } = req.body;

    if (!number) {
      throw new AppError(400, 'Número do processo é obrigatório');
    }

    if (!webhookUrl) {
      throw new AppError(400, 'webhookUrl é obrigatória');
    }

    logger.info(`Monitorando processo ${number} via JUDIT`);

    // Import here to avoid circular dependency
    const { juditClient } = require('@integrations/JUDITClient');

    const subscription = await juditClient.monitorarProcesso(
      number,
      webhookUrl,
      ['movimentacao', 'prazo', 'decisao'],
    );

    res.json({
      status: 'success',
      subscription,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao monitorar processo');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Listar Alertas Codilo
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, unread = false } = req.query;

    logger.debug('Obtendo alertas Codilo');

    const { codiloClient } = require('@integrations/CodiloClient');

    const alerts = await codiloClient.obterAlertas(
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0,
      unread === 'true',
    );

    res.json({
      status: 'success',
      alerts,
      pagination: {
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
        total: alerts.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter alertas');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Marcar Alerta como Lido
router.post('/alerts/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    logger.debug(`Marcando alerta ${id} como lido`);

    const { codiloClient } = require('@integrations/CodiloClient');

    await codiloClient.marcarAlertaComoLido(id);

    res.json({
      status: 'success',
      message: 'Alerta marcado como lido',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao marcar alerta');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Marcar Todos os Alertas como Lidos
router.post('/alerts/mark-all-read', async (req: Request, res: Response) => {
  try {
    logger.info('Marcando todos os alertas como lidos');

    const { codiloClient } = require('@integrations/CodiloClient');

    await codiloClient.marcarTodosComoLidos();

    res.json({
      status: 'success',
      message: 'Todos os alertas foram marcados como lidos',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao marcar alertas');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Casos Similares via Jusbrasil
router.post('/cases/similar', async (req: Request, res: Response) => {
  try {
    const { assunto, partes, tribunal, limit = 20 } = req.body;

    if (!assunto && (!partes || partes.length === 0)) {
      throw new AppError(400, 'Assunto ou partes são obrigatórios');
    }

    logger.debug('Buscando casos similares');

    const { jusbrasilClient } = require('@integrations/JusbrasilClient');

    const similarCases = await jusbrasilClient.buscarCasesSimilares({
      assunto,
      partes,
      tribunal,
      limit,
    });

    res.json({
      status: 'success',
      cases: similarCases,
      count: similarCases.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar casos similares');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Jurisprudência via Jusbrasil
router.get('/jurisprudence', async (req: Request, res: Response) => {
  try {
    const { tema, tribunal, limit = 20 } = req.query;

    if (!tema) {
      throw new AppError(400, 'Tema é obrigatório');
    }

    logger.debug(`Buscando jurisprudência para "${tema}"`);

    const { jusbrasilClient } = require('@integrations/JusbrasilClient');

    const jurisprudence = await jusbrasilClient.buscarJurisprudencia(
      tema as string,
      tribunal as string | undefined,
      parseInt(limit as string) || 20,
    );

    res.json({
      status: 'success',
      jurisprudence,
      count: jurisprudence.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar jurisprudência');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Perfil de Advogado (Jusbrasil)
router.get('/lawyers/:oabNumber/profile', async (req: Request, res: Response) => {
  try {
    const { oabNumber } = req.params;

    if (!oabNumber) {
      throw new AppError(400, 'OAB é obrigatória');
    }

    logger.debug(`Obtendo perfil do advogado ${oabNumber}`);

    const { jusbrasilClient } = require('@integrations/JusbrasilClient');

    const profile = await jusbrasilClient.obterPerfectilAdvogado(oabNumber);

    res.json({
      status: 'success',
      profile,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter perfil');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Taxa de Vitória do Advogado (Jusbrasil)
router.get('/lawyers/:oabNumber/win-rate', async (req: Request, res: Response) => {
  try {
    const { oabNumber } = req.params;
    const { periodo = 'ano' } = req.query;

    if (!oabNumber) {
      throw new AppError(400, 'OAB é obrigatória');
    }

    logger.debug(`Obtendo taxa de vitória de ${oabNumber}`);

    const { jusbrasilClient } = require('@integrations/JusbrasilClient');

    const winRate = await jusbrasilClient.obterTaxaVitoriaAdvogado(oabNumber, periodo as string);

    res.json({
      status: 'success',
      winRate,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter taxa vitória');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
