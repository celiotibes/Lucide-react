/** Conciliação bancária: comparar o saldo real do banco, numa data, contra o que o app
 * reconstituiu — e, quando não bate, dizer O QUE explica a diferença.
 *
 * Três números entram na comparação, por conta bancária e data de corte:
 *   1. saldo_extrato    — o que o extrato real do banco mostrava (digitado pela pessoa;
 *      o sistema não tem como deduzir isso sozinho, é o próprio ponto de partida).
 *   2. saldo_transacoes — SUM(valor) de `transacoes` desta conta até a data de corte. É
 *      o saldo que o app reconstituiu a partir do que foi importado e aprovado na
 *      triagem (ver src/domain/importacao/triagem.ts).
 *   3. saldo_razao      — a PARCELA do razão contábil atribuível a esta conta.
 *
 * O item 3 merece justificativa. `migracao-ledger.ts` lança toda transação bancária
 * contra CONTA_CAIXA_ERP (id 1101, mapeamentoPlanoApp.ts) — e essa é a MESMA conta de
 * caixa para QUALQUER conta bancária cadastrada; o razão não segrega por conta_id. Somar
 * o saldo bruto da 1101 (como obterSaldoConta faz) misturaria o dinheiro de todas as
 * contas bancárias numa comparação que deveria ser só desta. Por isso saldo_razao aqui é
 * calculado pela JUNÇÃO ledger_entries → transacoes: soma-se o valor das transações
 * DESTA conta que já têm perna no razão. Por construção da migração (débito=entrada,
 * crédito=saída, ambos de magnitude abs(valor)), essa perna de caixa sempre tem o mesmo
 * valor com sinal de `transacoes.valor` — verificado em migracao-ledger.test.ts e de
 * novo aqui, porque um erro de sinal nessa direção é o defeito mais fácil de cometer e
 * mais fácil de não notar (inverte silenciosamente saída por entrada).
 *
 * Consequência do desenho: `saldo_transacoes - saldo_razao` é EXATAMENTE a soma das
 * transações desta conta ainda sem perna no razão — não uma aproximação. É por isso que
 * o item 'nao_lancada_no_razao' fecha essa diferença por completo quando é a única
 * causa (ver o teste "diferença de transação não migrada fecha exatamente por ela").
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { CONTA_CAIXA_ERP, CONTA_CLASSIFICACAO_PENDENTE } from "../erp/mapeamentoPlanoApp";

const TOLERANCIA = 0.01; // mesma margem de arredondamento usada em ledger.ts

export interface ContaBancaria {
  id: number;
  banco: string;
  agencia: string | null;
  numero: string;
  titular: string;
  tipo: string;
}

/** Contas bancárias cadastradas, para o seletor da tela. */
export function listarContasBancarias(db: Database): ContaBancaria[] {
  return consultar<ContaBancaria>(
    db,
    "SELECT id, banco, agencia, numero, titular, tipo FROM contas_bancarias ORDER BY banco, numero",
  );
}

export interface SaldoExtratoInformado {
  id: number;
  conta_id: number;
  data: string;
  saldo: number;
  informado_em: string;
  informado_por: string | null;
  observacoes: string | null;
}

/** Grava (ou corrige, se já havia um valor para a mesma conta+data) o saldo que o
 * extrato real do banco mostrava numa data. Este é o dado que o sistema não tem como
 * deduzir sozinho — vem do próprio extrato/aplicativo do banco. */
export function informarSaldoExtrato(
  db: Database,
  dados: { conta_id: number; data: string; saldo: number; informado_por?: string; observacoes?: string },
): { sucesso: boolean; mensagem: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) {
    return { sucesso: false, mensagem: "Data precisa estar no formato AAAA-MM-DD." };
  }
  if (!Number.isFinite(dados.saldo)) {
    return { sucesso: false, mensagem: "Saldo precisa ser um número." };
  }
  const conta = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [dados.conta_id])[0];
  if (!conta) {
    return { sucesso: false, mensagem: "Conta bancária não encontrada." };
  }

  executar(
    db,
    `INSERT INTO extrato_saldos_informados (conta_id, data, saldo, informado_por, observacoes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (conta_id, data) DO UPDATE SET
       saldo = excluded.saldo,
       informado_por = excluded.informado_por,
       observacoes = excluded.observacoes,
       informado_em = CURRENT_TIMESTAMP`,
    [dados.conta_id, dados.data, dados.saldo, dados.informado_por ?? null, dados.observacoes ?? null],
  );
  return { sucesso: true, mensagem: "Saldo do extrato registrado." };
}

