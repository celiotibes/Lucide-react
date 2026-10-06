/**
 * Sistema de validação para linhas de importação
 * Fase 3: Validação e Deduplicação
 */

import Database from "better-sqlite3";
import type { ValidacaoLinha, LinhaImportacao, DuplicataResult } from "./tipos.js";
import { detectarDuplicata } from "./deduplicacao.js";

interface ErroValidacao {
  tipo: "data_futura" | "valor_invalido" | "campo_obrigatorio" | "formato";
  mensagem: string;
}

/**
 * Valida completamente uma linha de importação
 * Retorna objeto com resultado detalhado
 */
export function validarLinha(
  db: Database.Database,
  linha: Partial<LinhaImportacao>,
  usuarioId: string
): ValidacaoLinha {
  const erros: string[] = [];
  const avisos: string[] = [];
  let duplicata: DuplicataResult | null = null;

  // 1. Validar campos obrigatórios
  if (!linha.data_transacao || !linha.data_transacao.trim()) {
    erros.push("Data da transação é obrigatória");
  }

  if (linha.valor === null || linha.valor === undefined) {
    erros.push("Valor é obrigatório");
  }

  if (!linha.descricao || !linha.descricao.trim()) {
    erros.push("Descrição é obrigatória");
  }

  if (!linha.lote_id) {
    erros.push("Lote ID é obrigatório");
  }

  // Se há erros críticos, retornar já
  if (erros.length > 0) {
    return {
      valido: false,
      erros,
      avisos,
    };
  }

  // 2. Validar formato e valores
  const validacaoData = validarData(linha.data_transacao!);
  if (!validacaoData.valido) {
    erros.push(...validacaoData.erros);
  }

  const validacaoValor = validarValor(linha.valor!);
  if (!validacaoValor.valido) {
    erros.push(...validacaoValor.erros);
  }

  // 3. Validar descrição
  if (linha.descricao && linha.descricao.trim().length > 500) {
    erros.push("Descrição não pode exceder 500 caracteres");
  }

  // Se ainda há erros, não executar checks de duplicata
  if (erros.length > 0) {
    return {
      valido: false,
      erros,
      avisos,
    };
  }

  // 4. Detectar duplicatas (com a linha como objeto completo agora)
  const linhaCompleta: LinhaImportacao = {
    id: linha.id || "",
    lote_id: linha.lote_id!,
    usuario_id: usuarioId,
    numero_linha: linha.numero_linha || 0,
    data_transacao: linha.data_transacao!,
    valor: linha.valor!,
    descricao: linha.descricao!,
    tipo_operacao: linha.tipo_operacao,
    categoria: linha.categoria,
    conta_bancaria: linha.conta_bancaria,
    status: "pendente",
    score_duplicata: 0,
    suspeita_duplicata: 0,
    criado_em: new Date().toISOString(),
  };

  try {
    const possívelDuplicata = detectarDuplicata(db, linhaCompleta, usuarioId);
    if (possívelDuplicata && possívelDuplicata.score >= 80) {
      duplicata = possívelDuplicata;
      avisos.push(`Possível duplicata detectada: ${possívelDuplicata.motivo}`);
    }
  } catch (erro) {
    console.error("Erro ao detectar duplicata:", erro);
    // Não falhar a validação por causa de erro em deduplicação
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
    duplicata,
  };
}

/**
 * Valida a data da transação
 * - Deve estar em formato YYYY-MM-DD
 * - Não pode ser data futura
 */
function validarData(data: string): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  // Verificar formato
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    erros.push("Data deve estar no formato YYYY-MM-DD");
    return { valido: false, erros };
  }

  const dataObj = new Date(data);
  if (isNaN(dataObj.getTime())) {
    erros.push("Data é inválida");
    return { valido: false, erros };
  }

  // Verificar se é data futura
  const agora = new Date();
  agora.setHours(0, 0, 0, 0);
  if (dataObj > agora) {
    erros.push("Data não pode ser no futuro");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Valida o valor da transação
 * - Deve ser número
 * - Deve ser positivo (> 0)
 * - Não pode ser NULL
 */
function validarValor(valor: number): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (valor === null || valor === undefined) {
    erros.push("Valor é obrigatório");
    return { valido: false, erros };
  }

  if (typeof valor !== "number" || isNaN(valor)) {
    erros.push("Valor deve ser um número válido");
    return { valido: false, erros };
  }

  if (valor <= 0) {
    erros.push("Valor deve ser maior que zero");
  }

  if (valor > 999999999.99) {
    erros.push("Valor excede o máximo permitido");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Registra resultado de validação no banco
 */
export function registrarValidacao(
  db: Database.Database,
  linhaId: string,
  validacao: ValidacaoLinha
): void {
  const stmt = db.prepare(
    `INSERT INTO importacao_validacoes
     (linha_id, tipo_validacao, passou, mensagem_erro)
     VALUES (?, ?, ?, ?)`
  );

  // Registrar cada erro encontrado
  for (const erro of validacao.erros) {
    const tipoErro = detectarTipoErro(erro);
    stmt.run(linhaId, tipoErro, 0, erro);
  }

  // Se não há erros, registrar validação bem-sucedida
  if (validacao.erros.length === 0) {
    stmt.run(linhaId, "formato", 1, null);
  }
}

/**
 * Detecta o tipo de erro baseado na mensagem
 */
function detectarTipoErro(
  mensagem: string
): "data_futura" | "valor_invalido" | "campo_obrigatorio" | "formato" {
  if (mensagem.includes("futuro")) return "data_futura";
  if (mensagem.includes("Valor")) return "valor_invalido";
  if (mensagem.includes("obrigatório")) return "campo_obrigatorio";
  return "formato";
}

/**
 * Valida múltiplas linhas de uma vez
 * Retorna Map<linhaId, validacao>
 */
export function validarLinhas(
  db: Database.Database,
  linhas: Partial<LinhaImportacao>[],
  usuarioId: string
): Map<string, ValidacaoLinha> {
  const resultado = new Map<string, ValidacaoLinha>();

  for (const linha of linhas) {
    const linhaId = linha.id || `temp_${Math.random()}`;
    const validacao = validarLinha(db, linha, usuarioId);
    resultado.set(linhaId, validacao);

    // Registrar validação no banco se linhaId existe
    if (linha.id) {
      registrarValidacao(db, linha.id, validacao);
    }
  }

  return resultado;
}

/**
 * Obtém resumo das validações de uma linha
 */
export function obterResumoValidacoes(
  db: Database.Database,
  linhaId: string
): {
  totalValidacoes: number;
  totalErros: number;
  erros: string[];
} {
  const stmt = db.prepare(
    `SELECT tipo_validacao, passou, mensagem_erro
     FROM importacao_validacoes
     WHERE linha_id = ?
     ORDER BY criado_em DESC`
  );

  const validacoes = stmt.all(linhaId) as Array<{
    tipo_validacao: string;
    passou: number;
    mensagem_erro: string | null;
  }>;

  const erros = validacoes
    .filter((v) => v.passou === 0 && v.mensagem_erro)
    .map((v) => v.mensagem_erro!);

  return {
    totalValidacoes: validacoes.length,
    totalErros: erros.length,
    erros,
  };
}
