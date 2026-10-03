import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SEC-011: Structured Logging Service with Winston
 * Centralized logging with:
 * - Structured JSON format
 * - Request ID correlation
 * - Multiple transports (console + file)
 * - Log rotation (maxsize: 10MB, maxFiles: 10)
 * - Daily rotation with timestamp
 * - Archive support
 *
 * SEC-012: Automatic PII Redaction
 * - CPF, CNPJ, email, telefone, tokens, senhas
 * - Recursive object scrubbing with circular reference handling
 */

// ============================================================
// PII REDACTION FUNCTIONS
// ============================================================

/**
 * Máscara CPF: mantém apenas 2 últimos dígitos
 * Formato com ou sem pontuação: 123.456.789-01 ou 12345678901
 */
function mascaraCPF(cpf: string): string {
  // Remove pontuação
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return cpf;

  const ultimos2 = limpo.slice(-2);
  return `***.***.***-${ultimos2}`;
}

/**
 * Máscara CNPJ: mantém apenas 2 últimos dígitos
 * Formato: 14 dígitos
 */
function mascaraCNPJ(cnpj: string): string {
  const limpo = cnpj.replace(/\D/g, '');
  if (limpo.length !== 14) return cnpj;

  const ultimos2 = limpo.slice(-2);
  return `**.***.***/****-${ultimos2}`;
}

/**
 * Máscara Email: primeira letra + ***@ + domínio
 */
function mascaraEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (!local || !dominio) return email;

  return `${local.charAt(0)}***@${dominio}`;
}

/**
 * Máscara Telefone Brasileiro: (**) *****-NNNN
 * Mantém apenas 4 últimos dígitos
 */
function mascaraTelefone(telefone: string): string {
  const limpo = telefone.replace(/\D/g, '');
  if (limpo.length < 8) return telefone;

  const ultimos4 = limpo.slice(-4);
  return `(**) *****-${ultimos4}`;
}

/**
 * Detecta e mascara CPF/CNPJ em texto
 * CPF: 11 dígitos, com ou sem pontuação
 * CNPJ: 14 dígitos, com ou sem pontuação
 * Evita falsos positivos: timestamps de 13 dígitos, valores monetários, ids curtos
 */
function detectarEMascararDocumentos(texto: string): string {
  // CNPJ (14 dígitos)
  // Padrão: NN.NNN.NNN/NNNN-NN ou NNNNNNNNNNNNNN
  texto = texto.replace(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g, (match) => {
    const limpo = match.replace(/\D/g, '');
    // Validação simples: CNPJ não é sequência (1234567890123), não é timestamp
    if (limpo.length === 14 && limpo !== limpo[0].repeat(14)) {
      return mascaraCNPJ(limpo);
    }
    return match;
  });

  // CPF (11 dígitos)
  // Padrão: NNN.NNN.NNN-NN ou NNNNNNNNNNN
  texto = texto.replace(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g, (match) => {
    const limpo = match.replace(/\D/g, '');
    if (limpo.length === 11) {
      return mascaraCPF(limpo);
    }
    return match;
  });

  // Email
  texto = texto.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    return mascaraEmail(match);
  });

  // Telefone brasileiro (com ou sem formatação)
  // (XX) XXXXX-XXXX ou (XX) 9XXXXX-XXXX ou +55 XX 9XXXXX-XXXX etc
  texto = texto.replace(/\+?55\s?(\(?\d{2}\)?)?\s?9?\d{4}-?\d{4}|\(\d{2}\)\s?9?\d{4}-?\d{4}/g, (match) => {
    return mascaraTelefone(match);
  });

  return texto;
}

/**
 * Mascara tokens e senhas
 * Padrões: Bearer <token>, Authorization: <token>, password=, secret=, etc
 */
