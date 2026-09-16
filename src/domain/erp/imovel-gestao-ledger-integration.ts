/**
 * Integração: Imovel Gestão → Ledger
 * Sincroniza despesas operacionais (condominiais, manutenção, etc.) e receitas de aluguel
 * para lançamentos contábeis no ledger centralizado
 *
 * Fluxo de Despesas:
 * DespesaOperacional (imovel-gestao)
 *   → registrarDespesaImovelNoLedger()
 *   → registrarLancamentoContabil() (origem_modulo = 'imovel-gestao')
 *   → Rastreamento por imovel_id e tipo_despesa
 *
 * Fluxo de Receitas (Aluguel):
 * ReceitaAluguel (imovel-gestao)
 *   → registrarReceitaAluguelNoLedger()
 *   → registrarLancamentoContabil() (origem_modulo = 'imovel-gestao')
 *   → Dupla entrada: Caixa (débito) + Receita de Aluguel (crédito)
 *
 * Fluxo de Consolidação:
 * sincronizarMovimentosImoveisParaLedger()
 *   → Processa por período com validação
 *   → Agrupa por imovel_id e tipo_despesa
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import { assegurarPeriodoAberto } from "./ledger-period-validation";
import { createHash } from "crypto";

export interface SincronizacaoImovelsLedger {
  id: number;
  imovel_id: number;
  tipo_movimento: "despesa" | "receita" | "arrecadacao";
  subtipo: string;
  ledger_entry_id?: number;
  ledger_entry_id_contrapartida?: number;
  origem_modulo: "imovel-gestao";
  status: "sucesso" | "erro" | "duplicado";
  hash_provenance: string;
  mensagem_erro?: string;
  criado_em: string;
  tentativas: number;
}

export interface MapeamentoImoveLedger {
  tipo_despesa: string;
  conta_id_debito: number;
  conta_id_credito: number;
  centro_custo_id?: number;
  descricao_padrao: string;
}

export interface SaldoImovePeriodo {
  imovel_id: number;
  tipo_despesa: string;
  total_debito: number;
  total_credito: number;
  saldo_liquido: number;
}

export interface RelatorioImoveisLedger {
  periodo: string;
  total_imoveis: number;
  total_despesas: number;
  total_receitas: number;
  total_arrecadacoes: number;
  saldos_por_imovel: Array<{
    imovel_id: number;
    endereco: string;
    despesas_por_tipo: Array<{
      tipo_despesa: string;
      valor_total: number;
      quantidade_lancamentos: number;
    }>;
    receitas_aluguel: number;
    arrecadacoes: number;
    saldo_liquido: number;
  }>;
}

/**
 * Mapeamento de tipos de despesa para contas contábeis
 * Segue o plano de contas conforme especificado nas deliverables
 */
const MAPEAMENTO_DESPESAS_IMOVEIS: Record<string, MapeamentoImoveLedger> = {
  condominio: {
    tipo_despesa: "condominio",
    conta_id_debito: 5210, // 5.2.10 - Despesa com Condomínio
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com taxas condominiais",
  },
  agua: {
    tipo_despesa: "agua",
    conta_id_debito: 5207, // 5.2.07 - Despesa com Água
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com água",
  },
  energia: {
    tipo_despesa: "energia",
    conta_id_debito: 5206, // 5.2.06 - Despesa com Energia
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com energia elétrica",
  },
  internet: {
    tipo_despesa: "internet",
    conta_id_debito: 5212, // 5.2.12 - Despesa com Internet/Telecomunicações
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com internet",
  },
  seguros: {
    tipo_despesa: "seguros",
    conta_id_debito: 5213, // 5.2.13 - Despesa com Seguros
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com seguros imobiliários",
  },
  manutencao: {
    tipo_despesa: "manutencao",
    conta_id_debito: 5205, // 5.2.05 - Despesa com Manutenção
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com manutenção",
  },
  reforma: {
    tipo_despesa: "reforma",
    conta_id_debito: 1205, // 1.2.05 - Imóveis (Ativo Imobilizado)
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Despesa com reforma/melhorias em imóvel",
  },
  outro: {
    tipo_despesa: "outro",
    conta_id_debito: 5214, // 5.2.14 - Outras Despesas com Imóveis
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Outras despesas com imóvel",
  },
};

