/**
 * Relatórios de Contas Pessoais
 * Módulo de contas-pessoais com análise de movimentos, transferências e saldos
 *
 * Relatórios implementados:
 * 1. relatorioMovimentosConta() - Extrato de movimento por conta e período
 * 2. relatorioDepositosSaques() - Resumo de depósitos vs saques
 * 3. relatorioTransferenciasPessoais() - Rastreamento de transferências entre contas
 * 4. relatorioAportesVersusResgates() - Contribuições de capital vs resgates
 * 5. relatorioSaldoPorPessoa() - Saldos atuais consolidados
 * 6. relatorioMudancaSaldoPeriodo() - Comparação período a período
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/**
 * Builder fluente para construir relatórios de contas pessoais
 */
export class RelatorioBuilder {
  private db: Database;
  private entidade_id: number;
  private periodo_id?: number;
  private data_inicio?: string;
  private data_fim?: string;
  private pessoa_id?: number;
  private conta_id?: number;

  constructor(db: Database, entidade_id: number) {
    this.db = db;
    this.entidade_id = entidade_id;
  }

  comPeriodo(periodo_id: number): this {
    this.periodo_id = periodo_id;
    return this;
  }

  comPessoa(pessoa_id: number): this {
    this.pessoa_id = pessoa_id;
    return this;
  }

  comConta(conta_id: number): this {
    this.conta_id = conta_id;
    return this;
  }

  entreDataas(data_inicio: string, data_fim: string): this {
    this.data_inicio = data_inicio;
    this.data_fim = data_fim;
    return this;
  }

  private construirFiltrosSQL(): { query: string; params: (number | string)[] } {
    let query = "WHERE le.entidade_id = ?";
    const params: (number | string)[] = [this.entidade_id];

    if (this.data_inicio && this.data_fim) {
      query += " AND le.data_lancamento BETWEEN ? AND ?";
      params.push(this.data_inicio, this.data_fim);
    } else if (this.periodo_id) {
      query += " AND le.periodo_id = ?";
      params.push(this.periodo_id);
    }

    if (this.conta_id) {
      query += " AND le.conta_id = ?";
      params.push(this.conta_id);
    }

    return { query, params };
  }

  build() {
    return {
      db: this.db,
      entidade_id: this.entidade_id,
      periodo_id: this.periodo_id,
      data_inicio: this.data_inicio,
      data_fim: this.data_fim,
      pessoa_id: this.pessoa_id,
      conta_id: this.conta_id,
      construirFiltrosSQL: () => this.construirFiltrosSQL(),
    };
  }
}

// ============================================================================
// INTERFACES DE RELATÓRIOS
// ============================================================================

export interface LinhaMovimento {
  data: string;
  descricao: string;
  tipo_movimento: "entrada" | "saida" | "transferencia";
  valor: number;
  saldo_corrente: number;
  referencia_documento?: string;
}

export interface RelatorioMovimentos {
  periodo: string;
  conta_id: number;
  conta_descricao: string;
  saldo_inicial: number;
  saldo_final: number;
  total_entradas: number;
  total_saidas: number;
  total_transferencias_saidas: number;
  total_transferencias_entradas: number;
  movimentos: LinhaMovimento[];
}

export interface LinhaDepositoSaque {
  data: string;
  tipo: "deposito" | "saque";
  valor: number;
  conta_descricao: string;
  descricao?: string;
}

export interface RelatorioDepositosSaques {
  periodo: string;
  total_depositos: number;
  total_saques: number;
  quantidade_depositos: number;
  quantidade_saques: number;
  deposito_medio: number;
  saque_medio: number;
  linhas: LinhaDepositoSaque[];
}

export interface LinhaTransferencia {
  data: string;
  conta_origem: string;
  conta_destino: string;
  valor: number;
  descricao?: string;
}

export interface RelatorioTransferencias {
  periodo: string;
  total_transferencias: number;
  quantidade_transferencias: number;
  transferencia_media: number;
  transferencias_saidas: number;
  transferencias_entradas: number;
  linhas: LinhaTransferencia[];
}

export interface AporteResgate {
  data: string;
  tipo: "aporte" | "resgate";
  valor: number;
  conta_descricao: string;
  saldo_pos_operacao: number;
}

