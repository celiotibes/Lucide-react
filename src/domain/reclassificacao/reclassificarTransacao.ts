/** Reclassificar uma transação (mudar o código do plano de contas) SEM deixar o razão
 * para trás.
 *
 * O DEFEITO QUE ISTO CORRIGE: até aqui, reclassificar uma transação era um simples
 * `UPDATE transacoes SET plano_conta_codigo = ...` (TransacoesView.tsx, categorizar()) ou
 * um UPDATE em lote (regrasAprendidas.ts, aplicarRegrasSalvas()). Nenhum dos dois tocava
 * `ledger_entries`. `migrarTransacoesParaLedger` é idempotente por origem
 * (`origem_modulo='transacoes' + origem_id`) — uma vez migrada, uma transação nunca é
 * revisitada, então o razão continuava com a classificação ANTIGA para sempre, mesmo
 * depois de rodar sincronizarRazao de novo. Prova empírica que abriu esta tarefa: uma
 * transação de R$ 1.000 classificada como despesa (conta 5210) e depois reclassificada
 * para capex/ativo (conta 1205) — o razão continuava mostrando 5210 mesmo após
 * re-sincronizar. Numa perícia isso é o sistema contradizendo a própria tela.
 *
 * A CORREÇÃO É POR ESTORNO, NUNCA POR UPDATE NO LANÇAMENTO. Contabilidade não se
 * reescreve — um lançamento já gravado é revertido por outro que o anula (débito ↔
 * crédito invertidos), e o valor certo entra por um lançamento novo. `estornarLancamento`
 * já existe em erp/ledger.ts; este módulo não o reusa diretamente porque ele tem um defeito
 * que o inviabiliza aqui — ver a nota "POR QUE NÃO REUSAR estornarLancamento()" abaixo —
 * mas segue exatamente o mesmo desenho (reverso + `estornado_por_id` apontando pra ele).
 *
 * SÓ A PERNA DE CONTRAPARTIDA É TOCADA. Cada transação migrada tem duas pernas: caixa
 * (sempre CONTA_CAIXA_ERP, mesmo valor e mesmo lado — nunca muda numa reclassificação) e
 * contrapartida (a conta que depende da classificação — é essa que está errada). Estornar
 * e relançar a perna de caixa também seria só ruído: mesma conta, mesmo valor, seria um
 * estorno sem nenhum efeito líquido, seguido de um lançamento idêntico. E preservar a
 * perna de caixa intacta é o que mantém `conciliacao.ts` funcionando sem qualquer
 * alteração: ela lê o saldo do razão de uma conta bancária pela perna de caixa
 * (`origem_modulo='transacoes' AND origem_id=t.id AND conta_id=CONTA_CAIXA_ERP`), que
 * nunca é tocada por este módulo.
 *
 * POR QUE NÃO REUSAR estornarLancamento() — defeito encontrado nesta tarefa, não corrigido
 * aqui por estar fora do que uma reclassificação precisa (ver relatório): ela copia
 * `origem_modulo`/`origem_id`/`conta_id` do lançamento original para o reverso. Contra o
 * schema real, `ledger_entries` tem `UNIQUE (origem_modulo, origem_id, conta_id)` — o
 * reverso colide com a PRÓPRIA linha que está revertendo (mesmo origem_modulo, mesmo
 * origem_id, mesma conta) e a inserção falha com "UNIQUE constraint failed". Reproduzido
 * manualmente contra `criarBancoDeTeste()` (o schema real) antes de escrever este módulo.
 * Por isso as pernas de correção aqui usam origem_modulo='manual' (já é um valor
 * legítimo do CHECK de ledger_entries — "Lançamento manual (ajuste, acerto)") e, mais
 * importante, origem_id = id de OUTRO lançamento (o que está sendo revertido/substituído)
 * em vez do id da transação. Como o id de um lançamento é um AUTOINCREMENT nunca reusado
 * e cada lançamento só pode ser estornado uma vez, o trio (origem_modulo, origem_id,
 * conta_id) usado aqui nunca colide — mesmo que a mesma transação seja reclassificada
 * repetidas vezes e volte a uma conta já usada antes (A → B → A). A ligação de volta até a
 * transação, então, não é mais por origem_id (que não é mais o id da transação para estas
 * linhas) e sim por `referencia_documento`, sempre no formato `TXN-<id>-RECLASS...` — é o
 * que `historicoRazaoDaTransacao()` usa para montar a trilha completa.
 *
 * PERÍODO FECHADO — decisão registrada aqui (ver relatório para a justificativa completa):
 * se o lançamento original ainda está num período ABERTO, a correção é lançada nesse
 * mesmo período, na mesma data da transação — o caso comum, sem nenhuma superfície nova.
 * Se o período original já está FECHADO, a correção NÃO o reabre nem lança nele
 * (`assegurarPeriodoAberto`, chamado por dentro de `registrarLancamentoContabil`, recusaria
 * mesmo que tentássemos) — em vez disso lança no período aberto mais recente da entidade
 * (ou cria um para o mês corrente, se nenhum está aberto), datado de hoje. É a prática
 * contábil padrão para corrigir um exercício já encerrado: um ajuste datado de quando foi
 * descoberto, nunca uma reescrita retroativa do período fechado — e a reclassificação
 * nunca fica bloqueada só porque o lançamento original é antigo.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "../erp/ledger";
import { CONTA_CAIXA_ERP, contaContrapartida } from "../erp/mapeamentoPlanoApp";

export interface OpcoesReclassificacao {
  /** Como a transação passa a estar marcada em `transacoes.categorizado_por`. Default
   * 'manual' — o mesmo valor que a tela de transações já grava para um clique direto.
   * `regrasAprendidas.ts` passa 'regra' ao aplicar reclassificação em lote. */
  categorizado_por?: "regra" | "ia" | "manual";
  /** usuario_id de quem pediu a reclassificação — vai para `criado_por` dos lançamentos
   * de correção e é gravado como autor do estorno. */
  reclassificado_por?: number;
  /** Texto livre gravado em `motivo_estorno` do lançamento original. Default descreve a
   * mudança de código. */
  motivo?: string;
}

