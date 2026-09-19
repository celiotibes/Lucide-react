/**
 * Integração: Pagamentos → Ledger
 * Sincroniza confirmações de pagamento para lançamentos contábeis
 *
 * Fluxo:
 * Payment (pagamentos-integracao)
 *   → confirmarPagamento() atualiza status para 'pago'
 *   → registrarLancamentoPagamento()
 *   → registrarLancamentoContabil() (origem_modulo = 'pagamentos-integracao')
 *   → Débito conta específica / Crédito 1.1.01 (Caixa)
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import crypto from "crypto";

export interface SincronizacaoPagamentoLedger {
  id: number;
  payment_id: string;
  ledger_entry_id: number;
  tipo_pagamento: string;
  valor: number;
  status: "sucesso" | "erro" | "duplicado";
  hash_provenance: string;
  mensagem_erro?: string;
  criado_em: string;
  tentativas: number;
}

export interface MapeamentoPagamentoLedger {
  tipo_pagamento: string;
  metodo_pagamento?: string;
  conta_id_debito: number; // Conta do beneficiário (a reduzir)
  conta_id_credito: number; // Caixa (1.1.01)
  descricao_padrao: string;
}

/**
 * Mapeamento de tipos de pagamento para contas contábeis
 * Débito na conta específica do beneficiário, crédito em Caixa (1.1.01)
 */
const MAPEAMENTO_PAGAMENTOS_LEDGER: Record<string, MapeamentoPagamentoLedger> = {
  "remuneracao_pessoal": {
    tipo_pagamento: "remuneracao_pessoal",
    conta_id_debito: 3105, // 3.1.05 - Remuneração a Pagar
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento de remuneração",
  },
  "fornecedor": {
    tipo_pagamento: "fornecedor",
    conta_id_debito: 3102, // 3.1.02 - Contas a Pagar
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento a fornecedor",
  },
  "servico": {
    tipo_pagamento: "servico",
    conta_id_debito: 3102, // 3.1.02 - Contas a Pagar
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento de serviço",
  },
  "despesa_operacional": {
    tipo_pagamento: "despesa_operacional",
    conta_id_debito: 6201, // 6.2.01 - Despesas Operacionais
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento de despesa operacional",
  },
  "aluguel": {
    tipo_pagamento: "aluguel",
    conta_id_debito: 6101, // 6.1.01 - Despesa com Aluguel
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento de aluguel",
  },
  "utilidade": {
    tipo_pagamento: "utilidade",
    conta_id_debito: 6202, // 6.2.02 - Despesas com Utilidades (água, luz, etc)
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento de utilidade",
  },
  "outro": {
    tipo_pagamento: "outro",
    conta_id_debito: 3102, // 3.1.02 - Contas a Pagar (padrão)
    conta_id_credito: 1101, // 1.1.01 - Caixa
    descricao_padrao: "Pagamento diverso",
  },
};

/**
 * Conta padrão de Caixa para crédito em todos os pagamentos
 */
const CONTA_CAIXA = 1101; // 1.1.01 - Caixa

/**
 * Gerar hash SHA-256 para rastreamento de provenance
 * Impede processamento duplicado do mesmo pagamento
 */
function gerarHashProvenance(
  paymentId: string,
  valor: number,
  dataConfirmacao: string
): string {
  const dados = `PAG|${paymentId}|${valor}|${dataConfirmacao}`;
  return crypto.createHash("sha256").update(dados).digest("hex");
}

/**
 * Obter mapeamento de tipo de pagamento para ledger
 */
export function obterMapeamentoPagamento(
  tipoPagamento: string
): MapeamentoPagamentoLedger | null {
  return MAPEAMENTO_PAGAMENTOS_LEDGER[tipoPagamento] || MAPEAMENTO_PAGAMENTOS_LEDGER["outro"];
}

/**
 * Validar dados de pagamento para ledger
 */
