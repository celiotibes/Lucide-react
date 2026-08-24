import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { CompetenciaEsperada } from "../types";
import { valorVigente } from "../contratos/reajustes";

const TOLERANCIA_VALOR = 0.05; // 5% de diferença aceitável (desconto, juro já embutido, etc.)
const TOLERANCIA_DIAS = 10; // dias de atraso ainda tratados como "o mesmo pagamento"

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Gera as competências mensais esperadas de todos os contratos residenciais fixos,
 * do início do contrato até `hoje` (ou até `data_fim`, se encerrado). */
export function gerarCompetencias(db: Database, hoje: string): CompetenciaEsperada[] {
  const contratos = consultar<{
    id: number;
    imovel_id: number;
    valor_referencia: number;
    data_inicio: string;
    data_fim: string | null;
  }>(
    db,
    `SELECT id, imovel_id, valor_referencia, data_inicio, data_fim
     FROM contratos_locacao WHERE tipo = 'residencial_fixo'`,
  );

  const competencias: CompetenciaEsperada[] = [];
  for (const contrato of contratos) {
    const fim = contrato.data_fim ?? hoje;
    let mes = contrato.data_inicio.slice(0, 8) + "01";
    while (mes <= fim) {
      // usa o valor vigente naquele mês (respeita reajustes já registrados em
      // contrato_reajustes), não sempre o valor original do dia 1 do contrato —
      // senão, todo mês após um reajuste real pareceria "divergente".
      competencias.push({
        contrato_id: contrato.id,
        imovel_id: contrato.imovel_id,
        mes_referencia: mes,
        valor_esperado: valorVigente(db, contrato.id, mes),
      });
      mes = somarMeses(mes, 1);
    }
  }
  return competencias;
}

export interface Excecao {
  competencia: CompetenciaEsperada;
  motivo: string;
}

/** Casa cada competência esperada com uma transação existente dentro da tolerância
 * de valor e data. O que não casa vira exceção — nunca é descartado silenciosamente.
 *
 * As janelas de tolerância de meses vizinhos se sobrepõem (~10 dias de cada lado, mais a
 * largura do próprio mês) — sem controle, uma mesma transação podia "quitar" duas
 * competências ao mesmo tempo (ex.: um único pagamento de janeiro caindo também dentro da
 * janela de fevereiro, mascarando um calote real de fevereiro). Por isso cada transação só
 * pode casar com UMA competência: `usadas` acumula os ids já consumidos nesta chamada, e o
 * casamento prefere a transação mais próxima do início do mês de referência (não a primeira
 * que aparecer), para que a competência mais provável fique com o pagamento em caso de
 * disputa entre duas competências vizinhas. */
export function conciliar(db: Database, competencias: CompetenciaEsperada[]): Excecao[] {
  const excecoes: Excecao[] = [];
  const usadas = new Set<number>();

  for (const competencia of competencias) {
    const janelaInicio = somarDias(competencia.mes_referencia, -TOLERANCIA_DIAS);
    const janelaFim = somarDias(somarMeses(competencia.mes_referencia, 1), TOLERANCIA_DIAS);
    const valorMin = competencia.valor_esperado * (1 - TOLERANCIA_VALOR);
    const valorMax = competencia.valor_esperado * (1 + TOLERANCIA_VALOR);

    const candidatas = consultar<{ id: number }>(
      db,
      `SELECT id FROM transacoes
       WHERE contrato_id = ? AND data BETWEEN ? AND ? AND valor BETWEEN ? AND ?
       ORDER BY ABS(julianday(data) - julianday(?)) ASC`,
      [competencia.contrato_id, janelaInicio, janelaFim, valorMin, valorMax, competencia.mes_referencia],
    );
    const casada = candidatas.find((c) => !usadas.has(c.id));

    if (!casada) {
      excecoes.push({
        competencia,
        motivo: "sem recebimento correspondente dentro da tolerância (possível atraso, calote ou pagamento por conta diferente)",
      });
    } else {
      usadas.add(casada.id);
    }
  }
  return excecoes;
}
