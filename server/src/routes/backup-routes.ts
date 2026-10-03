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
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { backupSQLiteToGoogleDrive, listarBackupsNoGoogleDrive, restaurarBackupDoGoogleDrive } from "../utils/googleDriveBackup.js";
import type { AuthenticatedRequest } from "../types/express.js";

export interface BackupRoutesOptions {
  authService: AuthServiceDB;
}

export function criarRotasBackup(options: BackupRoutesOptions): Router {
  const router = Router();
  const { authService } = options;
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/backup/listar
   * Lista todos os backups disponíveis no Google Drive
   * Requer autenticação
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
      console.error("[BackupRoutes] Erro ao listar backups:", erro);
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
  router.post("/agora", exigirAutenticacao, async (req: Request, res: Response) => {
    try {
      const usuarioId = (req.auth as any)?.usuario?.id;
      console.log("[BackupRoutes] Backup manual solicitado por usuário:", usuarioId);

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
      console.error("[BackupRoutes] Erro ao criar backup:", erro);
      res.status(500).json({
        erro: "Erro ao criar backup",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/backup/restaurar/:fileId
   * Restaura um backup específico
   * Requer autenticação
   */
  router.post("/restaurar/:fileId", exigirAutenticacao, async (req: Request, res: Response) => {
    try {
      const usuarioId = (req.auth as any)?.usuario?.id;
      const { fileId } = req.params;

      if (!fileId) {
        return res.status(400).json({ erro: "fileId é obrigatório" });
      }

      console.log("[BackupRoutes] Restauração de backup solicitada por usuário:", usuarioId, "arquivo:", fileId);

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
      console.error("[BackupRoutes] Erro ao restaurar backup:", erro);
      res.status(500).json({
        erro: "Erro ao restaurar backup",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/backup/status
   * Verifica o status da configuração de backup
   * Requer autenticação
   */
  router.get("/status", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const googleDriveConfigured = !!process.env.GOOGLE_CREDENTIALS_JSON;

      res.json({
        sucesso: true,
        backup: {
          googleDriveConfigured,
          ultimoBackupAgendado: "a cada 1 hora automaticamente",
          backupManualDisponivel: googleDriveConfigured,
        },
      });
    } catch (erro) {
      console.error("[BackupRoutes] Erro ao verificar status:", erro);
      res.status(500).json({
        erro: "Erro ao verificar status de backup",
      });
    }
  });

  return router;
}
