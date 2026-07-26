// src/modules/ged/routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { GEDService } from './document.service';
import { Database } from '@/database';
import { verifyToken } from '@/middlewares';
import { z } from 'zod';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export function setupGEDRoutes(db: Database): Router {
  const gedService = new GEDService(db);

  /**
   * POST /ged/upload
   * Upload de documento
   */
  router.post(
    '/ged/upload',
    verifyToken,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Arquivo não fornecido' });
        }

        const { caseId, documentType = 'other', tags } = req.body;

        if (!caseId) {
          return res.status(400).json({ error: 'Caso obrigatório' });
        }

        const document = await gedService.uploadDocument(req.user!.id, {
          caseId,
          fileName: req.file.originalname,
          file: req.file.buffer,
          documentType: documentType || 'other',
          tags: tags ? JSON.parse(tags) : undefined,
        });

        res.json({
          success: true,
          document: {
            id: document.id,
            fileName: document.fileName,
            fileSize: document.fileSize,
            uploadedAt: document.uploadedAt,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /ged/documents/:caseId
   * Listar documentos do caso
   */
  router.get(
    '/ged/documents/:caseId',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const documents = await gedService.listDocumentsByCase(req.params.caseId);
        res.json({ documents });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /ged/search
   * Buscar documentos
   */
  router.get(
    '/ged/search',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { q, caseId, limit = 20 } = req.query;

        if (!q) {
          return res.status(400).json({ error: 'Parâmetro "q" obrigatório' });
        }

        const results = await gedService.searchDocuments(
          String(q),
          String(caseId) || undefined,
          parseInt(String(limit), 10)
        );

        res.json({ results });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /ged/ocr/:documentId
   * Processar OCR
   */
  router.post(
    '/ged/ocr/:documentId',
    verifyToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await gedService.extractOCR(req.params.documentId);
        res.json({
          success: true,
          ocr: {
            confidence: result.confidence,
            language: result.language,
            processingTime: result.processingTime,
            contentPreview: result.content.substring(0, 200),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /ged/version/:documentId
   * Criar versão de documento
   */
  router.post(
    '/ged/version/:documentId',
    verifyToken,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Arquivo não fornecido' });
        }

        const { changes } = req.body;
        const storagePath = `documents/${req.params.documentId}/versions/${req.file.originalname}`;

        const version = await gedService.createVersion(
          req.params.documentId,
          req.user!.id,
          storagePath,
          changes
        );

        res.json({
          success: true,
          version: {
            id: version.id,
            versionNumber: version.versionNumber,
            createdAt: version.createdAt,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
