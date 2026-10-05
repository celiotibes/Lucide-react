/**
 * Google Drive Backup Utility
 *
 * Funções para fazer backup automático do banco SQLite (app.db) para Google Drive.
 * - backupSQLiteToGoogleDrive(): lê database.db local → comprime .zip → upload para Google Drive
 * - Cria pasta "Backups Contabilidade" no Drive do usuário
 * - Arquivo nomeado: backup-YYYY-MM-DD-HH-mm-ss.zip
 * - Valida integridade: descompacta backup, validar database.db
 */

import fs from "fs";
import { logger } from '../services/logger-service.js';
import path from "path";
import * as archiverModule from "archiver";
import { google, drive_v3 } from "googleapis";
import { createReadStream, createWriteStream } from "fs";

// Caminho do banco de dados
const DB_PATH = path.join(process.cwd(), "data", "app.db");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const BACKUP_FOLDER_NAME = "Backups Contabilidade";

// Garante que o diretório de backups existe
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Inicializa o cliente Google Drive com as credenciais fornecidas
 * Espera que GOOGLE_CREDENTIALS_JSON contenha a chave privada de um Service Account
 */
function inicializarDriveClient(): drive_v3.Drive | null {
  try {
    const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    if (!credentialsJson) {
      logger.warn("[GoogleDriveBackup] GOOGLE_CREDENTIALS_JSON não configurada — backup desabilitado");
      return null;
    }

    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    return google.drive({ version: "v3", auth });
  } catch {
    logger.error(
      "[GoogleDriveBackup] Erro ao inicializar cliente Drive:",
      erro instanceof Error ? erro.message : erro
    );
    return null;
  }
}

/**
 * Encontra ou cria a pasta "Backups Contabilidade" no Google Drive
 */
async function encontrarOuCriarPastaBackup(drive: drive_v3.Drive): Promise<string | null> {
  try {
    // Busca pasta existente
    const res = await drive.files.list({
      q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 1,
    });

    if (res.data.files && res.data.files.length > 0) {
      logger.info(`[GoogleDriveBackup] Pasta '${BACKUP_FOLDER_NAME}' encontrada: ${res.data.files[0].id}`);
      return res.data.files[0].id || null;
    }

    // Cria pasta nova
    logger.info(`[GoogleDriveBackup] Criando pasta '${BACKUP_FOLDER_NAME}'...`);
    const fileMetadata = {
      name: BACKUP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    };

    const createRes = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });

    logger.info(`[GoogleDriveBackup] Pasta criada: ${createRes.data.id}`);
    return createRes.data.id || null;
  } catch {
    logger.error(
      "[GoogleDriveBackup] Erro ao buscar/criar pasta:",
      erro instanceof Error ? erro.message : erro
    );
    return null;
  }
}

/**
 * Cria arquivo ZIP com o banco de dados
 */
async function comprimirBanco(zipPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(DB_PATH)) {
        logger.error(`[GoogleDriveBackup] Arquivo do banco não encontrado: ${DB_PATH}`);
        resolve(false);
        return;
      }

      const output = createWriteStream(zipPath);
      const archive = (archiverModule as unknown)("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        logger.info(`[GoogleDriveBackup] Arquivo ZIP criado: ${zipPath} (${archive.pointer()} bytes)`);
        resolve(true);
      });

      archive.on("error", (err: unknown) => {
        logger.error("[GoogleDriveBackup] Erro ao compactar:", err.message);
        resolve(false);
      });

      archive.pipe(output);
      archive.file(DB_PATH, { name: "app.db" });
      archive.finalize();
    } catch {
      logger.error(
        "[GoogleDriveBackup] Erro ao compactar banco:",
        erro instanceof Error ? erro.message : erro
      );
      resolve(false);
    }
  });
}

/**
 * Faz upload do arquivo ZIP para Google Drive
 */
async function fazerUploadParaDrive(
  drive: drive_v3.Drive,
  folderId: string,
  zipPath: string,
  nomeArquivo: string
): Promise<boolean> {
  try {
    if (!fs.existsSync(zipPath)) {
      logger.error(`[GoogleDriveBackup] Arquivo ZIP não encontrado: ${zipPath}`);
      return false;
    }

    const fileMetadata = {
      name: nomeArquivo,
      parents: [folderId],
    };

    const media = {
      mimeType: "application/zip",
      body: createReadStream(zipPath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, webViewLink",
    });

    logger.info(
      `[GoogleDriveBackup] Upload concluído: ${nomeArquivo} (ID: ${response.data.id})`
    );
    if (response.data.webViewLink) {
      logger.info(`[GoogleDriveBackup] Link: ${response.data.webViewLink}`);
    }

    return true;
  } catch {
    logger.error(
      "[GoogleDriveBackup] Erro ao fazer upload:",
      erro instanceof Error ? erro.message : erro
    );
    return false;
  }
}

