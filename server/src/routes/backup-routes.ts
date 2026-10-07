/**
 * Backup Routes — Google Drive backup management
 *
 * Provides endpoints for listing, creating, and restoring database backups stored on Google Drive.
 *
 * Endpoints:
 * - GET /api/backup/listar — list all available backups on Google Drive
 * - POST /api/backup/agora — execute an immediate manual backup
 * - POST /api/backup/restaurar/:fileId — restore a specific backup (admin recommended)
 * - GET /api/backup/status — check backup configuration status
 *
 * All routes require authentication via the exigirAutenticacao middleware.
 * Admin verification is recommended for restore operations (currently commented out).
 */

import { Router, Request, Response } from "express";
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { backupSQLiteToGoogleDrive, listarBackupsNoGoogleDrive, restaurarBackupDoGoogleDrive } from "../utils/googleDriveBackup.js";

export interface BackupRoutesOptions {
  authService: AuthServiceDB;
}

export function criarRotasBackup(options: BackupRoutesOptions): Router {
  const router = Router();
  const { authService } = options;
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/backup/listar
   * List all available backups on Google Drive
   * Requires authentication
   *
   * @returns List of backup files with metadata
   */
  router.get("/listar", exigirAutenticacao, async (req: Request, res: Response) => {
    try {
      const backups = await listarBackupsNoGoogleDrive();

      if (backups === null) {
        return res.status(503).json({
          erro: "Google Drive não está configurado",
          dica: "Configure GOOGLE_CREDENTIALS_JSON no .env",
        });
      }

      res.json({
        sucesso: true,
        total: backups.length,
        backups,
      });
    } catch (erro) {
      logger.error("[BackupRoutes] Erro ao listar backups:", erro);
      res.status(500).json({
        erro: "Erro ao listar backups",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/backup/agora
   * Executa um backup imediato (manual) do banco de dados
   * Requer autenticação
   */
  /**
   * POST /api/backup/agora
   * Execute an immediate manual backup of the database
   * Requires authentication
   */
  router.post("/agora", exigirAutenticacao, async (req: Request, res: Response) => {
    try {
      // Type-safe access to authenticated user
      const usuarioId = req.auth?.usuario?.id;
      logger.info("[BackupRoutes] Backup manual solicitado por usuário:", usuarioId);

      const resultado = await backupSQLiteToGoogleDrive();

      if (resultado.sucesso) {
        res.json({
          sucesso: true,
          mensagem: "Backup criado com sucesso",
          arquivo: resultado.arquivoZip,
        });
      } else {
        res.status(500).json({
          sucesso: false,
          erro: "Backup falhou",
          detalhes: resultado.erros,
        });
      }
    } catch (erro) {
      logger.error("[BackupRoutes] Erro ao criar backup:", erro);
      res.status(500).json({
        erro: "Erro ao criar backup",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/backup/restaurar/:fileId
   * Restore a specific backup from Google Drive
   * Requires authentication (admin verification is recommended)
   *
   * @param fileId The Google Drive file ID of the backup to restore
   */
  router.post("/restaurar/:fileId", exigirAutenticacao, async (req: Request, res: Response) => {
    try {
      // Type-safe access to authenticated user
      const usuarioId = req.auth?.usuario?.id;
      const { fileId } = req.params;

      if (!fileId) {
        return res.status(400).json({ erro: "fileId é obrigatório" });
      }

      logger.info("[BackupRoutes] Restauração de backup solicitada por usuário:", usuarioId, "arquivo:", fileId);

      const resultado = await restaurarBackupDoGoogleDrive(fileId);

      if (resultado.sucesso) {
        res.json({
          sucesso: true,
          mensagem: "Backup restaurado com sucesso",
          aviso: "Reinicie o servidor para aplicar a restauração completamente",
        });
      } else {
        res.status(500).json({
          sucesso: false,
          erro: "Restauração falhou",
          detalhes: resultado.erros,
        });
      }
    } catch (erro) {
      logger.error("[BackupRoutes] Erro ao restaurar backup:", erro);
      res.status(500).json({
        erro: "Erro ao restaurar backup",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/backup/status
   * Check backup configuration status (Google Drive, scheduler, etc.)
   * Requires authentication
   *
   * @returns Configuration status including scheduler info
   */
  router.get("/status", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const googleDriveConfigured = !!process.env.GOOGLE_CREDENTIALS_JSON;
      const localBackupConfigured = !!process.env.BACKUP_LOCAL_DIR && !!process.env.BACKUP_ENCRYPTION_KEY;
      const backupScheduler = req.app?.locals?.backupScheduler;
      const schedulerStatus = backupScheduler?.getStatus();

      res.json({
        sucesso: true,
        backup: {
          googleDriveConfigured,
          localBackupConfigured,
          ultimoBackupAgendado: "a cada 1 hora automaticamente",
          backupManualDisponivel: googleDriveConfigured,
          scheduler: schedulerStatus || null,
        },
      });
    } catch (erro) {
      logger.error("[BackupRoutes] Erro ao verificar status:", erro);
      res.status(500).json({
        erro: "Erro ao verificar status de backup",
      });
    }
  });

  return router;
}
