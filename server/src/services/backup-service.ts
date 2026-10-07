/**
 * Backup Service — Backup & Restore com 2+ cópias, integridade e testes
 *
 * Responsabilidades:
 * - Gerar snapshot consistente do SQLite (VACUUM INTO ou backup API)
 * - Calcular SHA-256 e manifesto JSON (nome, tamanho, hash, data, schema version)
 * - Criptografar com AES-256-GCM (BACKUP_ENCRYPTION_KEY obrigatória)
 * - Gravar local (BACKUP_LOCAL_DIR) e chamar uploader Drive (2ª cópia)
 * - Retenção configurável: padrão 7 diários, 8 semanais, 12 mensais
 * - verificarBackup(arquivo, manifesto) → valida hash + integridade
 * - testarRestauracao(arquivo) → descriptografa, abre SQLite, PRAGMA integrity_check, row counts
 *
 * Padrão: RPO alvo 15 min (requer backup incremental/WAL — implementar depois)
 *         RTO alvo 4 h
 *         Regra 3-2-1: 3 cópias, 2 mídias, 1 offsite (esta impl: Drive + local apenas)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { logger } from "./logger-service.js";
import { enviarArquivoParaGoogleDrive } from "../utils/googleDriveBackup.js";
import os from "os";

// Constantes de retenção
const DEFAULT_RETENTION_POLICY = {
  dailies: 7,      // Mantém últimos 7 backups diários
  weeklies: 8,     // Mantém últimos 8 backups semanais
  monthlies: 12,   // Mantém últimos 12 backups mensais (>= 5 anos: 12 * 12 = 144 backups mensais)
};

export interface BackupManifest {
  id: string;                  // UUID ou timestamp
  timestamp: string;           // ISO 8601
  filename: string;            // Nome do arquivo criptografado
  originalSize: number;        // Bytes do banco original
  encryptedSize: number;       // Bytes após criptografia
  sha256Hash: string;          // Hash SHA-256 do arquivo original
  schemaVersion: string;       // Versão do schema (ex: "1.0")
  tables: string[];            // Lista de tabelas backeadas
  rowCounts: Record<string, number>; // Contagem de linhas por tabela
  encryptionIv: string;        // IV em base64 (para descriptografia)
  encryptionAuthTag: string;   // Auth tag em base64 (AES-256-GCM)
  rpoTargetMinutes: number;    // 15 min (informativo: exige WAL incremental)
  retention: {
    dailies: number;
    weeklies: number;
    monthlies: number;
  };
}

export class BackupService {
  private dbPath: string;
  private localBackupDir: string;
  private encryptionKey: Buffer;

  constructor(dbPath: string = path.join(process.cwd(), "data", "app.db")) {
    this.dbPath = dbPath;

    // BACKUP_LOCAL_DIR obrigatório
    const localDir = process.env.BACKUP_LOCAL_DIR;
    if (!localDir) {
      throw new Error("[BackupService] BACKUP_LOCAL_DIR não configurada — backup local desabilitado");
    }
    this.localBackupDir = localDir;

    // Garante que diretório local existe
    if (!fs.existsSync(this.localBackupDir)) {
      fs.mkdirSync(this.localBackupDir, { recursive: true });
    }

    // BACKUP_ENCRYPTION_KEY obrigatória — NUNCA logar a chave
    const keyEnv = process.env.BACKUP_ENCRYPTION_KEY;
    if (!keyEnv) {
      throw new Error("[BackupService] BACKUP_ENCRYPTION_KEY não configurada — falha fechada");
    }

    // Chave deve ser 32 bytes para AES-256
    const keyBuffer = Buffer.from(keyEnv, "hex");
    if (keyBuffer.length !== 32) {
      throw new Error("[BackupService] BACKUP_ENCRYPTION_KEY deve ser 64 caracteres hex (32 bytes)");
    }
    this.encryptionKey = keyBuffer;

    logger.info("[BackupService] Inicializado com diretório local:", this.localBackupDir);
  }

  /**
   * Gera snapshot consistente do SQLite
   * Usa VACUUM INTO para criar cópia sem locks
   */
  private async gerarSnapshot(outputPath: string): Promise<boolean> {
    let db: InstanceType<typeof Database> | null = null;
    try {
      // Somente leitura e sem alterar o modo do banco de produção.
      db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
      try {
        db.exec(`VACUUM INTO '${outputPath.replace(/'/g, "''")}'`);
        logger.info("[BackupService] Snapshot criado via VACUUM INTO");
      } catch {
        logger.warn("[BackupService] VACUUM INTO indisponível, usando API de backup");
        await db.backup(outputPath);
      }
      return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
    } catch (erro) {
      logger.error("[BackupService] Erro ao criar snapshot:", erro instanceof Error ? erro.message : erro);
      return false;
    } finally {
      db?.close();
    }
  }

  /**
   * Calcula SHA-256 de um arquivo
   */
  private calcularHash(filePath: string): string {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      return crypto.createHash("sha256").update(fileBuffer).digest("hex");
    } catch (erro) {
      logger.error("[BackupService] Erro ao calcular hash:", erro);
      return "";
    }
  }

  /**
   * Coleta metadados do banco antes da criptografia
   */
  private coletarMetadados(dbPath: string): {
    tables: string[];
    rowCounts: Record<string, number>;
    schemaVersion: string;
  } {
    const metadados = {
      tables: [] as string[],
      rowCounts: {} as Record<string, number>,
      schemaVersion: "1.0",
    };

    try {
      const db = new Database(dbPath);
      db.pragma("query_only = ON");

      // Listar tabelas (excluir sqlite_*)
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>;

      for (const { name } of tables) {
        metadados.tables.push(name);
        try {
          const result = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
          metadados.rowCounts[name] = result.count;
        } catch {
          metadados.rowCounts[name] = 0;
        }
      }

      db.close();
    } catch (erro) {
      logger.error("[BackupService] Erro ao coletar metadados:", erro);
    }

    return metadados;
  }

  /**
   * Criptografa arquivo com AES-256-GCM
   * Retorna: arquivo criptografado + IV + authTag
   */
  private criptografarArquivo(
    inputPath: string,
    outputPath: string
  ): { iv: string; authTag: string } | null {
    try {
      const plaintext = fs.readFileSync(inputPath);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
      let encrypted = cipher.update(plaintext);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const authTag = cipher.getAuthTag();

      fs.writeFileSync(outputPath, encrypted);
      logger.info("[BackupService] Arquivo criptografado:", outputPath);

      return {
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
      };
    } catch (erro) {
      logger.error("[BackupService] Erro ao criptografar:", erro);
      return null;
    }
  }

  /**
   * Cria manifesto JSON com metadados do backup
   */
  private criarManifesto(
    originalPath: string,
    encryptedPath: string,
    iv: string,
    authTag: string,
    metadados: ReturnType<typeof this.coletarMetadados>
  ): BackupManifest {
    const timestamp = new Date().toISOString();
    const id = `backup-${Date.now()}`;

    return {
      id,
      timestamp,
      filename: path.basename(encryptedPath),
      originalSize: fs.statSync(originalPath).size,
      encryptedSize: fs.statSync(encryptedPath).size,
      sha256Hash: this.calcularHash(originalPath),
      schemaVersion: metadados.schemaVersion,
      tables: metadados.tables,
      rowCounts: metadados.rowCounts,
      encryptionIv: iv,
      encryptionAuthTag: authTag,
      rpoTargetMinutes: 15,
      retention: DEFAULT_RETENTION_POLICY,
    };
  }

  /**
   * Cria backup completo: snapshot → hash → criptografa → manifesto → local + Drive
   */
  async criarBackup(): Promise<{
    sucesso: boolean;
    backupId?: string;
    manifesto?: BackupManifest;
    erros: string[];
  }> {
    const erros: string[] = [];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-"));

    try {
      logger.info("[BackupService] Iniciando backup");

      // 1. Gerar snapshot
      const snapshotPath = path.join(tempDir, "snapshot.db");
      if (!(await this.gerarSnapshot(snapshotPath))) {
        erros.push("Falha ao criar snapshot");
        return { sucesso: false, erros };
      }

      // 2. Coletar metadados ANTES de criptografar
      const metadados = this.coletarMetadados(snapshotPath);

      // 3. Criptografar
      const backupId = `backup-${Date.now()}`;
      const encryptedPath = path.join(this.localBackupDir, `${backupId}.enc`);
      const cryptResult = this.criptografarArquivo(snapshotPath, encryptedPath);
      if (!cryptResult) {
        erros.push("Falha ao criptografar backup");
        return { sucesso: false, erros };
      }

      // 4. Criar manifesto
      const manifesto = this.criarManifesto(
        snapshotPath,
        encryptedPath,
        cryptResult.iv,
        cryptResult.authTag,
        metadados
      );

      // 5. Gravar manifesto localmente
      const manifestoPath = path.join(this.localBackupDir, `${backupId}-manifest.json`);
      fs.writeFileSync(manifestoPath, JSON.stringify(manifesto, null, 2));
      logger.info("[BackupService] Manifesto gravado:", manifestoPath);

      // 6. Aplicar retenção local
      await this.aplicarRetencao();

      // 7. Segunda cópia no Google Drive: SOMENTE o arquivo criptografado e o manifesto
      logger.info("[BackupService] Enviando cópia criptografada para o Google Drive");
      for (const [caminho, nome] of [
        [encryptedPath, `${backupId}.enc`],
        [manifestoPath, `${backupId}-manifest.json`],
      ] as const) {
        const r = await enviarArquivoParaGoogleDrive(caminho, nome);
        if (!r.sucesso) {
          erros.push(`Drive (${nome}): ${r.erros.join("; ")}`);
          logger.warn("[BackupService] Upload Drive falhou (cópia local mantida):", r.erros);
        }
      }

      logger.info("[BackupService] Backup completado:", backupId);
      return { sucesso: true, backupId, manifesto, erros };
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      erros.push(msg);
      logger.error("[BackupService] Erro crítico:", msg);
      return { sucesso: false, erros };
    } finally {
      // Limpar temp
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Verifica integridade do backup: confere hash e testa descriptografia
   */
  async verificarBackup(arquivoEncriptado: string, manifesto: BackupManifest): Promise<{
    valido: boolean;
    erros: string[];
    avisos: string[];
  }> {
    const erros: string[] = [];
    const avisos: string[] = [];

    try {
      logger.info("[BackupService] Verificando backup:", arquivoEncriptado);

      // 1. Verificar que arquivo existe
      if (!fs.existsSync(arquivoEncriptado)) {
        erros.push(`Arquivo não encontrado: ${arquivoEncriptado}`);
        return { valido: false, erros, avisos };
      }

      // 2. Verificar tamanho do arquivo criptografado
      const fileSize = fs.statSync(arquivoEncriptado).size;
      if (fileSize !== manifesto.encryptedSize) {
        avisos.push(
          `Tamanho mismatch: manifesto=${manifesto.encryptedSize}, real=${fileSize}`
        );
      }

      // 3. Tentar descriptografar e verificar hash
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-verify-"));
      try {
        const decryptedPath = path.join(tempDir, "decrypted.db");
        const decrypted = this.descriptografarArquivo(
          arquivoEncriptado,
          decryptedPath,
          manifesto.encryptionIv,
          manifesto.encryptionAuthTag
        );

        if (!decrypted) {
          erros.push("Falha ao descriptografar arquivo");
          return { valido: false, erros, avisos };
        }

        // Verificar hash
        const hashReal = this.calcularHash(decryptedPath);
        if (hashReal !== manifesto.sha256Hash) {
          erros.push(
            `Hash mismatch: manifesto=${manifesto.sha256Hash}, real=${hashReal}`
          );
          return { valido: false, erros, avisos };
        }

        // 4. Tentar abrir banco para verificar integridade
        try {
          const db = new Database(decryptedPath);
          const pragmaResult = db.prepare("PRAGMA integrity_check").all() as Record<string, unknown>[];
          db.close();

          if (pragmaResult.length > 0 && pragmaResult[0].integrity_check !== "ok") {
            erros.push("PRAGMA integrity_check falhou: " + JSON.stringify(pragmaResult));
            return { valido: false, erros, avisos };
          }
          logger.info("[BackupService] PRAGMA integrity_check passou");
        } catch {
          erros.push(`Erro ao validar banco: ${e}`);
          return { valido: false, erros, avisos };
        }
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }

      logger.info("[BackupService] Verificação passou");
      return { valido: true, erros, avisos };
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      erros.push(msg);
      return { valido: false, erros, avisos };
    }
  }

  /**
   * Testa restauração: descriptografa em temp, abre SQLite, PRAGMA integrity_check, row counts
   */
  async testarRestauracao(arquivoEncriptado: string, manifesto: BackupManifest): Promise<{
    valido: boolean;
    relatorio: {
      integridade: string;
      tabelas: Record<string, number>;
      avisos: string[];
    };
    erros: string[];
  }> {
    const erros: string[] = [];
    const relatorio = {
      integridade: "não testado",
      tabelas: {} as Record<string, number>,
      avisos: [] as string[],
    };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));

    try {
      logger.info("[BackupService] Testando restauração:", arquivoEncriptado);

      const decryptedPath = path.join(tempDir, "test-restore.db");
      const decrypted = this.descriptografarArquivo(
        arquivoEncriptado,
        decryptedPath,
        manifesto.encryptionIv,
        manifesto.encryptionAuthTag
      );

      if (!decrypted) {
        erros.push("Falha ao descriptografar para teste");
        return { valido: false, relatorio, erros };
      }

      // Abrir banco e validar
      const db = new Database(decryptedPath);
      db.pragma("query_only = ON");

      // PRAGMA integrity_check
      const pragmaResult = db.prepare("PRAGMA integrity_check").all() as Record<string, unknown>[];
      if (pragmaResult.length > 0 && pragmaResult[0].integrity_check === "ok") {
        relatorio.integridade = "ok";
      } else {
        relatorio.integridade = "failed";
        erros.push("PRAGMA integrity_check falhou");
      }

      // Contar linhas em tabelas-chave
      for (const table of manifesto.tables) {
        try {
          const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
          relatorio.tabelas[table] = result.count;

          // Avisar se contagem mudou
          if (manifesto.rowCounts[table] !== result.count) {
            relatorio.avisos.push(
              `${table}: esperava ${manifesto.rowCounts[table]}, encontrou ${result.count}`
            );
          }
        } catch {
          relatorio.avisos.push(`${table}: erro ao contar linhas`);
        }
      }

      db.close();
      logger.info("[BackupService] Teste de restauração completo");
      return { valido: erros.length === 0, relatorio, erros };
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      erros.push(msg);
      return { valido: false, relatorio, erros };
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Descriptografa arquivo com AES-256-GCM
   */
  private descriptografarArquivo(inputPath: string, outputPath: string, iv: string, authTag: string): boolean {
    try {
      const encrypted = fs.readFileSync(inputPath);
      const ivBuffer = Buffer.from(iv, "base64");
      const authTagBuffer = Buffer.from(authTag, "base64");

      const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      let plaintext = decipher.update(encrypted);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      fs.writeFileSync(outputPath, plaintext);
      return true;
    } catch (erro) {
      logger.error("[BackupService] Erro ao descriptografar:", erro);
      return false;
    }
  }

  /**
   * Aplica política de retenção
   * Mantém: últimos 7 diários, 8 semanais, 12 mensais
   */
  private async aplicarRetencao(): Promise<void> {
    try {
      const files = fs.readdirSync(this.localBackupDir)
        .filter(f => f.endsWith(".enc"))
        .map(f => {
          const fullPath = path.join(this.localBackupDir, f);
          return {
            name: f,
            path: fullPath,
            time: fs.statSync(fullPath).mtime.getTime(),
          };
        })
        .sort((a, b) => b.time - a.time);

      // Agrupar por período (simplificado: dia, semana, mês)
      const now = Date.now();
      const DAY = 86400000;
      const WEEK = 7 * DAY;
      const MONTH = 30 * DAY;

      const byPeriod = {
        daily: files.filter(f => (now - f.time) < DAY).slice(DEFAULT_RETENTION_POLICY.dailies),
        weekly: files.filter(f => (now - f.time) < WEEK).slice(DEFAULT_RETENTION_POLICY.weeklies),
        monthly: files.filter(f => (now - f.time) < MONTH).slice(DEFAULT_RETENTION_POLICY.monthlies),
      };

      const toDelete = new Set<string>();
      [byPeriod.daily, byPeriod.weekly, byPeriod.monthly].forEach(arr => {
        arr.forEach(f => toDelete.add(f.path));
      });

      if (toDelete.size > 0) {
        logger.info(`[BackupService] Removendo ${toDelete.size} backups antigos`);
        toDelete.forEach(filePath => {
          try {
            fs.unlinkSync(filePath);
            const manifestPath = filePath.replace(".enc", "-manifest.json");
            if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
          } catch {
            logger.warn(`[BackupService] Erro ao remover ${filePath}:`, e);
          }
        });
      }
    } catch (erro) {
      logger.error("[BackupService] Erro ao aplicar retenção:", erro);
    }
  }

  /**
   * Lista backups locais disponíveis
   */
  listarBackups(): Array<{ id: string; timestamp: string; tamanho: number }> {
    try {
      return fs
        .readdirSync(this.localBackupDir)
        .filter(f => f.endsWith(".enc"))
        .map(f => {
          const fullPath = path.join(this.localBackupDir, f);
          const id = f.replace(".enc", "");
          const manifestPath = path.join(this.localBackupDir, `${id}-manifest.json`);
          let timestamp = "desconhecido";

          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as BackupManifest;
              timestamp = manifest.timestamp;
            } catch {
              // ignorar erro
            }
          }

          return {
            id,
            timestamp,
            tamanho: fs.statSync(fullPath).size,
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (erro) {
      logger.error("[BackupService] Erro ao listar backups:", erro);
      return [];
    }
  }
}

export default BackupService;