export interface ResultadoReclassificacao {
  sucesso: boolean;
  mensagem: string;
  transacao_id: number;
  classificacao_anterior: string | null;
  classificacao_nova: string | null;
  /** true quando havia lançamento no razão e ele foi estornado + relançado. false quando
   * a transação ainda não tinha chegado ao razão (nada para corrigir lá) ou quando o novo
   * código aponta para a MESMA conta do razão que o antigo (nada mudou de fato na
   * contabilidade, só o rótulo do app). */
  razao_ajustado: boolean;
  periodo_original_id?: number;
  /** Presente só quando a correção foi desviada para o período aberto corrente porque o
   * período original estava fechado — diferente de periodo_original_id nesse caso. */
  periodo_correcao_id?: number;
  estorno_ledger_id?: number;
  novo_ledger_id?: number;
}

/** Período aberto mais recente da entidade, criando um para o mês corrente se nenhum
 * estiver aberto — mesmo padrão de resolverPeriodo() em migracao-ledger.ts, mas
 * procurando o período ABERTO mais recente em vez de um ano/mês específico, porque aqui
 * quem manda na competência não é a data da transação original (isso já passou), é "onde
 * lançar uma correção agora". */
function periodoAbertoAtual(db: Database, entidade_id: number): { id: number; ano: number; mes: number } {
  const [periodo] = consultar<{ id: number; ano: number; mes: number }>(
    db,
    `SELECT id, ano, mes FROM periodos_contabeis
     WHERE entidade_id = ? AND status = 'aberto'
     ORDER BY ano DESC, mes DESC LIMIT 1`,
    [entidade_id],
  );
  if (periodo) return periodo;

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  executar(
    db,
    "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')",
    [entidade_id, ano, mes],
  );
  return consultar<{ id: number; ano: number; mes: number }>(
    db,
    "SELECT id, ano, mes FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
    [entidade_id, ano, mes],
  )[0];
}

interface LegAtual {
  id: number;
  entidade_id: number;
  periodo_id: number;
  conta_id: number;
  valor_debito: number | null;
  valor_credito: number | null;
  data_lancamento: string;
  descricao: string;
  referencia_documento: string;
}

/** A perna de CONTRAPARTIDA ativa (não estornada) desta transação no razão, se houver —
 * seja a da migração original (`origem_modulo='transacoes'`) ou a de uma reclassificação
 * anterior (`origem_modulo='manual'`, ver nota do arquivo sobre por que origem_id muda de
 * significado nesse caso). Nunca a perna de caixa (`conta_id != CONTA_CAIXA_ERP`) — essa
 * não é gerenciada por este módulo. */
