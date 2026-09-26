/** Contas a pagar: obrigação de pagar um fornecedor, com vencimento, antes de ter sido
 * paga (baixada) — o padrão de "aging de contas a pagar" que qualquer ERP de referência
 * (Oracle, Xero, AppFolio) cobre.
 *
 * `documentos` (src/domain/documentos/documentos.ts) já carrega quem cobra e quanto
 * (`valor`, `data_documento`, `cnpj_cpf_contraparte`, `nome_contraparte`,
 * `plano_conta_codigo`) — um boleto ou fatura já tem os dados de cobrança. O que faltava
 * era exatamente `data_vencimento` e um status de pagamento: é isso que esta tabela
 * acrescenta, sem duplicar o que o documento já sabe (`registrarContaAPagar` herda do
 * documento quando o campo não é informado explicitamente).
 *
 * A BAIXA (pagamento) NUNCA é uma tabela paralela desconectada do razão. Ela reusa
 * exatamente a mesma rota que uma transação bancária importada usaria: insere uma linha
 * em `transacoes` (a saída de caixa, na conta bancária escolhida — é isso que faz aquela
 * conta específica perder saldo, já que o saldo por conta bancária é
 * `SUM(valor) FROM transacoes WHERE conta_id = ...`, ver conciliacao.ts) e lança as duas
 * pernas no razão com `registrarLancamentoContabil` (débito na despesa mapeada, crédito
 * em caixa), com `origem_modulo = 'transacoes'` e `referencia_documento = 'TXN-<id>'` —
 * o MESMO formato que `migracao-ledger.ts` usa para uma transação vinda de extrato. Por
 * isso a baixa não introduz nenhum valor novo de `origem_modulo`: aos olhos do razão e de
 * uma sincronização futura (`sincronizarRazao`), esta é só mais uma transação bancária de
 * saída, já migrada — `migrarTransacoesParaLedger` a reconhece pelo id em
 * `ja_no_razao` e nunca a relança, então não há risco de o mesmo pagamento entrar em
 * dobro no razão quando o extrato real do banco for importado e conciliado depois.
 *
 * `status` na tabela só grava o que é FATO: 'pendente', 'paga' ou 'cancelada'.
 * 'atrasada' nunca é gravado — é CALCULADO em tempo de consulta comparando
 * `data_vencimento` com a data de referência (hoje, por padrão), no mesmo espírito de
 * `rateios.base_incompleta`: nunca congelar um dado que muda sozinho com o calendário.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "../erp/ledger";
import { CONTA_CAIXA_ERP, contaContrapartida } from "../erp/mapeamentoPlanoApp";

/** Status calculado (nunca gravado como 'atrasada' — ver calcularStatus()). */
export type StatusContaAPagar = "pendente" | "paga" | "atrasada" | "cancelada";

/** Status efetivamente gravado na coluna `status` — subconjunto de StatusContaAPagar. */
export type StatusGravadoContaAPagar = "pendente" | "paga" | "cancelada";

export interface ContaAPagar {
  id: number;
  entidade_id: number;
  documento_id: number | null;
  fornecedor_nome: string;
  fornecedor_cnpj_cpf: string | null;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: StatusGravadoContaAPagar;
  plano_conta_codigo: string | null;
  imovel_id: number | null;
  ledger_entry_id_baixa: number | null;
  criado_em: string;
}

export interface ContaAPagarComStatusCalculado extends ContaAPagar {
  /** 'atrasada' aparece só aqui, nunca na coluna do banco — ver comentário do arquivo. */
  status_calculado: StatusContaAPagar;
  /** Dias entre a data de referência e o vencimento, só quando positivo (atrasada); 0 caso
   * contrário (a vencer, paga ou cancelada). */
  dias_atraso: number;
}