export function validarPagamentoParaLedger(
  pagamento: any
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!pagamento.id) {
    erros.push("payment_id obrigatório");
  }

  if (pagamento.valor <= 0) {
    erros.push("valor deve ser positivo");
  }

  if (pagamento.status !== "pago") {
    erros.push("pagamento deve estar em status 'pago'");
  }

  if (!pagamento.data_conclusao) {
    erros.push("data_conclusao obrigatória");
  }

  if (!pagamento.tipo_pagamento) {
    erros.push("tipo_pagamento obrigatório");
  }

  if (!pagamento.entidade_id) {
    erros.push("entidade_id obrigatório");
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Registrar pagamento confirmado no ledger com dupla entrada
 * Retorna ID do lançamento contábil ou null se falha
 */
export function registrarLancamentoPagamento(
  db: Database,
  paymentId: string,
  pagamento: {
    entidade_id: number;
    periodo_id: number;
    valor: number;
    tipo_pagamento: string;
    metodo_pagamento: string;
    beneficiario: string;
    referencia: string;
    descricao: string;
    data_conclusao: string;
  },
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar dados
    const validacao = validarPagamentoParaLedger({
      id: paymentId,
      valor: pagamento.valor,
      status: "pago",
      data_conclusao: pagamento.data_conclusao,
      tipo_pagamento: pagamento.tipo_pagamento,
      entidade_id: pagamento.entidade_id,
    });

    if (!validacao.valido) {
      registrarSincronizacaoPagamentoError(
        db,
        paymentId,
        "erro",
        validacao.erros.join("; "),
        tentativa
      );
      return null;
    }

    // 2. Obter mapeamento
    const mapeamento = obterMapeamentoPagamento(pagamento.tipo_pagamento);
    if (!mapeamento) {
      registrarSincronizacaoPagamentoError(
        db,
        paymentId,
        "erro",
        "Mapeamento de tipo de pagamento não encontrado",
        tentativa
      );
      return null;
    }

    // 3. Verificar duplicação via hash de provenance
    const hashProvenance = gerarHashProvenance(
      paymentId,
      pagamento.valor,
      pagamento.data_conclusao
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_pagamentos_ledger
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoPagamentoError(
        db,
        paymentId,
        "duplicado",
        `Pagamento já sincronizado: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 4. Registrar lançamento contábil (débito na conta específica)
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: pagamento.entidade_id,
      periodo_id: pagamento.periodo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: pagamento.data_conclusao,
      valor_debito: pagamento.valor,
      descricao: `${mapeamento.descricao_padrao} para ${pagamento.beneficiario}: ${pagamento.descricao}`,
      origem_modulo: "pagamentos-integracao",
      origem_id: parseInt(paymentId.replace(/\D/g, "")) || 0,
      referencia_documento: pagamento.referencia,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de débito");
    }

    // 5. Registrar crédito na conta de Caixa
    const lancamentoCredito = registrarLancamentoContabil(db, {
      entidade_id: pagamento.entidade_id,
      periodo_id: pagamento.periodo_id,
      conta_id: CONTA_CAIXA,
      data_lancamento: pagamento.data_conclusao,
      valor_credito: pagamento.valor,
      descricao: `Saída de caixa - ${pagamento.metodo_pagamento} para ${pagamento.beneficiario}`,
      origem_modulo: "pagamentos-integracao",
      origem_id: parseInt(paymentId.replace(/\D/g, "")) || 0,
      referencia_documento: pagamento.referencia,
    });

    if (lancamentoCredito <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de crédito");
    }

    // 6. Atualizar pagamento com ledger_entry_id
    executar(
      db,
      `UPDATE pagamentos SET ledger_entry_id = ? WHERE id = ?`,
      [lancamentoId, paymentId]
    );

    // 7. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoPagamentoSucesso(
      db,
      paymentId,
      lancamentoId,
      pagamento.tipo_pagamento,
      pagamento.valor,
      hashProvenance
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoPagamentoError(
      db,
      paymentId,
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Sincronizar todos os pagamentos confirmados pendentes para ledger
 */
export function sincronizarPagamentosParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: number,
  limiteEntries: number = 100
): { processados: number; sucessos: number; falhas: number } {
  try {
    // Obter pagamentos confirmados sem ledger_entry_id
    const pagamentos = consultar<{
      id: string;
      valor: number;
      tipo_pagamento: string;
      metodo_pagamento: string;
      beneficiario: string;
      referencia: string;
      descricao: string;
      data_conclusao: string;
      tentativas: number;
    }>(
      db,
      `SELECT id, valor, tipo_pagamento, metodo_pagamento, beneficiario, referencia, descricao, data_conclusao, COALESCE(tentativas, 0) as tentativas
       FROM pagamentos
       WHERE entidade_id = ? AND status = 'pago' AND ledger_entry_id IS NULL AND COALESCE(tentativas, 0) < 3
       ORDER BY data_conclusao ASC
       LIMIT ?`,
      [entidadeId, limiteEntries]
    );

    if (!pagamentos || pagamentos.length === 0) {
      return { processados: 0, sucessos: 0, falhas: 0 };
    }

    let sucessos = 0;
    let falhas = 0;

    pagamentos.forEach((pagamento) => {
      try {
        const resultado = registrarLancamentoPagamento(
          db,
          pagamento.id,
          {
            entidade_id: entidadeId,
            periodo_id: periodoId,
            valor: pagamento.valor,
            tipo_pagamento: pagamento.tipo_pagamento,
            metodo_pagamento: pagamento.metodo_pagamento,
            beneficiario: pagamento.beneficiario,
            referencia: pagamento.referencia,
            descricao: pagamento.descricao,
            data_conclusao: pagamento.data_conclusao,
          },
          (pagamento.tentativas || 0) + 1
        );

        if (resultado) {
          sucessos++;
          // Incrementar tentativas
          executar(
            db,
            `UPDATE pagamentos SET tentativas = COALESCE(tentativas, 0) + 1 WHERE id = ?`,
            [pagamento.id]
          );
        } else {
          falhas++;
        }
      } catch (erro) {
        registrarSincronizacaoPagamentoError(
          db,
          pagamento.id,
          "erro",
          (erro as Error).message,
          (pagamento.tentativas || 0) + 1
        );
        falhas++;
      }
    });

    return {
      processados: pagamentos.length,
      sucessos,
      falhas,
    };
  } catch (erro) {
    console.error("Erro ao sincronizar pagamentos:", erro);
    return { processados: 0, sucessos: 0, falhas: 0 };
  }
}

/**
 * Sincronizar um pagamento específico de forma imediata
 * Chamado após confirmarPagamento() na função de pagamentos
 */
export function sincronizarPagamentoImediato(
  db: Database,
  paymentId: string,
  entidadeId: number,
  periodoId: number
): boolean {
  try {
    // Obter dados do pagamento
    const [pagamento] = consultar<{
      valor: number;
      tipo_pagamento: string;
      metodo_pagamento: string;
      beneficiario: string;
      referencia: string;
      descricao: string;
      data_conclusao: string;
      status: string;
      ledger_entry_id?: number;
    }>(
      db,
      `SELECT valor, tipo_pagamento, metodo_pagamento, beneficiario, referencia, descricao, data_conclusao, status, ledger_entry_id
       FROM pagamentos
       WHERE id = ? AND entidade_id = ?`,
      [paymentId, entidadeId]
    );

    if (!pagamento || pagamento.status !== "pago" || pagamento.ledger_entry_id) {
      return false;
    }

    const resultado = registrarLancamentoPagamento(
      db,
      paymentId,
      {
        entidade_id: entidadeId,
        periodo_id: periodoId,
        valor: pagamento.valor,
        tipo_pagamento: pagamento.tipo_pagamento,
        metodo_pagamento: pagamento.metodo_pagamento,
        beneficiario: pagamento.beneficiario,
        referencia: pagamento.referencia,
        descricao: pagamento.descricao,
        data_conclusao: pagamento.data_conclusao,
      }
    );

    return resultado !== null;
  } catch (erro) {
    console.error("Erro ao sincronizar pagamento:", erro);
    return false;
  }
}

/**
 * Registrar sucesso na tabela de sincronização
 */
function registrarSincronizacaoPagamentoSucesso(
  db: Database,
  paymentId: string,
  ledgerId: number,
  tipoPagamento: string,
  valor: number,
  hashProvenance: string
): number {
  executar(
    db,
    `INSERT INTO sincronizacoes_pagamentos_ledger
     (payment_id, ledger_entry_id, tipo_pagamento, valor, status, hash_provenance, tentativas, criado_em)
     VALUES (?, ?, ?, ?, 'sucesso', ?, 1, datetime('now'))`,
    [paymentId, ledgerId, tipoPagamento, valor, hashProvenance]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );

  return result?.id || 0;
}

/**
 * Registrar erro na tabela de sincronização
 */
function registrarSincronizacaoPagamentoError(
  db: Database,
  paymentId: string,
  status: "erro" | "duplicado",
  mensagemErro: string,
  tentativas: number
): void {
  executar(
    db,
    `INSERT INTO sincronizacoes_pagamentos_ledger
     (payment_id, status, mensagem_erro, tentativas, criado_em)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [paymentId, status, mensagemErro, tentativas]
  );
}

/**
 * Gerar relatório de sincronização de pagamentos
 */
export function gerarRelatorioSincronizacaoPagamentos(
  db: Database,
  entidadeId: number,
  periodoId?: number
): {
  total_processados: number;
  pagamentos_sincronizados: number;
  valor_total_sincronizado: number;
  sucessos: number;
  erros: number;
  duplicados: number;
  ultimos_30_dias: SincronizacaoPagamentoLedger[];
} {
  const [total] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_pagamentos_ledger
     WHERE criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [pagamentos] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_pagamentos_ledger
     WHERE status = 'sucesso' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [valoresync] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total FROM sincronizacoes_pagamentos_ledger
     WHERE status = 'sucesso' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [sucessos] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_pagamentos_ledger
     WHERE status = 'sucesso' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [erros] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_pagamentos_ledger
     WHERE status = 'erro' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [duplicados] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_pagamentos_ledger
     WHERE status = 'duplicado' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [ultimos30] = consultar<SincronizacaoPagamentoLedger>(
    db,
    `SELECT * FROM sincronizacoes_pagamentos_ledger
     WHERE criado_em >= datetime(?, '-30 days')
     ORDER BY criado_em DESC
     LIMIT 50`,
    [new Date().toISOString()]
  );

  return {
    total_processados: total?.count || 0,
    pagamentos_sincronizados: pagamentos?.count || 0,
    valor_total_sincronizado: valoresync?.total || 0,
    sucessos: sucessos?.count || 0,
    erros: erros?.count || 0,
    duplicados: duplicados?.count || 0,
    ultimos_30_dias: ultimos30 || [],
  };
}
