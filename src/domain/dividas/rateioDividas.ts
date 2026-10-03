/**
 * MÓDULO: Rateio de destino (PF × empresa de fato × advocacia) de dívidas.
 *
 * Uma dívida (consignado, empréstimo pessoal, cartão parcelado em `dividas_consumo`, ou
 * um financiamento imobiliário em `financiamentos`) pode pertencer inteiramente a um único
 * destino, ou ser uma MISTURA rateada por percentual entre vários — decisão do usuário
 * (2026-09-29): em vez de um campo fixo PF/PJ na própria linha da dívida, cada dívida pode
 * ter N linhas de rateio (`divida_rateio_destinos`), cada uma com seu próprio percentual e
 * observação/justificativa (ex: um consignado pode ser 60% imóveis de locação/Airbnb, 20%
 * pessoal, 20% advocacia). `destino` é texto livre (não enum fechado) para o usuário poder
 * segregar mais quando precisar — a UI só SUGERE os valores mais comuns.
 *
 * Referência polimórfica sem FK (`divida_tipo` + `divida_id`) — mesmo padrão já usado em
 * `retencoes_legais(entidade_tipo, entidade_id)` (ver compliance/retencao.ts), porque o
 * alvo pode ser uma linha de `dividas_consumo` OU de `financiamentos`.
 *
 * A soma dos percentuais de uma mesma dívida nunca pode ultrapassar 100% — mas PODE ficar
 * abaixo de 100% (inclusive em 0%, sem nenhuma linha ainda) enquanto o usuário não terminou
 * de classificar. Isso é uma PENDÊNCIA visível (`obterDividasComRateioIncompleto`), nunca
 * uma trava: o sistema não força 100% no cadastro porque o usuário pode estar processando
 * a classificação aos poucos, dívida por dívida, conforme revisa o Registrato/contrato.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export type DividaTipo = "divida_consumo" | "financiamento";

export interface RateioDestino {
  id: number;
  divida_tipo: DividaTipo;
  divida_id: number;
  destino: string;
  percentual: number;
  observacoes: string | null;
  criado_em: string;
}

const EPSILON = 1e-9; // tolerância para erro de ponto flutuante na soma de percentuais

function arredondarPercentual(valor: number): number {
  // Duas casas decimais é granularidade suficiente para percentual de rateio de dívida
  // (mesma convenção 0-100 de `divida_rateio_destinos.percentual`) e evita que um resíduo
  // de ponto flutuante (ex: 33.33 + 33.33 + 33.34 = 100.00000000000001) dispare a validação
  // de soma > 100% por engano.
  return Math.round(valor * 100) / 100;
}

/** Soma dos percentuais já cadastrados para uma dívida, excluindo opcionalmente uma linha
 * (usado por `atualizarRateioDestino` para não contar a própria linha duas vezes contra si
 * mesma). Retorna 0-100. */
function somarPercentuaisExistentes(db: Database, dividaTipo: DividaTipo, dividaId: number, excluirId?: number): number {
  const linhas = consultar<{ percentual: number }>(
    db,
    excluirId === undefined
      ? "SELECT percentual FROM divida_rateio_destinos WHERE divida_tipo = ? AND divida_id = ?"
      : "SELECT percentual FROM divida_rateio_destinos WHERE divida_tipo = ? AND divida_id = ? AND id != ?",
    excluirId === undefined ? [dividaTipo, dividaId] : [dividaTipo, dividaId, excluirId],
  );
  return arredondarPercentual(linhas.reduce((acc, l) => acc + l.percentual, 0));
}

/** Registra uma nova linha de rateio de destino para uma dívida. Valida que a soma dos
 * percentuais já cadastrados para aquela dívida + este novo não ultrapassa 100% — lança
 * erro claro (com o total que resultaria) em vez de deixar a soma estourar em silêncio. */
