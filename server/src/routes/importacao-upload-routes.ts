/**
 * Importação de Documentos - Routes (Fase 1: UPLOAD)
 *
 * Implementa endpoints para upload e validação de documentos financeiros
 *
 * Endpoints:
 * - POST /api/importacao/upload — Upload de arquivo com validação
 *
 * Fase 1 (UPLOAD):
 * - Validação de arquivo (extensão, tamanho, MIME type)
 * - Cálculo de SHA-256
 * - Detecção de tipo de arquivo
 * - Armazenamento no banco de dados
 *
 * Fases posteriores (parsing, reconhecimento, etc.) virão depois.
 */

import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  FileType,
  LoteStatus,
  ValidationResult,
  UploadResult,
  VALIDACAO_CONSTANTES,
} from "../domain/importacao/tipos.js";

interface AuthRequest extends Request {
  auth?: {
    usuario?: {
      id: string;
    };
  };
}

export interface ImportacaoUploadRoutesOptions {
  authService: AuthServiceDB;
  db: Database.Database;
}

/**
 * Gera UUID v4 simplificado (sem dependência externa)
 */
function gerarUUID(): string {
  const chars = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += chars[(Math.random() * 4 | 8)];
    } else {
      uuid += chars[Math.random() * 16 | 0];
    }
  }
  return uuid;
}

/**
 * Calcula SHA-256 de um buffer
 */
function calcularSHA256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Detecta o tipo de arquivo baseado na extensão e conteúdo
 */
async function detectarTipo(
  nomeArquivo: string,
  conteudo: Buffer
): Promise<FileType | null> {
  const extensao = nomeArquivo.toLowerCase().split(".").pop() || "";

  // Assinatura de arquivo (magic bytes)
  const magic = conteudo.slice(0, 12);
  const magicStr = magic.toString("hex");

  // Detectar por extensão primeiro
  switch (extensao) {
    case "ofx":
      // Verifica se começa com OFX ou OFXHEADER
      if (
        conteudo.toString("utf-8", 0, 3) === "OFX" ||
        conteudo.toString("utf-8", 0, 9) === "OFXHEADER"
      ) {
        return FileType.OFX;
      }
      break;

    case "csv":
      // CSV é texto
      if (conteudo.toString("utf-8", 0, 1).charCodeAt(0) < 128) {
        return FileType.CSV;
      }
      break;

    case "pdf":
      // PDF sempre começa com %PDF
      if (conteudo.toString("utf-8", 0, 4) === "%PDF") {
        return FileType.PDF;
      }
      break;

    case "jpg":
    case "jpeg":
      // JPEG: FFD8 FFE0/FFE1
      if (magicStr.startsWith("ffd8ffe")) {
        return FileType.JPEG;
      }
      break;

    case "png":
      // PNG: 89504E47
      if (magicStr.startsWith("89504e47")) {
        return FileType.PNG;
      }
      break;
  }

  // Detectar por magic bytes se extensão falhar
  if (magicStr.startsWith("ffd8ffe")) {
    return FileType.JPEG;
  }
  if (magicStr.startsWith("89504e47")) {
    return FileType.PNG;
  }
  if (conteudo.toString("utf-8", 0, 4) === "%PDF") {
    return FileType.PDF;
  }
  if (
    conteudo.toString("utf-8", 0, 3) === "OFX" ||
    conteudo.toString("utf-8", 0, 9) === "OFXHEADER"
  ) {
    return FileType.OFX;
  }

  return null;
}

/**
 * Valida um arquivo antes do upload
 */
async function validarArquivo(
  nomeArquivo: string,
  conteudo: Buffer,
  mimeType?: string
): Promise<ValidationResult> {
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. Validar extensão
  const extensao = nomeArquivo.toLowerCase().split(".").pop() || "";
  if (!VALIDACAO_CONSTANTES.EXTENSOES_PERMITIDAS.includes(`.${extensao}`)) {
    erros.push(
      `Extensão não permitida: .${extensao}. Permitidas: ${VALIDACAO_CONSTANTES.EXTENSOES_PERMITIDAS.join(", ")}`
    );
  }

  // 2. Validar tamanho
  if (conteudo.length > VALIDACAO_CONSTANTES.TAMANHO_MAXIMO_BYTES) {
    erros.push(
      `Arquivo muito grande: ${conteudo.length} bytes. Máximo: ${VALIDACAO_CONSTANTES.TAMANHO_MAXIMO_BYTES} bytes (50 MB)`
    );
  }

  if (conteudo.length === 0) {
    erros.push("Arquivo vazio");
  }

  // 3. Validar MIME type se fornecido
  if (mimeType && !VALIDACAO_CONSTANTES.MIME_TYPES_PERMITIDOS.includes(mimeType)) {
    avisos.push(
      `MIME type inesperado: ${mimeType}. Tipos esperados: ${VALIDACAO_CONSTANTES.MIME_TYPES_PERMITIDOS.join(", ")}`
    );
  }

  // 4. Detectar tipo de arquivo
  const tipo = await detectarTipo(nomeArquivo, conteudo);
  if (!tipo) {
    erros.push("Não foi possível detectar o tipo de arquivo");
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
    tipo: tipo || undefined,
    tamanho: conteudo.length,
  };
}

