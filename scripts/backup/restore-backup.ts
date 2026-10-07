#!/usr/bin/env tsx
/**
 * Script de restauração de backup
 *
 * Uso: npm run restore-backup <file-id>
 * Ou manualmente: tsx scripts/backup/restore-backup.ts <file-id>
 *
 * Baixa um arquivo de backup do Google Drive, valida e restaura o banco de dados.
 */

import "dotenv/config";
import { restaurarBackupDoGoogleDrive } from "../../server/src/utils/googleDriveBackup.js";

async function main() {
  const fileId = process.argv[2];

  if (!fileId) {
    console.error("Erro: Forneça o ID do arquivo do backup como argumento");
    console.error("Uso: npm run restore-backup <file-id>");
    console.error("Exemplo: npm run restore-backup 1a2b3c4d5e6f7g8h9i0j");
    process.exit(1);
  }

  console.log(`[RestoreBackup] Iniciando restauração do backup: ${fileId}`);

  const resultado = await restaurarBackupDoGoogleDrive(fileId);

  if (!resultado.sucesso) {
    console.error(`[RestoreBackup] Erro ao restaurar: ${resultado.erros.join(", ")}`);
    process.exit(1);
  }

  console.log("[RestoreBackup] Backup restaurado com sucesso!");
  console.log("[RestoreBackup] Verificar em: data/backups/restore-*.zip");
  process.exit(0);
}

main().catch((erro) => {
  console.error("[RestoreBackup] Erro fatal:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