function buscarLegAtual(db: Database, transacao_id: number): LegAtual | null {
  return (
    consultar<LegAtual>(
      db,
      `SELECT id, entidade_id, periodo_id, conta_id, valor_debito, valor_credito,
              data_lancamento, descricao, referencia_documento
       FROM ledger_entries
       WHERE estornado_por_id IS NULL
         AND conta_id != ?
         AND (
           (origem_modulo = 'transacoes' AND origem_id = ?)
           OR (origem_modulo = 'manual' AND referencia_documento LIKE ?)
         )
       ORDER BY id DESC LIMIT 1`,
      [CONTA_CAIXA_ERP, transacao_id, `TXN-${transacao_id}-RECLASS%`],
    )[0] ?? null
  );
}

/** Reclassifica UMA transação: muda `transacoes.plano_conta_codigo` e, se ela já tinha
 * chegado ao razão, estorna a perna de contrapartida antiga e lança a nova — nunca dá
 * UPDATE num lançamento existente. Idempotente: reclassificar para o mesmo código (ou
 * para um código diferente que mapeia para a mesma conta do razão) não estorna nada. */
export function reclassificarTransacao(
  db: Database,
  transacao_id: number,
  novo_codigo: string | null,
  opts: OpcoesReclassificacao = {},
): ResultadoReclassificacao {
  const transacao = consultar<{
    id: number;
    data: string;
    valor: number;
    descricao_original: string;
    plano_conta_codigo: string | null;
  }>(
    db,
    "SELECT id, data, valor, descricao_original, plano_conta_codigo FROM transacoes WHERE id = ?",
    [transacao_id],
  )[0];

  if (!transacao) {
    return {
      sucesso: false,
      mensagem: `Transação ${transacao_id} não encontrada.`,
      transacao_id,
      classificacao_anterior: null,
      classificacao_nova: null,
      razao_ajustado: false,
    };
  }

  const classificacao_anterior = transacao.plano_conta_codigo ?? null;
  const classificacao_nova = novo_codigo || null;
  const categorizado_por = opts.categorizado_por ?? "manual";

  if (classificacao_anterior === classificacao_nova) {
    return {
      sucesso: true,
      mensagem: "Classificação já era essa — nada a fazer.",
      transacao_id,
      classificacao_anterior,
      classificacao_nova,
      razao_ajustado: false,
    };
  }

  const contaNova = contaContrapartida(classificacao_nova);
  const legAtual = buscarLegAtual(db, transacao_id);

  // Ainda não migrada ao razão (sincronizarRazao nunca rodou pra ela, ou rodou e ela caiu
  // num erro): nada no razão para corrigir, só o rótulo do app muda. Quando a migração
  // rodar, já vai lançar com a classificação certa.
  if (!legAtual) {
    executar(
      db,
      "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = ? WHERE id = ?",
      [classificacao_nova, categorizado_por, transacao_id],
    );
    return {
      sucesso: true,
      mensagem: "Classificação atualizada. A transação ainda não tinha lançamento no razão — nada para estornar.",
      transacao_id,
      classificacao_anterior,
      classificacao_nova,
      razao_ajustado: false,
    };
  }

  // O código do app mudou mas mapeia para a MESMA conta do razão (ex: dois códigos que
  // by design caem na mesma conta transitória) — o razão já está certo, não há o que
  // estornar.
  if (legAtual.conta_id === contaNova.conta_id) {
    executar(
      db,
      "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = ? WHERE id = ?",
      [classificacao_nova, categorizado_por, transacao_id],
    );
    return {
      sucesso: true,
      mensagem: "O código mudou, mas aponta para a mesma conta do razão — nenhum lançamento precisou ser corrigido.",
      transacao_id,
      classificacao_anterior,
      classificacao_nova,
      razao_ajustado: false,
    };
  }

  const [periodoOriginal] = consultar<{ status: string }>(
    db,
    "SELECT status FROM periodos_contabeis WHERE id = ?",
    [legAtual.periodo_id],
  );
  if (!periodoOriginal) {
    return {
      sucesso: false,
      mensagem: `Período contábil ${legAtual.periodo_id} do lançamento original não foi encontrado — reclassificação recusada.`,
      transacao_id,
      classificacao_anterior,
      classificacao_nova,
      razao_ajustado: false,
    };
  }

  let periodo_destino_id = legAtual.periodo_id;
  let data_lancamento = legAtual.data_lancamento;
  let periodo_realocado = false;

  if (periodoOriginal.status !== "aberto") {
    const periodo = periodoAbertoAtual(db, legAtual.entidade_id);
    periodo_destino_id = periodo.id;
    data_lancamento = new Date().toISOString().slice(0, 10);
    periodo_realocado = true;
  }

  const motivo =
    opts.motivo ??
    `Reclassificação: ${classificacao_anterior ?? "(sem classificação)"} → ${classificacao_nova ?? "(sem classificação)"}`;

  // 1) Estorna a perna de contrapartida atual (débito ↔ crédito invertidos, mesma conta).
  //    origem_modulo='manual' e origem_id=<id do lançamento revertido> — ver a nota do
  //    arquivo sobre por que não é 'transacoes'/origem_id da transação (colidiria com a
  //    UNIQUE constraint contra a própria linha que está revertendo).
  const estorno_ledger_id = registrarLancamentoContabil(db, {
    entidade_id: legAtual.entidade_id,
    periodo_id: periodo_destino_id,
    conta_id: legAtual.conta_id,
    data_lancamento,
    valor_debito: legAtual.valor_credito ?? undefined,
    valor_credito: legAtual.valor_debito ?? undefined,
    descricao: `ESTORNO (reclassificação): ${legAtual.descricao}`,
    origem_modulo: "manual",
    origem_id: legAtual.id,
    // Sempre no formato TXN-<id>-RECLASS..., nunca derivado de legAtual.referencia_documento
    // (que para a perna original da migração é só "TXN-<id>", sem "-RECLASS") — é esse
    // prefixo fixo que historicoRazaoDaTransacao()/buscarLegAtual() usam para encontrar
    // TODAS as pernas de correção desta transação, incluindo o primeiro estorno.
    referencia_documento: `TXN-${transacao_id}-RECLASS-EST-${legAtual.id}`,
    criado_por: opts.reclassificado_por,
  });
  executar(
    db,
    "UPDATE ledger_entries SET estornado_por_id = ?, motivo_estorno = ? WHERE id = ?",
    [estorno_ledger_id, motivo, legAtual.id],
  );

  // 2) Lança a nova contrapartida — mesma regra de débito/crédito que migracao-ledger.ts
  //    usa na migração original (entrada credita a contrapartida, saída debita).
  const montante = Math.abs(transacao.valor);
  const entrada = transacao.valor > 0;
  const novo_ledger_id = registrarLancamentoContabil(db, {
    entidade_id: legAtual.entidade_id,
    periodo_id: periodo_destino_id,
    conta_id: contaNova.conta_id,
    data_lancamento,
    valor_debito: entrada ? undefined : montante,
    valor_credito: entrada ? montante : undefined,
    descricao: `RECLASSIFICAÇÃO: ${transacao.descricao_original}`,
    origem_modulo: "manual",
    origem_id: estorno_ledger_id,
    referencia_documento: `TXN-${transacao_id}-RECLASS-${classificacao_nova ?? "PENDENTE"}`,
    criado_por: opts.reclassificado_por,
  });

  executar(
    db,
    "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = ? WHERE id = ?",
    [classificacao_nova, categorizado_por, transacao_id],
  );

  return {
    sucesso: true,
    mensagem: periodo_realocado
      ? `Reclassificado. O período original estava fechado — a correção foi lançada no período aberto corrente, datada de hoje.`
      : `Reclassificado no razão: lançamento #${legAtual.id} estornado (#${estorno_ledger_id}) e substituído pelo novo (#${novo_ledger_id}).`,
    transacao_id,
    classificacao_anterior,
    classificacao_nova,
    razao_ajustado: true,
    periodo_original_id: legAtual.periodo_id,
    periodo_correcao_id: periodo_realocado ? periodo_destino_id : undefined,
    estorno_ledger_id,
    novo_ledger_id,
  };
}

