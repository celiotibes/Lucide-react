/**
 * Ledger Integrado: Núcleo contábil com auditoria e período fechável
 * Todas as 7 integrações alimentam este ledger centralizado
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import crypto from "crypto";
import {
  assegurarPeriodoAberto,
  obterDescricaoPeriodo,
} from "./ledger-period-validation";

export interface LancamentoContabil {
  entidade_id: number;
  periodo_id: number;
  centro_custo_id?: number;
  conta_id: number;
  data_lancamento: string;
  valor_debito?: number;
  valor_credito?: number;
  descricao: string;
  origem_modulo: 'transacoes' | 'contratos' | 'patrimonio' | 'caucao' | 'financiamento' | 'rateios' | 'vistorias' | 'advocacia' | 'contas-pessoais' | 'imovel-gestao' | 'apontamento-prestador' | 'pagamentos-integracao' | 'skillos' | 'manual';
  origem_id: number;
  referencia_documento: string;
  criado_por?: number;
}

export interface BalancetePeriodo {
  periodo: string;
  data_fechamento?: string;
  saldos: Array<{
    conta_codigo: string;
    conta_descricao: string;
    saldo_anterior: number;
    total_debito: number;
    total_credito: number;
    saldo_final: number;
  }>;
  total_debito_periodo: number;
  total_credito_periodo: number;
  balanceado: boolean;
}

/** Registrar lançamento no ledger integrado */
export function registrarLancamentoContabil(
  db: Database,
  lancamento: LancamentoContabil,
): number {
  // VALIDAÇÃO 1: Verificar se período está aberto
  // Deve ser feito ANTES de qualquer INSERT para evitar duplicação
  assegurarPeriodoAberto(db, lancamento.periodo_id);

  if (!lancamento.valor_debito && !lancamento.valor_credito) {
    throw new Error("Lançamento deve ter débito ou crédito");
  }

  if (lancamento.valor_debito && lancamento.valor_credito) {
    throw new Error("Lançamento não pode ter débito E crédito simultaneamente");
  }

  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, centro_custo_id, conta_id,
      data_lancamento, valor_debito, valor_credito,
      descricao, origem_modulo, origem_id, referencia_documento,
      criado_por, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      lancamento.entidade_id,
      lancamento.periodo_id,
      lancamento.centro_custo_id || null,
      lancamento.conta_id,
      lancamento.data_lancamento,
      lancamento.valor_debito || null,
      lancamento.valor_credito || null,
      lancamento.descricao,
      lancamento.origem_modulo,
      lancamento.origem_id,
      lancamento.referencia_documento,
      lancamento.criado_por || null,
    ],
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    [],
  );

  return result?.id || 0;
}

/** Obter saldo de uma conta em um período */
export function obterSaldoConta(
  db: Database,
  periodo_id: number,
  conta_id: number,
): number {
  const [saldo] = consultar<{ total_debito: number; total_credito: number }>(
    db,
    `SELECT
      COALESCE(SUM(CASE WHEN valor_debito IS NOT NULL THEN valor_debito ELSE 0 END), 0) as total_debito,
      COALESCE(SUM(CASE WHEN valor_credito IS NOT NULL THEN valor_credito ELSE 0 END), 0) as total_credito
     FROM ledger_entries
     WHERE periodo_id = ? AND conta_id = ?`,
    [periodo_id, conta_id],
  );

  if (!saldo) return 0;

  // Determinar natureza da conta (débito ou crédito)
  const [conta] = consultar<{ natureza: string }>(
    db,
    "SELECT natureza FROM contas_plano_contas WHERE id = ?",
    [conta_id],
  );

  const natureza = conta?.natureza || "debito";
  const saldo_bruto =
    (saldo.total_debito || 0) - (saldo.total_credito || 0);

  return natureza === "debito" ? saldo_bruto : -saldo_bruto;
}

