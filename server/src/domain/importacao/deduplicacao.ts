/**
 * Sistema de deduplicação com fuzzy matching
 * Fase 3: Validação e Deduplicação
 *
 * Scoring system (0-100):
 * - Data (±1 dia): 30 pontos
 * - Valor (±5%): 40 pontos
 * - Descrição (Levenshtein): 30 pontos
 * Threshold: score >= 80 = suspeita de duplicata
 */

import Database from "better-sqlite3";
import type { DuplicataResult, LinhaImportacao } from "./tipos.js";

/**
 * Calcula a distância de Levenshtein entre duas strings
 * Retorna um número entre 0 e 1 onde 1.0 = idêntico
 */
function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  
  const distancia = levenshteinDistance(s1, s2);
  return 1 - (distancia / maxLen);
}

/**
 * Implementação da distância de Levenshtein
 * Mede o número mínimo de edições (inserção, deleção, substituição) 
 * necessárias para transformar uma string em outra
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Criar matriz de distâncias
  const matriz: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matriz[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matriz[0][j] = j;
  }
  
  // Preencher a matriz
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const custo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,      // deleção
        matriz[i][j - 1] + 1,      // inserção
        matriz[i - 1][j - 1] + custo // substituição
      );
    }
  }
  
  return matriz[len1][len2];
}

/**
 * Calcula score para correspondência de data (±1 dia = máximo de pontos)
 * Retorna 0-30 pontos
 */
function calcularScoreData(data1: string, data2: string): { score: number; diasDif: number } {
  try {
    const d1 = new Date(data1);
    const d2 = new Date(data2);
    
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      return { score: 0, diasDif: 0 };
    }
    
    const diasDif = Math.abs(
      Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
    );
    
    if (diasDif === 0) {
      return { score: 30, diasDif };
    } else if (diasDif === 1) {
      return { score: 25, diasDif };
    } else if (diasDif <= 2) {
      return { score: 15, diasDif };
    } else if (diasDif <= 3) {
      return { score: 8, diasDif };
    }
    
    return { score: 0, diasDif };
  } catch {
    return { score: 0, diasDif: 0 };
  }
}

/**
 * Calcula score para correspondência de valor (±5% = máximo de pontos)
 * Retorna 0-40 pontos
 */
function calcularScoreValor(
  valor1: number,
  valor2: number
): { score: number; percentualDif: number } {
  if (!valor1 || !valor2 || valor1 <= 0 || valor2 <= 0) {
    return { score: 0, percentualDif: 100 };
  }
  
  const percentualDif = Math.abs((valor1 - valor2) / valor2) * 100;
  
  if (percentualDif === 0) {
    return { score: 40, percentualDif };
  } else if (percentualDif <= 1) {
    return { score: 38, percentualDif };
  } else if (percentualDif <= 3) {
    return { score: 35, percentualDif };
  } else if (percentualDif <= 5) {
    return { score: 30, percentualDif };
  } else if (percentualDif <= 10) {
    return { score: 20, percentualDif };
  } else if (percentualDif <= 15) {
    return { score: 10, percentualDif };
  }
  
  return { score: 0, percentualDif };
}

/**
 * Calcula score para correspondência de descrição (Levenshtein similarity)
 * Retorna 0-30 pontos
 */
function calcularScoreDescricao(desc1: string, desc2: string): { score: number; similarity: number } {
  const similarity = calcularSimilaridade(desc1, desc2);
  
  if (similarity >= 0.95) {
    return { score: 30, similarity };
  } else if (similarity >= 0.85) {
    return { score: 25, similarity };
  } else if (similarity >= 0.75) {
    return { score: 20, similarity };
  } else if (similarity >= 0.65) {
    return { score: 12, similarity };
  } else if (similarity >= 0.50) {
    return { score: 5, similarity };
  }
  
  return { score: 0, similarity };
}

/**
 * Detecta se uma linha é duplicata de linhas existentes
 * Usa scoring system com fuzzy matching
 *
 * Retorna o resultado com score >= 80 (threshold para suspeita)
 */