/** O saldo informado para esta conta nesta data exata, se houver. */
export function obterSaldoExtratoInformado(
  db: Database,
  conta_id: number,
  data: string,
): SaldoExtratoInformado | null {
  return (
    consultar<SaldoExtratoInformado>(
      db,
      "SELECT * FROM extrato_saldos_informados WHERE conta_id = ? AND data = ?",
      [conta_id, data],
    )[0] ?? null
  );
}

export type TipoItemConciliacao =
  | "nao_lancada_no_razao"
  | "triagem_pendente"
  | "classificacao_pendente"
  | "lancamento_orfao_no_razao"
  | "residual_nao_identificado";

export interface ItemConciliacao {
  tipo: TipoItemConciliacao;
  descricao: string;
  quantidade: number;
  valor: number;
  /** Se este item entra na soma que explica a diferença, ou é só informativo (caso de
   *  'classificacao_pendente', que já está corretamente no razão — só falta classificar
   *  a contrapartida — e de 'lancamento_orfao_no_razao', que não pode ser atribuído com
   *  certeza a UMA conta bancária específica quando há mais de uma cadastrada). */
  afeta_diferenca: boolean;
}

export interface DetalheTransacao {
  id: number;
  data: string;
  valor: number;
  descricao_original: string;
}

export interface DetalheTriagem {
  id: number;
  lote_id: number;
  arquivo_nome: string;
  linha_numero: number;
  data: string | null;
  valor: number | null;
  descricao_original: string;
  status: string;
}

export interface DetalheLancamentoOrfao {
  id: number;
  data_lancamento: string;
  descricao: string;
  valor_debito: number | null;
  valor_credito: number | null;
  referencia_documento: string;
}

