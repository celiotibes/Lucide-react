import { v4 as uuidv4 } from 'uuid';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { TwoFactorError } from '@utils/errors';
import { TwoFactorChallenge, User } from '@/types';

const challenges = new Map<string, TwoFactorChallenge>();
const userSecrets = new Map<string, string>();

function generateTOTPSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}

function generateTOTPCode(secret: string): string {
  const time = Math.floor(Date.now() / 30000);
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
  hmac.update(Buffer.from(time.toString(), 'utf-8'));
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;

  return (code % 1000000).toString().padStart(6, '0');
}

function verifyTOTPCode(secret: string, code: string, window: number = 1): boolean {
  const now = Math.floor(Date.now() / 30000);

  for (let i = -window; i <= window; i++) {
    const time = now + i;
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
    hmac.update(Buffer.from(time.toString(), 'utf-8'));
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const computedCode = (digest.readUInt32BE(offset) & 0x7fffffff).toString();
    const paddedCode = computedCode.substring(computedCode.length - 6);

    if (paddedCode === code) {
      return true;
    }
  }

  return false;
}

export class TwoFactorHandler {
  async createChallenge(user: User, method: 'totp' | 'sms' | 'email' = 'totp'): Promise<TwoFactorChallenge> {
    const challenge: TwoFactorChallenge = {
      id: uuidv4(),
      userId: user.id,
      method,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + config.eproc_2fa_timeout * 1000),
      attempts: 0,
      verified: false,
    };

    if (method === 'totp') {
      const secret = generateTOTPSecret();
      challenge.secret = secret;
      userSecrets.set(user.id, secret);

      const otpauth_url = `otpauth://totp/LegalAutomation:${user.email}?secret=${secret}&issuer=LegalAutomation`;
      challenge.qrCode = await qrcode.toDataURL(otpauth_url);

      logger.info(`Desafio 2FA criado para ${user.email}: ${challenge.id}`);
    }

    challenges.set(challenge.id, challenge);
    return challenge;
  }

  async verifyChallenge(challengeId: string, code: string): Promise<boolean> {
    const challenge = challenges.get(challengeId);

    if (!challenge) {
      throw new TwoFactorError('Desafio 2FA não encontrado');
    }

    if (new Date() > challenge.expiresAt) {
      challenges.delete(challengeId);
      throw new TwoFactorError('Desafio 2FA expirou');
    }

    challenge.attempts++;

    if (challenge.attempts > 5) {
      challenges.delete(challengeId);
      throw new TwoFactorError('Muitas tentativas falhas. Desafio cancelado.');
    }

    if (challenge.method === 'totp' && challenge.secret) {
      if (!verifyTOTPCode(challenge.secret, code)) {
        throw new TwoFactorError(`Código incorreto. Tentativa ${challenge.attempts} de 5`);
      }

      challenge.verified = true;
      logger.info(`2FA verificado para usuário: ${challenge.userId}`);
      return true;
    }

    throw new TwoFactorError('Método 2FA não suportado');
  }

  getChallenge(challengeId: string): TwoFactorChallenge {
    const challenge = challenges.get(challengeId);

    if (!challenge) {
      throw new TwoFactorError('Desafio 2FA não encontrado');
    }

    if (new Date() > challenge.expiresAt) {
      challenges.delete(challengeId);
      throw new TwoFactorError('Desafio 2FA expirou');
    }

    return challenge;
  }

  completeChallenge(challengeId: string): void {
    challenges.delete(challengeId);
  }

  async setupTOTP(user: User): Promise<{ secret: string; qrCode: string }> {
    const secret = generateTOTPSecret();
    userSecrets.set(user.id, secret);

    const otpauth_url = `otpauth://totp/LegalAutomation:${user.email}?secret=${secret}&issuer=LegalAutomation`;
    const qrCode = await qrcode.toDataURL(otpauth_url);

    logger.info(`TOTP configurado para usuário: ${user.id}`);

    return { secret, qrCode };
  }

  verifyTOTPSetup(userId: string, code: string): boolean {
    const secret = userSecrets.get(userId);

    if (!secret) {
      throw new TwoFactorError('Nenhuma configuração de TOTP pendente');
    }

    if (!verifyTOTPCode(secret, code)) {
      throw new TwoFactorError('Código TOTP inválido');
    }

    logger.info(`TOTP confirmado para usuário: ${userId}`);
    return true;
  }

  getUserSecret(userId: string): string | undefined {
    return userSecrets.get(userId);
  }

  cleanupExpiredChallenges(): void {
    const now = new Date();
    let count = 0;

    for (const [id, challenge] of challenges.entries()) {
      if (now > challenge.expiresAt) {
        challenges.delete(id);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Limpeza: ${count} desafios 2FA expirados removidos`);
    }
  }
}

export const twoFactorHandler = new TwoFactorHandler();

// Cleanup de desafios expirados a cada minuto
setInterval(() => {
  twoFactorHandler.cleanupExpiredChallenges();
}, 60 * 1000);
