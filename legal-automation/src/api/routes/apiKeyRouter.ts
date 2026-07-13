/**
 * API Key Management Router
 * Endpoints para gerenciamento seguro de chaves de API
 */

import { Router, Request, Response } from 'express';
import { apiKeyService } from '@services/ApiKeyService';
import { auditLogService } from '@services/AuditLogService';
import { verifyJwt } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * POST /api/v1/apikeys - Gera nova chave de API
 */
router.post('/apikeys', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, scopes, rateLimitPerHour, expiresInDays } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nome da API key é requerido',
      });
    }

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Pelo menos um escopo é requerido',
      });
    }

    const result = await apiKeyService.generateApiKey(
      name,
      scopes,
      rateLimitPerHour || 100,
      expiresInDays,
    );

    await auditLogService.log({
      action: 'CREATE_API_KEY',
      entityType: 'ApiKey',
      entityId: result.keyInfo.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: { after: { name, scopes } },
      status: 'success',
    });

    logger.info({ keyId: result.keyInfo.id, userId }, 'API key gerada com sucesso');

    res.json({
      success: true,
      data: {
        id: result.keyInfo.id,
        name: result.keyInfo.name,
        key: result.key,
        scopes: result.keyInfo.scopes,
        rateLimitPerHour: result.keyInfo.rateLimitPerHour,
        expiresAt: result.keyInfo.expiresAt,
        createdAt: result.keyInfo.createdAt,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao gerar API key');
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar API key',
    });
  }
});

/**
 * GET /api/v1/apikeys/:keyId - Obtém informações de uma chave
 */
router.get('/apikeys/:keyId', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user?.id || 'unknown';

    const keyInfo = await apiKeyService.getKeyInfo(keyId);

    if (!keyInfo) {
      return res.status(404).json({
        success: false,
        error: 'Chave de API não encontrada',
      });
    }

    await auditLogService.log({
      action: 'READ_API_KEY',
      entityType: 'ApiKey',
      entityId: keyId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {},
      status: 'success',
    });

    res.json({
      success: true,
      data: {
        id: keyInfo.id,
        name: keyInfo.name,
        scopes: keyInfo.scopes,
        rateLimitPerHour: keyInfo.rateLimitPerHour,
        isActive: keyInfo.isActive,
        lastUsedAt: keyInfo.lastUsedAt,
        expiresAt: keyInfo.expiresAt,
        createdAt: keyInfo.createdAt,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter informações de API key');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter informações de API key',
    });
  }
});

/**
 * PATCH /api/v1/apikeys/:keyId - Atualiza scopes de uma chave
 */
router.patch('/apikeys/:keyId', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const { scopes } = req.body;
    const userId = req.user?.id || 'unknown';

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Pelo menos um escopo é requerido',
      });
    }

    const oldKeyInfo = await apiKeyService.getKeyInfo(keyId);
    if (!oldKeyInfo) {
      return res.status(404).json({
        success: false,
        error: 'Chave de API não encontrada',
      });
    }

    await apiKeyService.updateScopes(keyId, scopes);

    await auditLogService.log({
      action: 'UPDATE_API_KEY',
      entityType: 'ApiKey',
      entityId: keyId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        before: { scopes: oldKeyInfo.scopes },
        after: { scopes },
      },
      status: 'success',
    });

    logger.info({ keyId, userId }, 'Scopes de API key atualizados');

    res.json({
      success: true,
      message: 'Scopes atualizados com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao atualizar scopes');
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar scopes',
    });
  }
});

/**
 * DELETE /api/v1/apikeys/:keyId - Revoga uma chave de API
 */
router.delete('/apikeys/:keyId', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user?.id || 'unknown';

    const keyInfo = await apiKeyService.getKeyInfo(keyId);
    if (!keyInfo) {
      return res.status(404).json({
        success: false,
        error: 'Chave de API não encontrada',
      });
    }

    await apiKeyService.revokeApiKey(keyId);

    await auditLogService.log({
      action: 'DELETE_API_KEY',
      entityType: 'ApiKey',
      entityId: keyId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: { before: keyInfo },
      status: 'success',
    });

    logger.info({ keyId, userId }, 'API key revogada');

    res.json({
      success: true,
      message: 'Chave revogada com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao revogar API key');
    res.status(500).json({
      success: false,
      error: 'Erro ao revogar API key',
    });
  }
});

/**
 * GET /api/v1/audit-logs - Obtém logs de auditoria
 */
router.get('/audit-logs', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityId, userId, action, limit = 50 } = req.query;

    let logs = [];

    if (entityId) {
      logs = await auditLogService.getEntityLogs(entityId as string, parseInt(limit as string));
    } else if (userId) {
      logs = await auditLogService.getUserLogs(userId as string, parseInt(limit as string));
    } else if (action) {
      logs = await auditLogService.getActionLogs(action as string, parseInt(limit as string));
    } else {
      return res.status(400).json({
        success: false,
        error: 'Filtro de entityId, userId ou action é requerido',
      });
    }

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter logs de auditoria');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter logs de auditoria',
    });
  }
});

/**
 * GET /api/v1/compliance-report - Gera relatório de compliance
 */
router.get('/compliance-report', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são requeridos',
      });
    }

    const report = await auditLogService.generateComplianceReport(
      new Date(startDate as string),
      new Date(endDate as string),
    );

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao gerar compliance report');
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar compliance report',
    });
  }
});

export default router;
