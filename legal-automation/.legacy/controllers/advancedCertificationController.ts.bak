/**
 * Advanced Certification Controller
 * Endpoints for ICP-Brasil certificate management and advanced signatures
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { advancedCertificationService } from '@services/AdvancedCertificationService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/certification/validate
 * Validate ICP-Brasil certificate
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { certificatePEM, pin } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!certificatePEM) {
      throw new AppError(400, 'Certificado é obrigatório');
    }

    logger.info('Validando certificado ICP-Brasil');

    const certificate = await advancedCertificationService.validateCertificate(
      certificatePEM,
      pin,
    );

    await auditLogService.log({
      action: 'CERTIFICATE_VALIDATED',
      entityType: 'Certificate',
      entityId: certificate.thumbprint,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          certificateType: certificate.certificateType,
          personType: certificate.personType,
          validUntil: certificate.validUntil.toISOString(),
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: {
        id: certificate.id,
        thumbprint: certificate.thumbprint,
        name: certificate.name,
        certificateType: certificate.certificateType,
        personType: certificate.personType,
        cpfCnpj: certificate.cpfCnpj,
        email: certificate.email,
        validFrom: certificate.validFrom,
        validUntil: certificate.validUntil,
        isValid: certificate.isValid,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao validar certificado');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/certification/sign
 * Sign document with advanced signature
 */
router.post('/sign', async (req: Request, res: Response) => {
  try {
    const { documentBuffer, certificateId, signatureFormat = 'CMS', timestampRequired = true } =
      req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!documentBuffer || !certificateId) {
      throw new AppError(400, 'Documento e certificado são obrigatórios');
    }

    logger.info(
      {
        signatureFormat,
        timestampRequired,
      },
      'Assinando documento com certificado avançado',
    );

    // Get certificate (in production, retrieve from database)
    const certificateData = {
      id: certificateId,
      name: 'Certificate Name',
      thumbprint: 'ABCD1234',
      certificateType: 'A3' as const,
      algorithm: 'RSA',
      keyUsage: ['digitalSignature'],
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    const signature = await advancedCertificationService.signDocumentAdvanced(
      Buffer.from(documentBuffer, 'base64'),
      certificateData as any,
      signatureFormat as 'CMS' | 'XAdES' | 'PAdES',
      timestampRequired,
      userId,
    );

    res.json({
      success: true,
      data: {
        signatureId: signature.id,
        documentHash: signature.documentHash,
        signatureFormat: signature.signatureFormat,
        signingTime: signature.signingTime,
        chainValidation: signature.chainValidation,
        timestampValidation: signature.timestampValidation,
        verificationStatus: signature.verificationStatus,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao assinar documento');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/certification/verify
 * Verify digital signature
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { signature, documentBuffer } = req.body;

    if (!signature || !documentBuffer) {
      throw new AppError(400, 'Assinatura e documento são obrigatórios');
    }

    logger.info('Verificando assinatura digital');

    const isValid = await advancedCertificationService.verifySignature(
      signature,
      Buffer.from(documentBuffer, 'base64'),
    );

    res.json({
      success: true,
      data: {
        isValid,
        verificationTime: new Date(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao verificar assinatura');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/certification/revoke
 * Revoke certificate
 */
router.post('/revoke', async (req: Request, res: Response) => {
  try {
    const { certificateThumbprint, reason } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!certificateThumbprint) {
      throw new AppError(400, 'Thumbprint do certificado é obrigatório');
    }

    logger.info(
      {
        certificateThumbprint,
        reason,
      },
      'Revogando certificado',
    );

    // Get certificate (in production, retrieve from database)
    const certificate = {
      thumbprint: certificateThumbprint,
      name: 'Certificate',
      certificateType: 'A3' as const,
    };

    await advancedCertificationService.revokeCertificate(
      certificate as any,
      reason || 'Não especificado',
      userId,
    );

    res.json({
      success: true,
      message: 'Certificado revogado com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao revogar certificado');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/certification/statistics
 * Get certificate statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await advancedCertificationService.getCertificateStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