export interface NovaContaAPagar {
  entidade_id: number;
  /** Obrigação já ligada a um documento (boleto, fatura) existente — quando presente,
   * fornecedor/valor/plano_conta_codigo abaixo só precisam ser informados se forem
   * DIFERENTES do que o documento já tem (ver registrarContaAPagar). */
  documento_id?: number;
  fornecedor_nome?: string;
  fornecedor_cnpj_cpf?: string;
  descricao?: string;
  valor?: number;
  data_vencimento: string;
  plano_conta_codigo?: string;
  imovel_id?: number;
}

export interface ResultadoContaAPagar {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

export interface ResultadoBaixaContaAPagar extends ResultadoContaAPagar {
  transacao_id?: number;
  ledger_entry_id_baixa?: number;
}

function obterContaAPagarBruta(db: Database, id: number): ContaAPagar | null {
  return consultar<ContaAPagar>(db, "SELECT * FROM contas_a_pagar WHERE id = ?", [id])[0] ?? null;
}

/** A mesma conta, com status calculado — para quem só precisa ler uma obrigação (ex: a
 * tela de baixa, antes de confirmar). */
export function obterContaAPagar(
  db: Database,
  id: number,
  data_referencia?: string,
): ContaAPagarComStatusCalculado | null {
  const conta = obterContaAPagarBruta(db, id);
  if (!conta) return null;
  return calcularStatus(conta, data_referencia ?? hoje());
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Registra uma nova obrigação de pagar. Se `documento_id` for informado, herda
 * valor/fornecedor/CNPJ-CPF/plano_conta_codigo do documento para os campos que NÃO
 * vieram explicitamente em `dados` — nunca sobrescreve o que foi informado, só preenche o
 * que faltou, evitando redigitar algo que o documento já tem. */
export function registrarContaAPagar(db: Database, dados: NovaContaAPagar): ResultadoContaAPagar {
  let fornecedor_nome = dados.fornecedor_nome?.trim() || undefined;
  let fornecedor_cnpj_cpf = dados.fornecedor_cnpj_cpf?.trim() || undefined;
  let valor = dados.valor;
  let plano_conta_codigo = dados.plano_conta_codigo || undefined;

  if (dados.documento_id !== undefined) {
    const [documento] = consultar<{
      valor: number | null;
      nome_contraparte: string | null;
      cnpj_cpf_contraparte: string | null;
      plano_conta_codigo: string | null;
    }>(
      db,
      "SELECT valor, nome_contraparte, cnpj_cpf_contraparte, plano_conta_codigo FROM documentos WHERE id = ?",
      [dados.documento_id],
    );
    if (!documento) {
      return { sucesso: false, mensagem: `Documento ${dados.documento_id} não encontrado.` };
    }
    if (valor === undefined && documento.valor != null) valor = documento.valor;
    if (!fornecedor_nome && documento.nome_contraparte) fornecedor_nome = documento.nome_contraparte;
    if (!fornecedor_cnpj_cpf && documento.cnpj_cpf_contraparte) {
      fornecedor_cnpj_cpf = documento.cnpj_cpf_contraparte;
    }
    if (!plano_conta_codigo && documento.plano_conta_codigo) plano_conta_codigo = documento.plano_conta_codigo;
  }

  if (!fornecedor_nome) {
    return {
      sucesso: false,
      mensagem: "Informe o nome do fornecedor (ou um documento com contraparte identificada).",
    };
  }
  if (valor === undefined || valor === null || !(valor > 0)) {
    return { sucesso: false, mensagem: "Informe um valor positivo (ou um documento com valor extraído)." };
  }
  if (!dados.data_vencimento) {
    return { sucesso: false, mensagem: "Informe a data de vencimento." };
  }

  executar(
    db,
    `INSERT INTO contas_a_pagar (
      entidade_id, documento_id, fornecedor_nome, fornecedor_cnpj_cpf, descricao,
      valor, data_vencimento, status, plano_conta_codigo, imovel_id, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
    [
      dados.entidade_id,
      dados.documento_id ?? null,
      fornecedor_nome,
      fornecedor_cnpj_cpf ?? null,
      dados.descricao ?? null,
      valor,
      dados.data_vencimento,
      plano_conta_codigo ?? null,
      dados.imovel_id ?? null,
      hoje(),
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Conta a pagar registrada.", id };
}

/** Período contábil (entidade, ano/mês da data informada), criando-o aberto se ainda não
 * existir — mesmo padrão de `resolverPeriodo()` em migracao-ledger.ts. Não valida se está
 * aberto: quem chama (`registrarLancamentoContabil`, via `assegurarPeriodoAberto`) já
 * recusa com uma mensagem clara se estiver fechado. */
function resolverPeriodoParaData(db: Database, entidade_id: number, data: string): { id: number; status: string } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!partes) throw new Error(`Data de pagamento inválida: "${data}".`);
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);

  const buscar = () =>
    consultar<{ id: number; status: string }>(
      db,
      "SELECT id, status FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
      [entidade_id, ano, mes],
    )[0];

  let periodo = buscar();
  if (!periodo) {
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [
      entidade_id,
      ano,
      mes,
    ]);
    periodo = buscar();
  }
  if (!periodo) throw new Error(`Não foi possível abrir o período contábil ${mes}/${ano}.`);
  return periodo;
}

/** Marca a conta como paga e gera o lançamento real no razão: uma saída de caixa na
 * conta bancária escolhida (débito na despesa mapeada, crédito em caixa), pela mesma rota
 * que uma transação bancária importada usaria — ver comentário do arquivo. Recusa baixa
 * dupla (conta já paga) e baixa de conta cancelada. Atômico: se qualquer passo falhar,
 * nada é persistido (nem a transação bancária, nem os lançamentos, nem a atualização de
 * status). */
export function baixarContaAPagar(
  db: Database,
  conta_a_pagar_id: number,
  conta_bancaria_id: number,
  data_pagamento: string,
  usuario_id?: number,
): ResultadoBaixaContaAPagar {
  const conta = obterContaAPagarBruta(db, conta_a_pagar_id);
  if (!conta) {
    return { sucesso: false, mensagem: `Conta a pagar ${conta_a_pagar_id} não encontrada.` };
  }
  if (conta.status === "cancelada") {
    return { sucesso: false, mensagem: "Conta a pagar já cancelada — não pode ser baixada." };
  }
  if (conta.status === "paga" || conta.data_pagamento) {
    return { sucesso: false, mensagem: "Conta a pagar já está paga — baixa duplicada recusada." };
  }
  if (!data_pagamento) {
    return { sucesso: false, mensagem: "Informe a data de pagamento." };
  }
  const [bancaria] = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [
    conta_bancaria_id,
  ]);
  if (!bancaria) {
    return { sucesso: false, mensagem: `Conta bancária ${conta_bancaria_id} não encontrada.` };
  }

  const montante = conta.valor;
  const descricao = `Baixa de contas a pagar #${conta.id} — ${conta.fornecedor_nome}`;

  db.run("BEGIN");
  try {
    // 1) A saída de caixa na conta bancária escolhida — é isso que faz ESTA conta
    //    (SUM(valor) FROM transacoes WHERE conta_id = conta_bancaria_id) perder saldo,
    //    já que o razão (CONTA_CAIXA_ERP) é compartilhado entre todas as contas
    //    bancárias cadastradas (ver mapeamentoPlanoApp.ts e conciliacao.ts).
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo, categorizado_por, revisado)
       VALUES (?, ?, ?, ?, ?, 'manual', 1)`,
      [conta_bancaria_id, data_pagamento, -montante, descricao, conta.plano_conta_codigo],
    );
    const [{ id: transacao_id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

    const periodo = resolverPeriodoParaData(db, conta.entidade_id, data_pagamento);
    const contrapartida = contaContrapartida(conta.plano_conta_codigo);
    const referencia_documento = `TXN-${transacao_id}`;

    // 2) As duas pernas no razão — mesma convenção de débito/crédito que
    //    migracao-ledger.ts usa para uma saída (crédito em caixa, débito na
    //    contrapartida), com origem_modulo='transacoes' para que uma sincronização
    //    futura reconheça esta transação como já migrada e nunca a relance.
    registrarLancamentoContabil(db, {
      entidade_id: conta.entidade_id,
      periodo_id: periodo.id,
      conta_id: CONTA_CAIXA_ERP,
      data_lancamento: data_pagamento,
      valor_credito: montante,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });
    const ledger_entry_id_baixa = registrarLancamentoContabil(db, {
      entidade_id: conta.entidade_id,
      periodo_id: periodo.id,
      conta_id: contrapartida.conta_id,
      data_lancamento: data_pagamento,
      valor_debito: montante,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });

    executar(db, "UPDATE contas_a_pagar SET status = 'paga', data_pagamento = ?, ledger_entry_id_baixa = ? WHERE id = ?", [
      data_pagamento,
      ledger_entry_id_baixa,
      conta.id,
    ]);

    db.run("COMMIT");
    return {
      sucesso: true,
      mensagem: `Conta a pagar #${conta.id} baixada — lançamento #${ledger_entry_id_baixa} no razão.`,
      id: conta.id,
      transacao_id,
      ledger_entry_id_baixa,
    };
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    return {
      sucesso: false,
      mensagem: `Não foi possível baixar a conta a pagar: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/** Cancela uma obrigação ainda não paga — nunca uma já baixada (contabilidade não se
 * apaga: uma conta paga só pode ser corrigida por estorno do lançamento, fora do escopo
 * deste módulo). Cancelar uma conta já cancelada é idempotente (sucesso, sem duplicar o
 * motivo). */
export function cancelarContaAPagar(db: Database, conta_a_pagar_id: number, motivo: string): ResultadoContaAPagar {
  const conta = obterContaAPagarBruta(db, conta_a_pagar_id);
  if (!conta) {
    return { sucesso: false, mensagem: `Conta a pagar ${conta_a_pagar_id} não encontrada.` };
  }
  if (conta.status === "paga" || conta.data_pagamento) {
    return { sucesso: false, mensagem: "Conta a pagar já paga — não pode ser cancelada." };
  }
  if (conta.status === "cancelada") {
    return { sucesso: true, mensagem: "Conta a pagar já estava cancelada.", id: conta.id };
  }
  if (!motivo || !motivo.trim()) {
    return { sucesso: false, mensagem: "Informe o motivo do cancelamento." };
  }

  const descricaoAtual = conta.descricao ? `${conta.descricao} ` : "";
  executar(db, "UPDATE contas_a_pagar SET status = 'cancelada', descricao = ? WHERE id = ?", [
    `${descricaoAtual}[CANCELADA: ${motivo.trim()}]`,
    conta.id,
  ]);
  return { sucesso: true, mensagem: "Conta a pagar cancelada.", id: conta.id };
}

/** Dias entre `dataReferencia` e `dataAlvo` (positivo quando a referência é POSTERIOR ao
 * alvo, isto é, o alvo já passou). */
function diasEntre(dataReferencia: string, dataAlvo: string): number {
  const a = new Date(`${dataReferencia}T00:00:00Z`).getTime();
  const b = new Date(`${dataAlvo}T00:00:00Z`).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function calcularStatus(conta: ContaAPagar, dataReferencia: string): ContaAPagarComStatusCalculado {
  if (conta.status === "paga" || conta.status === "cancelada") {
    return { ...conta, status_calculado: conta.status, dias_atraso: 0 };
  }
  const atraso = diasEntre(dataReferencia, conta.data_vencimento);
  if (atraso > 0) {
    return { ...conta, status_calculado: "atrasada", dias_atraso: atraso };
  }
  return { ...conta, status_calculado: "pendente", dias_atraso: 0 };
}

export interface FiltrosContasAPagar {
  /** Filtra pelo status CALCULADO (inclui 'atrasada', que nunca está gravado). */
  status?: StatusContaAPagar;
  /** Substring no nome do fornecedor, case-insensitive (LIKE do SQLite já é
   * case-insensitive para ASCII). */
  fornecedor?: string;
  imovel_id?: number;
  /** Data usada para calcular atraso — default hoje. Fixá-la é o que torna
   * gerarRelatorioAging()/listarContasAPagar() determinísticos em teste. */
  data_referencia?: string;
}

/** Lista as contas a pagar de uma entidade, com status calculado (pendente/atrasada/
 * paga/cancelada) — 'atrasada' é sempre derivado nesta consulta, nunca lido de uma
 * coluna. */
export function listarContasAPagar(
  db: Database,
  entidade_id: number,
  filtros: FiltrosContasAPagar = {},
): ContaAPagarComStatusCalculado[] {
  const dataReferencia = filtros.data_referencia ?? hoje();

  let sql = "SELECT * FROM contas_a_pagar WHERE entidade_id = ?";
  const params: (string | number)[] = [entidade_id];
  if (filtros.imovel_id !== undefined) {
    sql += " AND imovel_id = ?";
    params.push(filtros.imovel_id);
  }
  if (filtros.fornecedor) {
    sql += " AND fornecedor_nome LIKE ?";
    params.push(`%${filtros.fornecedor}%`);
  }
  sql += " ORDER BY data_vencimento ASC, id ASC";

  const comStatus = consultar<ContaAPagar>(db, sql, params).map((c) => calcularStatus(c, dataReferencia));
  if (filtros.status) return comStatus.filter((c) => c.status_calculado === filtros.status);
  return comStatus;
}

export type FaixaAging = "a_vencer" | "0-30" | "31-60" | "61-90" | "90+";

export interface ItemAging extends ContaAPagar {
  dias_atraso: number;
}

export interface GrupoAging {
  faixa: FaixaAging;
  total: number;
  itens: ItemAging[];
}

export interface RelatorioAging {
  data_referencia: string;
  faixas: GrupoAging[];
  total_geral: number;
}

const FAIXAS_ORDEM: FaixaAging[] = ["a_vencer", "0-30", "31-60", "61-90", "90+"];

function faixaDoAtraso(atraso: number): FaixaAging {
  if (atraso < 0) return "a_vencer";
  if (atraso <= 30) return "0-30";
  if (atraso <= 60) return "31-60";
  if (atraso <= 90) return "61-90";
  return "90+";
}

/** Aging report clássico: agrupa as contas PENDENTES (nem pagas, nem canceladas) em
 * faixas de atraso a partir de `data_referencia` (padrão: hoje), com total e lista de
 * itens por faixa — o relatório que Oracle/Xero/AppFolio chamam de "AP aging". */
export function gerarRelatorioAging(db: Database, entidade_id: number, data_referencia?: string): RelatorioAging {
  const dataRef = data_referencia ?? hoje();

  const pendentes = consultar<ContaAPagar>(
    db,
    "SELECT * FROM contas_a_pagar WHERE entidade_id = ? AND status = 'pendente' ORDER BY data_vencimento ASC, id ASC",
    [entidade_id],
  );

  const porFaixa = new Map<FaixaAging, ItemAging[]>(FAIXAS_ORDEM.map((f) => [f, []]));
  for (const conta of pendentes) {
    const atraso = diasEntre(dataRef, conta.data_vencimento);
    porFaixa.get(faixaDoAtraso(atraso))!.push({ ...conta, dias_atraso: Math.max(atraso, 0) });
  }

  const faixas = FAIXAS_ORDEM.map((faixa) => {
    const itens = porFaixa.get(faixa)!;
    return { faixa, total: itens.reduce((soma, item) => soma + item.valor, 0), itens };
  });

  return {
    data_referencia: dataRef,
    faixas,
    total_geral: faixas.reduce((soma, f) => soma + f.total, 0),
  };
}
