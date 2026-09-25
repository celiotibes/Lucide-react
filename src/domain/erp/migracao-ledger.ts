/**
 * Migração: transações bancárias (`transacoes`) → razão contábil (`ledger_entries`).
 *
 * É a ponte entre o que o app registra (extrato: uma linha, um valor com sinal) e o que a
 * contabilidade exige (partida dobrada: duas pernas que se anulam). Sem ela o razão fica
 * vazio — era por isso que o Painel mostrava quase R$ 1,9 milhão e os Relatórios
 * Integrados, com exatamente os mesmos dados, mostravam R$ 0,00: leem tabelas diferentes
 * e nada nunca atravessou de uma para a outra. A função existia, mas nunca era chamada, e
 * se fosse teria produzido lixo (ver o histórico dos três defeitos abaixo).
 *
 * REGRA DE LANÇAMENTO. Toda transação vira DUAS linhas de mesmo valor:
 *   - entrada (valor > 0): débito em Caixa, crédito na contrapartida
 *   - saída   (valor < 0): crédito em Caixa, débito na contrapartida
 * A regra é a mesma para qualquer natureza de contrapartida, e é o que faz o razão fechar
 * por construção: cada transação contribui com débito == crédito.
 *
 * Qual é a contrapartida, isso quem decide é `contaContrapartida()` em
 * mapeamentoPlanoApp.ts, que traduz o código do plano do app para o do razão conta a
 * conta. Não é tradução por igualdade de código: os dois planos usam os mesmos números
 * para contas diferentes.
 *
 * O QUE FOI CORRIGIDO AQUI (a versão anterior tinha três defeitos, cada um sozinho
 * suficiente para inutilizar o razão):
 *   1. Casava os planos por string de código (`ON c.codigo = p.codigo`), com fallback
 *      `codigo LIKE '1.%'`/`'2.%'` — receita de aluguel virava caixa, condomínio virava
 *      capital social, e o que não casava caía numa conta arbitrária da faixa.
 *   2. Gravava UMA perna por transação, sem contrapartida. O razão nascia
 *      permanentemente desbalanceado e nenhum período jamais fecharia.
 *   3. Jogava TODAS as transações históricas no período do mês corrente. Num sistema de
 *      reconstituição contábil isso é o oposto do objetivo: cada lançamento precisa cair
 *      na competência da própria data.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import { CONTA_CAIXA_ERP, contaContrapartida } from "./mapeamentoPlanoApp";

export interface MigracaoStatus {
  total_transacoes: number;
  transacoes_migradas: number;
  /** Já estavam no razão de uma execução anterior — a migração é idempotente. */
  transacoes_ja_migradas: number;
  transacoes_falhadas: number;
  /** Migradas, porém contra a conta transitória: entraram no razão e no saldo de caixa,
   * mas continuam pendentes de classificação e aparecem como tal no balancete. */
  transacoes_sem_classificacao: number;
  erros: Array<{ transacao_id: number; erro: string }>;
  tempo_ms: number;
}

interface TransacaoOrigem {
  id: number;
  data: string | null;
  data_competencia: string | null;
  valor: number;
  descricao_original: string;
  plano_conta_codigo: string | null;
}

const MESES_PT: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, MARÇO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

/** Tenta extrair a competência (mês do fato gerador) da descrição crua do extrato, no
 * padrão "REF <MÊS>/<ANO>" (ex.: "CONDOMINIO REF DEZEMBRO/2024"). Usado apenas como
 * fallback quando `data_competencia` não foi preenchida manualmente na triagem — ver
 * comentário no topo do arquivo e em __auditoria__/competencia-vs-caixa.test.ts. */
function inferirCompetenciaDaDescricao(descricao: string): { ano: number; mes: number } | null {
  const match = /REF\.?\s*([A-ZÇÃÕ]+)\s*\/\s*(\d{4})/i.exec(descricao);
  if (!match) return null;
  const mes = MESES_PT[match[1].toUpperCase()];
  if (!mes) return null;
  return { ano: Number(match[2]), mes };
}