export interface ApuracaoConciliacao {
  conta_id: number;
  data_corte: string;
  saldo_extrato: number;
  saldo_transacoes: number;
  saldo_razao: number;
  diferenca_extrato_transacoes: number;
  diferenca_transacoes_razao: number;
  diferenca_extrato_razao: number;
  fechada_sem_diferenca: boolean;
  itens: ItemConciliacao[];
  detalhes: {
    nao_lancada_no_razao: DetalheTransacao[];
    triagem_pendente: DetalheTriagem[];
    classificacao_pendente: DetalheTransacao[];
    lancamento_orfao_no_razao: DetalheLancamentoOrfao[];
  };
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Apura a conciliação para uma conta bancária numa data de corte, a partir do saldo do
 * extrato informado pelo usuário. Não grava nada — é o cálculo puro, o que permite à
 * tela mostrar a apuração antes de decidir registrá-la. */
export function apurarConciliacao(
  db: Database,
  conta_id: number,
  data_corte: string,
  saldo_extrato: number,
): ApuracaoConciliacao {
  // 1) saldo acumulado das transações desta conta até a data de corte.
  const [somaTransacoes] = consultar<{ total: number | null }>(
    db,
    "SELECT SUM(valor) AS total FROM transacoes WHERE conta_id = ? AND data <= ?",
    [conta_id, data_corte],
  );
  const saldo_transacoes = somaTransacoes?.total ?? 0;

  // 2) das transações desta conta até o corte, quais já têm perna no razão (join por
  // origem_id) — é essa junção que "atribui" ao razão só o que veio desta conta.
  const transacoes = consultar<{ id: number; data: string; valor: number; descricao_original: string; tem_ledger: number }>(
    db,
    `SELECT t.id, t.data, t.valor, t.descricao_original,
        CASE WHEN EXISTS (
          SELECT 1 FROM ledger_entries le
          WHERE le.origem_modulo = 'transacoes' AND le.origem_id = t.id AND le.conta_id = ?
        ) THEN 1 ELSE 0 END AS tem_ledger
     FROM transacoes t
     WHERE t.conta_id = ? AND t.data <= ?
     ORDER BY t.data, t.id`,
    [CONTA_CAIXA_ERP, conta_id, data_corte],
  );

  const naoMigradas = transacoes.filter((t) => t.tem_ledger === 0);
  const migradas = transacoes.filter((t) => t.tem_ledger === 1);
  const saldo_razao = migradas.reduce((soma, t) => soma + t.valor, 0);

  // 3) dentre as migradas, quais foram lançadas contra a conta transitória de
  // classificação pendente (1.9.99) — já contam certo no caixa, só falta classificar.
  let classificacaoPendenteIds = new Set<number>();
  if (migradas.length > 0) {
    const placeholders = migradas.map(() => "?").join(",");
    const linhas = consultar<{ origem_id: number }>(
      db,
      `SELECT DISTINCT origem_id FROM ledger_entries
       WHERE origem_modulo = 'transacoes' AND conta_id = ? AND origem_id IN (${placeholders})`,
      [CONTA_CLASSIFICACAO_PENDENTE, ...migradas.map((t) => t.id)],
    );
    classificacaoPendenteIds = new Set(linhas.map((l) => l.origem_id));
  }
  const classificacaoPendente = migradas.filter((t) => classificacaoPendenteIds.has(t.id));

  // 4) linhas de importação desta conta, dentro do corte, ainda sem decisão definitiva —
  // dinheiro que o extrato real já mostra, mas que o app ainda não incorporou a
  // `transacoes`. Linha malformada sem data entra também (não há como saber se é <= ao
  // corte, e escondê-la seria pior do que mostrá-la fora do filtro de data).
  const triagemPendente = consultar<DetalheTriagem>(
    db,
    `SELECT l.id, l.lote_id, lo.arquivo_nome, l.linha_numero, l.data, l.valor, l.descricao_original, l.status
     FROM importacao_linhas l
     JOIN lotes_importacao lo ON lo.id = l.lote_id
     WHERE lo.conta_id = ?
       AND l.status IN ('pendente', 'duplicata_provavel', 'malformada')
       AND (l.data IS NULL OR l.data <= ?)
     ORDER BY l.linha_numero`,
    [conta_id, data_corte],
  );
  const valorTriagemPendente = triagemPendente.reduce((soma, l) => soma + (l.valor ?? 0), 0);

  // 5) lançamentos de caixa no razão sem transação de origem — a transação foi apagada
  // (ou nunca existiu) depois de migrada. Não há como atribuir isto a UMA conta bancária
  // específica com certeza (o ledger não guarda conta_id de origem), então é sempre
  // informativo aqui, nunca soma na diferença desta conta — mas fica visível, porque
  // dinheiro no caixa contábil sem lastro rastreável é sempre uma pendência de auditoria.
  const lancamentosOrfaos = consultar<DetalheLancamentoOrfao>(
    db,
    `SELECT le.id, le.data_lancamento, le.descricao, le.valor_debito, le.valor_credito, le.referencia_documento
     FROM ledger_entries le
     WHERE le.conta_id = ? AND le.origem_modulo = 'transacoes' AND le.data_lancamento <= ?
       AND NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.id = le.origem_id)
     ORDER BY le.data_lancamento`,
    [CONTA_CAIXA_ERP, data_corte],
  );

  const diferenca_extrato_transacoes = saldo_extrato - saldo_transacoes;
  const diferenca_transacoes_razao = saldo_transacoes - saldo_razao;
  const diferenca_extrato_razao = saldo_extrato - saldo_razao;

  const itens: ItemConciliacao[] = [];

  if (naoMigradas.length > 0) {
    itens.push({
      tipo: "nao_lancada_no_razao",
      descricao: `${naoMigradas.length} transação(ões) desta conta, até ${data_corte}, ainda sem lançamento correspondente no razão — rode a sincronização do razão.`,
      quantidade: naoMigradas.length,
      valor: naoMigradas.reduce((soma, t) => soma + t.valor, 0),
      afeta_diferenca: true,
    });
  }

  if (triagemPendente.length > 0) {
    const semValor = triagemPendente.filter((l) => l.valor === null).length;
    itens.push({
      tipo: "triagem_pendente",
      descricao:
        `${triagemPendente.length} linha(s) do extrato ainda em triagem (pendente, possível duplicidade ou ilegível), sem decisão — ainda não viraram transação.` +
        (semValor > 0 ? ` ${semValor} sem valor legível, não somada(s) abaixo.` : ""),
      quantidade: triagemPendente.length,
      valor: valorTriagemPendente,
      afeta_diferenca: true,
    });
  }

  if (classificacaoPendente.length > 0) {
    itens.push({
      tipo: "classificacao_pendente",
      descricao: `${classificacaoPendente.length} transação(ões) já lançada(s) no razão, mas contra a conta transitória 1.9.99 (Classificação pendente) — o caixa está correto, falta só classificar a contrapartida.`,
      quantidade: classificacaoPendente.length,
      valor: classificacaoPendente.reduce((soma, t) => soma + t.valor, 0),
      afeta_diferenca: false,
    });
  }

  if (lancamentosOrfaos.length > 0) {
    const valorOrfaos = lancamentosOrfaos.reduce((soma, l) => soma + (l.valor_debito ?? 0) - (l.valor_credito ?? 0), 0);
    itens.push({
      tipo: "lancamento_orfao_no_razao",
      descricao: `${lancamentosOrfaos.length} lançamento(s) de caixa no razão (até ${data_corte}) sem transação de origem encontrada — a transação pode ter sido apagada depois de migrada. Não é possível atribuir com certeza a esta conta; verifique manualmente.`,
      quantidade: lancamentosOrfaos.length,
      valor: valorOrfaos,
      afeta_diferenca: false,
    });
  }

  // O que sobra depois dos itens explicáveis — nunca escondido. Uma diferença sem
  // explicação nomeada é um número inútil.
  const residual = diferenca_extrato_transacoes - valorTriagemPendente;
  if (Math.abs(residual) >= TOLERANCIA) {
    itens.push({
      tipo: "residual_nao_identificado",
      descricao: `${moeda(residual)} de diferença entre o saldo do extrato e o saldo das transações que os itens acima não explicam — confira o valor digitado do extrato, linhas rejeitadas na triagem ou lançamento fora do fluxo normal.`,
      quantidade: 0,
      valor: residual,
      afeta_diferenca: true,
    });
  }

  return {
    conta_id,
    data_corte,
    saldo_extrato,
    saldo_transacoes,
    saldo_razao,
    diferenca_extrato_transacoes,
    diferenca_transacoes_razao,
    diferenca_extrato_razao,
    fechada_sem_diferenca: Math.abs(diferenca_extrato_razao) < TOLERANCIA,
    itens,
    detalhes: {
      nao_lancada_no_razao: naoMigradas.map((t) => ({ id: t.id, data: t.data, valor: t.valor, descricao_original: t.descricao_original })),
      triagem_pendente: triagemPendente,
      classificacao_pendente: classificacaoPendente.map((t) => ({ id: t.id, data: t.data, valor: t.valor, descricao_original: t.descricao_original })),
      lancamento_orfao_no_razao: lancamentosOrfaos,
    },
  };
}

function idsDoItem(apuracao: ApuracaoConciliacao, tipo: TipoItemConciliacao): number[] {
  switch (tipo) {
    case "nao_lancada_no_razao":
      return apuracao.detalhes.nao_lancada_no_razao.map((d) => d.id);
    case "triagem_pendente":
      return apuracao.detalhes.triagem_pendente.map((d) => d.id);
    case "classificacao_pendente":
      return apuracao.detalhes.classificacao_pendente.map((d) => d.id);
    case "lancamento_orfao_no_razao":
      return apuracao.detalhes.lancamento_orfao_no_razao.map((d) => d.id);
    case "residual_nao_identificado":
      return [];
  }
}

export interface ConciliacaoResumo {
  id: number;
  conta_id: number;
  data_corte: string;
  saldo_extrato: number;
  saldo_transacoes: number;
  saldo_razao: number;
  diferenca_extrato_razao: number;
  fechada_sem_diferenca: boolean;
  realizada_em: string;
  realizada_por: string | null;
  observacoes: string | null;
}

/** Grava a apuração como um registro auditável: os três saldos, as diferenças e a
 * decomposição, para que uma conciliação já feita não precise ser refeita para ser
 * consultada depois. Também registra (ou corrige) o saldo do extrato informado, para
 * ficar salvo mesmo se a conciliação nunca for registrada de novo nesta conta+data. */
export function registrarConciliacao(
  db: Database,
  apuracao: ApuracaoConciliacao,
  dados: { realizada_por?: string; observacoes?: string } = {},
): { sucesso: boolean; conciliacao_id?: number; mensagem: string } {
  const conta = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [apuracao.conta_id])[0];
  if (!conta) return { sucesso: false, mensagem: "Conta bancária não encontrada." };

