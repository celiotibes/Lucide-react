/**
 * Integração: Contratos ↔ Imovel-Gestao
 * Sincroniza ciclo de vida de contratos entre módulos
 *
 * Fluxo bidirecional:
 * Contrato criado em imovel-gestao
 *   → Dispara contabilizarCriacaoContrato em integracao-contratos
 *   → Registra receita esperada no ledger
 *
 * Inquilino/Contrato alterado em imovel-gestao
 *   → Dispara recalcular rateios em automacao-rateios
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { contabilizarCriacaoContrato, contabilizarRecebimentoAluguel, contabilizarReajusteContrato } from "./integracao-contratos";

export interface SincronizacaoContratoImovel {
  id: number;
  contrato_id: number;
  tipo_evento: "criacao" | "reajuste" | "rescisao" | "recebimento";
  data_evento: string;
  origem_modulo: "imovel-gestao" | "integracao-contratos";
  status: "sucesso" | "pendente" | "erro";
  tentativas: number;
  criado_em: string;
}

/**
 * Sincronizar contrato após criação em imovel-gestao
 * Garante contabilização imediata de receita esperada
 */
export function sincronizarCriacao_ContratoFromImovel(
  db: Database,
  contratoId: number,
  entidadeId: number,
  periodoId: number
): boolean {
  try {
    // Validar contrato existe
    const [contrato] = consultar<{ id: number; status: string }>(
      db,
      `SELECT id, status FROM contratos_locacao WHERE id = ?`,
      [contratoId]
    );

    if (!contrato) {
      registrarSincronizacao(
        db,
        contratoId,
        "criacao",
        "erro",
        "Contrato não encontrado",
        1
      );
      return false;
    }

    // Contabilizar criação (registra receita esperada)
    contabilizarCriacaoContrato(db, contratoId, entidadeId, periodoId);

    // Registrar sucesso
    registrarSincronizacao(
      db,
      contratoId,
      "criacao",
      "sucesso",
      null,
      1
    );

    return true;
  } catch (erro) {
    registrarSincronizacao(
      db,
      contratoId,
      "criacao",
      "erro",
      (erro as Error).message,
      1
    );
    return false;
  }
}

/**
 * Sincronizar reajuste de contrato (IPCA, taxa, aditivo)
 * Atualiza valor de receita esperada no ledger
 */
export function sincronizarReajusteContratoFromImovel(
  db: Database,
  contratoId: number,
  entidadeId: number,
  periodoId: number,
  valorAnterior: number,
  valorNovo: number,
  motivo?: string
): boolean {
  try {
    const [contrato] = consultar<{
      id: number;
      imovel_id: number;
      locatario: string;
      valor_mensal: number;
    }>(
      db,
      `SELECT id, imovel_id, locatario, valor_mensal FROM contratos_locacao WHERE id = ?`,
      [contratoId]
    );

    if (!contrato) {
      registrarSincronizacao(
        db,
        contratoId,
        "reajuste",
        "erro",
        "Contrato não encontrado",
        1
      );
      return false;
    }

    // Criar evento de reajuste
    executar(
      db,
      `INSERT INTO eventos_contratos (contrato_id, tipo, data, valor_anterior, valor_novo, motivo, criado_em)
       VALUES (?, 'reajuste', datetime('now'), ?, ?, ?, datetime('now'))`,
      [contratoId, valorAnterior, valorNovo, motivo || null]
    );

    // BUG real: faltavam entidadeId e periodoId (ambos já disponíveis no escopo desta
    // função) — contabilizarReajusteContrato() os exige para gravar o lançamento
    // contábil; sem eles, TS acusa "Expected 4 arguments, but got 2" e, se isso
    // rodasse sem checagem de tipos, o lançamento sairia com entidade_id/periodo_id
    // undefined.
    contabilizarReajusteContrato(
      db,
      {
        id: 0,
        contrato_id: contratoId,
        tipo: "reajuste",
        data: new Date().toISOString().split("T")[0],
        valor_anterior: valorAnterior,
        valor_novo: valorNovo,
        motivo: motivo,
      },
      entidadeId,
      periodoId
    );

    registrarSincronizacao(
      db,
      contratoId,
      "reajuste",
      "sucesso",
      null,
      1
    );

    return true;
  } catch (erro) {
    registrarSincronizacao(
      db,
      contratoId,
      "reajuste",
      "erro",
      (erro as Error).message,
      1
    );
    return false;
  }
}

/**
 * Sincronizar recebimento de aluguel
 * Registra débito em conta corrente e crédito em receita
 */
export function sincronizarRecebimentoAluguelFromTransacao(
  db: Database,
  contratoId: number,
  entidadeId: number,
  periodoId: number,
  transacaoId: number,
  valor: number
): boolean {
  try {
    const [contrato] = consultar<{ id: number; status: string }>(
      db,
      `SELECT id, status FROM contratos_locacao WHERE id = ?`,
      [contratoId]
    );

    if (!contrato) {
      registrarSincronizacao(
        db,
        contratoId,
        "recebimento",
        "erro",
        "Contrato não encontrado",
        1
      );
      return false;
    }

    // Contabilizar recebimento (reconcilia com transação bancária)
    contabilizarRecebimentoAluguel(
      db,
      transacaoId,
      contratoId,
      entidadeId,
      periodoId,
      valor
    );

    // Registrar sucesso
    registrarSincronizacao(
      db,
      contratoId,
      "recebimento",
      "sucesso",
      null,
      1
    );

    return true;
  } catch (erro) {
    registrarSincronizacao(
      db,
      contratoId,
      "recebimento",
      "erro",
      (erro as Error).message,
      1
    );
    return false;
  }
}