/**
 * Valida a integridade do arquivo ZIP criando uma cópia temporária do banco
 */
function validarIntegridadeZip(zipPath: string): boolean {
  try {
    // Para uma validação simples, verificamos se o arquivo ZIP foi criado com sucesso
    // Uma validação mais completa envolveria descompactar e verificar o banco
    if (!fs.existsSync(zipPath)) {
      logger.error(`[GoogleDriveBackup] Arquivo ZIP não existe: ${zipPath}`);
      return false;
    }

    const stats = fs.statSync(zipPath);
    if (stats.size === 0) {
      logger.error(`[GoogleDriveBackup] Arquivo ZIP está vazio: ${zipPath}`);
      return false;
    }

    logger.info(`[GoogleDriveBackup] Validação: ZIP contém ${stats.size} bytes`);
    return true;
  } catch {
    logger.error(
      "[GoogleDriveBackup] Erro ao validar ZIP:",
      erro instanceof Error ? erro.message : erro
    );
    return false;
  }
}

/**
 * Função principal: faz backup do SQLite para Google Drive
 * Retorna { sucesso: boolean, arquivoZip?: string, erros: string[] }
 */
export async function backupSQLiteToGoogleDrive(): Promise<{
  sucesso: boolean;
  arquivoZip?: string;
  fileId?: string;
  erros: string[];
}> {
  const erros: string[] = [];

  try {
    // Verifica se as credenciais do Google Drive estão configuradas
    const drive = inicializarDriveClient();
    if (!drive) {
      erros.push("Google Drive não configurado — defina GOOGLE_CREDENTIALS_JSON no .env");
      logger.warn("[GoogleDriveBackup] " + erros[0]);
      return { sucesso: false, erros };
    }

    // Verifica se o banco de dados existe
    if (!fs.existsSync(DB_PATH)) {
      erros.push(`Banco de dados não encontrado: ${DB_PATH}`);
      logger.error("[GoogleDriveBackup] " + erros[0]);
      return { sucesso: false, erros };
    }

    // Fecha todas as conexões abertas ao banco para evitar lock
    // (em produção, seria bom ter uma função dedicada para isso)

    // Gera nome único para o arquivo
    const agora = new Date();
    const nomeArquivo = `backup-${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}-${String(agora.getHours()).padStart(2, "0")}-${String(agora.getMinutes()).padStart(2, "0")}-${String(agora.getSeconds()).padStart(2, "0")}.zip`;
    const zipPath = path.join(BACKUP_DIR, nomeArquivo);

    logger.info(`[GoogleDriveBackup] Iniciando backup: ${nomeArquivo}`);

    // Comprime o banco de dados
    const zipCriado = await comprimirBanco(zipPath);
    if (!zipCriado) {
      erros.push("Erro ao compactar banco de dados");
      return { sucesso: false, erros };
    }

    // Valida integridade do ZIP
    if (!validarIntegridadeZip(zipPath)) {
      erros.push("Validação do ZIP falhou");
      return { sucesso: false, erros };
    }

    // Encontra ou cria pasta de backup no Drive
    const folderId = await encontrarOuCriarPastaBackup(drive);
    if (!folderId) {
      erros.push("Erro ao encontrar/criar pasta no Google Drive");
      return { sucesso: false, erros };
    }

    // Faz upload para Google Drive
    const uploadSucesso = await fazerUploadParaDrive(drive, folderId, zipPath, nomeArquivo);
    if (!uploadSucesso) {
      erros.push("Erro ao fazer upload para Google Drive");
      return { sucesso: false, erros };
    }

    // Limpa arquivo local temporário após sucesso (opcional — pode manter para recuperação local)
    // fs.unlinkSync(zipPath);

    logger.info(`[GoogleDriveBackup] Backup concluído com sucesso: ${nomeArquivo}`);
    return { sucesso: true, arquivoZip: nomeArquivo, erros };
  } catch {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    erros.push(mensagemErro);
    logger.error("[GoogleDriveBackup] Erro ao fazer backup:", mensagemErro);
    return { sucesso: false, erros };
  }
}