export function registrarRateioDestino(
  db: Database,
  dados: { dividaTipo: DividaTipo; dividaId: number; destino: string; percentual: number; observacoes?: string },
): RateioDestino {
  const destino = dados.destino.trim();
  if (destino === "") throw new Error("Informe o destino do rateio.");
  if (!(dados.percentual > 0 && dados.percentual <= 100)) {
    throw new Error(`Percentual inválido (${dados.percentual}) — deve ser maior que 0 e no máximo 100.`);
  }

  const somaAtual = somarPercentuaisExistentes(db, dados.dividaTipo, dados.dividaId);
  const somaResultante = arredondarPercentual(somaAtual + dados.percentual);
  if (somaResultante > 100 + EPSILON) {
    throw new Error(
      `Soma dos percentuais ficaria em ${somaResultante}% — reduza algum valor antes de adicionar este.`,
    );
  }

  executar(
    db,
    "INSERT INTO divida_rateio_destinos (divida_tipo, divida_id, destino, percentual, observacoes) VALUES (?, ?, ?, ?, ?)",
    [dados.dividaTipo, dados.dividaId, destino, dados.percentual, dados.observacoes?.trim() || null],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const [linha] = consultar<RateioDestino>(db, "SELECT * FROM divida_rateio_destinos WHERE id = ?", [id]);
  return linha;
}

/** Atualiza uma linha de rateio existente. Mesma validação de soma <= 100% de
 * `registrarRateioDestino`, mas excluindo a PRÓPRIA linha do cálculo da soma antiga (senão
 * o percentual atual dela contaria duas vezes — uma na soma "antes" e outra no valor
 * "depois"). Lança erro se o id não existir. */
export function atualizarRateioDestino(
  db: Database,
  id: number,
  dados: { destino?: string; percentual?: number; observacoes?: string | null },
): RateioDestino {
  const [existente] = consultar<RateioDestino>(db, "SELECT * FROM divida_rateio_destinos WHERE id = ?", [id]);
  if (!existente) throw new Error(`Linha de rateio ${id} não encontrada.`);

  const destino = dados.destino !== undefined ? dados.destino.trim() : existente.destino;
  if (destino === "") throw new Error("Informe o destino do rateio.");
  const percentual = dados.percentual !== undefined ? dados.percentual : existente.percentual;
  if (!(percentual > 0 && percentual <= 100)) {
    throw new Error(`Percentual inválido (${percentual}) — deve ser maior que 0 e no máximo 100.`);
  }
  const observacoes = dados.observacoes !== undefined ? (dados.observacoes?.trim() || null) : existente.observacoes;

  const somaOutrasLinhas = somarPercentuaisExistentes(db, existente.divida_tipo, existente.divida_id, id);
  const somaResultante = arredondarPercentual(somaOutrasLinhas + percentual);
  if (somaResultante > 100 + EPSILON) {
    throw new Error(
      `Soma dos percentuais ficaria em ${somaResultante}% — reduza algum valor antes de salvar esta alteração.`,
    );
  }

  executar(
    db,
    "UPDATE divida_rateio_destinos SET destino = ?, percentual = ?, observacoes = ? WHERE id = ?",
    [destino, percentual, observacoes, id],
  );
  const [depois] = consultar<RateioDestino>(db, "SELECT * FROM divida_rateio_destinos WHERE id = ?", [id]);
  return depois;
}

/** Remove uma linha de rateio. Lança erro se o id não existir. */
export function removerRateioDestino(db: Database, id: number): void {
  const [existente] = consultar<{ id: number }>(db, "SELECT id FROM divida_rateio_destinos WHERE id = ?", [id]);
  if (!existente) throw new Error(`Linha de rateio ${id} não encontrada.`);
  executar(db, "DELETE FROM divida_rateio_destinos WHERE id = ?", [id]);
}

/** Todas as linhas de rateio de uma dívida, mais recente primeiro. */
export function listarRateioDestinos(db: Database, dividaTipo: DividaTipo, dividaId: number): RateioDestino[] {
  return consultar<RateioDestino>(
    db,
    "SELECT * FROM divida_rateio_destinos WHERE divida_tipo = ? AND divida_id = ? ORDER BY criado_em DESC, id DESC",
    [dividaTipo, dividaId],
  );
}

/** Soma dos percentuais já cadastrados para uma dívida (0-100). */
export function percentualTotalClassificado(db: Database, dividaTipo: DividaTipo, dividaId: number): number {
  return somarPercentuaisExistentes(db, dividaTipo, dividaId);
}

export interface DividaComRateioIncompleto {
  dividaTipo: DividaTipo;
  dividaId: number;
  /** Nome/descrição legível da dívida para exibir na pendência — instituição + tipo
   * (dívida de consumo) ou instituição + "financiamento" (financiamento imobiliário). */
  descricao: string;
  percentualClassificado: number; // 0-100
  percentualFaltante: number; // 100 - percentualClassificado
}

/** Lista TODAS as linhas de `dividas_consumo` e `financiamentos` cuja soma de rateio de
 * destino for menor que 100% — inclusive 0% (nenhuma linha cadastrada ainda). Alimenta uma
 * pendência visível (ex: painel de pendências), nunca uma trava: uma dívida sem rateio
 * completo continua utilizável normalmente em qualquer outro relatório. */
export function obterDividasComRateioIncompleto(db: Database): DividaComRateioIncompleto[] {
  const resultado: DividaComRateioIncompleto[] = [];

  const dividasConsumo = consultar<{ id: number; tipo: string; instituicao: string }>(
    db,
    "SELECT id, tipo, instituicao FROM dividas_consumo",
  );
  for (const d of dividasConsumo) {
    const percentualClassificado = somarPercentuaisExistentes(db, "divida_consumo", d.id);
    if (percentualClassificado < 100 - EPSILON) {
      resultado.push({
        dividaTipo: "divida_consumo",
        dividaId: d.id,
        descricao: `${d.instituicao} (${d.tipo})`,
        percentualClassificado,
        percentualFaltante: arredondarPercentual(100 - percentualClassificado),
      });
    }
  }

  const financiamentos = consultar<{ id: number; instituicao: string; apelido: string | null }>(
    db,
    `SELECT f.id, f.instituicao, i.apelido
     FROM financiamentos f
     LEFT JOIN imoveis i ON i.id = f.imovel_id`,
  );
  for (const f of financiamentos) {
    const percentualClassificado = somarPercentuaisExistentes(db, "financiamento", f.id);
    if (percentualClassificado < 100 - EPSILON) {
      resultado.push({
        dividaTipo: "financiamento",
        dividaId: f.id,
        descricao: `${f.instituicao} — financiamento${f.apelido ? ` (${f.apelido})` : ""}`,
        percentualClassificado,
        percentualFaltante: arredondarPercentual(100 - percentualClassificado),
      });
    }
  }

  return resultado;
}

export interface ValorRateado {
  destino: string;
  valor: number;
}

/** Função pura (sem acesso a banco): distribui um valor monetário pelos rateios informados,
 * arredondando cada fatia para centavos e ajustando o resíduo de arredondamento na ÚLTIMA
 * linha, para que a soma das fatias bata exatamente com `valor` original — mesmo cuidado já
 * usado no motor de rateio entre imóveis (ver `rateio/motorRateio.ts`). Reaproveitada por
 * outros módulos (relatório de juros pagos, indicadores) para quebrar um valor entre os
 * destinos de uma dívida: a assinatura é uma API pública estável, não mudar sem necessidade.
 *
 * `rateios` não precisa somar exatamente 100 — qualquer percentual parcial é aceito aqui
 * (quem decide se uma dívida está "completamente" classificada é
 * `obterDividasComRateioIncompleto`, não esta função). Com `rateios` vazio, retorna `[]`. */
export function aplicarRateio<T extends { destino: string; percentual: number }>(
  valor: number,
  rateios: T[],
): ValorRateado[] {
  if (rateios.length === 0) return [];

  // O "alvo" da soma é o total EXATO alocado pelos percentuais informados, arredondado uma
  // única vez — não `valor` bruto arredondado. Isso importa quando `rateios` não soma 100%
  // (dívida com rateio ainda parcial): a soma das fatias deve bater com a fração do valor
  // de fato coberta pelos percentuais recebidos, não com o valor inteiro original. Quando
  // `rateios` soma exatamente 100%, `alvoArredondado` coincide com `valor` arredondado —
  // caso normal de uma dívida já totalmente classificada.
  const valoresExatos = rateios.map((r) => valor * (r.percentual / 100));
  const somaExata = valoresExatos.reduce((acc, v) => acc + v, 0);
  const alvoArredondado = Math.round(somaExata * 100) / 100;

  const resultado: ValorRateado[] = rateios.map((r, i) => ({
    destino: r.destino,
    valor: Math.round(valoresExatos[i] * 100) / 100,
  }));

  const somaArredondada = resultado.reduce((acc, r) => acc + r.valor, 0);
  const residuo = Math.round((alvoArredondado - somaArredondada) * 100) / 100;
  if (residuo !== 0) {
    resultado[resultado.length - 1].valor = Math.round((resultado[resultado.length - 1].valor + residuo) * 100) / 100;
  }

  return resultado;
}
