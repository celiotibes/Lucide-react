/**
 * Integração: Advocacia → Ledger
 * Sincroniza despesas legais e provisões de processos para lançamentos contábeis
 *
 * Fluxo:
 * DespesaLegal (advocacia)
 *   → registrarDespesaLegalNoLedger()
 *   → registrarLancamentoContabil() (origem_modulo = 'advocacia')
 *   → Rastreamento de provenance via hash
 *
 * ProcessoLegal com risco > baixo
 *   → registrarProvisoesProcessos()
 *   → registrarLancamentoContabil() (origem_modulo = 'advocacia')
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import crypto from "crypto";

export interface SincronizacaoAdvocaciaLedger {
  id: number;
  despesa_legal_id?: number;
  processo_id?: number;
  ledger_entry_id: number;
  tipo_registro: "despesa_legal" | "provisao_processo";
  tipo_despesa: string;
  origem_modulo: "advocacia";
  status: "sucesso" | "erro" | "duplicado";
  hash_provenance: string;
  mensagem_erro?: string;
  criado_em: string;
  tentativas: number;
}

export interface MapeamentoDespesaLedger {
  tipo_despesa: "honorarios_advocaticios" | "custas_judiciais" | "pericia" | "outro";
  conta_id_debito: number; // Conta de despesa
  conta_id_credito: number; // Conta de passivo (Contas a Pagar)
  descricao_padrao: string;
}

/**
 * Mapeamento de tipos de despesa para contas contábeis
 * Debita em contas de despesa, credita em Contas a Pagar (3.1.02)
 */
const MAPEAMENTO_DESPESAS_LEGAIS: Record<
  "honorarios_advocaticios" | "custas_judiciais" | "pericia" | "outro",
  MapeamentoDespesaLedger
> = {
  honorarios_advocaticios: {
    tipo_despesa: "honorarios_advocaticios",
    conta_id_debito: 6301, // 6.3.01 - Despesa com Honorários Advocatícios
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Honorários advocatícios",
  },
  custas_judiciais: {
    tipo_despesa: "custas_judiciais",
    conta_id_debito: 6302, // 6.3.02 - Despesa com Custas Judiciais
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Custas judiciais",
  },
  pericia: {
    tipo_despesa: "pericia",
    conta_id_debito: 6303, // 6.3.03 - Despesa com Perícia
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Perícia judicial",
  },
  outro: {
    tipo_despesa: "outro",
    conta_id_debito: 6304, // 6.3.04 - Outras Despesas com Processos Legais
    conta_id_credito: 3102, // 3.1.02 - Contas a Pagar
    descricao_padrao: "Outras despesas legais",
  },
};

/**
 * Mapeamento de riscos para provisão
 * Calcula percentual de provisionamento baseado no risco potencial do processo
 */
const MAPEAMENTO_RISCO_PROVISAO: Record<
  "baixo" | "médio" | "alto" | "crítico",
  number
> = {
  baixo: 0.0, // Sem provisionamento
  médio: 0.25, // 25% do valor da causa
  alto: 0.5, // 50% do valor da causa
  crítico: 0.75, // 75% do valor da causa
};

/**
 * Conta para provisão de processos legais
 */
const CONTA_PROVISAO_PROCESSOS = {
  conta_id_debito: 6401, // 6.4.01 - Provisão para Processos Legais
  conta_id_credito: 3101, // 3.1.01 - Provisão para Riscos Legais (Passivo)
};

/**
 * Gerar hash SHA-256 para rastreamento de provenance
 * Impede processamento duplicado da mesma despesa
 */
function gerarHashProvenance(
  despesaLegalId: number,
  tipoDespesa: string,
  valor: number,
  dataLancamento: string
): string {
  const dados = `ADV_DESPESA|${despesaLegalId}|${tipoDespesa}|${valor}|${dataLancamento}`;
  return crypto.createHash("sha256").update(dados).digest("hex");
}

/**
 * Gerar hash para provisão de processo
 */
function gerarHashProvevanciaProvisao(
  processoId: number,
  risco: string,
  valor: number,
  periodo: number
): string {
  const dados = `ADV_PROVISAO|${processoId}|${risco}|${valor}|${periodo}`;
  return crypto.createHash("sha256").update(dados).digest("hex");
}

/**
 * Obter mapeamento de despesa para ledger
 */
export function obterMapeamentoDespesa(
  tipoDespesa: "honorarios_advocaticios" | "custas_judiciais" | "pericia" | "outro"
): MapeamentoDespesaLedger | null {
  return MAPEAMENTO_DESPESAS_LEGAIS[tipoDespesa] || null;
}

/**
 * Validar dados de despesa legal para ledger
 */
