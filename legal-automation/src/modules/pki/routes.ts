// src/modules/pki/routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CertificateService } from './certificate.service';
import { Database } from '@/database';
import { verifyToken } from '@/middlewares';
import { ZodError, z } from 'zod';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!['application/x-pkcs12', 'application/octet-stream'].includes(file.mimetype)) {
      return cb(new Error('Apenas arquivos PKCS#12 (.pfx) são permitidos'));
    }
    cb(null, true);
  },
});

export function setupPKIRoutes(db: Database): Router {
  const certService = new CertificateService(db);

  /**
   * POST /pki/upload
   * Upload de certificado digital
   */
  router.post(
    '/pki/upload',
    verifyToken,
    upload.single('certificate'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Certificado não fornecido' });
        }

        const { password, keyType = 'A1' } = req.body;
        if (!password) {
          return res.status(400).json({ error: 'Senha do certificado obrigatória' });
        }

        const certificate = await certService.uploadCertificate(req.user!.id, {
          pkcs12Buffer: req.file.buffer,
          password,
          keyType: keyType || 'A1',
        });

        res.json({
          success: true,
          certificate: {
            id: certificate.id,
            cnpj: certificate.cnpj,
            fingerprint: certificate.fingerprintSha256.substring(0, 16),
            notAfter: certificate.notAfter,
            status: certificate.status,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /pki/certificates
   * Listar certificados do usuário
   */
  router.get('/pki/certificates', verifyToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificates = await certService.listCertificates(req.user!.id);
      res.json({ certificates });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /pki/sign
   * Assinar documento
   */
  router.post(
    '/pki/sign',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const signSchema = z.object({
          certificateId: z.string().uuid(),
          documentId: z.string().uuid(),
          documentHash: z.string().regex(/^[a-f0-9]{64}$/),
          hashAlgorithm: z.enum(['SHA256', 'SHA384', 'SHA512']).default('SHA256'),
          signatureFormat: z.enum(['CMS', 'CAdES', 'XAdES']).default('CAdES'),
          password: z.string().min(4),
          timestamp: z.boolean().optional(),
        });

        const validated = signSchema.parse(req.body);

        const response = await certService.signDocument(
          validated.certificateId,
          {
            documentId: validated.documentId,
            documentHash: validated.documentHash,
            hashAlgorithm: validated.hashAlgorithm,
            signatureFormat: validated.signatureFormat,
            timestamp: validated.timestamp,
          },
          validated.password,
          req.ip || 'unknown'
        );

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /pki/certificates/:id
   * Revogar certificado
   */
  router.delete(
    '/pki/certificates/:id',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await certService.revokeCertificate(req.params.id, req.user!.id);
        res.json({ success: true, message: 'Certificado revogado com sucesso' });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
