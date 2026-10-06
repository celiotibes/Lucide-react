/**
 * Tipos e enums para o domínio de importação de documentos
 *
 * Fase 1 (UPLOAD):
 * - Validação de arquivo (extensão, tamanho, MIME type)
 * - Cálculo de SHA-256
 * - Detecção de tipo de arquivo
 * - Armazenamento no banco de dados
 *
 * Fases posteriores (parsing, reconhecimento, etc.) virão depois.
 */

/**
 * Tipos de arquivo suportados na importação
 */
export enum FileType {
  OFX = "OFX",        // Open Financial Exchange
  CSV = "CSV",        // Comma-Separated Values
  PDF = "PDF",        // Portable Document Format
  JPEG = "JPEG",      // JPEG Image
  PNG = "PNG",        // PNG Image
}

/**
 * Status do lote de importação
 */
export enum LoteStatus {
  ENVIADO = "ENVIADO",           // Arquivo enviado, aguardando processamento
  RECEBIDO = "RECEBIDO",         // Arquivo validado e armazenado
  PROCESSANDO = "PROCESSANDO",   // Em processamento
  PROCESSADO = "PROCESSADO",     // Processado com sucesso
  ERRO = "ERRO",                 // Erro durante processamento
  CANCELADO = "CANCELADO",       // Cancelado pelo usuário
}

/**
 * Status das linhas importadas
 */
export enum LinhaStatus {
  PENDENTE = "PENDENTE",         // Aguardando processamento
  VALIDADA = "VALIDADA",         // Validação bem-sucedida
  PROCESSADA = "PROCESSADA",     // Processamento bem-sucedido
  ERRO = "ERRO",                 // Erro durante validação/processamento
  IGNORADA = "IGNORADA",         // Linha ignorada (não se aplica, etc.)
}

/**
 * Tipo de lote de importação
 *
 * Armazena metadados sobre um arquivo enviado para importação
 */
export interface LoteImportacao {
  id: string;                    // UUID
  usuario_id: string;            // FK para usuarios.id
  arquivo_nome: string;          // Nome original do arquivo
  arquivo_hash: string;          // SHA-256 do conteúdo do arquivo
  tipo: FileType;                // Tipo detectado (OFX, CSV, PDF, JPEG, PNG)
  tamanho_bytes: number;         // Tamanho em bytes
  status: LoteStatus;            // Status do processamento
  erro_mensagem?: string;        // Mensagem de erro, se houver
  criado_em: string;             // ISO 8601 timestamp
  atualizado_em: string;         // ISO 8601 timestamp
}

/**
 * Tipo de linha importada
 *
 * Armazena dados brutos de cada linha do arquivo
 */
export interface LinhaImportacao {
  id: string;                    // UUID
  lote_id: string;               // FK para importacao_lotes.id
  numero_linha: number;          // Número da linha no arquivo (1-indexed)
  dados_brutos: string;          // Dados brutos da linha (CSV, OFX, etc.)
  status: LinhaStatus;           // Status de processamento
  erro_mensagem?: string;        // Mensagem de erro, se houver
  criado_em: string;             // ISO 8601 timestamp
}

/**
 * Resultado da validação de arquivo
 */
export interface ValidationResult {
  valido: boolean;
  erros: string[];
  avisos: string[];
  tipo?: FileType;
  tamanho?: number;
}

/**
 * Resultado do upload
 */
export interface UploadResult {
  sucesso: boolean;
  lote_id?: string;
  arquivo_nome?: string;
  arquivo_hash?: string;
  tipo?: FileType;
  tamanho_bytes?: number;
  criado_em?: string;
  erro?: string;
  detalhes?: string;
}

/**
 * Constantes de validação
 */
export const VALIDACAO_CONSTANTES = {
  TAMANHO_MAXIMO_BYTES: 50 * 1024 * 1024,  // 50 MB
  EXTENSOES_PERMITIDAS: [".ofx", ".csv", ".pdf", ".jpg", ".jpeg", ".png"],
  MIME_TYPES_PERMITIDOS: [
    "application/x-ofx",
    "application/vnd.intu.qbo",
    "text/plain",
    "text/csv",
    "application/pdf",
    "image/jpeg",
    "image/png",
  ],
} as const;
