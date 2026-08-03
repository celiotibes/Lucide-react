import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { logger } from '@utils/logger';
import { sessionManager } from '@auth/sessionManager';
import { certificateManager } from '@auth/certificateManager';
import { twoFactorHandler } from '@auth/twoFactorHandler';
import { userRepository } from '@/database/repositories';
import { AuthenticationError, ValidationError } from '@utils/errors';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email e senha são obrigatórios');
    }

    const user = await userRepository.findByEmail(email);
    if (!user || !user.is_active) {
      throw new AuthenticationError('Email ou senha inválidos');
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AuthenticationError('Email ou senha inválidos');
    }

    await userRepository.updateLastLogin(user.id);

    res.json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        oabNumber: user.oab_number,
        oabState: user.oab_state,
        firstName: user.first_name,
      },
      nextStep: '2fa_required',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro no login');
    const appError = error instanceof Error ? error : new AuthenticationError('Erro ao fazer login');
    res
      .status(appError instanceof AuthenticationError ? 401 : 400)
      .json({
        error: appError instanceof Error ? appError.message : 'Erro desconhecido',
      });
  }
});

// Registrar
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, oabNumber, oabState, firstName, lastName } = req.body;

    if (!email || !password || !oabNumber || !oabState || !firstName || !lastName) {
      throw new ValidationError('Todos os campos são obrigatórios');
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ValidationError('Email já registrado');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await userRepository.create({
      email,
      password_hash: passwordHash,
      oab_number: oabNumber,
      oab_state: oabState,
      first_name: firstName,
      last_name: lastName,
      is_active: true,
    });

    logger.info(`Novo usuário registrado: ${email}`);

    res.status(201).json({
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        message: 'Registrado com sucesso. Faça login para continuar.',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao registrar');
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Criar Desafio 2FA
router.post('/2fa/challenge', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AuthenticationError('Usuário não encontrado');
    }

    const challenge = await twoFactorHandler.createChallenge(
      {
        id: user.id,
        email: user.email,
        oabNumber: user.oab_number,
        oabState: user.oab_state,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      'totp',
    );

    res.json({
      status: 'success',
      challengeId: challenge.id,
      method: challenge.method,
      qrCode: challenge.qrCode,
      expiresIn: 300,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar desafio 2FA');
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Verificar 2FA
router.post('/2fa/verify', async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;

    if (!challengeId || !code) {
      throw new ValidationError('challengeId e code são obrigatórios');
    }

    const verified = await twoFactorHandler.verifyChallenge(challengeId, code);

    if (!verified) {
      throw new AuthenticationError('Código inválido');
    }

    const challenge = twoFactorHandler.getChallenge(challengeId);
    const user = await userRepository.findById(challenge.userId);

    if (!user) {
      throw new AuthenticationError('Usuário não encontrado');
    }

    const session = sessionManager.createSession(
      {
        id: user.id,
        email: user.email,
        oabNumber: user.oab_number,
        oabState: user.oab_state,
        firstName: user.first_name,
        lastName: user.last_name,
        certificateFingerprint: user.certificate_fingerprint,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      user.certificate_fingerprint,
    );

    twoFactorHandler.completeChallenge(challengeId);

    logger.info(`2FA verificado para: ${user.email}`);

    res.json({
      status: 'success',
      sessionId: session.id,
      token: session.token,
      expiresIn: 86400,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar 2FA');
    const statusCode = error instanceof ValidationError ? 400 : 401;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Upload Certificado
router.post('/certificate/upload', async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new ValidationError('Arquivo do certificado é obrigatório');
    }

    const { password } = req.body;
    if (!password) {
      throw new ValidationError('Senha do certificado é obrigatória');
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      throw new AuthenticationError('Usuário não autenticado');
    }

    const cert = await certificateManager.uploadCertificate(req.file.buffer, password, userId);

    await userRepository.updateCertificate(userId, cert.fingerprint);

    logger.info(`Certificado enviado para: ${userId}`);

    res.json({
      status: 'success',
      certificate: {
        fingerprint: cert.fingerprint,
        subject: cert.subject,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        uploadedAt: cert.uploadedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao fazer upload de certificado');
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Listar Certificados
router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const certificates = await certificateManager.listCertificates();

    res.json({
      status: 'success',
      certificates,
      total: certificates.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar certificados');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Deletar Certificado
router.delete('/certificates/:fingerprint', async (req: Request, res: Response) => {
  try {
    const { fingerprint } = req.params;

    await certificateManager.deleteCertificate(fingerprint);

    logger.info(`Certificado deletado: ${fingerprint}`);

    res.json({
      status: 'success',
      message: 'Certificado removido',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao deletar certificado');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  try {
    const sessionId = (req as any).sessionId;
    if (sessionId) {
      sessionManager.invalidateSession(sessionId);
      logger.info(`Logout: ${sessionId}`);
    }

    res.json({
      status: 'success',
      message: 'Logout realizado',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao fazer logout');
    res.status(500).json({
      error: 'Erro ao fazer logout',
    });
  }
});

export default router;
