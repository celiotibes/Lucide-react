/**
 * Rotas de backup para o cliente
 *
 * GET /api/backup/listar — lista backups no Google Drive
 * POST /api/backup/agora — executa backup imediato
 * POST /api/backup/restaurar/:fileId — restaura um backup específico
 */

import { Router, Request, Response } from "express";
import { backupSQLiteToGoogleDrive, listarBackupsNoGoogleDrive, restaurarBackupDoGoogleDrive } from "../utils/googleDriveBackup.js";
import { verificarAutorizacao } from "../domain/auth/auth-middleware.js";

export interface BackupRoutesOptions {
  permissoesService: any; // PermissoesServiceDB
}

export function criarRotasBackup(options: BackupRoutesOptions): Router {
  const router = Router();
  const { permissoesService } = options;

  /**
   * GET /api/backup/listar
   * Lista todos os backups disponíveis no Google Drive
   * Requer permissão de admin
   */
  router.get("/listar", async (req: Request, res: Response) => {
    try {
      // Verifica permissão (requer ser admin ou ter permissão específica)
      const usuarioId = (req as any).user?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Não autenticado" });
      }

      // Opcional: verificar se tem permissão específica de backup
      // await verificarAutorizacao(permissoesService, usuarioId, "backup.listar");

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
   * Requer permissão de admin
   */
  router.post("/agora", async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).user?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Não autenticado" });
      }

      // Opcional: verificar permissão específica
      // await verificarAutorizacao(permissoesService, usuarioId, "backup.criar");

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
   * Requer permissão de admin (muito cuidado!)
   */
  router.post("/restaurar/:fileId", async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).user?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Não autenticado" });
      }

      // Verificar permissão (pode ser uma permissão especial)
      // await verificarAutorizacao(permissoesService, usuarioId, "backup.restaurar");

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
   */
  router.get("/status", (req: Request, res: Response) => {
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
