/**
 * Tipos e schemas para o sistema de importação de documentos
 *
 * Fase 1 (UPLOAD): Validação e armazenamento de arquivos
 * Fase 3: Validação e Deduplicação
 */

import { z } from "zod";

// =====================================================================
// FASE 1: UPLOAD - Tipos e constantes para validação de arquivo
// =====================================================================

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

/**
 * Resultado da validação de uma linha
 */
export interface ValidacaoLinha {
  valido: boolean;
  erros: string[];
  duplicata?: DuplicataResult;
  avisos?: string[];
}

/**
 * Componentes do score de duplicata (0-100)
 * - Data: ±1 dia = até 30 pontos
 * - Valor: ±5% = até 40 pontos
 * - Descrição (Levenshtein): até 30 pontos
 * Total: >= 80 = suspeita de duplicata
 */
export interface DuplicataResult {
  score: number; // 0-100
  motivo: string;
  linhaExistenteId?: string;
  componentes: {
    dataScore: number;
    valorScore: number;
    descricaoScore: number;
  };
  detalhes?: {
    diferenca_dias: number;
    diferenca_percentual_valor: number;
    similarity_descricao: number;
  };
}

/**
 * Linha de importação no banco
 */
export interface LinhaImportacao {
  id: string;
  lote_id: string;
  usuario_id: string;
  numero_linha: number;
  
  data_transacao: string; // YYYY-MM-DD
  valor: number;
  descricao: string;
  tipo_operacao?: string;
  categoria?: string;
  conta_bancaria?: string;
  
  status: "pendente" | "validado" | "aprovado" | "rejeitado";
  
  validacoes_executadas?: string; // JSON stringified array
  erros_validacao?: string; // JSON stringified array
  
  score_duplicata: number;
  suspeita_duplicata: number; // 0 or 1
  linha_duplicada_id?: string;
  motivo_duplicata?: string;
  
  aprovado_por?: string;
  aprovado_em?: string;
  rejeitado_por?: string;
  rejeitado_em?: string;
  motivo_rejeicao?: string;
  
  criado_em: string;
  atualizado_em?: string;
}

/**
 * Lote de importação
 */
export interface LoteImportacao {
  id: string;
  usuario_id: string;
  nome_arquivo: string;
  formato: "csv" | "json" | "xlsx" | "ofx";
  total_linhas: number;
  linhas_processadas: number;
  linhas_aprovadas: number;
  linhas_rejeitadas: number;
  status: "processando" | "validado" | "importado" | "erro";
  resumo_erro?: string;
  criado_em: string;
  atualizado_em?: string;
}

/**
 * Request/Response schemas com Zod
 */

export const AprovarLinhaSchema = z.object({
  usuarioId: z.string().min(1, "Usuario ID obrigatório"),
  motivo: z.string().optional(),
});

export const RejeitarLinhaSchema = z.object({
  usuarioId: z.string().min(1, "Usuario ID obrigatório"),
  motivo: z.string().min(1, "Motivo de rejeição obrigatório"),
});

export const ListarLinhasQuerySchema = z.object({
  status: z.enum(["pendente", "validado", "aprovado", "rejeitado"]).optional(),
  offset: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  apenas_suspeitadas: z.enum(["true", "false"]).transform(v => v === "true").optional().default("false"),
});

export const CriarLinhaImportacaoSchema = z.object({
  loteId: z.string().min(1, "Lote ID obrigatório"),
  numeroLinha: z.number().int().min(1),
  dataTransacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  valor: z.number().positive("Valor deve ser positivo"),
  descricao: z.string().min(1, "Descrição obrigatória").max(500),
  tipoOperacao: z.string().optional(),
  categoria: z.string().optional(),
  contaBancaria: z.string().optional(),
  usuarioId: z.string().min(1, "Usuario ID obrigatório"),
});

/**
 * Response types
 */
export interface RespostaValidacao {
  linhaId: string;
  valida: boolean;
  erros: string[];
  duplicataSuspeita: boolean;
  score: number;
}

export interface RespostaAprovacao {
  linhaId: string;
  status: "aprovado" | "rejeitado";
  aprovadoEm: string;
  aprovadoPor: string;
}

