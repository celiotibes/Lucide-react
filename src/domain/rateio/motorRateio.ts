import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { Imovel } from "../types";

export type CriterioRateio = "fracao_ideal" | "area_m2" | "por_unidade";

export interface PercentualRateio {
  imovelId: number;
  percentual: number;
}

/** Normaliza o critério escolhido (fração ideal, área ou unidades iguais) em
 * percentuais que somam 1 entre os imóveis participantes — o mesmo tipo de
 * regra de rateio usado por Domínio/Alterdata para despesas coletivas. */
export function calcularPercentuais(imoveis: Imovel[], criterio: CriterioRateio): PercentualRateio[] {
  if (imoveis.length === 0) return [];

  if (criterio === "por_unidade") {
    const percentual = 1 / imoveis.length;
    return imoveis.map((i) => ({ imovelId: i.id, percentual }));
  }

  const chave = criterio === "fracao_ideal" ? "fracao_ideal" : "area_m2";
  const pesos = imoveis.map((i) => ({ imovelId: i.id, peso: i[chave] ?? 0 }));
  const somaPesos = pesos.reduce((acc, p) => acc + p.peso, 0);

  if (somaPesos <= 0) {
    // sem dado de fração/área cadastrado — cai para divisão igual em vez de dividir por zero
    const percentual = 1 / imoveis.length;
    return imoveis.map((i) => ({ imovelId: i.id, percentual }));
  }

  return pesos.map((p) => ({ imovelId: p.imovelId, percentual: p.peso / somaPesos }));
}

/** Rateia uma transação (despesa ou receita coletiva) entre os imóveis selecionados.
 * A transação original perde o vínculo direto com um único imóvel — o resultado por
 * imóvel passa a incluir a fatia via `rateios`, e o total agregado nunca muda porque
 * `valor_rateado` sempre soma de volta ao `valor` da transação original. */
export function aplicarRateio(db: Database, transacaoId: number, imovelIds: number[], criterio: CriterioRateio): void {
  const [transacao] = consultar<{ valor: number }>(db, "SELECT valor FROM transacoes WHERE id = ?", [transacaoId]);
  if (!transacao) throw new Error(`Transação ${transacaoId} não encontrada.`);

  const imoveis = consultar<Imovel>(
    db,
    `SELECT * FROM imoveis WHERE id IN (${imovelIds.map(() => "?").join(",")})`,
    imovelIds,
  );
  const percentuais = calcularPercentuais(imoveis, criterio);

  removerRateio(db, transacaoId);
  for (const { imovelId, percentual } of percentuais) {
    executar(
      db,
      "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (?, ?, ?, ?, ?)",
      [transacaoId, imovelId, criterio, percentual, transacao.valor * percentual],
    );
  }
  executar(db, "UPDATE transacoes SET imovel_id = NULL WHERE id = ?", [transacaoId]);
}

export function removerRateio(db: Database, transacaoId: number): void {
  executar(db, "DELETE FROM rateios WHERE transacao_id = ?", [transacaoId]);
}

export interface RateioDetalhado {
  imovelId: number;
  imovelApelido: string;
  criterio: CriterioRateio;
  percentual: number;
  valorRateado: number;
}

export function obterRateiosDaTransacao(db: Database, transacaoId: number): RateioDetalhado[] {
  return consultar<{ imovel_id: number; apelido: string; criterio: CriterioRateio; percentual: number; valor_rateado: number }>(
    db,
    `SELECT r.imovel_id, i.apelido, r.criterio, r.percentual, r.valor_rateado
     FROM rateios r JOIN imoveis i ON i.id = r.imovel_id
     WHERE r.transacao_id = ?`,
    [transacaoId],
  ).map((r) => ({ imovelId: r.imovel_id, imovelApelido: r.apelido, criterio: r.criterio, percentual: r.percentual, valorRateado: r.valor_rateado }));
}