/**
 * Mapeamento de receitas de aluguel
 */
const MAPEAMENTO_RECEITAS_ALUGUEL: Record<string, MapeamentoImoveLedger> = {
  entrada: {
    tipo_despesa: "aluguel_entrada",
    conta_id_debito: 1101, // 1.1.01 - Caixa
    conta_id_credito: 4101, // 4.1.01 - Receita de Aluguel
    descricao_padrao: "Recebimento de aluguel",
  },
  despesa_alocada: {
    tipo_despesa: "aluguel_despesa",
    conta_id_debito: 5105, // 5.1.05 - Aluguel (despesa alocada)
    conta_id_credito: 4101, // 4.1.01 - Receita de Aluguel
    descricao_padrao: "Aluguel como despesa alocada",
  },
};

/**
 * Mapeamento de arrecadação de taxa condominial
 */
const MAPEAMENTO_ARRECADACAO_TAXA: MapeamentoImoveLedger = {
  tipo_despesa: "arrecadacao_taxa",
  conta_id_debito: 1101, // 1.1.01 - Caixa
  conta_id_credito: 3102, // 3.1.02 - Contas a Pagar (reversa)
  descricao_padrao: "Arrecadação de taxa condominial",
};

/**
 * Gerar hash SHA-256 para rastreamento de provenance
 * Impede processamento duplicado da mesma despesa
 */
function gerarHashProvenance(
  imovelId: number,
  tipoDespesa: string,
  valor: number,
  dataLancamento: string
): string {
  const dados = `IMOVEL_DESPESA|${imovelId}|${tipoDespesa}|${valor}|${dataLancamento}`;
  return createHash("sha256").update(dados).digest("hex");
}

/**
 * Gerar hash para receita de aluguel
 */
function gerarHashProvenanceReceita(
  imovelId: number,
  tipoReceita: string,
  valor: number,
  mesReferencia: string
): string {
  const dados = `IMOVEL_RECEITA|${imovelId}|${tipoReceita}|${valor}|${mesReferencia}`;
  return createHash("sha256").update(dados).digest("hex");
}

/**
 * Obter mapeamento de despesa para ledger
 */
export function obterMapeamentoDespesa(
  tipoDespesa: string
): MapeamentoImoveLedger | null {
  return MAPEAMENTO_DESPESAS_IMOVEIS[tipoDespesa] || null;
}

/**
 * Registrar sincronização com sucesso
 */
function registrarSincronizacaoImoveLSucesso(
  db: Database,
  imovelId: number,
  tipoMovimento: "despesa" | "receita" | "arrecadacao",
  subtipo: string,
  lancamentoId: number,
  lancamentoContrapartidaId?: number,
  hashProvenance?: string
): number {
  executar(
    db,
    `INSERT INTO sincronizacoes_imovel_ledger (
      imovel_id, tipo_movimento, subtipo, ledger_entry_id,
      ledger_entry_id_contrapartida, origem_modulo, status,
      hash_provenance, tentativas, criado_em
    ) VALUES (?, ?, ?, ?, ?, 'imovel-gestao', 'sucesso', ?, 1, datetime('now'))`,
    [
      imovelId,
      tipoMovimento,
      subtipo,
      lancamentoId,
      lancamentoContrapartidaId || null,
      hashProvenance || "",
    ]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );
  return result?.id || 0;
}

/**
 * Registrar sincronização com erro
 */