/**
 * Armazena o lote no banco de dados
 */
function armazenarLote(
  db: Database.Database,
  usuarioId: string,
  nomeArquivo: string,
  hash: string,
  tipo: FileType,
  tamanho: number
): string {
  const loteId = gerarUUID();
  const agora = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO importacao_lotes (
      id, usuario_id, arquivo_nome, arquivo_hash, tipo, tamanho_bytes, status, criado_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      loteId,
      usuarioId,
      nomeArquivo,
      hash,
      tipo,
      tamanho,
      LoteStatus.RECEBIDO,
      agora,
      agora
    );
    return loteId;
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("UNIQUE constraint failed")) {
      throw new Error("Arquivo já foi importado anteriormente (mesmo hash SHA-256)");
    }
    throw erro;
  }
}

/**
 * Cria o router de importação (Fase 1: UPLOAD)
 */
export function criarRotasImportacaoUpload(options: ImportacaoUploadRoutesOptions): Router {
  const router = Router();
  const { authService, db } = options;
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /api/importacao/upload
   * Upload e validação de arquivo
   *
   * Requer: multipart/form-data com o arquivo em 'arquivo'
   *
   * Retorna:
   * - 200: Arquivo validado e armazenado com sucesso
   * - 400: Validação falhou (extensão, tamanho, tipo)
   * - 409: Arquivo duplicado (mesmo SHA-256)
   * - 500: Erro interno do servidor
   */
  router.post("/upload", exigirAutenticacao, async (req: AuthRequest, res: Response) => {
    try {
      const usuarioId = req.auth?.usuario?.id;

      if (!usuarioId) {
        return res.status(401).json({
          sucesso: false,
          erro: "Usuário não autenticado",
        });
      }

      // Verificar se arquivo foi enviado
      if (!req.file) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nenhum arquivo foi enviado",
          detalhes: "Use 'arquivo' como nome do campo multipart/form-data",
        });
      }

      const { originalname: filename, mimetype, buffer, size } = req.file;

      logger.info(`[ImportacaoUpload] Upload iniciado por usuário ${usuarioId}`, {
        arquivo: filename,
        tamanho: size,
        mimeType: mimetype,
      });

      // 1. Validar arquivo
      const validacao = await validarArquivo(filename, buffer, mimetype);

      if (!validacao.valido) {
        logger.warn(`[ImportacaoUpload] Validação falhou para ${filename}:`, validacao.erros);
        return res.status(400).json({
          sucesso: false,
          erro: "Validação de arquivo falhou",
          detalhes: validacao.erros,
          avisos: validacao.avisos,
        } as UploadResult);
      }

      // 2. Calcular SHA-256
      const hash = calcularSHA256(buffer);
      logger.debug(`[ImportacaoUpload] SHA-256 calculado para ${filename}: ${hash}`);

      // 3. Armazenar no banco de dados
      const loteId = armazenarLote(
        db,
        usuarioId,
        filename,
        hash,
        validacao.tipo!,
        validacao.tamanho!
      );

      const agora = new Date().toISOString();

      logger.info(`[ImportacaoUpload] Arquivo armazenado com sucesso`, {
        loteId,
        arquivo: filename,
        hash,
        tipo: validacao.tipo,
      });

      return res.status(200).json({
        sucesso: true,
        lote_id: loteId,
        arquivo_nome: filename,
        arquivo_hash: hash,
        tipo: validacao.tipo,
        tamanho_bytes: validacao.tamanho,
        criado_em: agora,
      } as UploadResult);
    } catch (erro) {
      if (erro instanceof Error) {
        // Duplicado
        if (erro.message.includes("já foi importado")) {
          logger.warn(`[ImportacaoUpload] Arquivo duplicado:`, erro.message);
          return res.status(409).json({
            sucesso: false,
            erro: "Arquivo duplicado",
            detalhes: erro.message,
          } as UploadResult);
        }

        // Erro de constraint
        if (erro.message.includes("UNIQUE")) {
          logger.warn(`[ImportacaoUpload] Violação de constraint:`, erro.message);
          return res.status(409).json({
            sucesso: false,
            erro: "Conflito de dados",
            detalhes: "Arquivo ou lote já existe",
          } as UploadResult);
        }
      }

      logger.error(`[ImportacaoUpload] Erro ao processar upload:`, erro);
      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao processar upload",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      } as UploadResult);
    }
  });

  return router;
}