/** Gerar balancete completo de um período */
export function gerarBalancete(
  db: Database,
  periodo_id: number,
): BalancetePeriodo {
  const [periodo] = consultar<{ ano: number; mes: number; status: string; data_fechamento: string }>(
    db,
    "SELECT ano, mes, status, data_fechamento FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  const saldos = consultar<{
    id: number;
    codigo: string;
    descricao: string;
    total_debito: number;
    total_credito: number;
  }>(
    db,
    `SELECT
      c.id,
      c.codigo,
      c.descricao,
      COALESCE(SUM(CASE WHEN l.valor_debito IS NOT NULL THEN l.valor_debito ELSE 0 END), 0) as total_debito,
      COALESCE(SUM(CASE WHEN l.valor_credito IS NOT NULL THEN l.valor_credito ELSE 0 END), 0) as total_credito
     FROM contas_plano_contas c
     LEFT JOIN ledger_entries l ON c.id = l.conta_id AND l.periodo_id = ?
     WHERE c.analisavel = 1 AND c.ativo = 1
     GROUP BY c.id
     ORDER BY c.codigo`,
    [periodo_id],
  );

  let total_debito = 0;
  let total_credito = 0;

  const saldos_processados = saldos.map((s) => {
    const debito = s.total_debito || 0;
    const credito = s.total_credito || 0;
    total_debito += debito;
    total_credito += credito;

    return {
      conta_codigo: s.codigo,
      conta_descricao: s.descricao,
      saldo_anterior: 0, // Implementar saldo_anterior de ledger_saldos_periodo
      total_debito: debito,
      total_credito: credito,
      saldo_final: debito - credito,
    };
  });

  return {
    periodo: `${periodo?.ano}/${String(periodo?.mes || 1).padStart(2, "0")}`,
    data_fechamento: periodo?.data_fechamento,
    saldos: saldos_processados,
    total_debito_periodo: total_debito,
    total_credito_periodo: total_credito,
    balanceado: Math.abs(total_debito - total_credito) < 0.01, // Margem de arredondamento
  };
}

/** Validar integridade do ledger (débitos = créditos) */
export function validarBalanceamento(
  db: Database,
  periodo_id: number,
): { balanceado: boolean; diferenca: number } {
  const [totais] = consultar<{ total_debito: number; total_credito: number }>(
    db,
    `SELECT
      COALESCE(SUM(valor_debito), 0) as total_debito,
      COALESCE(SUM(valor_credito), 0) as total_credito
     FROM ledger_entries
     WHERE periodo_id = ?`,
    [periodo_id],
  );

  const diferenca = Math.abs(
    (totais?.total_debito || 0) - (totais?.total_credito || 0),
  );

  return {
    balanceado: diferenca < 0.01,
    diferenca,
  };
}

/** Encerrar um período contábil (período fechado, não pode ser alterado) */
export function encerrarPeriodo(
  db: Database,
  periodo_id: number,
  encerrado_por: number,
  motivo: string,
): { sucesso: boolean; mensagem: string } {
  // 1. Validar que o período está aberto
  const [periodo] = consultar<{ status: string }>(
    db,
    "SELECT status FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodo) {
    return { sucesso: false, mensagem: "Período não encontrado" };
  }

  if (periodo.status !== "aberto") {
    return { sucesso: false, mensagem: "Período já está fechado" };
  }

  // 2. Validar balanceamento
  const balancete = validarBalanceamento(db, periodo_id);
  if (!balancete.balanceado) {
    return {
      sucesso: false,
      mensagem: `Ledger desbalanceado. Diferença: R$ ${balancete.diferenca.toFixed(2)}`,
    };
  }

  // 3. Gerar snapshot dos saldos finais
  const balancete_completo = gerarBalancete(db, periodo_id);

  // 4. Hash dos saldos (para detectar manipulação pós-fechamento)
  const snapshot = JSON.stringify(balancete_completo.saldos);
  const hash_snapshot = crypto
    .createHash("sha256")
    .update(snapshot)
    .digest("hex");

  // 5. Registrar no histórico de encerramentos
  executar(
    db,
    `INSERT INTO ledger_encerramentos (
      periodo_id, encerrado_por, balancete_OK,
      total_debito, total_credito, hash_snapshot, observacoes,
      data_encerramento
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      periodo_id,
      encerrado_por,
      1, // balancete OK
      balancete_completo.total_debito_periodo,
      balancete_completo.total_credito_periodo,
      hash_snapshot,
      motivo,
    ],
  );

  // 6. Fechar o período
  executar(
    db,
    `UPDATE periodos_contabeis
     SET status = 'fechado', data_fechamento = datetime('now'),
         encerrado_por = ?
     WHERE id = ?`,
    [encerrado_por, periodo_id],
  );

  // 7. Criar cache de saldos para próximo período
  criarSaldosProximoPeriodo(db, periodo_id);

  return { sucesso: true, mensagem: "Período encerrado com sucesso" };
}

/** Criar saldos iniciais (saldo_anterior) do próximo período */
function criarSaldosProximoPeriodo(
  db: Database,
  periodo_id: number,
): void {
  // Obter info do período fechado
  const [periodo] = consultar<{ entidade_id: number; ano: number; mes: number }>(
    db,
    "SELECT entidade_id, ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodo) return;

  // Calcular próximo período
  let proximo_mes = (periodo.mes || 1) + 1;
  let proximo_ano = periodo.ano;
  if (proximo_mes > 12) {
    proximo_mes = 1;
    proximo_ano += 1;
  }

  // Verificar se próximo período já existe; caso contrário, criar
  let [proximo_periodo] = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis
     WHERE entidade_id = ? AND ano = ? AND mes = ?`,
    [periodo.entidade_id, proximo_ano, proximo_mes],
  );

  if (!proximo_periodo) {
    executar(
      db,
      `INSERT INTO periodos_contabeis (entidade_id, ano, mes, status)
       VALUES (?, ?, ?, 'aberto')`,
      [periodo.entidade_id, proximo_ano, proximo_mes],
    );

    [proximo_periodo] = consultar<{ id: number }>(
      db,
      `SELECT id FROM periodos_contabeis
       WHERE entidade_id = ? AND ano = ? AND mes = ?`,
      [periodo.entidade_id, proximo_ano, proximo_mes],
    );
  }

  if (!proximo_periodo) return;

  // Inserir saldos finais do período anterior como saldo_anterior do próximo
  const contas = consultar<{ id: number; saldo_final: number }>(
    db,
    `SELECT conta_id as id,
            COALESCE(SUM(valor_debito), 0) - COALESCE(SUM(valor_credito), 0) as saldo_final
     FROM ledger_entries
     WHERE periodo_id = ?
     GROUP BY conta_id`,
    [periodo_id],
  );

  contas.forEach((conta) => {
    executar(
      db,
      `INSERT OR REPLACE INTO ledger_saldos_periodo
       (periodo_id, conta_id, saldo_anterior, total_debito, total_credito, saldo_final)
       VALUES (?, ?, ?, 0, 0, ?)`,
      [proximo_periodo.id, conta.id, conta.saldo_final, conta.saldo_final],
    );
  });
}

