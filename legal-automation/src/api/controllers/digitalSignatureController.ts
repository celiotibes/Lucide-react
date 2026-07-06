import express, { Router } from 'express';
import CertificateService from '@services/CertificateService';
import DocumentSignatureService from '@services/DocumentSignatureService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

// ============ CERTIFICATE MANAGEMENT ============

/**
 * POST /certificates/upload
 * Upload e registrar novo certificado digital
 */
router.post('/certificates/upload', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { certificate, password, isPinned } = req.body;

    if (!certificate) {
      return res.status(400).json({
        status: 'error',
        message: 'Certificado não fornecido',
      });
    }

    const certBuffer = Buffer.from(certificate, 'base64');

    const uploadedCert = await CertificateService.uploadCertificate(userId, {
      certificate: certBuffer,
      password,
      isPinned,
    });

    res.status(201).json({
      status: 'success',
      message: 'Certificado enviado e validado com sucesso',
      certificate: {
        id: uploadedCert.id,
        commonName: uploadedCert.commonName,
        issuerName: uploadedCert.issuerName,
        validFrom: uploadedCert.validFrom,
        validUntil: uploadedCert.validUntil,
        owner: uploadedCert.owner,
        certificateType: uploadedCert.certificateType,
        isValid: uploadedCert.isValid,
        thumbprint: uploadedCert.thumbprint,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao fazer upload de certificado');
    res.status(400).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Erro ao fazer upload',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /certificates
 * Listar certificados do usuário
 */
router.get('/certificates', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const certificates = await CertificateService.getCertificatesByUser(userId);

    res.status(200).json({
      status: 'success',
      certificates: certificates.map((cert) => ({
        id: cert.id,
        commonName: cert.commonName,
        issuerName: cert.issuerName,
        serialNumber: cert.serialNumber,
        validFrom: cert.validFrom,
        validUntil: cert.validUntil,
        isValid: cert.isValid,
        isPinned: cert.isPinned,
        owner: cert.owner,
        certificateType: cert.certificateType,
        uploadedAt: cert.uploadedAt,
        usageCount: cert.usageCount,
      })),
      count: certificates.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar certificados');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao listar certificados',
    });
  }
});

/**
 * GET /certificates/:certificateId
 * Obter detalhes de um certificado específico
 */
router.get('/certificates/:certificateId', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { certificateId } = req.params;

    const certificate = await CertificateService.getCertificate(
      certificateId,
      userId,
    );

    if (!certificate) {
      return res.status(404).json({
        status: 'error',
        message: 'Certificado não encontrado',
      });
    }

    res.status(200).json({
      status: 'success',
      certificate: {
        id: certificate.id,
        commonName: certificate.commonName,
        issuerName: certificate.issuerName,
        serialNumber: certificate.serialNumber,
        thumbprint: certificate.thumbprint,
        keyType: certificate.keyType,
        keySize: certificate.keySize,
        validFrom: certificate.validFrom,
        validUntil: certificate.validUntil,
        isValid: certificate.isValid,
        isPinned: certificate.isPinned,
        owner: certificate.owner,
        certificateType: certificate.certificateType,
        issuerType: certificate.issuerType,
        uploadedAt: certificate.uploadedAt,
        lastUsedAt: certificate.lastUsedAt,
        usageCount: certificate.usageCount,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter certificado');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter certificado',
    });
  }
});

/**
 * DELETE /certificates/:certificateId
 * Deletar certificado do usuário
 */
router.delete('/certificates/:certificateId', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { certificateId } = req.params;

    const deleted = await CertificateService.deleteCertificate(
      certificateId,
      userId,
    );

    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Certificado não encontrado',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Certificado deletado com sucesso',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao deletar certificado');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao deletar certificado',
    });
  }
});

/**
 * GET /certificates/expirations/warnings
 * Obter alertas de certificados prestes a expirar
 */
router.get(
  '/certificates/expirations/warnings',
  authenticateJWT,
  async (req, res) => {
    try {
      const warnings =
        await CertificateService.validateCertificateExpiration();

      res.status(200).json({
        status: 'success',
        warnings,
        count: warnings.length,
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar expiração de certificados');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao validar expiração de certificados',
      });
    }
  },
);

