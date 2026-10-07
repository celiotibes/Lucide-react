/**
 * Tipos TypeScript para o workflow de importação de documentos
 * Estende os tipos do servidor com informações específicas do cliente
 */

/**
 * Tipos de arquivo suportados
 */
export enum FileType {
  OFX = 'OFX',      // Open Financial Exchange
  CSV = 'CSV',      // Comma-Separated Values
  PDF = 'PDF',      // Portable Document Format
  JPEG = 'JPEG',    // JPEG Image
  PNG = 'PNG',      // PNG Image
}

/**
 * Status do lote de importação
 */
export enum LoteStatus {
  ENVIADO = 'ENVIADO',           // Arquivo enviado, aguardando processamento
  RECEBIDO = 'RECEBIDO',         // Arquivo validado e armazenado
  PROCESSANDO = 'PROCESSANDO',   // Em processamento
  PROCESSADO = 'PROCESSADO',     // Processado com sucesso
  ERRO = 'ERRO',                 // Erro durante processamento
  CANCELADO = 'CANCELADO',       // Cancelado pelo usuário
}

/**
 * Status das linhas importadas
 */
export enum LinhaStatus {
  PENDENTE = 'PENDENTE',         // Aguardando processamento
  DUPLICATA_SUSPEITA = 'DUPLICATA_SUSPEITA', // Possível duplicata detectada
  VALIDADA = 'VALIDADA',         // Validação bem-sucedida
  PROCESSADA = 'PROCESSADA',     // Processamento bem-sucedido
  REJEITADA = 'REJEITADA',       // Linha rejeitada
  ERRO = 'ERRO',                 // Erro durante validação/processamento
  IGNORADA = 'IGNORADA',         // Linha ignorada
}

/**
 * Lote de importação (dados do servidor)
 */
export interface LoteImportacao {
  id: string;
  usuario_id: string;
  arquivo_nome: string;
  arquivo_hash: string;
  tipo: FileType;
  tamanho_bytes: number;
  status: LoteStatus;
  erro_mensagem?: string;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Linha de importação com detecção de duplicata
 */
export interface LinhaImportacao {
  id: string;
  lote_id: string;
  numero_linha: number;
  dados_brutos: string;
  status: LinhaStatus;
  erro_mensagem?: string;
  duplicata_score?: number; // Score de similaridade (0-1) se status for DUPLICATA_SUSPEITA
  duplicata_com_id?: string; // ID da linha duplicada potencial
  criado_em: string;
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
 * Preview de dados importados (primeiras linhas)
 */
export interface PreviewDados {
  lote_id: string;
  tipo: FileType;
  total_linhas: number;
  linhas_preview: Array<{
    numero_linha: number;
    dados: string;
    status: LinhaStatus;
  }>;
}

/**
 * Resultado da revisão de uma linha
 */
export interface ResultadoRevisaoLinha {
  lote_id: string;
  linha_id: string;
  novo_status: LinhaStatus;
  motivo_rejeicao?: string;
}

/**
 * Resultado da revisão em bulk
 */
export interface ResultadoRevisaoBulk {
  lote_id: string;
  processadas: number;
  erros: string[];
}

/**
 * Props para ImportUpload
 */
export interface ImportUploadProps {
  onUploadSuccess?: (result: UploadResult) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number; // em bytes, padrão 50MB
  acceptedTypes?: string[];
}

/**
 * Props para ImportPreview
 */
export interface ImportPreviewProps {
  loteId: string;
  onApprove?: (loteId: string) => void;
  onEditMapping?: (loteId: string) => void;
  onReject?: (loteId: string, reason: string) => void;
  onClose?: () => void;
}

/**
 * Props para ImportReview
 */
export interface ImportReviewProps {
  loteId: string;
  onComplete?: (loteId: string) => void;
  onCancel?: () => void;
}

/**
 * Estado interno do componente ImportUpload
 */
export interface UploadState {
  isLoading: boolean;
  progress: number;
  file: File | null;
  error: string | null;
  result: UploadResult | null;
}

/**
 * Filtros para a tabela de revisão
 */
export interface FiltrosRevisao {
  status?: LinhaStatus[];
  texto?: string;
  comDuplicata?: boolean;
}

/**
 * Paginação
 */
export interface Paginacao {
  pagina: number;
  limite: number;
  total: number;
}
