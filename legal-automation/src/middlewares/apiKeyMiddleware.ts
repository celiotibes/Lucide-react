/**
 * API Key Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '@services/ApiKeyService';
import { logger } from '@utils/logger';

export interface AuthenticatedRequest extends Request {
  apiKey?: {
    id: string;
    scopes: string[];
  };
}

/**
 * Verifica API key na header
 */
export async function verifyApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key ausente',
      });
    }

    const keyInfo = await apiKeyService.validateApiKey(apiKey);

    if (!keyInfo) {
      logger.warn({ apiKey: apiKey.slice(0, 10) }, 'API key inválida');
      return res.status(401).json({
        success: false,
        error: 'API key inválida ou expirada',
      });
    }

    // Verifica rate limit
    const withinLimit = await apiKeyService.checkRateLimit(keyInfo.id);
    if (!withinLimit) {
      logger.warn({ keyId: keyInfo.id }, 'Rate limit excedido');
      return res.status(429).json({
        success: false,
        error: 'Rate limit excedido',
      });
    }

    req.apiKey = {
      id: keyInfo.id,
      scopes: keyInfo.scopes,
    };

    logger.debug({ keyId: keyInfo.id }, 'API key validada');
    next();
  } catch (error) {
    logger.error({ error }, 'Erro na validação de API key');
    res.status(500).json({
      success: false,
      error: 'Erro ao validar API key',
    });
  }
}

/**
 * Verifica escopo específico
 */
export function requireScope(scope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey?.scopes.includes(scope)) {
      logger.warn(
        { keyId: req.apiKey?.id, requiredScope: scope },
        'Escopo insuficiente',
      );
      return res.status(403).json({
        success: false,
        error: `Escopo '${scope}' requerido`,
      });
    }

    next();
  };
}

/**
 * Combina JWT + API Key authentication
 */
export async function verifyJwtOrApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const hasJwt = req.headers.authorization?.startsWith('Bearer ');
  const hasApiKey = req.headers['x-api-key'];

  if (!hasJwt && !hasApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Autenticação requerida (JWT ou API Key)',
    });
  }

  if (hasApiKey) {
    return verifyApiKey(req, res, next);
  }

  // Deixa middleware de JWT tratar
  next();
}