export interface RelatorioAportesResgates {
  periodo: string;
  total_aportes: number;
  total_resgates: number;
  quantidade_aportes: number;
  quantidade_resgates: number;
  aporte_liquido: number;
  aporte_medio: number;
  resgate_medio: number;
  registros: AporteResgate[];
}

export interface SaldoPessoa {
  pessoa_nome: string;
  saldos_por_conta: Record<string, number>;
  saldo_total: number;
  quantidade_contas: number;
  data_consulta: string;
}

export interface RelatorioSaldoPorPessoa {
  data_consulta: string;
  total_geral: number;
  quantidade_pessoas: number;
  saldos: SaldoPessoa[];
}

export interface ComparisonPeriodo {
  conta_descricao: string;
  saldo_periodo_anterior: number;
  saldo_periodo_atual: number;
  variacao_absoluta: number;
  variacao_percentual: number;
  entradas_periodo: number;
  saidas_periodo: number;
}

export interface RelatorioCombinacaoPeriodos {
  periodo_anterior: string;
  periodo_atual: string;
  total_variacao_absoluta: number;
  total_variacao_percentual: number;
  contas: ComparisonPeriodo[];
}

// ============================================================================
// RELATÓRIO 1: MOVIMENTOS DA CONTA
// ============================================================================

export function relatorioMovimentosConta(
  db: Database,
  entidade_id: number,
  conta_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioMovimentos {
  // Obter dados da conta
  const [contaData] = consultar<{ id: number; descricao: string }>(
    db,
    `SELECT id, descricao FROM contas_pessoais WHERE id = ? AND entidade_id = ?`,
    [conta_id, entidade_id],
  );

  if (!contaData) {
    throw new Error(`Conta pessoal ${conta_id} não encontrada`);
  }

  // Saldo inicial (antes de data_inicio)
  const [saldoInicialData] = consultar<{ saldo: number }>(
    db,
    `SELECT COALESCE(SUM(
      CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END
    ), 0) as saldo
     FROM movimentos_pessoais
     WHERE conta_pessoal_id = ? AND entidade_id = ? AND data_movimento < ?`,
    [conta_id, entidade_id, data_inicio],
  );

  const saldo_inicial = (saldoInicialData?.saldo || 0) + (contaData?.id || 0);

  // Movimentos no período
  const movimentos = consultar<{
    data_movimento: string;
    descricao: string;
    tipo_movimento: "entrada" | "saida" | "transferencia";
    valor: number;
    referencia_documento?: string;
  }>(
    db,
    `SELECT data_movimento, descricao, tipo_movimento, valor, referencia_documento
     FROM movimentos_pessoais
     WHERE conta_pessoal_id = ? AND entidade_id = ? AND data_movimento BETWEEN ? AND ?
     ORDER BY data_movimento ASC`,
    [conta_id, entidade_id, data_inicio, data_fim],
  );

  // Calcular saldos correntes e totalizadores
  let saldo_corrente = saldo_inicial;
  let total_entradas = 0;
  let total_saidas = 0;
  let total_transferencias_saidas = 0;
  let total_transferencias_entradas = 0;

  const movimentosComSaldo: LinhaMovimento[] = movimentos.map((m) => {
    if (m.tipo_movimento === "entrada") {
      total_entradas += m.valor;
      // Código morto removido: dentro deste ramo, tipo_movimento já é "entrada" —
      // "entrada" e "transferencia" são valores mutuamente exclusivos do mesmo campo
      // (não uma combinação de flags), então esta comparação nunca podia ser
      // verdadeira e total_transferencias_entradas nunca era incrementado aqui.
      // Suspeita de bug de design mais profundo (não corrigido: mudaria o valor
      // observável do relatório sem uma forma clara e verificável de saber a direção
      // de uma "transferencia" a partir só do tipo_movimento) — ver relatório da tarefa.
      saldo_corrente += m.valor;
    } else {
      total_saidas += m.valor;
      if (m.tipo_movimento === "transferencia") total_transferencias_saidas += m.valor;
      saldo_corrente -= m.valor;
    }

    return {
      data: m.data_movimento,
      descricao: m.descricao,
      tipo_movimento: m.tipo_movimento,
      valor: m.valor,
      saldo_corrente,
      referencia_documento: m.referencia_documento,
    };
  });

  const saldo_final = saldo_corrente;

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    conta_id,
    conta_descricao: contaData.descricao,
    saldo_inicial,
    saldo_final,
    total_entradas,
    total_saidas,
    total_transferencias_saidas,
    total_transferencias_entradas,
    movimentos: movimentosComSaldo,
  };
}

