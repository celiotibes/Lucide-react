import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { Imovel } from "../types";

export type CriterioRateio = "fracao_ideal" | "area_m2" | "por_unidade";

// 'documento' só é gravado por aplicarRateioPersonalizado (distribuição vinda de nota
// fiscal/recibo) — nunca é um valor de entrada válido para calcularPercentuais/aplicarRateio,
// por isso é um tipo à parte em vez de mais um membro de CriterioRateio (achado desta revisão:
// RateioDetalhado.criterio já usava CriterioRateio, incompatível com o valor real gravado).
export type CriterioRateioPersistido = CriterioRateio | "documento";

export interface PercentualRateio {
  imovelId: number;
  percentual: number;
}

export interface ResultadoCalculoRateio {
  percentuais: PercentualRateio[];
  // true = pelo menos um imóvel participante não tinha fracao_ideal/area_m2 cadastrado e o
  // cálculo precisou tratar o peso dele como 0 (ou, se ninguém tinha, caiu para divisão
  // igual) — nunca deveria se passar por um rateio por fração ideal/área real e completo
  // sem sinalização (mesmo princípio de "nunca fabricar dado" já aplicado a valor venal,
  // saldo devedor manual etc. em balancoPatrimonial.ts).
  baseIncompleta: boolean;
}

/** Normaliza o critério escolhido (fração ideal, área ou unidades iguais) em
 * percentuais que somam 1 entre os imóveis participantes — o mesmo tipo de
 * regra de rateio usado por Domínio/Alterdata para despesas coletivas. */
export function calcularPercentuais(imoveis: Imovel[], criterio: CriterioRateio): ResultadoCalculoRateio {
  if (imoveis.length === 0) return { percentuais: [], baseIncompleta: false };

  if (criterio === "por_unidade") {
    const percentual = 1 / imoveis.length;
    return { percentuais: imoveis.map((i) => ({ imovelId: i.id, percentual })), baseIncompleta: false };
  }

  const chave = criterio === "fracao_ideal" ? "fracao_ideal" : "area_m2";
  const algumSemDado = imoveis.some((i) => i[chave] == null);
  const pesos = imoveis.map((i) => ({ imovelId: i.id, peso: i[chave] ?? 0 }));
  const somaPesos = pesos.reduce((acc, p) => acc + p.peso, 0);

  if (somaPesos <= 0) {
    // ninguém tinha o dado cadastrado — cai para divisão igual em vez de dividir por zero,
    // mas isso é um fallback, nunca um rateio por fração ideal/área de verdade.
    const percentual = 1 / imoveis.length;
    return { percentuais: imoveis.map((i) => ({ imovelId: i.id, percentual })), baseIncompleta: true };
  }

  return {
    percentuais: pesos.map((p) => ({ imovelId: p.imovelId, percentual: p.peso / somaPesos })),
    baseIncompleta: algumSemDado,
  };
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
  const { percentuais, baseIncompleta } = calcularPercentuais(imoveis, criterio);

  removerRateio(db, transacaoId);
  for (const { imovelId, percentual } of percentuais) {
    // Um imóvel sem o dado do critério (fracao_ideal/area_m2) pondera exatamente 0 quando
    // pelo menos outro participante tem peso > 0 — a tabela rateios exige percentual > 0
    // (0% não é uma participação real), então ele fica de fora da inserção em vez de violar
    // a constraint (achado ao testar ao vivo o aviso de base incompleta: sem este filtro, o
    // INSERT quebrava com "CHECK constraint failed: percentual > 0..." e o rateio inteiro
    // falhava, mesmo os imóveis com dado completo). baseIncompleta continua marcado nas
    // linhas que entram, para nunca passar por um rateio completo quando na verdade um
    // imóvel selecionado ficou de fora por falta de dado.
    if (percentual <= 0) continue;
    executar(
      db,
      "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado, base_incompleta) VALUES (?, ?, ?, ?, ?, ?)",
      [transacaoId, imovelId, criterio, percentual, transacao.valor * percentual, baseIncompleta ? 1 : 0],
    );
  }
  executar(db, "UPDATE transacoes SET imovel_id = NULL WHERE id = ?", [transacaoId]);
}

export function removerRateio(db: Database, transacaoId: number): void {
  executar(db, "DELETE FROM rateios WHERE transacao_id = ?", [transacaoId]);
}

/** Rateia por percentuais explícitos (não calculados por critério) — usado quando a
 * distribuição entre imóveis vem de um documento de suporte (nota fiscal, recibo) que já
 * define a proporção, em vez de recalcular por fração ideal/área/unidade. `percentual` em
 * fração 0-1, igual à convenção de `rateios.percentual` (diferente de `documento_imoveis`,
 * que guarda 0-100 — quem chama esta função converte). */
export function aplicarRateioPersonalizado(db: Database, transacaoId: number, distribuicao: PercentualRateio[]): void {
  const [transacao] = consultar<{ valor: number }>(db, "SELECT valor FROM transacoes WHERE id = ?", [transacaoId]);
  if (!transacao) throw new Error(`Transação ${transacaoId} não encontrada.`);

  removerRateio(db, transacaoId);
  for (const { imovelId, percentual } of distribuicao) {
    executar(
      db,
      "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (?, ?, 'documento', ?, ?)",
      [transacaoId, imovelId, percentual, transacao.valor * percentual],
    );
  }
  executar(db, "UPDATE transacoes SET imovel_id = NULL WHERE id = ?", [transacaoId]);
}

export interface RateioDetalhado {
  imovelId: number;
  imovelApelido: string;
  criterio: CriterioRateioPersistido;
  percentual: number;
  valorRateado: number;
  baseIncompleta: boolean;
}

export function obterRateiosDaTransacao(db: Database, transacaoId: number): RateioDetalhado[] {
  return consultar<{ imovel_id: number; apelido: string; criterio: CriterioRateioPersistido; percentual: number; valor_rateado: number; base_incompleta: number }>(
    db,
    `SELECT r.imovel_id, i.apelido, r.criterio, r.percentual, r.valor_rateado, r.base_incompleta
     FROM rateios r JOIN imoveis i ON i.id = r.imovel_id
     WHERE r.transacao_id = ?`,
    [transacaoId],
  ).map((r) => ({
    imovelId: r.imovel_id,
    imovelApelido: r.apelido,
    criterio: r.criterio,
    percentual: r.percentual,
    valorRateado: r.valor_rateado,
    baseIncompleta: r.base_incompleta === 1,
  }));
}