/** Resolve a data de competência efetiva de uma transação: coluna explícita
 * (`data_competencia`, preenchida na triagem) tem prioridade; na ausência dela, tenta
 * inferir da descrição do extrato; por fim cai na data do extrato (regime de caixa). */
function resolverCompetencia(txn: TransacaoOrigem): { ano: number; mes: number } | null {
  if (txn.data_competencia) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(txn.data_competencia);
    if (partes) return { ano: Number(partes[1]), mes: Number(partes[2]) };
  }
  const inferida = inferirCompetenciaDaDescricao(txn.descricao_original);
  if (inferida) return inferida;
  return null;
}

/** Período contábil (entidade, ano, mês), criando-o aberto se ainda não existir.
 * Devolve null se não for possível — o chamador registra o erro na transação, em vez de
 * empurrar o lançamento para outro mês. */
function resolverPeriodo(
  db: Database,
  entidade_id: number,
  ano: number,
  mes: number,
  cache: Map<string, { id: number; status: string } | null>,
): { id: number; status: string } | null {
  const chave = `${ano}-${mes}`;
  const emCache = cache.get(chave);
  if (emCache !== undefined) return emCache;

  const buscar = () =>
    consultar<{ id: number; status: string }>(
      db,
      "SELECT id, status FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
      [entidade_id, ano, mes],
    )[0] ?? null;

  let periodo = buscar();
  if (!periodo) {
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')",
      [entidade_id, ano, mes],
    );
    periodo = buscar();
  }

  cache.set(chave, periodo);
  return periodo;
}

/** Migra as transações bancárias ainda ausentes do razão.
 *
 * Idempotente: o que já foi migrado antes é reconhecido pela origem
 * (`origem_modulo = 'transacoes'` + `origem_id`) e pulado, não duplicado. Pode ser
 * chamada quantas vezes for preciso — após cada importação de extrato, por exemplo. */