function mascaraTokensESenhas(texto: string): string {
  // Bearer token - DEVE SER PRIMEIRO para evitar ser capturado por token genérico
  texto = texto.replace(/Bearer\s+[^\s,}"\n]+/gi, 'Bearer [REDACTED]');

  // Authorization header/query - NÃO capture se já tiver Bearer ou [REDACTED]
  texto = texto.replace(/authorization\s*[:=]\s*(?!Bearer\s|\[REDACTED\])[^\s,}"\n]+/gi, 'authorization: [REDACTED]');

  // Password
  texto = texto.replace(/password\s*[:=]\s*(?!\[REDACTED\])[^\s,}"\n]+/gi, 'password: [REDACTED]');

  texto = texto.replace(/token\s*[:=]\s*(?!\[REDACTED\])[^\s,}"\n]+/gi, 'token: [REDACTED]');

  // API Keys
  texto = texto.replace(/api[_-]?key\s*[:=]\s*(?!\[REDACTED\])[^\s,}"\n]+/gi, 'api_key: [REDACTED]');

  return texto;
}

/**
 * Interface para rastrear objetos já visitados (detectar ciclos)
 */
interface Visitados {
  objetos: WeakSet<any>;
}

/**
 * Recursivamente mascara objetos, incluindo campos sensíveis
 * Lida com: objetos aninhados, arrays, Errors, e evita ciclos
 */
function redactarObjeto(obj: any, visitados: Visitados = { objetos: new WeakSet() }): any {
  // Null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Tipos primitivos
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return detectarEMascararDocumentos(mascaraTokensESenhas(obj));
    }
    return obj;
  }

  // Detectar ciclos
  if (visitados.objetos.has(obj)) {
    return '[CIRCULAR]';
  }
  visitados.objetos.add(obj);
  try {
    return redactarObjetoInterno(obj, visitados);
  } finally {
    // Sai do caminho atual: o mesmo objeto referenciado duas vezes (sem ciclo) não é "circular".
    visitados.objetos.delete(obj);
  }
}

function redactarObjetoInterno(obj: any, visitados: Visitados): any {
  // Error
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactarObjeto(obj.message, visitados),
      stack: obj.stack ? redactarObjeto(obj.stack, visitados) : undefined,
    };
  }

  // Array
  if (Array.isArray(obj)) {
    return obj.map(item => redactarObjeto(item, visitados));
  }

  // Objeto
  const redatado: any = {};
  const camposSensiveis = ['senha', 'password', 'secret', 'token', 'authorization', 'api_key', 'apikey', 'cookie'];

  for (const [chave, valor] of Object.entries(obj)) {
    const chaveLower = chave.toLowerCase();

    // Verificar se a chave contém palavra sensível
    if (camposSensiveis.some(sens => chaveLower.includes(sens))) {
      redatado[chave] = '[REDACTED]';
    } else {
      redatado[chave] = redactarObjeto(valor, visitados);
    }
  }

  return redatado;
}

/**
 * Aplica redação a mensagem e metadados
 */
function aplicarRedacao(mensagem: unknown, meta?: Record<string, unknown>): { mensagem: any; meta?: any } {
  try {
    // winston aceita mensagem não-string (objeto, número, undefined): nunca assumir .replace
    const mensagemRedatada =
      typeof mensagem === 'string' ? detectarEMascararDocumentos(mascaraTokensESenhas(mensagem)) : redactarObjeto(mensagem);
    return { mensagem: mensagemRedatada, meta: meta ? redactarObjeto(meta) : meta };
  } catch {
    // Fail-closed: se a redação falhar, nada do conteúdo original é emitido e o logger não derruba o chamador.
    return { mensagem: '[REDACTION-ERROR: conteúdo omitido]', meta: undefined };
  }
}

// ============================================================
// WINSTON LOGGER INITIALIZATION
// ============================================================

let winstonLogger: any = null;

// Ensure log directories exist
function ensureLogDirectories() {
  const logsDir = path.join(__dirname, '../../logs');
  const archiveDir = path.join(logsDir, 'archive');

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

// Initialize Winston logger at module load time
function initWinston() {
  try {
    // Only initialize Winston in node environments
    const winston = require('winston');
    const DailyRotateFile = require('winston-daily-rotate-file');

    // Ensure directories exist
    ensureLogDirectories();

    // Custom format with PII redaction
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      // Apply redaction before logging
      winston.format((info: any) => {
        const { mensagem, meta: metaRedatada } = aplicarRedacao(info.message, info);
        info.message = mensagem;
        // Merge redacted metadata back into info (except message which was already processed)
        if (metaRedatada && typeof metaRedatada === 'object') {
          Object.assign(info, metaRedatada);
        }
        return info;
      })(),
      winston.format.json()
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      // Apply redaction to console output
      winston.format((info: any) => {
        const { mensagem, meta: metaRedatada } = aplicarRedacao(info.message, info);
        info.message = mensagem;
        if (metaRedatada && typeof metaRedatada === 'object') {
          Object.assign(info, metaRedatada);
        }
        return info;
      })(),
      winston.format.printf(({ timestamp, level, message, requestId, ...meta }: any) => {
        const requestIdStr = requestId ? `[${requestId}] ` : '';
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${requestIdStr}${message} ${metaStr}`.trim();
      })
    );

    // Create logger instance
    winstonLogger = winston.createLogger({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      format: customFormat,
      defaultMeta: {},
      transports: [
        // Console transport
        new winston.transports.Console({
          format: consoleFormat,
        }),
        // Daily rotating file transport - All logs
        new DailyRotateFile({
          filename: path.join(__dirname, '../../logs/app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '10m', // 10MB
          maxFiles: 10,
          auditFile: path.join(__dirname, '../../logs/.audit.json'),
          format: customFormat,
          utc: true,
        }),
        // File transport with rotation - All logs (for size-based rotation)
        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/app.log'),
          format: customFormat,
          maxsize: 10485760, // 10MB in bytes
          maxFiles: 10,
        }),
        // Daily rotating file transport - Errors only
        new DailyRotateFile({
          filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '10m',
          maxFiles: 10,
          auditFile: path.join(__dirname, '../../logs/.audit-errors.json'),
          format: customFormat,
          utc: true,
        }),
        // File transport with rotation - Errors only
        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/error.log'),
          level: 'error',
          format: customFormat,
          maxsize: 10485760, // 10MB in bytes
          maxFiles: 10,
        }),
      ],
    });
  } catch (e) {
    // Winston not available (e.g., in tests)
    winstonLogger = null;
  }
}

// Initialize at module load
initWinston();

// Fallback mock logger if Winston is not available
const mockLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    const { mensagem, meta: metaRedatada } = aplicarRedacao(message, meta);
    console.log(`[DEBUG] ${mensagem}`, metaRedatada);
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    const { mensagem, meta: metaRedatada } = aplicarRedacao(message, meta);
    console.log(`[INFO] ${mensagem}`, metaRedatada);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    const { mensagem, meta: metaRedatada } = aplicarRedacao(message, meta);
    console.warn(`[WARN] ${mensagem}`, metaRedatada);
  },
  error: (message: string, error?: Error | Record<string, unknown>) => {
    const { mensagem, meta: metaRedatada } = aplicarRedacao(message, error as any);
    if (error instanceof Error) {
      const redatado = redactarObjeto({ message: error.message, stack: error.stack });
      console.error(`[ERROR] ${mensagem}`, redatado);
    } else {
      console.error(`[ERROR] ${mensagem}`, metaRedatada);
    }
  },
  child: (meta: any) => ({
    debug: (msg: string, data?: any) => {
      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, data);
      console.log(`[DEBUG] [${meta.requestId}] ${mensagem}`, metaRedatada);
    },
    info: (msg: string, data?: any) => {
      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, data);
      console.log(`[INFO] [${meta.requestId}] ${mensagem}`, metaRedatada);
    },
    warn: (msg: string, data?: any) => {
      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, data);
      console.warn(`[WARN] [${meta.requestId}] ${mensagem}`, metaRedatada);
    },
    error: (msg: string, error?: any) => {
      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, error);
      console.error(`[ERROR] [${meta.requestId}] ${mensagem}`, metaRedatada);
    },
  }),
};

export const logger = winstonLogger || mockLogger;

// Child logger factory with requestId
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

// Export convenience methods with types
export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => logger.debug(message, meta),
  info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
  error: (message: string, error?: Error | Record<string, unknown>) => logger.error(message, error),
};

// Export redaction functions for testing and external use
export {
  mascaraCPF,
  mascaraCNPJ,
  mascaraEmail,
  mascaraTelefone,
  detectarEMascararDocumentos,
  mascaraTokensESenhas,
  redactarObjeto,
  aplicarRedacao,
};

export default logger;