export function detectarDuplicata(
  db: Database.Database,
  linhaAtual: LinhaImportacao,
  usuarioId: string,
  linhasExistentes?: LinhaImportacao[]
): DuplicataResult | null {
  // Se não passou linhasExistentes, buscar do banco
  if (!linhasExistentes) {
    try {
      const stmt = db.prepare(
        `SELECT * FROM importacao_linhas 
         WHERE usuario_id = ? 
         AND status IN ('aprovado', 'validado')
         AND id != ?
         AND data_transacao BETWEEN date(?, '-7 days') AND date(?, '+7 days')
         ORDER BY ABS(CAST(valor AS REAL) - CAST(? AS REAL)) ASC
         LIMIT 20`
      );
      
      const rows = stmt.all(
        usuarioId,
        linhaAtual.id || "",
        linhaAtual.data_transacao,
        linhaAtual.data_transacao,
        linhaAtual.valor
      ) as LinhaImportacao[];
      
      linhasExistentes = rows || [];
    } catch (erro) {
      console.error("Erro ao buscar linhas existentes:", erro);
      linhasExistentes = [];
    }
  }
  
  let melhorMatch: DuplicataResult | null = null;
  let melhorScore = 0;
  
  for (const linhaExistente of linhasExistentes) {
    // Calcular componentes de score
    const { score: scoreData, diasDif } = calcularScoreData(
      linhaAtual.data_transacao,
      linhaExistente.data_transacao
    );
    
    const { score: scoreValor, percentualDif } = calcularScoreValor(
      linhaAtual.valor,
      linhaExistente.valor
    );
    
    const { score: scoreDescricao, similarity } = calcularScoreDescricao(
      linhaAtual.descricao,
      linhaExistente.descricao
    );
    
    // Score total (máximo 100)
    const scoreTotal = scoreData + scoreValor + scoreDescricao;
    
    if (scoreTotal >= 80 && scoreTotal > melhorScore) {
      melhorScore = scoreTotal;
      
      const motivos: string[] = [];
      if (scoreData >= 15) {
        motivos.push(`Data próxima (${diasDif} dias)`);
      }
      if (scoreValor >= 20) {
        motivos.push(`Valor similar (${percentualDif.toFixed(1)}% diferença)`);
      }
      if (scoreDescricao >= 12) {
        motivos.push(`Descrição similar (${(similarity * 100).toFixed(0)}% match)`);
      }
      
      melhorMatch = {
        score: scoreTotal,
        motivo: motivos.join("; "),
        linhaExistenteId: linhaExistente.id,
        componentes: {
          dataScore: scoreData,
          valorScore: scoreValor,
          descricaoScore: scoreDescricao,
        },
        detalhes: {
          diferenca_dias: diasDif,
          diferenca_percentual_valor: percentualDif,
          similarity_descricao: similarity,
        },
      };
    }
  }
  
  return melhorMatch;
}

/**
 * Registra uma detecção de duplicata no banco
 */
export function registrarDuplicata(
  db: Database.Database,
  linhaNovaNId: string,
  duplicata: DuplicataResult
): string {
  if (!duplicata.linhaExistenteId) {
    throw new Error("Duplicata deve ter linhaExistenteId");
  }
  
  const stmt = db.prepare(
    `INSERT INTO importacao_deduplicacoes
     (linha_nova_id, linha_existente_id, score_data, score_valor, score_descricao, score_total, motivos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  
  const motivos = [
    `Data: ${duplicata.componentes.dataScore}%`,
    `Valor: ${duplicata.componentes.valorScore}%`,
    `Descrição: ${duplicata.componentes.descricaoScore}%`,
  ];
  
  stmt.run(
    linhaNovaNId,
    duplicata.linhaExistenteId,
    duplicata.componentes.dataScore,
    duplicata.componentes.valorScore,
    duplicata.componentes.descricaoScore,
    duplicata.score,
    JSON.stringify(motivos)
  );
  
  // Atualizar status da linha
  const updateStmt = db.prepare(
    `UPDATE importacao_linhas
     SET suspeita_duplicata = 1,
         score_duplicata = ?,
         linha_duplicada_id = ?,
         motivo_duplicata = ?,
         status = 'validado',
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = ?`
  );
  
  updateStmt.run(
    duplicata.score,
    duplicata.linhaExistenteId,
    duplicata.motivo,
    linhaNovaNId
  );
  
  const inserted = db.prepare(
    "SELECT last_insert_rowid() FROM importacao_deduplicacoes LIMIT 1"
  ).get() as { 'last_insert_rowid()': number };
  
  return String(inserted['last_insert_rowid()']);
}

/**
 * Busca todas as possíveis duplicatas para uma linha
 */
export function buscarDuplicatasEmLote(
  db: Database.Database,
  loteId: string
): Map<string, DuplicataResult> {
  const resultado = new Map<string, DuplicataResult>();
  
  try {
    const stmt = db.prepare(
      `SELECT * FROM importacao_linhas 
       WHERE lote_id = ? AND status = 'pendente'
       ORDER BY numero_linha ASC`
    );
    
    const linhas = stmt.all(loteId) as LinhaImportacao[];
    
    for (let i = 0; i < linhas.length; i++) {
      const linhaAtual = linhas[i];
      
      // Comparar com linhas anteriores no lote
      for (let j = 0; j < i; j++) {
        const { score: scoreData, diasDif } = calcularScoreData(
          linhaAtual.data_transacao,
          linhas[j].data_transacao
        );
        
        const { score: scoreValor, percentualDif } = calcularScoreValor(
          linhaAtual.valor,
          linhas[j].valor
        );
        
        const { score: scoreDescricao, similarity } = calcularScoreDescricao(
          linhaAtual.descricao,
          linhas[j].descricao
        );
        
        const scoreTotal = scoreData + scoreValor + scoreDescricao;
        
        if (scoreTotal >= 80) {
          resultado.set(linhaAtual.id, {
            score: scoreTotal,
            motivo: `Duplicata dentro do lote (linha ${linhas[j].numero_linha})`,
            linhaExistenteId: linhas[j].id,
            componentes: {
              dataScore: scoreData,
              valorScore: scoreValor,
              descricaoScore: scoreDescricao,
            },
            detalhes: {
              diferenca_dias: diasDif,
              diferenca_percentual_valor: percentualDif,
              similarity_descricao: similarity,
            },
          });
          break; // Usar apenas a primeira duplicata encontrada
        }
      }
    }
  } catch (erro) {
    console.error("Erro ao buscar duplicatas em lote:", erro);
  }
  
  return resultado;
}