// ============================================================================
// RELATÓRIO 2: DEPÓSITOS E SAQUES
// ============================================================================

export function relatorioDepositosSaques(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioDepositosSaques {
  const linhas = consultar<{
    data_movimento: string;
    tipo_movimento: "entrada" | "saida";
    valor: number;
    descricao: string;
    conta_descricao: string;
  }>(
    db,
    `SELECT mp.data_movimento, mp.tipo_movimento, mp.valor, mp.descricao, cp.descricao as conta_descricao
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp ON mp.conta_pessoal_id = cp.id
     WHERE mp.entidade_id = ? AND mp.tipo_movimento IN ('entrada', 'saida')
       AND mp.data_movimento BETWEEN ? AND ?
     ORDER BY mp.data_movimento ASC`,
    [entidade_id, data_inicio, data_fim],
  );

  let total_depositos = 0;
  let total_saques = 0;
  let quantidade_depositos = 0;
  let quantidade_saques = 0;

  const linhasFormatadas: LinhaDepositoSaque[] = linhas.map((linha) => {
    const tipo = linha.tipo_movimento === "entrada" ? "deposito" : "saque";
    if (tipo === "deposito") {
      total_depositos += linha.valor;
      quantidade_depositos++;
    } else {
      total_saques += linha.valor;
      quantidade_saques++;
    }

    return {
      data: linha.data_movimento,
      tipo,
      valor: linha.valor,
      conta_descricao: linha.conta_descricao,
      descricao: linha.descricao,
    };
  });

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    total_depositos,
    total_saques,
    quantidade_depositos,
    quantidade_saques,
    deposito_medio: quantidade_depositos > 0 ? total_depositos / quantidade_depositos : 0,
    saque_medio: quantidade_saques > 0 ? total_saques / quantidade_saques : 0,
    linhas: linhasFormatadas,
  };
}

// ============================================================================
// RELATÓRIO 3: TRANSFERÊNCIAS PESSOAIS
// ============================================================================

export function relatorioTransferenciasPessoais(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioTransferencias {
  const transferencias = consultar<{
    data_movimento: string;
    conta_origem: string;
    conta_destino: string;
    valor: number;
    descricao?: string;
  }>(
    db,
    `SELECT
       mp.data_movimento,
       cp_orig.descricao as conta_origem,
       cp_dest.descricao as conta_destino,
       mp.valor,
       mp.descricao
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp_orig ON mp.conta_pessoal_id = cp_orig.id
     LEFT JOIN contas_pessoais cp_dest ON mp.referencia_documento LIKE '%' || cp_dest.id || '%'
     WHERE mp.entidade_id = ? AND mp.tipo_movimento = 'transferencia'
       AND mp.data_movimento BETWEEN ? AND ?
     ORDER BY mp.data_movimento ASC`,
    [entidade_id, data_inicio, data_fim],
  );

  let total_transferencias = 0;
  let transferencias_saidas = 0;
  let transferencias_entradas = 0;

  const linhasFormatadas: LinhaTransferencia[] = transferencias.map((t) => {
    total_transferencias += t.valor;
    // Assume primeira metade é saída, segunda é entrada
    if (transferencias.indexOf(t) % 2 === 0) {
      transferencias_saidas++;
    } else {
      transferencias_entradas++;
    }

    return {
      data: t.data_movimento,
      conta_origem: t.conta_origem,
      conta_destino: t.conta_destino || "Desconhecido",
      valor: t.valor,
      descricao: t.descricao,
    };
  });

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    total_transferencias,
    quantidade_transferencias: transferencias.length,
    transferencia_media:
      transferencias.length > 0 ? total_transferencias / transferencias.length : 0,
    transferencias_saidas,
    transferencias_entradas,
    linhas: linhasFormatadas,
  };
}

// ============================================================================
// RELATÓRIO 4: APORTES VERSUS RESGATES
// ============================================================================

