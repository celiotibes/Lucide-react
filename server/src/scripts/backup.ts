#!/usr/bin/env node

/**
 * CLI de Backup — subcomandos para gerenciamento de backups
 *
 * Uso:
 *   tsx server/src/scripts/backup.ts criar        — Cria novo backup
 *   tsx server/src/scripts/backup.ts verificar    — Verifica integridade de último backup
 *   tsx server/src/scripts/backup.ts testar-restauracao — Testa restauração
 *   tsx server/src/scripts/backup.ts listar       — Lista backups disponíveis
 */

import BackupService from "../services/backup-service.js";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const command = args[0] || "help";

async function main() {
  try {
    const dbPath = path.join(process.cwd(), "data", "app.db");
    const service = new BackupService(dbPath);

    switch (command) {
      case "criar": {
        console.log("\n[Backup CLI] Criando novo backup...");
        const result = await service.criarBackup();

        if (result.sucesso) {
          console.log(`✓ Backup criado com sucesso: ${result.backupId}`);
          console.log(`  Timestamp: ${result.manifesto?.timestamp}`);
          console.log(`  Tamanho original: ${result.manifesto?.originalSize} bytes`);
          console.log(`  Tamanho criptografado: ${result.manifesto?.encryptedSize} bytes`);
          console.log(`  SHA-256: ${result.manifesto?.sha256Hash.substring(0, 16)}...`);
          console.log(`  Tabelas: ${result.manifesto?.tables.length}`);
        } else {
          console.error("✗ Backup falhou:");
          result.erros.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }
        break;
      }

      case "verificar": {
        console.log("\n[Backup CLI] Verificando integridade...");
        const backups = service.listarBackups();

        if (backups.length === 0) {
          console.error("✗ Nenhum backup encontrado");
          process.exit(1);
        }

        const ultimo = backups[0];
        const manifestPath = path.join(
          process.env.BACKUP_LOCAL_DIR || "",
          `${ultimo.id}-manifest.json`
        );

        if (!fs.existsSync(manifestPath)) {
          console.error("✗ Manifesto não encontrado:", manifestPath);
          process.exit(1);
        }

        const manifesto = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const arquivoEncriptado = path.join(
          process.env.BACKUP_LOCAL_DIR || "",
          `${ultimo.id}.enc`
        );

        const result = await service.verificarBackup(arquivoEncriptado, manifesto);

        if (result.valido) {
          console.log(`✓ Backup válido: ${ultimo.id}`);
          console.log(`  Timestamp: ${manifesto.timestamp}`);
          console.log(`  Hash SHA-256 verificado`);
        } else {
          console.error("✗ Erros encontrados:");
          result.erros.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }

        if (result.avisos.length > 0) {
          console.log("⚠ Avisos:");
          result.avisos.forEach(a => console.log(`  - ${a}`));
        }
        break;
      }

      case "testar-restauracao": {
        console.log("\n[Backup CLI] Testando restauração...");
        const backups = service.listarBackups();

        if (backups.length === 0) {
          console.error("✗ Nenhum backup encontrado");
          process.exit(1);
        }

        const ultimo = backups[0];
        const manifestPath = path.join(
          process.env.BACKUP_LOCAL_DIR || "",
          `${ultimo.id}-manifest.json`
        );

        if (!fs.existsSync(manifestPath)) {
          console.error("✗ Manifesto não encontrado:", manifestPath);
          process.exit(1);
        }

        const manifesto = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const arquivoEncriptado = path.join(
          process.env.BACKUP_LOCAL_DIR || "",
          `${ultimo.id}.enc`
        );

        const result = await service.testarRestauracao(arquivoEncriptado, manifesto);

        console.log(`\nResultado: ${result.valido ? "✓ VÁLIDO" : "✗ FALHOU"}`);
        console.log(`Integridade: ${result.relatorio.integridade}`);
        console.log(`Tabelas restituídas:`);
        Object.entries(result.relatorio.tabelas).forEach(([tabela, count]) => {
          console.log(`  - ${tabela}: ${count} linhas`);
        });

        if (result.relatorio.avisos.length > 0) {
          console.log(`⚠ Avisos:`);
          result.relatorio.avisos.forEach(a => console.log(`  - ${a}`));
        }

        if (result.erros.length > 0) {
          console.log(`✗ Erros:`);
          result.erros.forEach(e => console.log(`  - ${e}`));
          process.exit(1);
        }
        break;
      }

      case "listar": {
        console.log("\n[Backup CLI] Backups disponíveis:\n");
        const backups = service.listarBackups();

        if (backups.length === 0) {
          console.log("Nenhum backup encontrado");
          break;
        }

        backups.forEach((b, i) => {
          console.log(`${i + 1}. ${b.id}`);
          console.log(`   Timestamp: ${b.timestamp}`);
          console.log(`   Tamanho: ${(b.tamanho / 1024 / 1024).toFixed(2)} MB`);
        });
        break;
      }

      case "help":
      case "-h":
      case "--help":
      default:
        console.log(`
Backup CLI — Gerenciador de Backups com Criptografia

Uso: tsx server/src/scripts/backup.ts <comando>

Comandos:
  criar                 Cria novo backup criptografado
  verificar             Verifica integridade do último backup
  testar-restauracao    Testa restauração do último backup
  listar                Lista todos os backups disponíveis
  help, -h, --help      Exibe esta mensagem

Variáveis de Ambiente:
  BACKUP_LOCAL_DIR           Caminho do diretório local de backups (obrigatório)
  BACKUP_ENCRYPTION_KEY      Chave AES-256 em hex 64 caracteres (obrigatório)
  GOOGLE_CREDENTIALS_JSON    Credenciais Google Drive para 2ª cópia (opcional)

Exemplo:
  export BACKUP_LOCAL_DIR=/mnt/backup
  export BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)
  export GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'

  tsx server/src/scripts/backup.ts criar
`);
        break;
    }
  } catch (erro) {
    console.error("\n✗ Erro crítico:", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  }
}

main();