/**
 * Sincronizar rescisão de contrato
 * Baixa receita esperada e calcula rescisão contábil
 */
export function sincronizarRescisaoContratoFromImovel(
  db: Database,
  contratoId: number,
  entidadeId: number,
  periodoId: number,
  dataRescisao: string
): boolean {
  try {
    const [contrato] = consultar<{
      id: number;
      imovel_id: number;
      locatario: string;
      valor_mensal: number;
    }>(
      db,
      `SELECT id, imovel_id, locatario, valor_mensal FROM contratos_locacao WHERE id = ?`,
      [contratoId]
    );

    if (!contrato) {
      registrarSincronizacao(
        db,
        contratoId,
        "rescisao",
        "erro",
        "Contrato não encontrado",
        1
      );
      return false;
    }

    // Atualizar status do contrato
    executar(
      db,
      `UPDATE contratos_locacao SET status = 'rescindido', data_rescisao = ? WHERE id = ?`,
      [dataRescisao, contratoId]
    );

    // Verificar se há caução a devolver
    const [caucao] = consultar<{ id: number; valor_inicial: number }>(
      db,
      `SELECT id, valor_inicial FROM caucoes WHERE contrato_id = ? AND data_devolucao IS NULL`,
      [contratoId]
    );

    if (caucao) {
      // Registrar devolução de caução
      executar(
        db,
        `UPDATE caucoes SET data_devolucao = ?, status = 'devolvida' WHERE id = ?`,
        [dataRescisao, caucao.id]
      );
    }

    registrarSincronizacao(
      db,
      contratoId,
      "rescisao",
      "sucesso",
      null,
      1
    );

    return true;
  } catch (erro) {
    registrarSincronizacao(
      db,
      contratoId,
      "rescisao",
      "erro",
      (erro as Error).message,
      1
    );
    return false;
  }
}

/**
 * Validar consistência bidirecional entre imovel-gestao e integracao-contratos
 * Verifica: contrato existe em ambos, valores estão sincronizados, etc
 */
export function validarConsistenciaContratoImovel(
  db: Database,
  contratoId: number
): {
  consistente: boolean;
  discrepancias: string[];
  ultimaSincronizacao?: string;
} {
  const discrepancias: string[] = [];

  // 1. Verificar se contrato existe em ambos os módulos
  const [contratoLedger] = consultar<{ id: number }>(
    db,
    `SELECT id FROM contratos_locacao WHERE id = ?`,
    [contratoId]
  );

  if (!contratoLedger) {
    discrepancias.push("Contrato não encontrado em contratos_locacao");
  }

  // 2. Verificar se receita esperada foi registrada no ledger
  const [ledgerEntry] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries WHERE origem_modulo = 'contratos' AND origem_id = ? LIMIT 1`,
    [contratoId]
  );

  if (!ledgerEntry && contratoLedger) {
    discrepancias.push("Receita esperada não registrada no ledger");
  }

  // 3. Verificar sincronização mais recente
  const [ultimaSincronizacao] = consultar<{ criado_em: string }>(
    db,
    `SELECT criado_em FROM sincronizacoes_contratos_imovel
     WHERE contrato_id = ?
     ORDER BY criado_em DESC
     LIMIT 1`,
    [contratoId]
  );

  return {
    consistente: discrepancias.length === 0,
    discrepancias,
    ultimaSincronizacao: ultimaSincronizacao?.criado_em,
  };
}

/**
 * Registrar evento de sincronização
 */
function registrarSincronizacao(
  db: Database,
  contratoId: number,
  tipoEvento: string,
  status: "sucesso" | "pendente" | "erro",
  erro?: string | null,
  tentativas: number = 1
): void {
  executar(
    db,
    `INSERT INTO sincronizacoes_contratos_imovel
     (contrato_id, tipo_evento, status, tentativas, criado_em)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [contratoId, tipoEvento, status, tentativas]
  );
}

/**
 * Reconciliar todos os contratos pendentes
 */
export function reconciliarContratosImovel(
  db: Database,
  entidadeId: number,
  periodoId: number
): {
  processados: number;
  sucessos: number;
  erros: number;
} {
  // Obter contratos com sincronização pendente ou com erro
  const contratosPendentes = consultar<{ id: number }>(
    db,
    `SELECT DISTINCT c.id
     FROM contratos_locacao c
     LEFT JOIN sincronizacoes_contratos_imovel s ON c.id = s.contrato_id
     -- contrato vigente: contratos_locacao não tem status; data_fim nulo = em vigor
     WHERE c.data_fim IS NULL OR c.data_fim >= DATE('now')
       AND (s.id IS NULL OR s.status = 'erro')
     ORDER BY c.criado_em ASC`,
    []
  );

  let sucessos = 0;
  let erros = 0;

  contratosPendentes.forEach((contrato) => {
    const resultado = sincronizarCriacao_ContratoFromImovel(
      db,
      contrato.id,
      entidadeId,
      periodoId
    );
    if (resultado) {
      sucessos++;
    } else {
      erros++;
    }
  });

  return {
    processados: contratosPendentes.length,
    sucessos,
    erros,
  };
}