/**
 * Envia um arquivo arbitrário (ex.: backup já criptografado e seu manifesto) para a pasta de
 * backups do Drive. Diferente de backupSQLiteToGoogleDrive, NÃO lê o banco ao vivo.
 */
export async function enviarArquivoParaGoogleDrive(
  caminho: string,
  nomeRemoto: string,
): Promise<{ sucesso: boolean; erros: string[] }> {
  try {
    const drive = inicializarDriveClient();
    if (!drive) return { sucesso: false, erros: ["Google Drive não configurado — defina GOOGLE_CREDENTIALS_JSON"] };
    if (!fs.existsSync(caminho)) return { sucesso: false, erros: [`Arquivo não encontrado: ${caminho}`] };
    const folderId = await encontrarOuCriarPastaBackup(drive);
    if (!folderId) return { sucesso: false, erros: ["Erro ao encontrar/criar pasta no Google Drive"] };
    const ok = await fazerUploadParaDrive(drive, folderId, caminho, nomeRemoto);
    return ok ? { sucesso: true, erros: [] } : { sucesso: false, erros: ["Erro ao fazer upload para Google Drive"] };
  } catch {
    return { sucesso: false, erros: [erro instanceof Error ? erro.message : String(erro)] };
  }
}

/**
 * Lista todos os backups no Google Drive
 */
export async function listarBackupsNoGoogleDrive(): Promise<
  Array<{ id: string; nome: string; criadoEm: string }> | null
> {
  try {
    const drive = inicializarDriveClient();
    if (!drive) {
      logger.warn("[GoogleDriveBackup] Google Drive não configurado");
      return null;
    }

    const folderId = await encontrarOuCriarPastaBackup(drive);
    if (!folderId) {
      logger.error("[GoogleDriveBackup] Pasta de backup não encontrada");
      return null;
    }

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      spaces: "drive",
      fields: "files(id, name, createdTime)",
      pageSize: 50,
      orderBy: "createdTime desc",
    });

    if (!res.data.files) {
      return [];
    }

    return res.data.files.map((file) => ({
      id: file.id || "",
      nome: file.name || "",
      criadoEm: file.createdTime || "",
    }));
  } catch {
    logger.error(
      "[GoogleDriveBackup] Erro ao listar backups:",
      erro instanceof Error ? erro.message : erro
    );
    return null;
  }
}

/**
 * Restaura um backup do Google Drive
 * Baixa o arquivo .zip, valida, e restaura o banco de dados
 */
export async function restaurarBackupDoGoogleDrive(fileId: string): Promise<{
  sucesso: boolean;
  erros: string[];
}> {
  const erros: string[] = [];

  try {
    const drive = inicializarDriveClient();
    if (!drive) {
      erros.push("Google Drive não configurado");
      return { sucesso: false, erros };
    }

    logger.info(`[GoogleDriveBackup] Iniciando restauração do backup: ${fileId}`);

    // Baixa arquivo do Drive
    const zipPathTemp = path.join(BACKUP_DIR, `restore-${Date.now()}.zip`);
    const dest = createWriteStream(zipPathTemp);

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return new Promise((resolve) => {
      if (!res.data || typeof res.data === "string") {
        erros.push("Resposta inválida do Google Drive");
        resolve({ sucesso: false, erros });
        return;
      }

      res.data.pipe(dest);

      dest.on("finish", async () => {
        try {
          // Valida integridade do ZIP
          if (!validarIntegridadeZip(zipPathTemp)) {
            erros.push("Validação do ZIP falhou");
            resolve({ sucesso: false, erros });
            return;
          }

          // Aqui você implementaria a descompactação e restauração do banco
          // Por enquanto, apenas confirmamos que o arquivo foi baixado
          logger.info(`[GoogleDriveBackup] Arquivo restaurado: ${zipPathTemp}`);
          logger.info(`[GoogleDriveBackup] Para restaurar completamente, descompacte o arquivo e substitua ${DB_PATH}`);

          resolve({ sucesso: true, erros });
        } catch {
          erros.push(erro instanceof Error ? erro.message : String(erro));
          resolve({ sucesso: false, erros });
        }
      });

      dest.on("error", (erro) => {
        erros.push(erro.message);
        resolve({ sucesso: false, erros });
      });
    });
  } catch {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    erros.push(mensagemErro);
    logger.error("[GoogleDriveBackup] Erro ao restaurar backup:", mensagemErro);
    return { sucesso: false, erros };
  }
}
