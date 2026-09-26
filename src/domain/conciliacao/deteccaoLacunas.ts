/** Detecção de lacunas temporais num extrato bancário importado.
 *
 * `conciliacao.ts` (módulo irmão deste) responde "os três saldos batem, e se não batem,
 * o que explica a diferença" — mas parte de um pressuposto: que TODAS as transações do
 * período existem em `transacoes`. Se um trecho do extrato nunca foi importado (arquivo
 * incompleto, período pulado entre dois uploads, exportação do banco com buraco), a
 * conciliação pode até fechar sem diferença — porque não há nada para comparar contra
 * o saldo do banco naquela data — e o buraco passa despercebido. Isto aqui detecta esse
 * buraco diretamente: um intervalo de dias corridos, dentro do período que deveria estar
 * coberto, sem NENHUMA linha em `transacoes` para a conta.
 *
 * Não é "qualquer dia sem transação" — isso é normal em qualquer conta bancária (fins de
 * semana, feriados, dias sem movimento). O CRITÉRIO é um LIMIAR de dias corridos
 * consecutivos sem nenhum movimento:
 *
 *   LIMIAR PADRÃO = 7 dias corridos sem NENHUMA transação.
 *
 *   Por quê 7: é o maior "silêncio bancário normal" que aparece sem indicar problema —
 *   cobre um fim de semana longo (sexta a domingo), um feriado emendado com fim de
 *   semana, ou simplesmente uma conta pouco movimentada por alguns dias. Acima disso,
 *   numa conta que tem movimento nos dias adjacentes ao buraco, sete dias seguidos sem
 *   NENHUM lançamento — nem um PIX, nem uma tarifa, nem um débito automático — deixa de
 *   ser plausível como coincidência e passa a ser um achado que merece pergunta ao
 *   cliente ou ao perito: o extrato está incompleto? faltou importar um arquivo? a conta
 *   ficou mesmo parada? Isto é uma decisão de negócio, não uma verdade estatística — por
 *   isso é parâmetro (`limiar_dias_sem_movimento`), documentado aqui e não escondido
 *   dentro do cálculo.
 *
 * O que NÃO faz: não julga se a lacuna é suspeita ou normal — isso cabe à pessoa, com o
 * `contexto` (última transação antes, primeira depois) que cada lacuna carrega. O que
 * este módulo faz é garantir que a lacuna apareça, em vez de ficar invisível dentro de
 * uma conciliação que, tecnicamente, fechou.
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

/** Ver o comentário de topo: mais que isso, numa conta com movimento nos dias
 * adjacentes, deixa de ser silêncio bancário normal. */
export const LIMIAR_PADRAO_DIAS_SEM_MOVIMENTO = 7;

export interface OpcoesDeteccaoLacunas {
  /** Dias corridos sem nenhuma transação para uma lacuna ser reportada. Ver o comentário
   * de topo deste arquivo para a justificativa do padrão. */
  limiar_dias_sem_movimento?: number;
}

export interface ContextoTransacao {
  data: string;
  valor: number;
  descricao_original: string;
}

export interface SaldoInformadoResumo {
  data: string;
  saldo: number;
}

export type SeveridadeLacuna = "normal" | "alta";

export interface LacunaDetectada {
  conta_id: number;
  data_inicio_lacuna: string;
  data_fim_lacuna: string;
  dias_sem_movimento: number;
  /** A última transação registrada antes da lacuna e a primeira depois dela — para a
   * pessoa avaliar se é normal (conta pouco usada naquele período) ou suspeito. Pode ser
   * `null` quando a lacuna toca a borda do intervalo pedido e não há transação nenhuma
   * da conta antes (ou depois) dela, dentro OU fora do intervalo — sinal de que a conta
   * pode não ter movimento registrado ali de jeito nenhum. */
  contexto: {
    antes: ContextoTransacao | null;
    depois: ContextoTransacao | null;
  };
  /** 'alta' quando existe saldo do extrato informado (`extrato_saldos_informados`)
   * datado DENTRO da lacuna — ou seja, a pessoa registrou que o saldo do banco mudou
   * (ou foi conferido) num dia em que o app não tem nenhuma transação para explicar essa
   * posição. É um sinal mais forte do que a lacuna sozinha: o saldo se moveu sem
   * transação visível. 'normal' é a lacuna sem esse cruzamento — ainda merece
   * verificação, mas sem essa confirmação adicional. */
  severidade: SeveridadeLacuna;
  saldos_informados_no_periodo: SaldoInformadoResumo[];
}

