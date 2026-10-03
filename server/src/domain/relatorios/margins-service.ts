/**
 * Margins Service
 *
 * Responsável por calcular margens por propriedade
 *
 * Funções:
 * - Calcular margem de cada propriedade
 * - Identificar top 5 e bottom 5 propriedades
 * - Paginação de margens
 */

import type Database from "better-sqlite3";
import { logger } from "../../services/logger-service.js";
import { calcularMargensImovel } from "./margensPorPropriedade.js";
import { paginarArray, type ResultadoPaginado } from "./report-helpers.js";

export interface MargemPropriedade {
  imovelId: number;
  nomePropriedade: string;
  margem: number;
  status: "OK" | "ATENÇÃO" | "CRÍTICO";
}

export interface MargensPorPropriedadeResumo {
  total: number;
  mediaGeral: number;
  top5: Array<MargemPropriedade>;
  bottom5: Array<MargemPropriedade>;
}

export interface MargensPaginadas extends ResultadoPaginado<MargemPropriedade> {
  mediaGeral: number;
}

/**
 * Busca todas as propriedades e calcula margens
 */
function calcularMargensTodasPropriedades(
  db: Database.Database,
  mes: number,
  ano: number,
): Array<MargemPropriedade> {
  try {
    const propriedades = db
      .prepare("SELECT id, nome FROM imoveis ORDER BY nome")
      .all() as Array<{ id: number; nome: string }>;

    const margens = propriedades
      .map((prop) => {
        try {
          const margem = calcularMargensImovel(db, prop.id, ano, mes);
          return {
            imovelId: margem.imovelId,
            nomePropriedade: margem.nomeProriedade,
            margem: margem.margem,
            status: margem.status,
          };
        } catch {
          return null;
        }
      })
      .filter((m) => m !== null) as Array<MargemPropriedade>;

    return margens;
  } catch (erro) {
    logger.error("[MarginsService] Erro ao calcular margens:", erro);
    return [];
  }
}

/**
 * Gera resumo de margens por propriedade com top 5 e bottom 5
 */
export function gerarMargensResumo(
  db: Database.Database,
  mes: number,
  ano: number,
): MargensPorPropriedadeResumo {
  try {
    const margens = calcularMargensTodasPropriedades(db, mes, ano);

    const total = margens.length;
    const mediaGeral = total > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / total : 0;

    const ordenadas = [...margens].sort((a, b) => b.margem - a.margem);
    const top5 = ordenadas.slice(0, 5);
    const bottom5 = ordenadas.slice(-5).reverse();

    return {
      total,
      mediaGeral,
      top5,
      bottom5,
    };
  } catch (erro) {
    logger.error("[MarginsService] Erro ao gerar margens resumo:", erro);
    return { total: 0, mediaGeral: 0, top5: [], bottom5: [] };
  }
}

/**
 * Gera margens com paginação
 */
export function gerarMargensPaginadas(
  db: Database.Database,
  mes: number,
  ano: number,
  limit: number = 50,
  offset: number = 0,
): MargensPaginadas {
  try {
    const margens = calcularMargensTodasPropriedades(db, mes, ano);
    const mediaGeral = margens.length > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / margens.length : 0;

    const resultado = paginarArray(margens, limit, offset);

    return {
      ...resultado,
      mediaGeral,
    };
  } catch (erro) {
    logger.error("[MarginsService] Erro ao paginar margens:", erro);
    return {
      items: [],
      total: 0,
      mediaGeral: 0,
      limit,
      offset,
      hasMore: false,
    };
  }
}

/**
 * Encontra propriedade com melhor margem
 */
export function encontrarMelhorMargem(db: Database.Database, mes: number, ano: number): MargemPropriedade | null {
  const margens = calcularMargensTodasPropriedades(db, mes, ano);
  if (margens.length === 0) return null;

  return margens.reduce((best, current) => (current.margem > best.margem ? current : best));
}

/**
 * Encontra propriedade com pior margem
 */
export function encontrarPiorMargem(db: Database.Database, mes: number, ano: number): MargemPropriedade | null {
  const margens = calcularMargensTodasPropriedades(db, mes, ano);
  if (margens.length === 0) return null;

  return margens.reduce((worst, current) => (current.margem < worst.margem ? current : worst));
}