/** Registrar estorno de lançamento (lançamento reverso com trilha de auditoria) */
export function estornarLancamento(
  db: Database,
  lancamento_id: number,
  motivo_estorno: string,
  estornado_por: number,
): boolean {
  // Obter lançamento original
  const [original] = consultar<{
    valor_debito: number;
    valor_credito: number;
  }>(
    db,
    "SELECT valor_debito, valor_credito FROM ledger_entries WHERE id = ?",
    [lancamento_id],
  );

  if (!original) return false;

  // Marcar original como estornado
  executar(
    db,
    `UPDATE ledger_entries
     SET estornado_por_id = ?, motivo_estorno = ?
     WHERE id = ?`,
    [lancamento_id, motivo_estorno, lancamento_id],
  );

  // Criar lançamento reverso (débito ↔ crédito invertido)
  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, conta_id, data_lancamento,
      valor_debito, valor_credito, descricao, origem_modulo,
      origem_id, referencia_documento, criado_por, criado_em
    ) SELECT
      entidade_id, periodo_id, conta_id, datetime('now'),
      valor_credito, valor_debito,
      'ESTORNO: ' || descricao,
      origem_modulo,
      origem_id,
      referencia_documento || '-EST',
      ?, datetime('now')
     FROM ledger_entries WHERE id = ?`,
    [estornado_por, lancamento_id],
  );

  return true;
}

/** Auditoria: aprovar lançamentos para finalizar processamento contábil */
export function aprovarLancamentos(
  db: Database,
  lancamento_ids: number[],
  auditado_por: number,
): number {
  let aprovados = 0;

  lancamento_ids.forEach((id) => {
    executar(
      db,
      `UPDATE ledger_entries
       SET auditada = 1, auditado_em = datetime('now'), auditado_por = ?
       WHERE id = ?`,
      [auditado_por, id],
    );
    aprovados++;
  });

  return aprovados;
}

/** Interface para retificação contábil (valor anterior → valor novo) */
export interface RetificacaoContabil {
  apontamento_id?: number;
  retificacao_id?: number;
  conta_id: number;
  valor_anterior: number;
  valor_novo: number;
  entidade_id: number;
  periodo_id: number;
  data_lancamento: string;
  origem_modulo:
    | "transacoes"
    | "contratos"
    | "patrimonio"
    | "caucao"
    | "financiamento"
    | "rateios"
    | "vistorias"
    | "apontamento-prestador"
    | "manual";
  motivo_retificacao: string;
  retificada_por: number;
}

/**
 * Registrar retificação com mecanismo de reversão (sem duplicação)
 *
 * Fluxo:
 * 1. Se valor_anterior > 0: cria lançamento REVERSO (inverte débito ↔ crédito)
 * 2. Registra novo lançamento com valor_novo
 * 3. Mapeia ambos no rastreamento (retificacao_ledger_mapping)
 *
 * Resultado: débito original REVERSADO + novo lançamento = valor final correto
 * (não duplicado, sim corrigido)
 */
export function registrarRetificacao(
  db: Database,
  retificacao: RetificacaoContabil,
): { sucesso: boolean; ledger_reverso_id?: number; ledger_novo_id?: number; mensagem: string } {
  try {
    // VALIDAÇÃO: Período deve estar aberto
    assegurarPeriodoAberto(db, retificacao.periodo_id);

    // PASSO 1: Se havia valor anterior, reverter o lançamento original
    let ledger_reverso_id: number | undefined;

    if (retificacao.valor_anterior > 0) {
      // Encontrar lançamento original
      const [original] = consultar<{
        id: number;
        valor_debito: number;
        valor_credito: number;
      }>(
        db,
        `SELECT id, valor_debito, valor_credito FROM ledger_entries
         WHERE conta_id = ? AND periodo_id = ? AND (valor_debito = ? OR valor_credito = ?)
         ORDER BY id DESC LIMIT 1`,
        [
          retificacao.conta_id,
          retificacao.periodo_id,
          retificacao.valor_anterior,
          retificacao.valor_anterior,
        ]
      );

      // PASSO 1a: Criar lançamento reverso (inverte débito ↔ crédito)
      const lancamento_reverso: LancamentoContabil = {
        entidade_id: retificacao.entidade_id,
        periodo_id: retificacao.periodo_id,
        conta_id: retificacao.conta_id,
        data_lancamento: retificacao.data_lancamento,
        // Inverter: se original era débito, reverso é crédito
        valor_debito: original?.valor_credito || undefined,
        valor_credito: original?.valor_debito || undefined,
        descricao: `RETIFICAÇÃO REVERSO: ${retificacao.motivo_retificacao}`,
        origem_modulo: retificacao.origem_modulo,
        origem_id: retificacao.retificacao_id || retificacao.apontamento_id || 0,
        referencia_documento: `RETIF-${retificacao.retificacao_id || "MANUAL"}-REV`,
        criado_por: retificacao.retificada_por,
      };

      // Registrar sem validação (já validamos período acima)
      ledger_reverso_id = registrarLancamentoSemValidacao(
        db,
        lancamento_reverso
      );
    }

    // PASSO 2: Registrar novo lançamento com valor correto
    const lancamento_novo: LancamentoContabil = {
      entidade_id: retificacao.entidade_id,
      periodo_id: retificacao.periodo_id,
      conta_id: retificacao.conta_id,
      data_lancamento: retificacao.data_lancamento,
      // Manter natureza da conta: se débito era débito, continua débito
      valor_debito:
        retificacao.valor_novo > 0
          ? retificacao.valor_novo
          : undefined,
      valor_credito:
        retificacao.valor_novo > 0 ? undefined : Math.abs(retificacao.valor_novo),
      descricao: `RETIFICAÇÃO: ${retificacao.motivo_retificacao}`,
      origem_modulo: retificacao.origem_modulo,
      origem_id: retificacao.retificacao_id || retificacao.apontamento_id || 0,
      referencia_documento: `RETIF-${retificacao.retificacao_id || "MANUAL"}`,
      criado_por: retificacao.retificada_por,
    };

    const ledger_novo_id = registrarLancamentoSemValidacao(db, lancamento_novo);

    // PASSO 3: Registrar rastreamento (se tabela existir)
    if (ledger_reverso_id && retificacao.retificacao_id) {
      executar(
        db,
        `INSERT OR IGNORE INTO retificacao_ledger_mapping
         (retificacao_id, ledger_entry_reverso_id, ledger_entry_novo_id)
         VALUES (?, ?, ?)`,
        [retificacao.retificacao_id, ledger_reverso_id, ledger_novo_id]
      );
    }

    return {
      sucesso: true,
      ledger_reverso_id,
      ledger_novo_id,
      mensagem: `Retificação registrada: R$${retificacao.valor_anterior.toFixed(2)} → R$${retificacao.valor_novo.toFixed(2)}`,
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao registrar retificação: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/**
 * Versão interna de registrarLancamentoContabil sem validação de período
 * Usada por registrarRetificacao para evitar validação dupla
 */
function registrarLancamentoSemValidacao(
  db: Database,
  lancamento: LancamentoContabil,
): number {
  if (!lancamento.valor_debito && !lancamento.valor_credito) {
    throw new Error("Lançamento deve ter débito ou crédito");
  }

  if (lancamento.valor_debito && lancamento.valor_credito) {
    throw new Error("Lançamento não pode ter débito E crédito simultaneamente");
  }

  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, centro_custo_id, conta_id,
      data_lancamento, valor_debito, valor_credito,
      descricao, origem_modulo, origem_id, referencia_documento,
      criado_por, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      lancamento.entidade_id,
      lancamento.periodo_id,
      lancamento.centro_custo_id || null,
      lancamento.conta_id,
      lancamento.data_lancamento,
      lancamento.valor_debito || null,
      lancamento.valor_credito || null,
      lancamento.descricao,
      lancamento.origem_modulo,
      lancamento.origem_id,
      lancamento.referencia_documento,
      lancamento.criado_por || null,
    ]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );

  return result?.id || 0;
}