function paraData(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function adicionarDias(iso: string, dias: number): string {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraIso(d);
}

/** Diferença em dias corridos entre duas datas ISO (fim - inicio). */
function diferencaDias(isoFim: string, isoInicio: string): number {
  return Math.round((paraData(isoFim).getTime() - paraData(isoInicio).getTime()) / 86_400_000);
}

interface LinhaTransacao {
  id: number;
  data: string;
  valor: number;
  descricao_original: string;
}

function paraContexto(t: LinhaTransacao): ContextoTransacao {
  return { data: t.data, valor: t.valor, descricao_original: t.descricao_original };
}

/** A transação mais próxima da conta ANTES (estritamente) de uma data, sem limite de
 * intervalo — usada como contexto quando a lacuna toca o início do período pedido e não
 * há movimento nenhum dentro do intervalo para servir de marco. */
function transacaoMaisProximaAntes(db: Database, conta_id: number, data: string): LinhaTransacao | null {
  return (
    consultar<LinhaTransacao>(
      db,
      `SELECT id, data, valor, descricao_original FROM transacoes
       WHERE conta_id = ? AND data < ?
       ORDER BY data DESC, id DESC LIMIT 1`,
      [conta_id, data],
    )[0] ?? null
  );
}

/** Simétrico a `transacaoMaisProximaAntes`, para depois de uma data. */
function transacaoMaisProximaDepois(db: Database, conta_id: number, data: string): LinhaTransacao | null {
  return (
    consultar<LinhaTransacao>(
      db,
      `SELECT id, data, valor, descricao_original FROM transacoes
       WHERE conta_id = ? AND data > ?
       ORDER BY data ASC, id ASC LIMIT 1`,
      [conta_id, data],
    )[0] ?? null
  );
}

/** Detecta lacunas — trechos de dias corridos sem nenhuma transação da conta — dentro de
 * um intervalo [data_inicio, data_fim]. Não grava nada: é cálculo puro sobre o que já
 * está em `transacoes` e, para o cruzamento de severidade, em `extrato_saldos_informados`.
 */
export function detectarLacunas(
  db: Database,
  conta_id: number,
  data_inicio: string,
  data_fim: string,
  opcoes: OpcoesDeteccaoLacunas = {},
): LacunaDetectada[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(data_fim)) {
    throw new Error("data_inicio e data_fim precisam estar no formato AAAA-MM-DD.");
  }
  if (data_inicio > data_fim) return [];

  const limiar = opcoes.limiar_dias_sem_movimento ?? LIMIAR_PADRAO_DIAS_SEM_MOVIMENTO;

  const transacoes = consultar<LinhaTransacao>(
    db,
    `SELECT id, data, valor, descricao_original FROM transacoes
     WHERE conta_id = ? AND data BETWEEN ? AND ?
     ORDER BY data ASC, id ASC`,
    [conta_id, data_inicio, data_fim],
  );

  // Agrupa por dia de movimento. Quando há mais de uma transação no mesmo dia, a data
  // sozinha não diz qual veio "antes" ou "depois" das outras (não há hora no schema) —
  // por isso o contexto usa, deliberadamente, a primeira linha inserida daquele dia como
  // marco de "depois" (início do movimento do dia) e a última como marco de "antes" (fim
  // do movimento do dia), pela ordem de inserção (id).
  const porDia = new Map<string, LinhaTransacao[]>();
  for (const t of transacoes) {
    const grupo = porDia.get(t.data);
    if (grupo) grupo.push(t);
    else porDia.set(t.data, [t]);
  }
  const diasComMovimento = Array.from(porDia.keys()).sort();

  type Marco = { data: string; primeira: LinhaTransacao; ultima: LinhaTransacao };
  const marcos: Marco[] = diasComMovimento.map((data) => {
    const grupo = porDia.get(data)!;
    return { data, primeira: grupo[0], ultima: grupo[grupo.length - 1] };
  });

  const lacunas: LacunaDetectada[] = [];

  // Ponte entre um marco de movimento (ou a borda do intervalo, quando null) e o próximo.
  const pontes: Array<{ anterior: Marco | null; proximo: Marco | null }> = [];
  if (marcos.length === 0) {
    pontes.push({ anterior: null, proximo: null });
  } else {
    pontes.push({ anterior: null, proximo: marcos[0] });
    for (let i = 0; i < marcos.length - 1; i++) {
      pontes.push({ anterior: marcos[i], proximo: marcos[i + 1] });
    }
    pontes.push({ anterior: marcos[marcos.length - 1], proximo: null });
  }

  for (const { anterior, proximo } of pontes) {
    const inicioLacuna = anterior ? adicionarDias(anterior.data, 1) : data_inicio;
    const fimLacuna = proximo ? adicionarDias(proximo.data, -1) : data_fim;
    if (inicioLacuna > fimLacuna) continue; // dias consecutivos, sem lacuna nenhuma

    const dias_sem_movimento = diferencaDias(fimLacuna, inicioLacuna) + 1;
    if (dias_sem_movimento <= limiar) continue;

    const antesFora = anterior ? null : transacaoMaisProximaAntes(db, conta_id, data_inicio);
    const depoisFora = proximo ? null : transacaoMaisProximaDepois(db, conta_id, data_fim);
    const contextoAntes = anterior ? paraContexto(anterior.ultima) : antesFora ? paraContexto(antesFora) : null;
    const contextoDepois = proximo ? paraContexto(proximo.primeira) : depoisFora ? paraContexto(depoisFora) : null;

    const saldosNoPeriodo = consultar<SaldoInformadoResumo>(
      db,
      `SELECT data, saldo FROM extrato_saldos_informados
       WHERE conta_id = ? AND data BETWEEN ? AND ?
       ORDER BY data`,
      [conta_id, inicioLacuna, fimLacuna],
    );

    lacunas.push({
      conta_id,
      data_inicio_lacuna: inicioLacuna,
      data_fim_lacuna: fimLacuna,
      dias_sem_movimento,
      contexto: { antes: contextoAntes, depois: contextoDepois },
      // Saldo informado no meio de um trecho sem nenhuma transação: o saldo do banco foi
      // registrado ali, mas nada em `transacoes` explica a posição — sinal mais forte de
      // que falta algo importado, não só de que a conta ficou parada.
      severidade: saldosNoPeriodo.length > 0 ? "alta" : "normal",
      saldos_informados_no_periodo: saldosNoPeriodo,
    });
  }

  return lacunas;
}