export interface ItemReclassificacaoLote {
  transacao_id: number;
  novo_codigo: string | null;
}

export interface ResultadoReclassificacaoLote {
  sucesso: boolean;
  mensagem: string;
  /** Quantas transações foram de fato alteradas (classificação diferente da atual). Só
   * tem valor quando sucesso=true — o lote é tudo-ou-nada (ver comentário abaixo). */
  processadas: number;
  razao_ajustadas: number;
  /** Não vazio só quando sucesso=false — nesse caso NADA foi persistido (ROLLBACK). */
  falha?: { transacao_id: number; erro: string };
}

/** Reclassifica várias transações numa única transação de banco (BEGIN/COMMIT) — tudo ou
 * nada. Usado por regras aprendidas aplicadas em lote, que podem afetar centenas de
 * transações de uma vez: uma falha no meio (ex: transação apagada entre a leitura da
 * regra e a aplicação) não pode deixar metade reclassificada e metade não — nesse caso o
 * lote inteiro é revertido e o chamador decide o que fazer (tipicamente: mostrar o erro e
 * deixar o operador tentar de novo, já que a causa mais provável — período fechado sem
 * período aberto que possa ser criado, ou transação removida — não se resolve sozinha
 * repetindo a mesma chamada sem intervenção). */
export function reclassificarTransacoesEmLote(
  db: Database,
  itens: ItemReclassificacaoLote[],
  opts: OpcoesReclassificacao = {},
): ResultadoReclassificacaoLote {
  if (itens.length === 0) {
    return { sucesso: true, mensagem: "Nada para reclassificar.", processadas: 0, razao_ajustadas: 0 };
  }

  let razao_ajustadas = 0;
  db.run("BEGIN");
  try {
    for (const item of itens) {
      const r = reclassificarTransacao(db, item.transacao_id, item.novo_codigo, opts);
      if (!r.sucesso) {
        throw Object.assign(new Error(r.mensagem), { transacao_id: item.transacao_id });
      }
      if (r.razao_ajustado) razao_ajustadas++;
    }
    db.run("COMMIT");
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    const transacao_id = (erro as { transacao_id?: number })?.transacao_id ?? itens[0].transacao_id;
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    return {
      sucesso: false,
      mensagem: `Lote de reclassificação revertido (nenhuma transação foi alterada): ${mensagemErro}`,
      processadas: 0,
      razao_ajustadas: 0,
      falha: { transacao_id, erro: mensagemErro },
    };
  }

  return {
    sucesso: true,
    mensagem: `${itens.length} transação(ões) reclassificada(s), ${razao_ajustadas} com ajuste no razão.`,
    processadas: itens.length,
    razao_ajustadas,
  };
}