export function relatorioAportesVersusResgates(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioAportesResgates {
  const operacoes = consultar<{
    data_movimento: string;
    categoria: string;
    valor: number;
    conta_descricao: string;
    saldo_pos_operacao?: number;
  }>(
    db,
    `SELECT mp.data_movimento, mp.categoria, mp.valor, cp.descricao as conta_descricao
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp ON mp.conta_pessoal_id = cp.id
     WHERE mp.entidade_id = ? AND mp.categoria IN ('aporte', 'resgate')
       AND mp.data_movimento BETWEEN ? AND ?
     ORDER BY mp.data_movimento ASC`,
    [entidade_id, data_inicio, data_fim],
  );

  let total_aportes = 0;
  let total_resgates = 0;
  let quantidade_aportes = 0;
  let quantidade_resgates = 0;

  const registros: AporteResgate[] = operacoes.map((op) => {
    const tipo = op.categoria === "aporte" ? "aporte" : "resgate";
    if (tipo === "aporte") {
      total_aportes += op.valor;
      quantidade_aportes++;
    } else {
      total_resgates += op.valor;
      quantidade_resgates++;
    }

    return {
      data: op.data_movimento,
      tipo,
      valor: op.valor,
      conta_descricao: op.conta_descricao,
      saldo_pos_operacao: op.saldo_pos_operacao || 0,
    };
  });

  const aporte_liquido = total_aportes - total_resgates;

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    total_aportes,
    total_resgates,
    quantidade_aportes,
    quantidade_resgates,
    aporte_liquido,
    aporte_medio: quantidade_aportes > 0 ? total_aportes / quantidade_aportes : 0,
    resgate_medio: quantidade_resgates > 0 ? total_resgates / quantidade_resgates : 0,
    registros,
  };
}

// ============================================================================
// RELATÓRIO 5: SALDO POR PESSOA
// ============================================================================

export function relatorioSaldoPorPessoa(
  db: Database,
  entidade_id: number,
): RelatorioSaldoPorPessoa {
  const pessoas = consultar<{ id: number; nome: string }>(
    db,
    `SELECT DISTINCT id, nome FROM pessoas WHERE entidade_id = ? ORDER BY nome ASC`,
    [entidade_id],
  );

  const saldos: SaldoPessoa[] = [];
  let total_geral = 0;

  pessoas.forEach((pessoa) => {
    const contas = consultar<{ id: number; descricao: string }>(
      db,
      `SELECT id, descricao FROM contas_pessoais WHERE entidade_id = ? AND pessoa_id = ?`,
      [entidade_id, pessoa.id],
    );

    const saldos_por_conta: Record<string, number> = {};
    let saldo_pessoa = 0;

    contas.forEach((conta) => {
      const [saldoData] = consultar<{ saldo: number }>(
        db,
        `SELECT COALESCE(SUM(
          CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END
        ), 0) as saldo
         FROM movimentos_pessoais
         WHERE conta_pessoal_id = ? AND entidade_id = ?`,
        [conta.id, entidade_id],
      );

      const saldo = saldoData?.saldo || 0;
      saldos_por_conta[conta.descricao] = saldo;
      saldo_pessoa += saldo;
    });

    total_geral += saldo_pessoa;

    saldos.push({
      pessoa_nome: pessoa.nome,
      saldos_por_conta,
      saldo_total: saldo_pessoa,
      quantidade_contas: contas.length,
      data_consulta: new Date().toISOString().split("T")[0],
    });
  });

  return {
    data_consulta: new Date().toISOString().split("T")[0],
    total_geral,
    quantidade_pessoas: pessoas.length,
    saldos,
  };
}

// ============================================================================
// RELATÓRIO 6: MUDANÇA DE SALDO POR PERÍODO
// ============================================================================

