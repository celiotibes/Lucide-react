import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/**
 * Sistema de categorização inteligente de transações.
 * Sugere categorias baseado em histórico e keyword matching (heurística simples, sem ML).
 */

export interface SugestaoCategoriaResponse {
  categoria: string;
  confianca: number; // 0-100
  motivo: string;
  historico_match?: {
    count: number;
    categoria: string;
  };
}

interface TransacaoComBeneficiario {
  id: number;
  descricao_original: string;
  plano_conta_codigo?: string | null;
}

/** Padrões de keywords com regras de categorização padrão */
const PADROES_KEYWORDS: Record<string, { keywords: string[]; categoria_padrao: string; confianca_base: number }> = {
  aluguel: {
    keywords: ["aluguel", "rent", "imóvel", "propriedade", "moradia", "locação"],
    categoria_padrao: "1.1.01", // Receita - Aluguel
    confianca_base: 85,
  },
  folha_pagamento: {
    keywords: ["folha", "payroll", "salário", "funcionário", "vencimento", "remuneração"],
    categoria_padrao: "2.1.01", // Despesa - Folha de Pagamento
    confianca_base: 90,
  },
  condominio: {
    keywords: ["condominio", "taxa_condominio", "cobradora", "taxa síndico", "síndico"],
    categoria_padrao: "2.1.02", // Despesa - Condomínio
    confianca_base: 80,
  },
  manutencao: {
    keywords: ["reparo", "conserto", "manutenção", "pintura", "reforma", "obra", "reparação"],
    categoria_padrao: "2.1.03", // Despesa - Manutenção
    confianca_base: 75,
  },
  utilitarios: {
    keywords: ["agua", "energia", "eletricidade", "saneamento", "água", "luz", "gás"],
    categoria_padrao: "2.1.04", // Despesa - Utilidades
    confianca_base: 85,
  },
};

/**
 * Extrai o "beneficiário" ou identificador de uma transação da descrição.
 * Simples: pega a primeira palavra depois de remover números, símbolos.
 */
function extrairBeneficiario(descricao: string): string {
  const palavras = descricao
    .toLowerCase()
    .replace(/[0-9.,\-()]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2);
  return palavras[0] || descricao.substring(0, 10);
}

/**
 * Busca todas as transações do mesmo beneficiário e retorna a categoria mais frequente.
 * Se 70%+ das transações têm a mesma categoria → confiança alta.
 */
function buscarCategoriaHistorico(
  db: Database,
  descricaoOriginal: string,
  transacaoIdAtual: number,
): { categoria?: string; confianca: number; count: number } {
  const beneficiario = extrairBeneficiario(descricaoOriginal);

  // Buscar transações com padrão similar na descrição (LIKE) e que tenham categoria
  const transacoesHistorico = consultar<{ plano_conta_codigo: string }>(
    db,
    `SELECT plano_conta_codigo
     FROM transacoes
     WHERE id != ? AND descricao_original LIKE ? AND plano_conta_codigo IS NOT NULL
     ORDER BY data DESC
     LIMIT 50`,
    [transacaoIdAtual, `%${beneficiario}%`],
  );

  if (transacoesHistorico.length === 0) {
    return { confianca: 0, count: 0 };
  }

  // Contar frequência de cada categoria
  const frequencia: Record<string, number> = {};
  for (const t of transacoesHistorico) {
    frequencia[t.plano_conta_codigo] = (frequencia[t.plano_conta_codigo] || 0) + 1;
  }

  // Encontrar a mais frequente
  const [categoriaTopFreq, countTop] = Object.entries(frequencia).sort(([, a], [, b]) => b - a)[0];

  // Se 70%+ das transações têm a mesma categoria → confiança alta
  const percentualTop = countTop / transacoesHistorico.length;
  const confianca = percentualTop >= 0.7 ? 90 : percentualTop >= 0.5 ? 70 : 40;

  return {
    categoria: categoriaTopFreq,
    confianca,
    count: countTop,
  };
}