export interface LancamentoHistoricoTransacao {
  id: number;
  periodo_id: number;
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  data_lancamento: string;
  valor_debito: number | null;
  valor_credito: number | null;
  descricao: string;
  origem_modulo: string;
  referencia_documento: string;
  criado_em: string;
  estornado_por_id: number | null;
  motivo_estorno: string | null;
}

/** Toda a trilha de lançamentos de UMA transação no razão, incluindo pernas já
 * estornadas — original (migração) + cada reclassificação que veio depois, na ordem em
 * que aconteceram. É a resposta a "o que mudou" e "quando" para esta transação: quem lê
 * vê a classificação errada original, o estorno dela e a classificação nova, cada uma com
 * data e descrição. Não inclui a perna de caixa por padrão seria ruído (nunca muda) — para
 * incluí-la, filtre a mesma consulta por conta_id = CONTA_CAIXA_ERP à parte.
 *
 * PARA A TELA DE TRANSAÇÕES: é isto que deveria alimentar uma coluna/expansor "histórico
 * de classificação" ao lado da categoria — ver o relatório desta tarefa para a assinatura
 * exata que a tela precisa chamar. */
export function historicoRazaoDaTransacao(db: Database, transacao_id: number): LancamentoHistoricoTransacao[] {
  return consultar<LancamentoHistoricoTransacao>(
    db,
    `SELECT le.id, le.periodo_id, le.conta_id, c.codigo AS conta_codigo, c.descricao AS conta_descricao,
            le.data_lancamento, le.valor_debito, le.valor_credito, le.descricao,
            le.origem_modulo, le.referencia_documento, le.criado_em, le.estornado_por_id, le.motivo_estorno
     FROM ledger_entries le
     JOIN contas_plano_contas c ON c.id = le.conta_id
     WHERE le.conta_id != ?
       AND (
         (le.origem_modulo = 'transacoes' AND le.origem_id = ?)
         OR (le.origem_modulo = 'manual' AND le.referencia_documento LIKE ?)
       )
     ORDER BY le.id ASC`,
    [CONTA_CAIXA_ERP, transacao_id, `TXN-${transacao_id}-RECLASS%`],
  );
}
