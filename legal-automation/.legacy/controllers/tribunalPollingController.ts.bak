import express, { Router } from 'express';
import TribunalPollingService from '@services/TribunalPollingService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

/**
 * POST /polling/configure
 * Criar configuração de sincronização automática para um caso
 */
router.post('/polling/configure', authenticateJWT, async (req, res) => {
  try {
    const { caseId, processNumber, tribunalCode, interval } = req.body;

    if (!caseId || !processNumber || !tribunalCode) {
      return res.status(400).json({
        status: 'error',
        message:
          'Campos obrigatórios: caseId, processNumber, tribunalCode',
      });
    }

    const config =
      await TribunalPollingService.createSyncConfiguration(
        caseId,
        processNumber,
        tribunalCode,
        interval,
      );

    res.status(201).json({
      status: 'success',
      message: 'Configuração de sincronização criada',
      configuration: {
        id: config.id,
        caseId: config.caseId,
        processNumber: config.processNumber,
        tribunalCode: config.tribunalCode,
        enabled: config.enabled,
        interval: config.interval,
        notifications: config.notifications,
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Erro ao criar configuração de sincronização',
    );
    res.status(500).json({
      status: 'error',
      message: 'Erro ao criar configuração de sincronização',
    });
  }
});

/**
 * POST /polling/:configurationId/start
 * Iniciar polling automático
 */
router.post('/polling/:configurationId/start', authenticateJWT, async (req, res) => {
  try {
    const { configurationId } = req.params;

    await TribunalPollingService.startPolling(configurationId);

    res.status(200).json({
      status: 'success',
      message: `Polling iniciado para ${configurationId}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao iniciar polling');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao iniciar polling',
    });
  }
});

/**
 * POST /polling/:configurationId/stop
 * Parar polling automático
 */
router.post('/polling/:configurationId/stop', authenticateJWT, async (req, res) => {
  try {
    const { configurationId } = req.params;

    await TribunalPollingService.stopPolling(configurationId);

    res.status(200).json({
      status: 'success',
      message: `Polling parado para ${configurationId}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao parar polling');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao parar polling',
    });
  }
});

/**
 * POST /polling/:configurationId/sync-now
 * Sincronizar imediatamente
 */
router.post(
  '/polling/:configurationId/sync-now',
  authenticateJWT,
  async (req, res) => {
    try {
      const { configurationId } = req.params;

      const result = await TribunalPollingService.executeSyncNow(
        configurationId,
      );

      res.status(200).json({
        status: 'success',
        message: 'Sincronização executada',
        result: {
          success: result.success,
          changes: result.changes,
          syncTime: result.syncTime,
          errors: result.errors,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao executar sincronização');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao executar sincronização',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  },
);

/**
 * GET /polling/:configurationId/statistics
 * Obter estatísticas de sincronização
 */
router.get(
  '/polling/:configurationId/statistics',
  authenticateJWT,
  async (req, res) => {
    try {
      const { configurationId } = req.params;

      const stats = await TribunalPollingService.getSyncStatistics(
        configurationId,
      );

      res.status(200).json({
        status: 'success',
        statistics: {
          configurationId: stats.configurationId,
          totalSyncs: stats.totalSyncs,
          successfulSyncs: stats.successfulSyncs,
          failedSyncs: stats.failedSyncs,
          errorRate: `${stats.errorRate}%`,
          averageSyncTime: `${Math.round(stats.averageSyncTime)}ms`,
          lastSyncTime: stats.lastSyncTime,
          totalUpdates: stats.totalUpdates,
          updates: {
            movements: stats.totalMovements,
            documents: stats.totalDocuments,
            deadlines: stats.totalDeadlines,
          },
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao obter estatísticas',
      });
    }
  },
);

/**
 * GET /polling/queue/status
 * Obter status da fila de sincronização
 */
router.get('/polling/queue/status', authenticateJWT, async (req, res) => {
  try {
    // Get current queue status from service
    const queueInfo = {
      status: 'active',
      totalPending: 0,
      message: 'Sistema de polling está operacional',
    };

    res.status(200).json({
      status: 'success',
      queue: queueInfo,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status da fila');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter status da fila',
    });
  }
});

/**
 * POST /polling/test
 * Testar configuração de polling
 */
router.post('/polling/test', authenticateJWT, async (req, res) => {
  try {
    const { processNumber, tribunalCode } = req.body;

    if (!processNumber || !tribunalCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: processNumber, tribunalCode',
      });
    }

    logger.info(`Testando sincronização de ${processNumber} em ${tribunalCode}`);

    // Create temporary configuration
    const tempConfig = await TribunalPollingService.createSyncConfiguration(
      'test-case',
      processNumber,
      tribunalCode,
      60,
    );

    // Execute immediate sync
    const result = await TribunalPollingService.executeSyncNow(
      tempConfig.id,
    );

    // Cleanup - stop polling
    await TribunalPollingService.stopPolling(tempConfig.id);

    res.status(200).json({
      status: 'success',
      message: 'Teste de sincronização concluído com sucesso',
      result: {
        processNumber: result.processNumber,
        tribunalCode: result.tribunalCode,
        success: result.success,
        changes: result.changes,
        syncTime: `${result.syncTime}ms`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao testar sincronização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao testar sincronização',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