export interface RespostaListaLinhas {
  total: number;
  linhas: (LinhaImportacao & {
    errosFormatados: string[];
    duplicataFormatada?: {
      score: number;
      motivo: string;
    };
  })[];
}

/**
 * ========== FASE 2: PARSING ==========
 * Tipos para normalização de transações após parsing de diferentes formatos
 */

/**
 * Transação normalizada extraída de arquivo (CSV, PDF, OFX)
 * Cada parser deve converter seus dados para este formato
 */
export interface TransacaoBruta {
  /**
   * Data da transação em formato ISO 8601 (YYYY-MM-DD)
   * Os parsers devem normalizar de qualquer formato para este padrão
   */
  data: string;

  /**
   * Valor em número decimal (positivo para entrada/crédito, negativo para saída/débito)
   * Parsers devem converter strings com separadores de milhar/decimal
   */
  valor: number;

  /**
   * Descrição da transação (memo/subject)
   * Texto livre, pode vir de diferentes campos dependendo do formato
   */
  descricao: string;

  /**
   * Tipo de transação: entrada (crédito) ou saída (débito)
   * Alguns formatos indicam isso explicitamente (OFX), outros requerem inferência do sinal do valor
   */
  tipo_transacao: "entrada" | "saida";

  /**
   * Módulo/origem de onde veio a transação
   * Usável para rastreabilidade: "csv", "pdf", "ofx", "csv_contabil", etc.
   */
  origem_modulo: string;

  /**
   * Número de linha do arquivo original (para rastreabilidade em CSV/PDF)
   * Opcional, usado principalmente para debug e auditoria
   */
  numero_linha?: number;

  /**
   * Campos adicionais que não foram normalizados (opcional)
   * Útil para reter informações que podem ser importantes em contextos específicos
   */
  campos_adicionais?: Record<string, unknown>;
}

/**
 * Erro durante parsing de transação
 */
export interface ParseError {
  linha: number;
  coluna?: number;
  motivo: string;
  valor_original?: string;
}

/**
 * Resultado da operação de parsing
 * Indica sucesso/falha e fornece feedback detalhado
 */
export interface ParserResult {
  /**
   * Indicador de sucesso (true = pelo menos uma transação foi parseada)
   * Pode haver um mix de sucesso com erros parciais
   */
  sucesso: boolean;

  /**
   * Array de transações extraídas com sucesso
   * Sempre normalizado para TransacaoBruta
   */
  transacoes: TransacaoBruta[];

  /**
   * Array de erros encontrados durante parsing
   * Inclui linha, coluna, motivo (para debug)
   */
  erros: ParseError[];

  /**
   * Número de linhas/registros descartados (inválidos, vazias, etc.)
   * Usado para relatório de qualidade
   */
  linhas_descartadas: number;

  /**
   * Mensagens de aviso (warnings)
   * Situações que não impedem parsing mas podem indicar problemas
   */
  avisos?: string[];

  /**
   * Estatísticas sobre o arquivo processado
   */
  estatisticas?: {
    total_linhas: number;
    linhas_vazias: number;
    linhas_processadas: number;
    linhas_com_erro: number;
  };
}

/**
 * Opções para configurar o comportamento de parsing
 */
export interface ParserOptions {
  /**
   * Modulo de origem (usado em origem_modulo)
   */
  origem?: string;

  /**
   * Se true, continua processando mesmo com erros;
   * se false, para no primeiro erro crítico
   */
  tolerarErros?: boolean;

  /**
   * Encoding do arquivo (default: utf-8)
   */
  encoding?: string;

  /**
   * Número máximo de linhas a processar (para testes/preview)
   */
  maxLinhas?: number;

  /**
   * Formats de data aceitos pelo parser
   * Ex: ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]
   */
  formatosDatas?: string[];

  /**
   * Separador decimal (default: ".")
   * Alguns arquivos usam "," para decimais
   */
  separadorDecimal?: string;

  /**
   * Separador de milhares (default: ",")
   * Alguns arquivos usam "." para milhares
   */
  separadorMilhares?: string;
}