  informarSaldoExtrato(db, {
    conta_id: apuracao.conta_id,
    data: apuracao.data_corte,
    saldo: apuracao.saldo_extrato,
    informado_por: dados.realizada_por,
  });

  executar(
    db,
    `INSERT INTO conciliacoes_bancarias (
       conta_id, data_corte, saldo_extrato, saldo_transacoes, saldo_razao,
       diferenca_extrato_transacoes, diferenca_transacoes_razao, diferenca_extrato_razao,
       fechada_sem_diferenca, realizada_por, observacoes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      apuracao.conta_id,
      apuracao.data_corte,
      apuracao.saldo_extrato,
      apuracao.saldo_transacoes,
      apuracao.saldo_razao,
      apuracao.diferenca_extrato_transacoes,
      apuracao.diferenca_transacoes_razao,
      apuracao.diferenca_extrato_razao,
      apuracao.fechada_sem_diferenca ? 1 : 0,
      dados.realizada_por ?? "operador-local",
      dados.observacoes ?? null,
    ],
  );
  const conciliacao_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;

  for (const item of apuracao.itens) {
    executar(
      db,
      `INSERT INTO conciliacoes_itens (conciliacao_id, tipo, descricao, quantidade, valor, afeta_diferenca, referencias_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        conciliacao_id,
        item.tipo,
        item.descricao,
        item.quantidade,
        item.valor,
        item.afeta_diferenca ? 1 : 0,
        JSON.stringify(idsDoItem(apuracao, item.tipo)),
      ],
    );
  }

  return {
    sucesso: true,
    conciliacao_id,
    mensagem: apuracao.fechada_sem_diferenca
      ? "Conciliação registrada — fechou sem diferença."
      : `Conciliação registrada com diferença de ${moeda(apuracao.diferenca_extrato_razao)}.`,
  };
}