/**
 * POST /certificates/:certificateId/validate
 * Validar certificado
 */
router.post(
  '/certificates/:certificateId/validate',
  authenticateJWT,
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { certificateId } = req.params;

      const certificate = await CertificateService.getCertificate(
        certificateId,
        userId,
      );

      if (!certificate) {
        return res.status(404).json({
          status: 'error',
          message: 'Certificado não encontrado',
        });
      }

      await CertificateService.refreshCertificateValidation(certificateId);

      const updatedCert = await CertificateService.getCertificate(
        certificateId,
        userId,
      );

      res.status(200).json({
        status: 'success',
        message: 'Certificado validado com sucesso',
        certificate: {
          id: updatedCert!.id,
          isValid: updatedCert!.isValid,
          validUntil: updatedCert!.validUntil,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar certificado');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao validar certificado',
      });
    }
  },
);

// ============ DOCUMENT SIGNING ============

/**
 * POST /sign/document
 * Assinar documento genérico
 */
router.post('/sign/document', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const {
      documentId,
      documentContent,
      documentName,
      certificateId,
      password,
      signatureReason,
      signatureLocation,
      format,
      timestamps,
    } = req.body;

    if (!certificateId) {
      return res.status(400).json({
        status: 'error',
        message: 'Certificado obrigatório',
      });
    }

    let docContent: Buffer | undefined;
    if (documentContent) {
      docContent = Buffer.from(documentContent, 'base64');
    }

    const response = await DocumentSignatureService.signDocument(userId, {
      documentId,
      documentContent: docContent,
      documentName,
      certificateId,
      password,
      signatureReason,
      signatureLocation,
      format: format || 'CMS',
      timestamps: timestamps || false,
    });

    if (!response.success) {
      return res.status(400).json(response);
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error({ err: error }, 'Erro ao assinar documento');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao assinar documento',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /sign/petition
 * Assinar petição jurídica completa
 */
router.post('/sign/petition', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const {
      petitionId,
      petitionContent,
      signerName,
      signerCPF,
      certificateId,
      password,
      includeTimestamp,
      signatureFormat,
      attachments,
    } = req.body;

    if (!petitionId || !petitionContent || !certificateId) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: petitionId, petitionContent, certificateId',
      });
    }

    const petitionBuffer = Buffer.from(petitionContent, 'base64');
    const attachmentBuffers = attachments?.map((att: any) => ({
      name: att.name,
      content: Buffer.from(att.content, 'base64'),
    }));

    const response = await DocumentSignatureService.signPetition(userId, {
      petitionId,
      petitionContent: petitionBuffer,
      signerName,
      signerCPF,
      certificateId,
      password,
      includeTimestamp: includeTimestamp || false,
      signatureFormat: signatureFormat || 'PAdES',
      attachments: attachmentBuffers,
    });

    if (!response.success) {
      return res.status(400).json(response);
    }

    res.status(200).json({
      ...response,
      signedPetition: response.signedPetition.toString('base64'),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao assinar petição');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao assinar petição',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /verify/signature
 * Verificar assinatura de documento
 */
router.post('/verify/signature', authenticateJWT, async (req, res) => {
  try {
    const { signedDocument, originalDocument } = req.body;

    if (!signedDocument) {
      return res.status(400).json({
        status: 'error',
        message: 'Documento assinado é obrigatório',
      });
    }

    const result = await DocumentSignatureService.verifySignature({
      signedDocument,
      originalDocument: originalDocument
        ? Buffer.from(originalDocument, 'base64')
        : undefined,
    });

    res.status(200).json({
      status: 'success',
      verification: result,
      isValid: result.isValid,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar assinatura');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao verificar assinatura',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /signature/:signatureId
 * Obter detalhes de uma assinatura
 */
router.get('/signature/:signatureId', authenticateJWT, async (req, res) => {
  try {
    const { signatureId } = req.params;

    const signature = await DocumentSignatureService.getSignature(signatureId);

    if (!signature) {
      return res.status(404).json({
        status: 'error',
        message: 'Assinatura não encontrada',
      });
    }

    res.status(200).json({
      status: 'success',
      signature,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter assinatura');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter assinatura',
    });
  }
});

export default router;