/**
 * Tenta encontrar um padrão de keyword que combine com a descrição.
 * Retorna a categoria sugerida e a confiança.
 */
function buscarCategoriaKeywords(descricao: string): { categoria?: string; confianca: number; motivo: string } {
  const descricaoLower = descricao.toLowerCase();

  for (const [, { keywords, categoria_padrao, confianca_base }] of Object.entries(PADROES_KEYWORDS)) {
    const matches = keywords.filter((kw) => descricaoLower.includes(kw.toLowerCase()));
    if (matches.length > 0) {
      return {
        categoria: categoria_padrao,
        confianca: confianca_base,
        motivo: `Keyword match: ${matches.join(", ")}`,
      };
    }
  }

  return { confianca: 0, motivo: "Nenhum padrão de keyword encontrado" };
}

/**
 * Busca a categoria mais frequente em todo o histórico (fallback final).
 */
function buscarCategoriaFallback(db: Database): { categoria?: string; confianca: number } {
  const resultado = consultar<{ plano_conta_codigo: string; total: number }>(
    db,
    `SELECT plano_conta_codigo, COUNT(*) as total
     FROM transacoes
     WHERE plano_conta_codigo IS NOT NULL
     GROUP BY plano_conta_codigo
     ORDER BY total DESC
     LIMIT 1`,
  );

  if (resultado.length === 0) {
    return { confianca: 0 };
  }

  const { plano_conta_codigo, total } = resultado[0];
  return { categoria: plano_conta_codigo, confianca: Math.min(50, Math.ceil((total / 20) * 10)) };
}

/**
 * Sugere uma categoria para uma transação baseado em histórico e keywords.
 * Retorna: { categoria, confianca (0-100), motivo }
 */
export function sugerirCategoria(db: Database, transacaoId: number): SugestaoCategoriaResponse {
  // 1. Buscar a transação
  const transacoes = consultar<TransacaoComBeneficiario>(
    db,
    "SELECT id, descricao_original, plano_conta_codigo FROM transacoes WHERE id = ?",
    [transacaoId],
  );

  if (transacoes.length === 0) {
    return {
      categoria: "1.1.01",
      confianca: 0,
      motivo: "Transação não encontrada",
    };
  }

  const transacao = transacoes[0];

  // 2. Tentar buscar histórico do mesmo beneficiário
  const historico = buscarCategoriaHistorico(db, transacao.descricao_original, transacaoId);
  if (historico.confianca >= 70) {
    return {
      categoria: historico.categoria!,
      confianca: historico.confianca,
      motivo: `Baseado em histórico: ${historico.count} transações similares`,
      historico_match: {
        count: historico.count,
        categoria: historico.categoria!,
      },
    };
  }

  // 3. Tentar keyword matching
  const keywordResult = buscarCategoriaKeywords(transacao.descricao_original);
  if (keywordResult.confianca > 0) {
    return {
      categoria: keywordResult.categoria!,
      confianca: keywordResult.confianca,
      motivo: keywordResult.motivo,
    };
  }

  // 4. Fallback: categoria mais frequente do histórico
  const fallback = buscarCategoriaFallback(db);
  return {
    categoria: fallback.categoria || "1.1.01",
    confianca: fallback.confianca,
    motivo: "Categoria mais frequente no histórico (fallback)",
  };
}

/**
 * Registra o histórico de sugestões (para auditoria e aprendizado futuro).
 */
export function registrarSugestaoCategoria(
  db: Database,
  transacaoId: number,
  categoriaSugerida: string,
  confianca: number,
  motivo: string,
): void {
  executar(
    db,
    `INSERT INTO categorias_sugeridas_historico
     (transacao_id, categoria_sugerida, confianca_sugestao, motivo, criado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [transacaoId, categoriaSugerida, confianca, motivo, new Date().toISOString()],
  );
}
