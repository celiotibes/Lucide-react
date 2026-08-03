import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { AuthenticationError, AuthorizationError } from '@utils/errors';
import { Session, User } from '@/types';

const sessions = new Map<string, Session>();

export class SessionManager {
  createToken(user: User, certificateFingerprint?: string): string {
    const payload = {
      userId: user.id,
      email: user.email,
      oabNumber: user.oabNumber,
      oabState: user.oabState,
      certificateFingerprint,
    };

    return jwt.sign(payload, config.jwt_secret, {
      expiresIn: config.jwt_expires_in,
      issuer: 'legal-automation',
      subject: user.id,
    });
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt_secret);
    } catch (error) {
      logger.warn(`Token inválido: ${error instanceof Error ? error.message : 'desconhecido'}`);
      throw new AuthenticationError('Token inválido ou expirado');
    }
  }

  createSession(user: User, certificateFingerprint?: string): Session {
    const token = this.createToken(user, certificateFingerprint);
    const decoded = jwt.decode(token) as any;

    const session: Session = {
      id: uuidv4(),
      userId: user.id,
      token,
      certificateFingerprint,
      issuedAt: new Date(),
      expiresAt: new Date(decoded.exp * 1000),
      lastActivity: new Date(),
    };

    sessions.set(session.id, session);
    logger.info(`Sessão criada para usuário: ${user.id}`);

    return session;
  }

  getSession(sessionId: string): Session {
    const session = sessions.get(sessionId);

    if (!session) {
      throw new AuthenticationError('Sessão não encontrada');
    }

    if (new Date() > session.expiresAt) {
      sessions.delete(sessionId);
      throw new AuthenticationError('Sessão expirada');
    }

    session.lastActivity = new Date();
    return session;
  }

  validateSession(sessionId: string, userId: string): boolean {
    try {
      const session = this.getSession(sessionId);
      return session.userId === userId;
    } catch {
      return false;
    }
  }

  invalidateSession(sessionId: string): void {
    sessions.delete(sessionId);
    logger.info(`Sessão invalidada: ${sessionId}`);
  }

  invalidateAllUserSessions(userId: string): void {
    let count = 0;
    for (const [id, session] of sessions.entries()) {
      if (session.userId === userId) {
        sessions.delete(id);
        count++;
      }
    }
    logger.info(`${count} sessões invalidadas para usuário: ${userId}`);
  }

  cleanupExpiredSessions(): void {
    const now = new Date();
    let count = 0;

    for (const [id, session] of sessions.entries()) {
      if (now > session.expiresAt) {
        sessions.delete(id);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Limpeza: ${count} sessões expiradas removidas`);
    }
  }

  extractTokenFromHeader(authHeader?: string): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Header Authorization inválido');
    }

    return authHeader.slice(7);
  }
}

export const sessionManager = new SessionManager();

// Cleanup de sessões expiradas a cada 5 minutos
setInterval(() => {
  sessionManager.cleanupExpiredSessions();
}, 5 * 60 * 1000);
