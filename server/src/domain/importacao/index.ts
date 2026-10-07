/**
 * Export de funções e tipos públicos do módulo de importação
 */

export {
  validarLinha,
  registrarValidacao,
  obterResumoValidacoes,
  validarLinhas,
} from "./validacao.js";

export {
  detectarDuplicata,
  registrarDuplicata,
  buscarDuplicatasEmLote,
} from "./deduplicacao.js";

export type {
  ValidacaoLinha,
  DuplicataResult,
  LinhaImportacao,
  LoteImportacao,
  RespostaValidacao,
  RespostaAprovacao,
  RespostaListaLinhas,
  TransacaoBruta,
  ParserResult,
  ParserOptions,
} from "./tipos.js";

export {
  AprovarLinhaSchema,
  RejeitarLinhaSchema,
  ListarLinhasQuerySchema,
  CriarLinhaImportacaoSchema,
} from "./tipos.js";

// Parser exports
export {
  parseCSV,
  previewCSV,
} from "./parsers/csv-parser.js";

export {
  parseOFX,
  previewOFX,
} from "./parsers/ofx-parser.js";

export {
  parseMT940,
  previewMT940,
  MT940Parser,
} from "./parsers/mt940-parser.js";

export type { IParser } from "./parsers/parser-base.js";
export { ParserBase } from "./parsers/parser-base.js";

export {
  parseArquivo,
  detectarFormato,
  listarFormatosSuportados,
  obterRegistry,
} from "./parsers/parser-registry.js";

export {
  NormalizadorTransacao,
  normalizarData,
  normalizarValor,
  normalizarDescricao,
  extrairDocumento,
  detectarTipo,
  extrairCategoria,
} from "./parsers/normalizacao.js";

export { TipoTransacao } from "./parsers/normalizacao.js";