export function relatorioMudancaSaldoPeriodo(
  db: Database,
  entidade_id: number,
  periodo_anterior_id: number,
  periodo_atual_id: number,
): RelatorioCombinacaoPeriodos {
  // Obter períodos
  const [periodoAnterior] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_anterior_id],
  );

  const [periodoAtual] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_atual_id],
  );

  if (!periodoAnterior || !periodoAtual) {
    throw new Error("Um ou ambos os períodos não foram encontrados");
  }

  // Obter todas as contas
  const contas = consultar<{ id: number; descricao: string }>(
    db,
    `SELECT id, descricao FROM contas_pessoais WHERE entidade_id = ? ORDER BY descricao ASC`,
    [entidade_id],
  );

  const comparacoes: ComparisonPeriodo[] = contas.map((conta) => {
    // Saldo período anterior
    const [saldoAntData] = consultar<{ saldo: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END
      ), 0) as saldo
       FROM movimentos_pessoais
       WHERE conta_pessoal_id = ? AND entidade_id = ? AND periodo_id = ?`,
      [conta.id, entidade_id, periodo_anterior_id],
    );

    // Saldo período atual
    const [saldoAtualData] = consultar<{ saldo: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END
      ), 0) as saldo
       FROM movimentos_pessoais
       WHERE conta_pessoal_id = ? AND entidade_id = ? AND periodo_id = ?`,
      [conta.id, entidade_id, periodo_atual_id],
    );

    const saldo_anterior = saldoAntData?.saldo || 0;
    const saldo_atual = saldoAtualData?.saldo || 0;
    const variacao_absoluta = saldo_atual - saldo_anterior;
    const variacao_percentual =
      saldo_anterior !== 0 ? (variacao_absoluta / Math.abs(saldo_anterior)) * 100 : 0;

    // Entradas e saídas do período atual
    const [movimentosData] = consultar<{
      entradas: number;
      saidas: number;
    }>(
      db,
      `SELECT
        COALESCE(SUM(CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE 0 END), 0) as entradas,
        COALESCE(SUM(CASE WHEN tipo_movimento = 'saida' THEN valor ELSE 0 END), 0) as saidas
       FROM movimentos_pessoais
       WHERE conta_pessoal_id = ? AND entidade_id = ? AND periodo_id = ?`,
      [conta.id, entidade_id, periodo_atual_id],
    );

    return {
      conta_descricao: conta.descricao,
      saldo_periodo_anterior: saldo_anterior,
      saldo_periodo_atual: saldo_atual,
      variacao_absoluta,
      variacao_percentual: Math.round(variacao_percentual * 100) / 100,
      entradas_periodo: movimentosData?.entradas || 0,
      saidas_periodo: movimentosData?.saidas || 0,
    };
  });

  // Totalizadores
  const total_variacao_absoluta = comparacoes.reduce((sum, c) => sum + c.variacao_absoluta, 0);
  const total_variacao_percentual =
    comparacoes.length > 0
      ? comparacoes.reduce((sum, c) => sum + c.variacao_percentual, 0) / comparacoes.length
      : 0;

  return {
    periodo_anterior: `${periodoAnterior.mes}/${periodoAnterior.ano}`,
    periodo_atual: `${periodoAtual.mes}/${periodoAtual.ano}`,
    total_variacao_absoluta,
    total_variacao_percentual: Math.round(total_variacao_percentual * 100) / 100,
    contas: comparacoes,
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES DE FORMATAÇÃO
// ============================================================================

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

export function formatarPercentual(valor: number): string {
  return `${(Math.round(valor * 100) / 100).toFixed(2)}%`;
}

// ============================================================================
// FUNÇÃO CONSOLIDADORA
// ============================================================================

export interface RelatorioConsolidadoContasPessoais {
  movimentos: RelatorioMovimentos;
  depositos_saques: RelatorioDepositosSaques;
  transferencias: RelatorioTransferencias;
  aportes_resgates: RelatorioAportesResgates;
  saldos_pessoas: RelatorioSaldoPorPessoa;
  mudanca_periodos?: RelatorioCombinacaoPeriodos;
}

export function gerarRelatorioConsolidado(
  db: Database,
  entidade_id: number,
  conta_id: number,
  data_inicio: string,
  data_fim: string,
  periodo_anterior_id?: number,
  periodo_atual_id?: number,
): RelatorioConsolidadoContasPessoais {
  const movimentos = relatorioMovimentosConta(db, entidade_id, conta_id, data_inicio, data_fim);
  const depositos_saques = relatorioDepositosSaques(db, entidade_id, data_inicio, data_fim);
  const transferencias = relatorioTransferenciasPessoais(db, entidade_id, data_inicio, data_fim);
  const aportes_resgates = relatorioAportesVersusResgates(db, entidade_id, data_inicio, data_fim);
  const saldos_pessoas = relatorioSaldoPorPessoa(db, entidade_id);

  let mudanca_periodos: RelatorioCombinacaoPeriodos | undefined;
  if (periodo_anterior_id && periodo_atual_id) {
    mudanca_periodos = relatorioMudancaSaldoPeriodo(
      db,
      entidade_id,
      periodo_anterior_id,
      periodo_atual_id,
    );
  }

  return {
    movimentos,
    depositos_saques,
    transferencias,
    aportes_resgates,
    saldos_pessoas,
    mudanca_periodos,
  };
}