export interface ResultadoLacunasLotes {
  conta_id: number;
  /** Intervalo inferido a partir das linhas de importação dos lotes CONCLUÍDOS desta
   * conta. `null` quando a conta não tem nenhum lote concluído com linha datada — não há
   * como inferir um período "supostamente coberto" sem isso. */
  data_inicio: string | null;
  data_fim: string | null;
  /** Quantidade de lotes concluídos desta conta considerados no cálculo do intervalo. */
  lotes_considerados: number;
  lacunas: LacunaDetectada[];
}

/** Variante de uso real: "o que foi importado para esta conta tem buraco?" — em vez de
 * pedir o intervalo, infere-o do próprio histórico de importação. O intervalo é o
 * MIN/MAX das datas das linhas de `importacao_linhas` pertencentes a lotes CONCLUÍDOS
 * desta conta (`lotes_importacao.status = 'concluido'`) — um lote ainda em triagem ou
 * descartado não representa um período que o sistema considera "coberto". */
export function detectarLacunasEmLotesImportados(
  db: Database,
  conta_id: number,
  opcoes: OpcoesDeteccaoLacunas = {},
): ResultadoLacunasLotes {
  const [contagem] = consultar<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM lotes_importacao WHERE conta_id = ? AND status = 'concluido'`,
    [conta_id],
  );
  const lotes_considerados = contagem?.n ?? 0;

  const [intervalo] = consultar<{ data_inicio: string | null; data_fim: string | null }>(
    db,
    `SELECT MIN(l.data) AS data_inicio, MAX(l.data) AS data_fim
     FROM importacao_linhas l
     JOIN lotes_importacao lo ON lo.id = l.lote_id
     WHERE lo.conta_id = ? AND lo.status = 'concluido' AND l.data IS NOT NULL`,
    [conta_id],
  );

  const data_inicio = intervalo?.data_inicio ?? null;
  const data_fim = intervalo?.data_fim ?? null;

  if (data_inicio === null || data_fim === null) {
    return { conta_id, data_inicio: null, data_fim: null, lotes_considerados, lacunas: [] };
  }

  return {
    conta_id,
    data_inicio,
    data_fim,
    lotes_considerados,
    lacunas: detectarLacunas(db, conta_id, data_inicio, data_fim, opcoes),
  };
}