export function validarDespesaParaLedger(
  despesa: any
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!despesa.processo_id) {
    erros.push("processo_id obrigatório");
  }

  if (despesa.valor_despesa <= 0) {
    erros.push("valor_despesa deve ser positivo");
  }

  if (!despesa.data_lancamento) {
    erros.push("data_lancamento obrigatória");
  }

  if (!["honorarios_advocaticios", "custas_judiciais", "pericia", "outro"].includes(despesa.tipo_despesa)) {
    erros.push("tipo_despesa inválido");
  }

  if (!despesa.referencia_documento) {
    erros.push("referencia_documento obrigatória");
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Registrar despesa legal no ledger com dupla entrada
 * Retorna ID do lançamento contábil ou null se falha
 */
export function registrarDespesaLegalNoLedger(
  db: Database,
  despesaId: number,
  despesa: {
    processo_id: number;
    entidade_id: number;
    periodo_id: number;
    data_lancamento: string;
    tipo_despesa: "honorarios_advocaticios" | "custas_judiciais" | "pericia" | "outro";
    valor_despesa: number;
    descricao: string;
    beneficiario: string;
    referencia_documento: string;
  },
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Validar dados
    const validacao = validarDespesaParaLedger(despesa);
    if (!validacao.valido) {
      registrarSincronizacaoAdvocaciaError(
        db,
        despesaId,
        null,
        "despesa_legal",
        despesa.tipo_despesa,
        "erro",
        validacao.erros.join("; "),
        tentativa
      );
      return null;
    }

    // 2. Obter mapeamento
    const mapeamento = obterMapeamentoDespesa(despesa.tipo_despesa);
    if (!mapeamento) {
      registrarSincronizacaoAdvocaciaError(
        db,
        despesaId,
        null,
        "despesa_legal",
        despesa.tipo_despesa,
        "erro",
        "Mapeamento de despesa não encontrado",
        tentativa
      );
      return null;
    }

    // 3. Verificar duplicação via hash de provenance
    const hashProvenance = gerarHashProvenance(
      despesaId,
      despesa.tipo_despesa,
      despesa.valor_despesa,
      despesa.data_lancamento
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_advocacia_ledger
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoAdvocaciaError(
        db,
        despesaId,
        null,
        "despesa_legal",
        despesa.tipo_despesa,
        "duplicado",
        `Despesa já sincronizada: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 4. Registrar lançamento contábil (débito na conta de despesa)
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: despesa.entidade_id,
      periodo_id: despesa.periodo_id,
      conta_id: mapeamento.conta_id_debito,
      data_lancamento: despesa.data_lancamento,
      valor_debito: despesa.valor_despesa,
      descricao: `${mapeamento.descricao_padrao} - ${despesa.beneficiario}: ${despesa.descricao}`,
      origem_modulo: "advocacia",
      origem_id: despesa.processo_id,
      referencia_documento: despesa.referencia_documento,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de débito");
    }

    // 5. Registrar crédito na conta de passivo (Contas a Pagar)
    const lancamentoCredito = registrarLancamentoContabil(db, {
      entidade_id: despesa.entidade_id,
      periodo_id: despesa.periodo_id,
      conta_id: mapeamento.conta_id_credito,
      data_lancamento: despesa.data_lancamento,
      valor_credito: despesa.valor_despesa,
      descricao: `${mapeamento.descricao_padrao} a pagar - ${despesa.beneficiario}`,
      origem_modulo: "advocacia",
      origem_id: despesa.processo_id,
      referencia_documento: despesa.referencia_documento,
    });

    if (lancamentoCredito <= 0) {
      throw new Error("Falha ao registrar lançamento contábil de crédito");
    }

    // 6. Atualizar despesa legal com ledger_entry_id
    executar(
      db,
      `UPDATE despesas_legais SET ledger_entry_id = ?, criado_em = datetime('now')
       WHERE id = ?`,
      [lancamentoId, despesaId]
    );

    // 7. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoAdvocaciaSucesso(
      db,
      despesaId,
      null,
      lancamentoId,
      "despesa_legal",
      despesa.tipo_despesa,
      hashProvenance
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoAdvocaciaError(
      db,
      despesaId,
      null,
      "despesa_legal",
      despesa.tipo_despesa,
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Registrar provisões para processos com risco > baixo
 * Cria lançamentos para provisionar possíveis perdas em processos
 */
export function registrarProvisoesProcessos(
  db: Database,
  entidadeId: number,
  periodoId: number
): { processados: number; sucessos: number; falhas: number } {
  try {
    // 1. Obter processos com risco > baixo e sem provisão registrada neste período
    const [processos] = consultar<{
      id: number;
      valor_causa: number;
      risco_potencial: "baixo" | "médio" | "alto" | "crítico";
      numero_processo: string;
    }>(
      db,
      `SELECT p.id, p.valor_causa, p.risco_potencial, p.numero_processo
       FROM processos_legais p
       LEFT JOIN sincronizacoes_advocacia_ledger s
         ON s.processo_id = p.id
         AND s.tipo_registro = 'provisao_processo'
         AND s.status = 'sucesso'
       WHERE p.entidade_id = ?
         AND p.risco_potencial IN ('médio', 'alto', 'crítico')
         AND p.status IN ('ativo', 'em_recurso')
         AND s.id IS NULL
       LIMIT 100`,
      [entidadeId]
    );

    if (!processos || processos.length === 0) {
      return { processados: 0, sucessos: 0, falhas: 0 };
    }

    let sucessos = 0;
    let falhas = 0;

    processos.forEach((processo) => {
      try {
        // Calcular provisão baseada no risco
        const percentualProvisao =
          MAPEAMENTO_RISCO_PROVISAO[processo.risco_potencial];

        if (percentualProvisao === 0) {
          return; // Sem provisionamento para risco baixo
        }

        const valorProvisao = processo.valor_causa * percentualProvisao;

        // Hash para evitar duplicação
        const hashProvenance = gerarHashProvevanciaProvisao(
          processo.id,
          processo.risco_potencial,
          valorProvisao,
          periodoId
        );

        // Verificar se já foi provisionado
        const [existente] = consultar<{ id: number }>(
          db,
          `SELECT id FROM sincronizacoes_advocacia_ledger
           WHERE hash_provenance = ? AND status = 'sucesso'`,
          [hashProvenance]
        );

        if (existente) {
          return; // Já foi provisionado
        }

        // Registrar débito na conta de provisão
        const lancamentoId = registrarLancamentoContabil(db, {
          entidade_id: entidadeId,
          periodo_id: periodoId,
          conta_id: CONTA_PROVISAO_PROCESSOS.conta_id_debito,
          data_lancamento: new Date().toISOString().split("T")[0],
          valor_debito: valorProvisao,
          descricao: `Provisão para processo ${processo.numero_processo} (Risco: ${processo.risco_potencial})`,
          origem_modulo: "advocacia",
          origem_id: processo.id,
          referencia_documento: `PROV_${processo.id}`,
        });

        if (lancamentoId <= 0) {
          throw new Error("Falha ao registrar débito de provisão");
        }

        // Registrar crédito na conta de provisão (Passivo)
        const lancamentoCredito = registrarLancamentoContabil(db, {
          entidade_id: entidadeId,
          periodo_id: periodoId,
          conta_id: CONTA_PROVISAO_PROCESSOS.conta_id_credito,
          data_lancamento: new Date().toISOString().split("T")[0],
          valor_credito: valorProvisao,
          descricao: `Provisão para riscos do processo ${processo.numero_processo}`,
          origem_modulo: "advocacia",
          origem_id: processo.id,
          referencia_documento: `PROV_${processo.id}`,
        });

        if (lancamentoCredito <= 0) {
          throw new Error("Falha ao registrar crédito de provisão");
        }

        // Registrar sincronização de provisão
        registrarSincronizacaoAdvocaciaSucesso(
          db,
          null,
          processo.id,
          lancamentoId,
          "provisao_processo",
          `provisao_${processo.risco_potencial}`,
          hashProvenance
        );

        sucessos++;
      } catch (erro) {
        registrarSincronizacaoAdvocaciaError(
          db,
          null,
          processo.id,
          "provisao_processo",
          `provisao_${processo.risco_potencial}`,
          "erro",
          (erro as Error).message,
          1
        );
        falhas++;
      }
    });

    return {
      processados: processos.length,
      sucessos,
      falhas,
    };
  } catch (erro) {
    console.error("Erro ao registrar provisões:", erro);
    return { processados: 0, sucessos: 0, falhas: 0 };
  }
}

/**
 * Sincronizar todas as despesas legais pendentes para ledger
 */
export function sincronizarDespesasAdvocaciaParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: number,
  limiteEntries: number = 100
): { processados: number; sucessos: number; falhas: number } {
  try {
    // Obter despesas legais sem ledger_entry_id
    const [despesas] = consultar<{
      id: number;
      processo_id: number;
      data_lancamento: string;
      tipo_despesa: string;
      descricao: string;
      valor_despesa: number;
      beneficiario: string;
      referencia_documento: string;
      tentativas: number;
    }>(
      db,
      `SELECT id, processo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, COALESCE(tentativas, 0) as tentativas
       FROM despesas_legais
       WHERE entidade_id = ? AND periodo_id = ? AND ledger_entry_id IS NULL AND tentativas < 3
       ORDER BY data_lancamento ASC
       LIMIT ?`,
      [entidadeId, periodoId, limiteEntries]
    );

    if (!despesas || despesas.length === 0) {
      return { processados: 0, sucessos: 0, falhas: 0 };
    }

    let sucessos = 0;
    let falhas = 0;

    despesas.forEach((despesa) => {
      try {
        const resultado = registrarDespesaLegalNoLedger(
          db,
          despesa.id,
          {
            processo_id: despesa.processo_id,
            entidade_id: entidadeId,
            periodo_id: periodoId,
            data_lancamento: despesa.data_lancamento,
            tipo_despesa: despesa.tipo_despesa as any,
            valor_despesa: despesa.valor_despesa,
            descricao: despesa.descricao,
            beneficiario: despesa.beneficiario,
            referencia_documento: despesa.referencia_documento,
          },
          (despesa.tentativas || 0) + 1
        );

        if (resultado) {
          sucessos++;
          // Incrementar tentativas
          executar(
            db,
            `UPDATE despesas_legais SET tentativas = COALESCE(tentativas, 0) + 1 WHERE id = ?`,
            [despesa.id]
          );
        } else {
          falhas++;
        }
      } catch (erro) {
        registrarSincronizacaoAdvocaciaError(
          db,
          despesa.id,
          null,
          "despesa_legal",
          despesa.tipo_despesa,
          "erro",
          (erro as Error).message,
          (despesa.tentativas || 0) + 1
        );
        falhas++;
      }
    });

    return {
      processados: despesas.length,
      sucessos,
      falhas,
    };
  } catch (erro) {
    console.error("Erro ao sincronizar despesas:", erro);
    return { processados: 0, sucessos: 0, falhas: 0 };
  }
}

/**
 * Registrar sucesso na tabela de sincronização
 */
function registrarSincronizacaoAdvocaciaSucesso(
  db: Database,
  despesaLegalId: number | null,
  processoId: number | null,
  ledgerId: number,
  tipoRegistro: "despesa_legal" | "provisao_processo",
  tipoDespesa: string,
  hashProvenance: string
): number {
  executar(
    db,
    `INSERT INTO sincronizacoes_advocacia_ledger
     (despesa_legal_id, processo_id, ledger_entry_id, tipo_registro, tipo_despesa, origem_modulo, status, hash_provenance, tentativas, criado_em)
     VALUES (?, ?, ?, ?, ?, 'advocacia', 'sucesso', ?, 1, datetime('now'))`,
    [despesaLegalId, processoId, ledgerId, tipoRegistro, tipoDespesa, hashProvenance]
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
function registrarSincronizacaoAdvocaciaError(
  db: Database,
  despesaLegalId: number | null,
  processoId: number | null,
  tipoRegistro: "despesa_legal" | "provisao_processo",
  tipoDespesa: string,
  status: "erro" | "duplicado",
  mensagemErro: string,
  tentativas: number
): void {
  executar(
    db,
    `INSERT INTO sincronizacoes_advocacia_ledger
     (despesa_legal_id, processo_id, tipo_registro, tipo_despesa, origem_modulo, status, mensagem_erro, tentativas, criado_em)
     VALUES (?, ?, ?, ?, 'advocacia', ?, ?, ?, datetime('now'))`,
    [despesaLegalId, processoId, tipoRegistro, tipoDespesa, status, mensagemErro, tentativas]
  );
}

/**
 * Gerar relatório de sincronização de advocacia
 */
export function gerarRelatorioSincronizacaoAdvocacia(
  db: Database,
  entidadeId: number,
  periodoId: number
): {
  total_processados: number;
  despesas_sincronizadas: number;
  provisoes_registradas: number;
  sucessos: number;
  erros: number;
  duplicados: number;
  ultimos_30_dias: SincronizacaoAdvocaciaLedger[];
} {
  const [total] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [despesas] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE tipo_registro = 'despesa_legal' AND status = 'sucesso'
       AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [provisoes] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE tipo_registro = 'provisao_processo' AND status = 'sucesso'
       AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [sucessos] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE status = 'sucesso' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [erros] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE status = 'erro' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [duplicados] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_advocacia_ledger
     WHERE status = 'duplicado' AND criado_em >= datetime(?, '-30 days')`,
    [new Date().toISOString()]
  );

  const [ultimos30] = consultar<SincronizacaoAdvocaciaLedger>(
    db,
    `SELECT * FROM sincronizacoes_advocacia_ledger
     WHERE criado_em >= datetime(?, '-30 days')
     ORDER BY criado_em DESC
     LIMIT 50`,
    [new Date().toISOString()]
  );

  return {
    total_processados: total?.count || 0,
    despesas_sincronizadas: despesas?.count || 0,
    provisoes_registradas: provisoes?.count || 0,
    sucessos: sucessos?.count || 0,
    erros: erros?.count || 0,
    duplicados: duplicados?.count || 0,
    ultimos_30_dias: ultimos30 || [],
  };
}