export function migrarTransacoesParaLedger(
  db: Database,
  entidade_id: number,
): MigracaoStatus {
  const inicio = Date.now();
  const erros: Array<{ transacao_id: number; erro: string }> = [];
  let migradas = 0;
  let ja_migradas = 0;
  let sem_classificacao = 0;
  let transacoes: TransacaoOrigem[] = [];

  // BEGIN explícito: o laço abaixo abre um SAVEPOINT por transação (RELEASE/ROLLBACK TO
  // em caso de falha na segunda perna — ver comentário mais abaixo). SAVEPOINT sem uma
  // transação já aberta funciona em SQLite (que abre uma implicitamente sozinho), mas o
  // PostgreSQL recusa com "SAVEPOINT can only be used in transaction blocks" — BUG REAL
  // encontrado nesta função, só visível ao portar para Postgres/Supabase, porque em
  // SQLite o efeito é indistinguível de estar correto. `executar`/`consultar` (API
  // parametrizada) não cobrem controle de transação — por isso BEGIN/COMMIT/SAVEPOINT
  // aqui usam a API do sql.js diretamente, como a própria connection.ts faz.
  db.run("BEGIN");
  try {
    transacoes = consultar<TransacaoOrigem>(
      db,
      `SELECT id, data, data_competencia, valor, descricao_original, plano_conta_codigo
       FROM transacoes
       ORDER BY data ASC, id ASC`,
      [],
    );

    // Uma consulta só, em vez de um SELECT por transação dentro do laço.
    const ja_no_razao = new Set(
      consultar<{ origem_id: number }>(
        db,
        "SELECT DISTINCT origem_id FROM ledger_entries WHERE origem_modulo = 'transacoes'",
        [],
      ).map((linha) => linha.origem_id),
    );

    const periodos = new Map<string, { id: number; status: string } | null>();

    for (const txn of transacoes) {
      if (ja_no_razao.has(txn.id)) {
        ja_migradas++;
        continue;
      }

      try {
        const valor = Number(txn.valor);
        if (!Number.isFinite(valor) || valor === 0) {
          throw new Error("Valor ausente ou zero — não há partida a registrar");
        }

        // A competência decide o PERÍODO CONTÁBIL do lançamento: `data_competencia`
        // (preenchida na triagem) ou, na ausência dela, o padrão "REF <MÊS>/<ANO>" na
        // descrição do extrato têm prioridade sobre a data do extrato — ver
        // resolverCompetencia(). `data_lancamento` continua usando a data do EXTRATO
        // (abaixo, em `comum`), para o fluxo de caixa em regime de caixa continuar correto.
        const competencia = resolverCompetencia(txn);
        let ano: number;
        let mes: number;
        if (competencia) {
          ano = competencia.ano;
          mes = competencia.mes;
        } else {
          // Formato do schema é DATE 'AAAA-MM-DD'; qualquer outra coisa é erro da
          // transação, não motivo para chutar o mês corrente.
          const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(txn.data ?? "");
          if (!partes) {
            throw new Error(`Data inválida ou ausente ("${txn.data ?? ""}") — competência indeterminável`);
          }
          ano = Number(partes[1]);
          mes = Number(partes[2]);
        }

        const periodo = resolverPeriodo(db, entidade_id, ano, mes, periodos);
        if (!periodo) {
          throw new Error(`Não foi possível abrir o período contábil ${mes}/${ano}`);
        }
        if (periodo.status !== "aberto") {
          throw new Error(
            `Período ${String(mes).padStart(2, "0")}/${ano} está fechado — lançar exigiria reabrir o período ou registrar um ajuste no período corrente`,
          );
        }

        const { conta_id: conta_contrapartida, classificada } = contaContrapartida(
          txn.plano_conta_codigo,
        );

        const montante = Math.abs(valor);
        const entrada = valor > 0;
        const comum = {
          entidade_id,
          periodo_id: periodo.id,
          data_lancamento: txn.data as string,
          descricao: txn.descricao_original,
          origem_modulo: "transacoes" as const,
          origem_id: txn.id,
          referencia_documento: `TXN-${txn.id}`,
        };

        // SAVEPOINT por transação: se a segunda perna falhar, a primeira não pode ficar
        // sozinha no razão — uma perna órfã desbalanceia o período inteiro e impede o
        // fechamento, que é exatamente o defeito que esta reescrita veio consertar. Agora
        // aninha dentro do BEGIN de cima (nunca é o savepoint mais externo).
        db.run(`SAVEPOINT txn_${txn.id}`);
        try {
          registrarLancamentoContabil(db, {
            ...comum,
            conta_id: CONTA_CAIXA_ERP,
            valor_debito: entrada ? montante : undefined,
            valor_credito: entrada ? undefined : montante,
          });
          registrarLancamentoContabil(db, {
            ...comum,
            conta_id: conta_contrapartida,
            valor_debito: entrada ? undefined : montante,
            valor_credito: entrada ? montante : undefined,
          });
          db.run(`RELEASE txn_${txn.id}`);
        } catch (erro) {
          db.run(`ROLLBACK TO txn_${txn.id}`);
          db.run(`RELEASE txn_${txn.id}`);
          throw erro;
        }

        migradas++;
        if (!classificada) sem_classificacao++;
      } catch (erro) {
        // Erro de UMA transação (validação, ou a própria SAVEPOINT acima já desfeita) —
        // registrado em `erros` e a migração segue para a próxima. Não escapa até o
        // BEGIN/COMMIT externo, que por isso sempre chega ao COMMIT abaixo.
        erros.push({
          transacao_id: txn.id,
          erro: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }

    db.run("COMMIT");
  } catch (erro) {
    // Só chega aqui por falha ANTES do laço (ex.: o SELECT de transações) ou alguma
    // exceção que escapou do try por-transação acima — nos dois casos, nada do que este
    // BEGIN abriu deve ficar meio aplicado.
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    throw erro;
  }

  return {
    total_transacoes: transacoes.length,
    transacoes_migradas: migradas,
    transacoes_ja_migradas: ja_migradas,
    transacoes_falhadas: erros.length,
    transacoes_sem_classificacao: sem_classificacao,
    erros,
    tempo_ms: Date.now() - inicio,
  };
}
