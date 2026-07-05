import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { ocrService } from '@services/OCRService';
import { OCRRequest } from '@services/OCRService';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configurar upload de arquivo
const upload = multer({
  dest: path.join(process.cwd(), 'uploads/ocr'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`));
    }
  },
});

/**
 * POST /ocr/upload
 * Upload e processar documento com OCR
 * Requer autenticação
 */
router.post('/upload', verifyToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo é obrigatório' });
    }

    const fileType = req.body.fileType || this.detectFileType(req.file.mimetype);

    if (!['pdf', 'image', 'scan'].includes(fileType)) {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado' });
    }

    const ocrRequest: OCRRequest = {
      fileId: req.file.filename,
      filePath: req.file.path,
      fileType: fileType as 'pdf' | 'image' | 'scan',
      language: req.body.language || 'pt-BR',
      returnStructure: req.body.returnStructure === 'true',
    };

    const result = await ocrService.extractText(ocrRequest);

    res.json({
      status: 'success',
      fileId: req.file.filename,
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar OCR');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao processar arquivo',
    });
  }
});

/**
 * POST /ocr/extract
 * Extrair texto de arquivo já enviado
 * Requer autenticação
 */
router.post('/extract', verifyToken, async (req: Request, res: Response) => {
  try {
    const { filePath, fileType } = req.body;

    if (!filePath || !fileType) {
      return res.status(400).json({ error: 'filePath e fileType são obrigatórios' });
    }

    const result = await ocrService.extractText({
      fileId: filePath,
      filePath,
      fileType,
      returnStructure: req.body.returnStructure || false,
    });

    res.json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro na extração de texto');
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao extrair texto',
    });
  }
});

/**
 * POST /ocr/validate
 * Validar formato de documento
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath é obrigatório' });
    }

    const validation = await ocrService.validateDocumentFormat(filePath);

    res.json({
      status: 'success',
      ...validation,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao validar documento');
    res.status(400).json({
      error: 'Erro ao validar documento',
    });
  }
});

/**
 * POST /ocr/structure
 * Estruturar documento em seções
 * Requer autenticação
 */
router.post('/structure', verifyToken, async (req: Request, res: Response) => {
  try {
    const { text, fileId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texto é obrigatório' });
    }

    const structure = await ocrService.detectSignatures(fileId || 'unknown');

    res.json({
      status: 'success',
      fileId,
      structure,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao estruturar documento');
    res.status(500).json({
      error: 'Erro ao estruturar documento',
    });
  }
});

// Helper
function detectFileType(mimetype: string): string {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.startsWith('image/')) return 'image';
  return 'scan';
}

export const ocrController = router;
