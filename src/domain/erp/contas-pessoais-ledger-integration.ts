/**
 * Integração: Contas Pessoais → Ledger
 * Sincroniza movimentos pessoais (depósito, saque, transferência) para lançamentos contábeis
 *
 * Fluxo:
 * Depósito: Débito 1.1.05 (Contas Correntes Pessoais) / Crédito 3.1.01 (Aportes Pessoais)
 * Saque: Débito 3.1.01 / Crédito 1.1.05
 * Transferência: Débito conta_origem / Crédito conta_destino
 *
 * Rastreamento de provenance via hash para evitar duplicação
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import crypto from "crypto";

export interface MovimentoPessoalLedger {
  movimento_pessoal_id: number;
  conta_pessoal_id: number;
  entidade_id: number;
  periodo_id: number;
  data_movimento: string;
  tipo_movimento: "deposito" | "saque" | "transferencia_origem" | "transferencia_destino";
  valor: number;
  descricao: string;
  referencia_documento: string;
}

export interface MapeamentoMovimentoLedger {
  tipo_movimento: "deposito" | "saque" | "transferencia_origem" | "transferencia_destino";
  conta_id_debito: number;
  conta_id_credito: number;
  descricao_padrao: string;
}

export interface SincronizacaoContasPessoaisLedger {
  id: number;
  movimento_pessoal_id: number;
  conta_pessoal_id: number;
  ledger_entry_debito_id?: number;
  ledger_entry_credito_id?: number;
  tipo_movimento: string;
  status: "sucesso" | "erro" | "duplicado";
  hash_provenance: string;
  mensagem_erro?: string;
  criado_em: string;
  tentativas: number;
}

export interface RelatorioMovimentosPessoais {
  periodo: string;
  conta_pessoal_descricao: string;
  saldo_anterior: number;
  saldo_final: number;
  movimentos_deposito: number;
  movimentos_saque: number;
  total_depositado: number;
  total_sacado: number;
  saldo_liquido: number;
  movimentos_sincronizados: number;
  movimentos_com_erro: number;
}

/**
 * Mapeamento de tipos de movimento para contas contábeis
 * Segue o plano de contas com contas específicas para pessoal
 */
const MAPEAMENTO_MOVIMENTOS: Record<
  "deposito" | "saque" | "transferencia_origem" | "transferencia_destino",
  MapeamentoMovimentoLedger
> = {
  deposito: {
    tipo_movimento: "deposito",
    conta_id_debito: 1105, // 1.1.05 - Contas Correntes Pessoais (Ativo)
    conta_id_credito: 3101, // 3.1.01 - Aportes Pessoais (Passivo/PL)
    descricao_padrao: "Depósito em conta pessoal",
  },
  saque: {
    tipo_movimento: "saque",
    conta_id_debito: 3101, // 3.1.01 - Aportes Pessoais
    conta_id_credito: 1105, // 1.1.05 - Contas Correntes Pessoais
    descricao_padrao: "Saque de conta pessoal",
  },
  transferencia_origem: {
    tipo_movimento: "transferencia_origem",
    conta_id_debito: 1105, // 1.1.05 - Contas Correntes Pessoais (Origem)
    conta_id_credito: 1105, // 1.1.05 - Contas Correntes Pessoais (Destino)
    descricao_padrao: "Transferência entre contas pessoais (saída)",
  },
  transferencia_destino: {
    tipo_movimento: "transferencia_destino",
    conta_id_debito: 1105, // 1.1.05 - Contas Correntes Pessoais (Destino)
    conta_id_credito: 1105, // 1.1.05 - Contas Correntes Pessoais (Origem)
    descricao_padrao: "Transferência entre contas pessoais (entrada)",
  },
};

/**
 * Gerar hash SHA-256 para rastreamento de provenance
 * Impede processamento duplicado do mesmo movimento
 */
function gerarHashProvenance(
  movimentoId: number,
  tipoMovimento: string,
  valor: number,
  dataMovimento: string
): string {
  const dados = `PESSOAL_MOV|${movimentoId}|${tipoMovimento}|${valor}|${dataMovimento}`;
  return crypto.createHash("sha256").update(dados).digest("hex");
}

/**
 * Obter mapeamento de movimento para ledger
 */
