#!/usr/bin/env tsx
/**
 * Script para listar backups disponíveis no Google Drive
 *
 * Uso: npm run backup:listar
 * Ou manualmente: tsx scripts/backup/listar-backups.ts
 *
 * Lista todos os arquivos de backup armazenados na pasta "Backups Contabilidade"
 */

import "dotenv/config";
import { listarBackupsNoGoogleDrive } from "../../server/src/utils/googleDriveBackup.js";

async function main() {
  console.log("[ListarBackups] Conectando ao Google Drive...");

  const backups = await listarBackupsNoGoogleDrive();

  if (backups === null) {
    console.error("[ListarBackups] Não foi possível conectar ao Google Drive");
    console.error("[ListarBackups] Verifique se GOOGLE_CREDENTIALS_JSON está configurada no .env");
    process.exit(1);
  }

  if (backups.length === 0) {
    console.log("[ListarBackups] Nenhum backup encontrado no Google Drive");
    process.exit(0);
  }

  console.log(`[ListarBackups] ${backups.length} backup(s) encontrado(s):\n`);

  backups.forEach((backup, index) => {
    const data = new Date(backup.criadoEm);
    const dataFormatada = data.toLocaleString("pt-BR");

    console.log(`${index + 1}. ${backup.nome}`);
    console.log(`   ID: ${backup.id}`);
    console.log(`   Criado em: ${dataFormatada}`);
    console.log();
  });

  console.log("[ListarBackups] Para restaurar um backup, use:");
  console.log("npm run restore-backup <file-id>");
  console.log("\nExemplo:");
  console.log(`npm run restore-backup ${backups[0]?.id}`);
}

main().catch((erro) => {
  console.error("[ListarBackups] Erro fatal:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