function registrarSincronizacaoImoveLErro(
  db: Database,
  imovelId: number,
  tipoMovimento: "despesa" | "receita" | "arrecadacao",
  subtipo: string,
  status: "erro" | "duplicado",
  mensagemErro: string,
  tentativa: number
): number {
  executar(
    db,
    `INSERT INTO sincronizacoes_imovel_ledger (
      imovel_id, tipo_movimento, subtipo, origem_modulo, status,
      mensagem_erro, tentativas, criado_em
    ) VALUES (?, ?, ?, 'imovel-gestao', ?, ?, ?, datetime('now'))`,
    [imovelId, tipoMovimento, subtipo, status, mensagemErro, tentativa]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );
  return result?.id || 0;
}

/**
 * Validar dados de despesa operacional para ledger
 */
export function validarDespesaParaLedger(despesa: any): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!despesa.imovel_id || despesa.imovel_id <= 0) {
    erros.push("imovel_id obrigatório e deve ser positivo");
  }

  if (despesa.valor_mensal <= 0) {
    erros.push("valor_mensal deve ser positivo");
  }

  if (despesa.data_lancamento && !/^\d{4}-\d{2}-\d{2}$/.test(despesa.data_lancamento)) {
    erros.push("data_lancamento deve estar no formato YYYY-MM-DD");
  }

  if (
    ![
      "condominio",
      "agua",
      "energia",
      "internet",
      "seguros",
      "manutencao",
      "reforma",
      "outro",
    ].includes(despesa.tipo_despesa)
  ) {
    erros.push("tipo_despesa inválido");
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Registrar despesa operacional de imóvel no ledger com dupla entrada
 * Retorna ID do lançamento contábil ou null se falha
 */
export function registrarDespesaImovelNoLedger(
  db: Database,
  despesaId: number,
  despesa: {
    imovel_id: number;
    entidade_id: number;
    periodo_id: number;
    data_lancamento: string;
    tipo_despesa: string;
    valor_mensal: number;
    descricao: string;
    referencia_documento?: string;
  },
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar período aberto
    assegurarPeriodoAberto(db, despesa.periodo_id);

    // 2. Validar dados
    const validacao = validarDespesaParaLedger(despesa);
    if (!validacao.valido) {
      registrarSincronizacaoImoveLErro(
        db,
        despesa.imovel_id,
        "despesa",
        despesa.tipo_despesa,
        "erro",
        validacao.erros.join("; "),
        tentativa
      );
      return null;
    }

    // 3. Obter mapeamento
    const mapeamento = obterMapeamentoDespesa(despesa.tipo_despesa);
    if (!mapeamento) {
      registrarSincronizacaoImoveLErro(
        db,
        despesa.imovel_id,
        "despesa",
        despesa.tipo_despesa,
        "erro",
        "Mapeamento de despesa não encontrado",
        tentativa
      );
      return null;
    }

    // 4. Verificar duplicação via hash de provenance
    const hashProvenance = gerarHashProvenance(
      despesa.imovel_id,
      despesa.tipo_despesa,
      despesa.valor_mensal,
      despesa.data_lancamento
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_imovel_ledger
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoImoveLErro(
        db,
        despesa.imovel_id,
        "despesa",
        despesa.tipo_despesa,
        "duplicado",
        `Despesa já sincronizada: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 5. Registrar lançamento contábil (débito na conta de despesa)
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: despesa.entidade_id,
      periodo_id: despesa.periodo_id,
      centro_custo_id: mapeamento.centro_custo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: despesa.data_lancamento,
      valor_debito: despesa.valor_mensal,
      descricao: `${mapeamento.descricao_padrao} - Imóvel ${despesa.imovel_id}: ${despesa.descricao}`,
      origem_modulo: "imovel-gestao",
      origem_id: despesa.imovel_id,
      referencia_documento: despesa.referencia_documento || `IMOVEL_${despesa.imovel_id}_${despesa.tipo_despesa}`,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de débito");
    }

    // 6. Registrar crédito na conta de passivo (Contas a Pagar)
    const lancamentoCredito = registrarLancamentoContabil(db, {
      entidade_id: despesa.entidade_id,
      periodo_id: despesa.periodo_id,
      centro_custo_id: mapeamento.centro_custo_id,
      conta_id: mapeamento.conta_id_credito,
      data_lancamento: despesa.data_lancamento,
      valor_credito: despesa.valor_mensal,
      descricao: `${mapeamento.descricao_padrao} a pagar - Imóvel ${despesa.imovel_id}`,
      origem_modulo: "imovel-gestao",
      origem_id: despesa.imovel_id,
      referencia_documento: despesa.referencia_documento || `IMOVEL_${despesa.imovel_id}_${despesa.tipo_despesa}`,
    });

    if (lancamentoCredito <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de crédito");
    }

    // 7. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoImoveLSucesso(
      db,
      despesa.imovel_id,
      "despesa",
      despesa.tipo_despesa,
      lancamentoId,
      lancamentoCredito,
      hashProvenance
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoImoveLErro(
      db,
      despesa.imovel_id,
      "despesa",
      despesa.tipo_despesa,
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Registrar receita de aluguel no ledger com dupla entrada
 */
export function registrarReceitaAluguelNoLedger(
  db: Database,
  receitaId: number,
  receita: {
    imovel_id: number;
    entidade_id: number;
    periodo_id: number;
    data_lancamento: string;
    mes_referencia: string; // YYYY-MM
    valor_aluguel: number;
    inquilino_nome?: string;
    referencia_documento?: string;
  },
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar período aberto
    assegurarPeriodoAberto(db, receita.periodo_id);

    // 2. Validar dados
    if (receita.imovel_id <= 0) {
      throw new Error("imovel_id inválido");
    }
    if (receita.valor_aluguel <= 0) {
      throw new Error("valor_aluguel deve ser positivo");
    }

    // 3. Obter mapeamento
    const mapeamento = MAPEAMENTO_RECEITAS_ALUGUEL["entrada"];

    // 4. Verificar duplicação via hash
    const hashProvenance = gerarHashProvenanceReceita(
      receita.imovel_id,
      "aluguel",
      receita.valor_aluguel,
      receita.mes_referencia
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_imovel_ledger
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoImoveLErro(
        db,
        receita.imovel_id,
        "receita",
        "aluguel",
        "duplicado",
        `Receita já sincronizada: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 5. Registrar débito em Caixa
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: receita.entidade_id,
      periodo_id: receita.periodo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: receita.data_lancamento,
      valor_debito: receita.valor_aluguel,
      descricao: `${mapeamento.descricao_padrao} - Imóvel ${receita.imovel_id}${
        receita.inquilino_nome ? ` - ${receita.inquilino_nome}` : ""
      } (${receita.mes_referencia})`,
      origem_modulo: "imovel-gestao",
      origem_id: receita.imovel_id,
      referencia_documento:
        receita.referencia_documento ||
        `ALUGUEL_${receita.imovel_id}_${receita.mes_referencia}`,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de débito");
    }

    // 6. Registrar crédito em Receita de Aluguel
    const lancamentoCredito = registrarLancamentoContabil(db, {
      entidade_id: receita.entidade_id,
      periodo_id: receita.periodo_id,
      conta_id: mapeamento.conta_id_credito,
      data_lancamento: receita.data_lancamento,
      valor_credito: receita.valor_aluguel,
      descricao: `Receita de aluguel - Imóvel ${receita.imovel_id}${
        receita.inquilino_nome ? ` - ${receita.inquilino_nome}` : ""
      } (${receita.mes_referencia})`,
      origem_modulo: "imovel-gestao",
      origem_id: receita.imovel_id,
      referencia_documento:
        receita.referencia_documento ||
        `ALUGUEL_${receita.imovel_id}_${receita.mes_referencia}`,
    });

    if (lancamentoCredito <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de crédito");
    }

    // 7. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoImoveLSucesso(
      db,
      receita.imovel_id,
      "receita",
      "aluguel",
      lancamentoId,
      lancamentoCredito,
      hashProvenance
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoImoveLErro(
      db,
      receita.imovel_id,
      "receita",
      "aluguel",
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Registrar arrecadação de taxa condominial
 */
export function registrarArrecadacaoTaxaNoLedger(
  db: Database,
  arrecadacaoId: number,
  arrecadacao: {
    imovel_id: number;
    entidade_id: number;
    periodo_id: number;
    data_lancamento: string;
    valor_taxa: number;
    descricao: string;
    referencia_documento?: string;
  },
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar período aberto
    assegurarPeriodoAberto(db, arrecadacao.periodo_id);

    // 2. Validar dados
    if (arrecadacao.imovel_id <= 0) {
      throw new Error("imovel_id inválido");
    }
    if (arrecadacao.valor_taxa <= 0) {
      throw new Error("valor_taxa deve ser positivo");
    }

    const mapeamento = MAPEAMENTO_ARRECADACAO_TAXA;

    // 3. Registrar débito em Caixa
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: arrecadacao.entidade_id,
      periodo_id: arrecadacao.periodo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: arrecadacao.data_lancamento,
      valor_debito: arrecadacao.valor_taxa,
      descricao: `${mapeamento.descricao_padrao} - Imóvel ${arrecadacao.imovel_id}: ${arrecadacao.descricao}`,
      origem_modulo: "imovel-gestao",
      origem_id: arrecadacao.imovel_id,
      referencia_documento:
        arrecadacao.referencia_documento ||
        `TAXA_${arrecadacao.imovel_id}`,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar débito de arrecadação");
    }

    // 4. Registrar crédito em Contas a Pagar (reversa)
    const lancamentoCredito = registrarLancamentoContabil(db, {
      entidade_id: arrecadacao.entidade_id,
      periodo_id: arrecadacao.periodo_id,
      conta_id: mapeamento.conta_id_credito,
      data_lancamento: arrecadacao.data_lancamento,
      valor_credito: arrecadacao.valor_taxa,
      descricao: `Arrecadação de taxa - Imóvel ${arrecadacao.imovel_id}`,
      origem_modulo: "imovel-gestao",
      origem_id: arrecadacao.imovel_id,
      referencia_documento:
        arrecadacao.referencia_documento ||
        `TAXA_${arrecadacao.imovel_id}`,
    });

    if (lancamentoCredito <= 0) {
      throw new Error("Falha ao registrar crédito de arrecadação");
    }

    // 5. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoImoveLSucesso(
      db,
      arrecadacao.imovel_id,
      "arrecadacao",
      "taxa_condominial",
      lancamentoId,
      lancamentoCredito
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoImoveLErro(
      db,
      arrecadacao.imovel_id,
      "arrecadacao",
      "taxa_condominial",
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Obter saldo de imóvel por período e tipo de despesa
 */
export function obterSaldoImoveisParaLedger(
  db: Database,
  periodoId: number,
  imovelId?: number
): SaldoImovePeriodo[] {
  try {
    let query = `
      SELECT
        le.origem_id as imovel_id,
        CASE
          WHEN le.conta_id = ? THEN 'condominio'
          WHEN le.conta_id = ? THEN 'agua'
          WHEN le.conta_id = ? THEN 'energia'
          WHEN le.conta_id = ? THEN 'internet'
          WHEN le.conta_id = ? THEN 'seguros'
          WHEN le.conta_id = ? THEN 'manutencao'
          WHEN le.conta_id = ? THEN 'reforma'
          WHEN le.conta_id = ? THEN 'receita_aluguel'
          ELSE 'outro'
        END as tipo_despesa,
        COALESCE(SUM(le.valor_debito), 0) as total_debito,
        COALESCE(SUM(le.valor_credito), 0) as total_credito,
        COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as saldo_liquido
      FROM ledger_entries le
      WHERE le.periodo_id = ? AND le.origem_modulo = 'imovel-gestao'
    `;

    const params: any[] = [5210, 5207, 5206, 5212, 5213, 5205, 1205, 4101, periodoId];

    if (imovelId) {
      query += ` AND le.origem_id = ?`;
      params.push(imovelId);
    }

    query += ` GROUP BY le.origem_id, tipo_despesa ORDER BY le.origem_id, tipo_despesa`;

    const [saldos] = consultar<SaldoImovePeriodo>(db, query, params);
    return saldos || [];
  } catch (erro) {
    console.error("Erro ao obter saldos:", erro);
    return [];
  }
}

/**
 * Sincronizar movimentos de imóveis para ledger em lote
 * Com validação de período aberto
 */
export function sincronizarMovimentosImoveisParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: number,
  limiteEntries: number = 100
): { processados: number; sucessos: number; falhas: number } {
  try {
    // 1. Validar período aberto
    assegurarPeriodoAberto(db, periodoId);

    // 2. Obter despesas operacionais não sincronizadas
    const [despesasData] = consultar<{
      id: number;
      imovel_id: number;
      data_lancamento: string;
      tipo_despesa: string;
      descricao: string;
      valor_mensal: number;
      tentativas: number;
    }>(
      db,
      `SELECT d.id, d.imovel_id, date(datetime('now')) as data_lancamento,
              d.tipo_despesa, d.descricao, d.valor_mensal, COALESCE(s.tentativas, 0) as tentativas
       FROM despesas_operacionais_agendadas d
       LEFT JOIN sincronizacoes_imovel_ledger s
         ON s.imovel_id = d.imovel_id AND s.subtipo = d.tipo_despesa
       WHERE d.entidade_id = ? AND d.status = 'ativa' AND s.id IS NULL
         AND COALESCE(s.tentativas, 0) < 3
       ORDER BY d.imovel_id, d.tipo_despesa ASC
       LIMIT ?`,
      [entidadeId, limiteEntries]
    );

    const despesas = despesasData || [];

    let sucessos = 0;
    let falhas = 0;

    if (despesas && despesas.length > 0) {
      despesas.forEach((despesa) => {
        try {
          const resultado = registrarDespesaImovelNoLedger(
            db,
            despesa.id,
            {
              imovel_id: despesa.imovel_id,
              entidade_id: entidadeId,
              periodo_id: periodoId,
              data_lancamento: despesa.data_lancamento,
              tipo_despesa: despesa.tipo_despesa,
              valor_mensal: despesa.valor_mensal,
              descricao: despesa.descricao,
            },
            despesa.tentativas + 1
          );

          if (resultado) {
            sucessos++;
          } else {
            falhas++;
          }
        } catch (erro) {
          console.error(
            `Erro ao sincronizar despesa ${despesa.id}:`,
            erro
          );
          falhas++;
        }
      });
    }

    return {
      processados: despesas?.length || 0,
      sucessos,
      falhas,
    };
  } catch (erro) {
    console.error("Erro ao sincronizar movimentos de imóveis:", erro);
    return { processados: 0, sucessos: 0, falhas: 0 };
  }
}

/**
 * Gerar relatório de imóveis para ledger
 * Consolidado por imóvel e tipo de despesa/receita
 */
export function gerarRelatorioImoveisParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: string
): RelatorioImoveisLedger | null {
  try {
    // 1. Obter período
    const [periodo] = consultar<{ id: number; mes: string; ano: number }>(
      db,
      `SELECT id, mes, ano FROM periodos_contabeis WHERE id = ?`,
      [periodoId]
    );

    if (!periodo) {
      return null;
    }

    // 2. Obter imóveis da entidade
    const [imoveisData] = consultar<{
      id: number;
      endereco: string;
    }>(
      db,
      `SELECT id, endereco FROM imoveis WHERE entidade_id = ? ORDER BY id`,
      [entidadeId]
    );

    const imoveis = imoveisData || [];
    if (imoveis.length === 0) {
      return {
        periodo: `${periodo.mes}/${periodo.ano}`,
        total_imoveis: 0,
        total_despesas: 0,
        total_receitas: 0,
        total_arrecadacoes: 0,
        saldos_por_imovel: [],
      };
    }

    // 3. Calcular saldos por imóvel
    let totalDespesas = 0;
    let totalReceitas = 0;
    let totalArrecadacoes = 0;

    const saldos_por_imovel = imoveis.map((imovel) => {
      // Obter despesas do imóvel
      const [despesasData] = consultar<{
        tipo_despesa: string;
        valor_total: number;
        quantidade: number;
      }>(
        db,
        `SELECT
          CASE
            WHEN le.conta_id = 5210 THEN 'condominio'
            WHEN le.conta_id = 5207 THEN 'agua'
            WHEN le.conta_id = 5206 THEN 'energia'
            WHEN le.conta_id = 5212 THEN 'internet'
            WHEN le.conta_id = 5213 THEN 'seguros'
            WHEN le.conta_id = 5205 THEN 'manutencao'
            WHEN le.conta_id = 1205 THEN 'reforma'
            ELSE 'outro'
          END as tipo_despesa,
          SUM(COALESCE(le.valor_debito, 0)) as valor_total,
          COUNT(*) as quantidade
         FROM ledger_entries le
         WHERE le.periodo_id = ? AND le.origem_modulo = 'imovel-gestao'
           AND le.origem_id = ?
         GROUP BY tipo_despesa
         ORDER BY tipo_despesa`,
        [periodoId, imovel.id]
      );

      const despesas_por_tipo =
        despesasData?.map((d) => ({
          tipo_despesa: d.tipo_despesa,
          valor_total: d.valor_total,
          quantidade_lancamentos: d.quantidade,
        })) || [];

      // Obter receitas de aluguel
      const [receitasData] = consultar<{ valor_total: number }>(
        db,
        `SELECT SUM(COALESCE(le.valor_credito, 0)) as valor_total
         FROM ledger_entries le
         WHERE le.periodo_id = ? AND le.origem_modulo = 'imovel-gestao'
           AND le.origem_id = ? AND le.conta_id = 4101`,
        [periodoId, imovel.id]
      );

      const receitas_aluguel = receitasData[0]?.valor_total || 0;

      // Obter arrecadações
      const [arrecadadoesData] = consultar<{ valor_total: number }>(
        db,
        `SELECT SUM(COALESCE(le.valor_debito, 0)) as valor_total
         FROM ledger_entries le
         WHERE le.periodo_id = ? AND le.origem_modulo = 'imovel-gestao'
           AND le.origem_id = ? AND le.conta_id = 1101
           AND le.descricao LIKE '%Arrecadação%'`,
        [periodoId, imovel.id]
      );

      const arrecadacoes = arrecadadoesData[0]?.valor_total || 0;

      // Calcular total de despesas e saldo líquido
      const totalDespesasImovel = despesas_por_tipo.reduce(
        (sum, d) => sum + d.valor_total,
        0
      );
      const saldoLiquido = receitas_aluguel - totalDespesasImovel + arrecadacoes;

      totalDespesas += totalDespesasImovel;
      totalReceitas += receitas_aluguel;
      totalArrecadacoes += arrecadacoes;

      return {
        imovel_id: imovel.id,
        endereco: imovel.endereco,
        despesas_por_tipo,
        receitas_aluguel,
        arrecadacoes,
        saldo_liquido: saldoLiquido,
      };
    });

    return {
      periodo: `${periodo.mes}/${periodo.ano}`,
      total_imoveis: imoveis.length,
      total_despesas: totalDespesas,
      total_receitas: totalReceitas,
      total_arrecadacoes: totalArrecadacoes,
      saldos_por_imovel,
    };
  } catch (erro) {
    console.error("Erro ao gerar relatório de imóveis:", erro);
    return null;
  }
}