export function obterMapeamentoMovimento(
  tipoMovimento: "deposito" | "saque" | "transferencia_origem" | "transferencia_destino"
): MapeamentoMovimentoLedger | null {
  return MAPEAMENTO_MOVIMENTOS[tipoMovimento] || null;
}

/**
 * Validar dados de movimento pessoal para ledger
 */
export function validarMovimentoParaLedger(
  movimento: any
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!movimento.movimento_pessoal_id) {
    erros.push("movimento_pessoal_id obrigatório");
  }

  if (!movimento.conta_pessoal_id) {
    erros.push("conta_pessoal_id obrigatório");
  }

  if (movimento.valor <= 0) {
    erros.push("valor deve ser positivo");
  }

  if (!movimento.data_movimento) {
    erros.push("data_movimento obrigatória");
  }

  if (!["deposito", "saque", "transferencia_origem", "transferencia_destino"].includes(movimento.tipo_movimento)) {
    erros.push("tipo_movimento inválido");
  }

  if (!movimento.referencia_documento) {
    erros.push("referencia_documento obrigatória");
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Registrar sincronização com sucesso
 */
function registrarSincronizacaoSucesso(
  db: Database,
  movimentoId: number,
  contaPessoalId: number,
  lancamentoDebitoId: number,
  lancamentoCreditoId: number,
  tipoMovimento: string,
  hashProvenance: string
): number {
  executar(
    db,
    `INSERT INTO contas_pessoais_sincronizacao_log
     (movimento_pessoal_id, conta_pessoal_id, tipo_sincronizacao, status, criado_em)
     VALUES (?, ?, 'registrar', 'sucesso', datetime('now'))`,
    [movimentoId, contaPessoalId]
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
function registrarSincronizacaoError(
  db: Database,
  movimentoId: number,
  contaPessoalId: number,
  mensagem: string,
  tentativa: number = 1
): void {
  executar(
    db,
    `INSERT INTO contas_pessoais_sincronizacao_log
     (movimento_pessoal_id, conta_pessoal_id, tipo_sincronizacao, status, mensagem, tentativas, criado_em)
     VALUES (?, ?, 'registrar', 'erro', ?, ?, datetime('now'))`,
    [movimentoId, contaPessoalId, mensagem, tentativa]
  );
}

/**
 * Registrar movimento pessoal no ledger com dupla entrada
 * Retorna IDs dos lançamentos contábeis ou null se falha
 */
export function registrarMovimentoPessoalNoLedger(
  db: Database,
  movimento: MovimentoPessoalLedger,
  tentativa: number = 1
): { lancamento_debito_id: number; lancamento_credito_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar dados
    const validacao = validarMovimentoParaLedger(movimento);
    if (!validacao.valido) {
      registrarSincronizacaoError(
        db,
        movimento.movimento_pessoal_id,
        movimento.conta_pessoal_id,
        validacao.erros.join("; "),
        tentativa
      );
      return null;
    }

    // 2. Obter mapeamento
    const mapeamento = obterMapeamentoMovimento(movimento.tipo_movimento);
    if (!mapeamento) {
      registrarSincronizacaoError(
        db,
        movimento.movimento_pessoal_id,
        movimento.conta_pessoal_id,
        "Mapeamento de movimento não encontrado",
        tentativa
      );
      return null;
    }

    // 3. Verificar duplicação via hash de provenance
    const hashProvenance = gerarHashProvenance(
      movimento.movimento_pessoal_id,
      movimento.tipo_movimento,
      movimento.valor,
      movimento.data_movimento
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM contas_pessoais_ledger_mapping
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoError(
        db,
        movimento.movimento_pessoal_id,
        movimento.conta_pessoal_id,
        `Movimento já sincronizado: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 4. Registrar lançamento contábil (débito)
    const lancamentoDebitoId = registrarLancamentoContabil(db, {
      entidade_id: movimento.entidade_id,
      periodo_id: movimento.periodo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: movimento.data_movimento,
      valor_debito: movimento.valor,
      descricao: `${mapeamento.descricao_padrao}: ${movimento.descricao}`,
      origem_modulo: "contas-pessoais",
      origem_id: movimento.conta_pessoal_id,
      referencia_documento: movimento.referencia_documento,
    });

    if (lancamentoDebitoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de débito");
    }

    // 5. Registrar lançamento contábil (crédito)
    const lancamentoCreditoId = registrarLancamentoContabil(db, {
      entidade_id: movimento.entidade_id,
      periodo_id: movimento.periodo_id,
      conta_id: mapeamento.conta_id_credito,
      data_lancamento: movimento.data_movimento,
      valor_credito: movimento.valor,
      descricao: `${mapeamento.descricao_padrao}: ${movimento.descricao}`,
      origem_modulo: "contas-pessoais",
      origem_id: movimento.conta_pessoal_id,
      referencia_documento: movimento.referencia_documento,
    });

    if (lancamentoCreditoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de crédito");
    }

    // 6. Registrar mapeamento no contas_pessoais_ledger_mapping
    executar(
      db,
      `INSERT INTO contas_pessoais_ledger_mapping
       (movimento_pessoal_id, conta_pessoal_id, ledger_entry_debito_id, ledger_entry_credito_id,
        tipo_movimento, conta_id_debito, conta_id_credito, hash_provenance, status,
        data_efetiva_inicio, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sucesso', ?, datetime('now'))`,
      [
        movimento.movimento_pessoal_id,
        movimento.conta_pessoal_id,
        lancamentoDebitoId,
        lancamentoCreditoId,
        movimento.tipo_movimento,
        mapeamento.conta_id_debito,
        mapeamento.conta_id_credito,
        hashProvenance,
        movimento.data_movimento,
      ]
    );

    // 7. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoSucesso(
      db,
      movimento.movimento_pessoal_id,
      movimento.conta_pessoal_id,
      lancamentoDebitoId,
      lancamentoCreditoId,
      movimento.tipo_movimento,
      hashProvenance
    );

    return {
      lancamento_debito_id: lancamentoDebitoId,
      lancamento_credito_id: lancamentoCreditoId,
      sincronizacao_id: sincronizacaoId,
    };
  } catch (erro) {
    registrarSincronizacaoError(
      db,
      movimento.movimento_pessoal_id,
      movimento.conta_pessoal_id,
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Obter saldo de conta pessoal consultando o ledger
 * Retorna saldo baseado em lançamentos contábeis
 */
export function obterSaldoContaPessoal(
  db: Database,
  periodo_id: number,
  conta_pessoal_id: number
): number {
  try {
    // Obter saldo inicial da conta pessoal
    const [conta] = consultar<{ saldo_inicial: number }>(
      db,
      `SELECT saldo_inicial FROM contas_pessoais WHERE id = ?`,
      [conta_pessoal_id]
    );

    const saldoInicial = conta?.saldo_inicial || 0;

    // Somar movimentos do ledger (apenas contas pessoais de origem contas-pessoais)
    const [resultado] = consultar<{ total_saldo: number }>(
      db,
      `SELECT
        COALESCE(
          SUM(CASE
            WHEN valor_debito IS NOT NULL THEN valor_debito
            WHEN valor_credito IS NOT NULL THEN -valor_credito
            ELSE 0
          END),
          0
        ) as total_saldo
       FROM ledger_entries
       WHERE origem_modulo = 'contas-pessoais'
         AND origem_id = ?
         AND periodo_id = ?
         AND conta_id = 1105`, // Conta 1.1.05 - Contas Correntes Pessoais
      [conta_pessoal_id, periodo_id]
    );

    return saldoInicial + (resultado?.total_saldo || 0);
  } catch (erro) {
    console.error("Erro ao obter saldo da conta pessoal:", erro);
    return 0;
  }
}

/**
 * Sincronizar movimentos pessoais em lote (batch)
 * Processa múltiplos movimentos em uma transação
 */
export function sincronizarMovimentosPessoaisParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: number,
  limite: number = 100
): { processados: number; sucessos: number; falhas: number } {
  try {
    // Obter movimentos não sincronizados
    const movimentos = consultar<{
      id: number;
      conta_pessoal_id: number;
      data_movimento: string;
      tipo_movimento: string;
      valor: number;
      descricao: string;
      categoria: string;
    }>(
      db,
      `SELECT mp.id, mp.conta_pessoal_id, mp.data_movimento,
              CASE
                WHEN mp.tipo_movimento = 'entrada' THEN 'deposito'
                WHEN mp.tipo_movimento = 'saida' THEN 'saque'
                ELSE 'deposito'
              END as tipo_movimento,
              mp.valor, mp.descricao, mp.categoria
       FROM movimentos_pessoais mp
       LEFT JOIN contas_pessoais_ledger_mapping cplm ON mp.id = cplm.movimento_pessoal_id
       WHERE mp.entidade_id = ? AND mp.periodo_id = ?
         AND cplm.id IS NULL
       LIMIT ?`,
      [entidadeId, periodoId, limite]
    );

    let processados = 0;
    let sucessos = 0;
    let falhas = 0;

    for (const movimento of movimentos) {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: movimento.id,
        conta_pessoal_id: movimento.conta_pessoal_id,
        entidade_id: entidadeId,
        periodo_id: periodoId,
        data_movimento: movimento.data_movimento,
        tipo_movimento: movimento.tipo_movimento as any,
        valor: movimento.valor,
        descricao: movimento.descricao,
        referencia_documento: `MOV-PESSOAL-${movimento.id}`,
      });

      processados++;
      if (resultado) {
        sucessos++;
      } else {
        falhas++;
      }
    }

    return { processados, sucessos, falhas };
  } catch (erro) {
    console.error("Erro ao sincronizar movimentos pessoais:", erro);
    return { processados: 0, sucessos: 0, falhas: 0 };
  }
}

/**
 * Gerar relatório de movimentos pessoais com dados do ledger
 * Filtra apenas lançamentos de origem_modulo = 'contas-pessoais'
 */
export function gerarRelatorioMovimentosPessoais(
  db: Database,
  periodoId: number,
  contaPessoalId: number
): RelatorioMovimentosPessoais | null {
  try {
    // Obter informações da conta pessoal
    const [conta] = consultar<{ descricao: string; saldo_inicial: number }>(
      db,
      `SELECT descricao, saldo_inicial FROM contas_pessoais WHERE id = ?`,
      [contaPessoalId]
    );

    if (!conta) {
      return null;
    }

    // Obter movimentos de depósito (débito)
    const [movDep] = consultar<{ quantidade: number; total: number }>(
      db,
      `SELECT COUNT(*) as quantidade, COALESCE(SUM(valor_debito), 0) as total
       FROM ledger_entries
       WHERE origem_modulo = 'contas-pessoais'
         AND origem_id = ?
         AND periodo_id = ?
         AND conta_id = 1105
         AND valor_debito IS NOT NULL`,
      [contaPessoalId, periodoId]
    );

    // Obter movimentos de saque (crédito)
    const [movSaq] = consultar<{ quantidade: number; total: number }>(
      db,
      `SELECT COUNT(*) as quantidade, COALESCE(SUM(valor_credito), 0) as total
       FROM ledger_entries
       WHERE origem_modulo = 'contas-pessoais'
         AND origem_id = ?
         AND periodo_id = ?
         AND conta_id = 1105
         AND valor_credito IS NOT NULL`,
      [contaPessoalId, periodoId]
    );

    // Contar sincronizações
    const [sincro] = consultar<{ sucessos: number; erros: number }>(
      db,
      `SELECT
        SUM(CASE WHEN status = 'sucesso' THEN 1 ELSE 0 END) as sucessos,
        SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) as erros
       FROM contas_pessoais_sincronizacao_log
       WHERE conta_pessoal_id = ? AND (processado_em IS NOT NULL OR criado_em > datetime('now', '-1 day'))`,
      [contaPessoalId]
    );

    const totalDepositado = movDep?.total || 0;
    const totalSacado = movSaq?.total || 0;
    const saldoFinal = conta.saldo_inicial + totalDepositado - totalSacado;

    return {
      periodo: `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      conta_pessoal_descricao: conta.descricao,
      saldo_anterior: conta.saldo_inicial,
      saldo_final: saldoFinal,
      movimentos_deposito: movDep?.quantidade || 0,
      movimentos_saque: movSaq?.quantidade || 0,
      total_depositado: totalDepositado,
      total_sacado: totalSacado,
      saldo_liquido: totalDepositado - totalSacado,
      movimentos_sincronizados: sincro?.sucessos || 0,
      movimentos_com_erro: sincro?.erros || 0,
    };
  } catch (erro) {
    console.error("Erro ao gerar relatório de movimentos pessoais:", erro);
    return null;
  }
}
