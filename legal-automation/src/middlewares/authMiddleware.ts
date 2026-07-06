import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@utils/logger';
import { AuthenticationError } from '@utils/errors';

interface JWTPayload {
  userId: string;
  sessionId: string;
  email: string;
  oabNumber: string;
  oabState: string;
  firstName: string;
  lastName: string;
  role?: string;
  certificateFingerprint?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      sessionId?: string;
    }
  }
}

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('Token não fornecido');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthenticationError('Token inválido');
    }

    const token = parts[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as JWTPayload;

    req.user = decoded;
    req.sessionId = decoded.sessionId;

    logger.info(`Token verificado para usuário: ${decoded.email}`);
    next();
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar token');

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Token inválido',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      error: error instanceof Error ? error.message : 'Não autorizado',
      code: 'UNAUTHORIZED',
    });
  }
};

export const optionalToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as JWTPayload;

    req.user = decoded;
    req.sessionId = decoded.sessionId;

    logger.info(`Token opcional verificado para usuário: ${decoded.email}`);
  } catch (error) {
    logger.warn({ err: error }, 'Erro ao verificar token opcional - continuando sem autenticação');
  }

  next();
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autorizado',
        code: 'UNAUTHORIZED',
      });
    }

    logger.info(`Verificando permissão para: ${req.user.email}`);
    next();
  };
};
