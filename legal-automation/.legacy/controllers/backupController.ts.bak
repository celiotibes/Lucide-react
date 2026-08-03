import express, { Router } from 'express';
import BackupService from '@services/BackupService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

/**
 * POST /backup/configure
 * Criar configuração de backup
 */
router.post('/backup/configure', authenticateJWT, async (req, res) => {
  try {
    const { name, type, frequency, retentionDays, storageBackends } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Campo obrigatório: name',
      });
    }

    const config = await BackupService.createBackupConfiguration({
      name,
      type,
      frequency,
      retentionDays,
      storageBackends,
    });

    res.status(201).json({
      status: 'success',
      message: 'Configuração de backup criada com sucesso',
      config: {
        id: config.id,
        name: config.name,
        type: config.type,
        frequency: config.frequency,
        nextRunAt: config.nextRunAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar configuração de backup');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao criar configuração de backup',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /backup/execute/:configId
 * Executar backup
 */
router.post('/backup/execute/:configId', authenticateJWT, async (req, res) => {
  try {
    const { configId } = req.params;

    const job = await BackupService.executeBackup(configId);

    res.status(201).json({
      status: 'success',
      message: 'Backup executado com sucesso',
      job: {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        compressedSize: job.compressedSize,
        duration: job.duration,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar backup');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao executar backup',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /backup/restore/:backupJobId
 * Restaurar backup
 */
router.post('/backup/restore/:backupJobId', authenticateJWT, async (req, res) => {
  try {
    const { backupJobId } = req.params;
    const { targetEnvironment } = req.body;
    const userId = (req as any).user.id;

    if (!targetEnvironment) {
      return res.status(400).json({
        status: 'error',
        message: 'Campo obrigatório: targetEnvironment',
      });
    }

    const job = await BackupService.restoreFromBackup(
      backupJobId,
      targetEnvironment,
      userId
    );

    res.status(201).json({
      status: 'success',
      message: 'Restauração iniciada com sucesso',
      job: {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        verificationPassed: job.verificationPassed,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao restaurar backup');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao restaurar backup',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /backup/verify/:backupJobId
 * Verificar integridade do backup
 */
router.post('/backup/verify/:backupJobId', authenticateJWT, async (req, res) => {
  try {
    const { backupJobId } = req.params;

    const isValid = await BackupService.verifyBackup(backupJobId);

    res.status(200).json({
      status: 'success',
      message: 'Verificação concluída',
      isValid,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar backup');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao verificar backup',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /backup/metrics
 * Obter métricas de backup
 */
router.get('/backup/metrics', authenticateJWT, async (req, res) => {
  try {
    const metrics = await BackupService.getBackupMetrics();

    res.status(200).json({
      status: 'success',
      metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas de backup');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter métricas de backup',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /backup/health
 * Executar health check
 */
router.get('/backup/health', authenticateJWT, async (req, res) => {
  try {
    const check = await BackupService.performHealthCheck();

    res.status(200).json({
      status: 'success',
      check: {
        type: check.type,
        status: check.status,
        message: check.message,
        details: check.details,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar health check');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao executar health check',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