/** Conciliações já feitas para uma conta (ou de todas, se omitida), mais recente primeiro. */
export function listarConciliacoes(db: Database, conta_id?: number): ConciliacaoResumo[] {
  const filtro = conta_id !== undefined ? "WHERE conta_id = ?" : "";
  const params = conta_id !== undefined ? [conta_id] : [];
  return consultar<ConciliacaoResumo>(
    db,
    `SELECT id, conta_id, data_corte, saldo_extrato, saldo_transacoes, saldo_razao,
            diferenca_extrato_razao, fechada_sem_diferenca, realizada_em, realizada_por, observacoes
     FROM conciliacoes_bancarias ${filtro}
     ORDER BY data_corte DESC, id DESC`,
    params,
  ).map((c) => ({ ...c, fechada_sem_diferenca: Boolean(c.fechada_sem_diferenca) }));
}

export interface ConciliacaoItemRegistrado {
  id: number;
  tipo: TipoItemConciliacao;
  descricao: string;
  quantidade: number;
  valor: number;
  afeta_diferenca: boolean;
  referencias: number[];
}

/** Uma conciliação já registrada, com a decomposição salva — para reabrir depois sem
 * recalcular (a apuração pode mudar se os dados de origem mudarem; o registro é a foto
 * do que foi apurado no momento). */
export function obterConciliacao(
  db: Database,
  conciliacao_id: number,
): { conciliacao: ConciliacaoResumo; itens: ConciliacaoItemRegistrado[] } | null {
  const conciliacao = consultar<ConciliacaoResumo>(
    db,
    `SELECT id, conta_id, data_corte, saldo_extrato, saldo_transacoes, saldo_razao,
            diferenca_extrato_razao, fechada_sem_diferenca, realizada_em, realizada_por, observacoes
     FROM conciliacoes_bancarias WHERE id = ?`,
    [conciliacao_id],
  )[0];
  if (!conciliacao) return null;

  const itensBrutos = consultar<{
    id: number;
    tipo: TipoItemConciliacao;
    descricao: string;
    quantidade: number;
    valor: number;
    afeta_diferenca: number;
    referencias_json: string;
  }>(
    db,
    "SELECT id, tipo, descricao, quantidade, valor, afeta_diferenca, referencias_json FROM conciliacoes_itens WHERE conciliacao_id = ?",
    [conciliacao_id],
  );

  return {
    conciliacao: { ...conciliacao, fechada_sem_diferenca: Boolean(conciliacao.fechada_sem_diferenca) },
    itens: itensBrutos.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valor: i.valor,
      afeta_diferenca: Boolean(i.afeta_diferenca),
      referencias: (() => {
        try {
          const parsed = JSON.parse(i.referencias_json);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    })),
  };
}
