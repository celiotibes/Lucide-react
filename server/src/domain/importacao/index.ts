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
} from "./tipos.js";

export {
  AprovarLinhaSchema,
  RejeitarLinhaSchema,
  ListarLinhasQuerySchema,
  CriarLinhaImportacaoSchema,
} from "./tipos.js";
