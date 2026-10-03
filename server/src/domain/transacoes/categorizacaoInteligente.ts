/**
 * Categorização inteligente de transações — Fase 2.3
 *
 * Expõe funções para sugestão de categorias baseadas em:
 * - Histórico de transações anteriores com mesma descrição
 * - Matching de keywords contra padrões conhecidos
 * - Confiança da sugestão baseada em frequência histórica
 */

import type { Database } from "sql.js";

export interface SugestaoCategoria {
  categoria: string;
  confianca: number; // 0-100
  motivo: string;
  historico_match?: { count: number; categoria: string };
}

/**
 * Palavras-chave para categorização automática
 * Mapeamento de keywords comuns para categorias de plano de contas
 */
const KEYWORDS_CATEGORIAS: Record<string, string> = {
  // Despesas operacionais
  "energia": "6.1.01.01",
  "luz": "6.1.01.01",
  "eletricidade": "6.1.01.01",
  "água": "6.1.01.02",
  "saneamento": "6.1.01.02",
  "aluguel": "6.1.02.01",
  "locação": "6.1.02.01",
  "condomínio": "6.1.02.02",
  "telefone": "6.1.03.01",
  "internet": "6.1.03.01",
  "telecom": "6.1.03.01",

  // Despesas com pessoal
  "salário": "6.2.01.01",
  "folha": "6.2.01.01",
  "pagamento": "6.2.01.01",
  "férias": "6.2.01.02",
  "inss": "6.2.02.01",
  "fgts": "6.2.02.02",

  // Despesas comerciais
  "publicidade": "6.3.01.01",
  "marketing": "6.3.01.01",
  "propaganda": "6.3.01.01",
  "viagem": "6.3.02.01",
  "passagem": "6.3.02.01",
  "hospedagem": "6.3.02.02",

  // Despesas com material
  "material": "6.4.01.01",
  "suprimentos": "6.4.01.01",
  "escritório": "6.4.01.02",

  // Receitas
  "venda": "4.1.01.01",
  "serviço": "4.1.02.01",
  "consultoria": "4.1.02.01",
  "juros": "4.2.01.01",
  "aluguel recebido": "4.2.02.01",
};

/**
 * Sugere uma categoria para uma transação baseada em histórico e keywords
 * @param db - Database SQL.js
 * @param transacaoId - ID da transação a categorizar
 * @returns Sugestão com categoria, confiança e motivo
 */
export function sugerirCategoria(db: Database, transacaoId: number): SugestaoCategoria {
  try {
    // Buscar informações da transação
    const transacao = buscarTransacao(db, transacaoId);
    if (!transacao) {
      return {
        categoria: "1.0.00.00",
        confianca: 0,
        motivo: "Transação não encontrada",
      };
    }

    // Tentar match por histórico (mesmo descritivo em transações anteriores)
    const matchHistorico = buscarCategoriaHistorico(db, transacao.descricao);
    if (matchHistorico) {
      return {
        categoria: matchHistorico.categoria,
        confianca: Math.min(100, matchHistorico.count * 10), // Mais ocorrências = mais confiança
        motivo: `Histórico: ${matchHistorico.count} transação(ões) anterior(es) com mesmo padrão`,
        historico_match: {
          count: matchHistorico.count,
          categoria: matchHistorico.categoria,
        },
      };
    }

    // Tentar match por keywords
    const matchKeyword = buscarCategoriaKeywords(transacao.descricao);
    if (matchKeyword) {
      return {
        categoria: matchKeyword.categoria,
        confianca: matchKeyword.confianca,
        motivo: `Palavra-chave detectada: "${matchKeyword.palavra}"`,
      };
    }

    // Fallback: categoria padrão com baixa confiança
    return {
      categoria: "1.0.00.00",
      confianca: 10,
      motivo: "Nenhum padrão detectado; sugira categoria manualmente",
    };
  } catch (erro) {
    console.error("Erro ao sugerir categoria:", erro);
    return {
      categoria: "1.0.00.00",
      confianca: 0,
      motivo: "Erro ao processar sugestão",
    };
  }
}

/**
 * Registra a sugestão de categoria no histórico (para auditoria e aprendizado futuro)
 * @param db - Database SQL.js
 * @param transacaoId - ID da transação
 * @param categoria - Categoria sugerida (plano_conta_codigo)
 * @param confianca - Nível de confiança (0-100)
 * @param motivo - Explicação da sugestão
 */
export function registrarSugestaoCategoria(
  db: Database,
  transacaoId: number,
  categoria: string,
  confianca: number,
  motivo: string
): void {
  try {
    const timestamp = new Date().toISOString();

    // Inserir registro de sugestão (se tabela existir)
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS sugestoes_categorizacao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transacao_id INTEGER NOT NULL,
        categoria_sugerida TEXT NOT NULL,
        confianca INTEGER NOT NULL,
        motivo TEXT,
        data_sugestao TEXT NOT NULL,
        FOREIGN KEY(transacao_id) REFERENCES transacoes(id)
      );
    `;

    const insertSQL = `
      INSERT INTO sugestoes_categorizacao (transacao_id, categoria_sugerida, confianca, motivo, data_sugestao)
      VALUES (?, ?, ?, ?, ?);
    `;

    // Garantir tabela existe
    db.run(createTableSQL);

    // Inserir registro
    db.run(insertSQL, [transacaoId, categoria, confianca, motivo, timestamp]);
  } catch (erro) {
    // Silent fail - auditoria não deve quebrar o fluxo principal
    console.warn("Aviso ao registrar sugestão:", erro instanceof Error ? erro.message : String(erro));
  }
}

/**
 * Busca uma transação por ID
 */
function buscarTransacao(
  db: Database,
  transacaoId: number
): { descricao: string } | null {
  try {
    const sql = `
      SELECT descricao FROM transacoes WHERE id = ?
      UNION
      SELECT descricao FROM movimentacoes WHERE id = ?
      LIMIT 1
    `;

    const stmt = db.prepare(sql);
    stmt.bind([transacaoId, transacaoId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return { descricao: String(row.descricao || "") };
    }

    stmt.free();
    return null;
  } catch (erro) {
    console.warn("Erro ao buscar transação:", erro);
    return null;
  }
}

/**
 * Busca categoria no histórico de transações similares
 */
function buscarCategoriaHistorico(
  db: Database,
  descricao: string
): { categoria: string; count: number } | null {
  try {
    // Buscar padrão similar no histórico
    const sql = `
      SELECT plano_conta_codigo, COUNT(*) as count
      FROM transacoes
      WHERE descricao LIKE ?
        AND plano_conta_codigo IS NOT NULL
      GROUP BY plano_conta_codigo
      ORDER BY count DESC
      LIMIT 1
    `;

    const stmt = db.prepare(sql);
    stmt.bind([`%${descricao}%`]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        categoria: String(row.plano_conta_codigo || ""),
        count: Number(row.count || 0),
      };
    }

    stmt.free();
    return null;
  } catch (erro) {
    console.warn("Erro ao buscar histórico:", erro);
    return null;
  }
}

/**
 * Busca categoria por matching de keywords
 */
function buscarCategoriaKeywords(
  descricao: string
): { categoria: string; confianca: number; palavra: string } | null {
  const descricaoLower = descricao.toLowerCase();

  // Tentar match com múltiplos keywords (prioridade)
  for (const [keyword, categoria] of Object.entries(KEYWORDS_CATEGORIAS)) {
    if (descricaoLower.includes(keyword)) {
      return {
        categoria,
        confianca: 70, // Confiança moderada para match por keyword
        palavra: keyword,
      };
    }
  }

  return null;
}
