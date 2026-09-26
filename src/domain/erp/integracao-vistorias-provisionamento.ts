/**
 * Integração: Vistorias → Provisionamento Contábil
 * Sincroniza conclusão de vistoria com provisão de danos no ledger
 *
 * Fluxo automático:
 * Vistoria concluída em imovel-gestao
 *   → Dispara provisarDanosVistoria() em integracao-vistorias
 *   → Registra despesa de provisão no ledger
 *   → Calcula desconto em caução se aplicável
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { provisarDanosVistoria, calcularValorDanosVistoria } from "./integracao-vistorias";
import { registrarLancamentoContabil } from "./ledger";

export interface ProvisionamentoVistoriaLog {
  id: number;
  vistoria_id: number;
  imovel_id: number;
  contrato_id?: number;
  status: "pendente" | "provisionado" | "revertido" | "erro";
  valor_danos_estimado: number;
  valor_provision_registrada: number;
  valor_desconto_caucao: number;
  referencia_documento: string;
  criado_em: string;
  criado_por?: number;
}

/**
 * Estados de uma vistoria em relação ao provisionamento
 */
export enum StatusProvisionamento {
  NAO_REQUER = "nao_requer", // Sem danos estimados
  PENDENTE = "pendente", // Vistoria concluída mas provisão não feita
  PROVISIONADO = "provisionado", // Provisão registrada
  REVERTIDO = "revertido", // Danos reparados, provisão revertida
  ERRO = "erro", // Erro ao tentar provisionar
}

/**
 * Sincronizar vistoria concluída: registrar provisão no ledger
 * Deve ser chamado automaticamente quando vistoria.status → 'concluida'
 */
export function sincronizarVistoriaConcluidaParaProvisionamento(
  db: Database,
  vistoriaId: number,
  entidadeId: number,
  periodoId: number
): boolean {
  try {
    // 1. Validar vistoria
    const [vistoria] = consultar<{
      id: number;
      imovel_id: number;
      contrato_id?: number;
      status: string;
    }>(
      db,
      `SELECT id, imovel_id, contrato_id, status FROM vistorias WHERE id = ?`,
      [vistoriaId]
    );

    if (!vistoria || vistoria.status !== "concluida") {
      registrarProvisionamentoLog(
        db,
        vistoriaId,
        0,
        undefined,
        StatusProvisionamento.ERRO,
        0,
        0,
        0,
        "Vistoria não está concluída"
      );
      return false;
    }

    // 2. Calcular valor de danos
    const valor_danos = calcularValorDanosVistoria(db, vistoriaId);

    if (valor_danos <= 0) {
      registrarProvisionamentoLog(
        db,
        vistoriaId,
        vistoria.imovel_id,
        vistoria.contrato_id,
        StatusProvisionamento.NAO_REQUER,
        0,
        0,
        0,
        "Sem danos estimados"
      );
      return true; // Não é erro, apenas não requer provisão
    }

    // 3. Provisionar danos no ledger
    const resultado = provisarDanosVistoria(
      db,
      vistoriaId,
      entidadeId,
      periodoId
    );

    if (!resultado) {
      registrarProvisionamentoLog(
        db,
        vistoriaId,
        vistoria.imovel_id,
        vistoria.contrato_id,
        StatusProvisionamento.ERRO,
        valor_danos,
        0,
        0,
        "Erro ao provisionar danos"
      );
      return false;
    }

    // 4. Calcular desconto em caução se há
    let valor_desconto_caucao = 0;
    if (vistoria.contrato_id) {
      const [caucao] = consultar<{ id: number; valor_inicial: number }>(
        db,
        `SELECT id, valor_inicial FROM caucoes
         WHERE contrato_id = ? AND data_devolucao IS NULL`,
        [vistoria.contrato_id]
      );

      if (caucao) {
        valor_desconto_caucao = Math.min(valor_danos, caucao.valor_inicial);
      }
    }

    // 5. Registrar provisionamento com sucesso
    registrarProvisionamentoLog(
      db,
      vistoriaId,
      vistoria.imovel_id,
      vistoria.contrato_id,
      StatusProvisionamento.PROVISIONADO,
      valor_danos,
      valor_danos,
      valor_desconto_caucao,
      `VIST-${vistoriaId}-PROV`
    );

    // 6. Atualizar status da vistoria
    executar(
      db,
      `UPDATE vistorias SET status_provisionamento = ?, data_provisionamento = datetime('now') WHERE id = ?`,
      [StatusProvisionamento.PROVISIONADO, vistoriaId]
    );

    return true;
  } catch (erro) {
    registrarProvisionamentoLog(
      db,
      vistoriaId,
      0,
      undefined,
      StatusProvisionamento.ERRO,
      0,
      0,
      0,
      (erro as Error).message
    );
    return false;
  }
}

/**
 * Reverter provisão quando danos são reparados
 * Registra reversão da provisão no ledger
 */
export function revertorProvisionamentoDanosVistoria(
  db: Database,
  vistoriaId: number,
  entidadeId: number,
  periodoId: number,
  dataReparo: string
): boolean {
  try {
    // 1. Obter provisão registrada
    const [provisionamento] = consultar<ProvisionamentoVistoriaLog>(
      db,
      `SELECT * FROM provisionamento_vistoria_log WHERE vistoria_id = ? AND status = 'provisionado'`,
      [vistoriaId]
    );

    if (!provisionamento) {
      return false; // Não há provisão a reverter
    }

    // 2. Reverter TODOS os lançamentos vivos desta vistoria no razão (o débito da
    // provisão e, quando houve, o crédito de desconto na caução) — mesmo padrão de
    // estorno que reclassificarTransacao.ts já usa: a perna reversa entra com
    // origem_modulo 'manual' (o índice único idx_ledger_origem_unica indexa a tripla
    // origem_modulo/origem_id/conta_id só para módulos != 'manual', então a reversão não
    // colide com o lançamento original que ela reverte na MESMA conta) e
    // estornado_por_id liga um ao outro.
    //
    // Antes, as duas reversões usavam origem_modulo: 'vistorias' e origem_id: vistoriaId
    // — exatamente a mesma tripla (origem_modulo, origem_id, conta_id) do lançamento
    // original que ainda estava viva (estornado_por_id IS NULL) na mesma conta. Isso
    // violava idx_ledger_origem_unica, e o erro subia direto para o catch desta função,
    // que reportava reversão bem-sucedida como `false` sem nenhum diagnóstico.
    const lancamentosOriginais = consultar<{
      id: number;
      conta_id: number;
      valor_debito: number | null;
      valor_credito: number | null;
    }>(
      db,
      `SELECT id, conta_id, valor_debito, valor_credito FROM ledger_entries
       WHERE origem_modulo = 'vistorias' AND origem_id = ?
         AND estornado_por_id IS NULL AND estorno_de_id IS NULL`,
      [vistoriaId],
    );

    for (const original of lancamentosOriginais) {
      const estornoId = registrarLancamentoContabil(db, {
        entidade_id: entidadeId,
        periodo_id: periodoId,
        conta_id: original.conta_id,
        data_lancamento: dataReparo,
        valor_debito: original.valor_credito ?? undefined,
        valor_credito: original.valor_debito ?? undefined,
        descricao: `Reversão provisão danos vistoria ${vistoriaId} (danos reparados)`,
        origem_modulo: "manual",
        origem_id: original.id,
        referencia_documento: `VIST-${vistoriaId}-REVERT-${original.id}`,
      });
      executar(db, `UPDATE ledger_entries SET estornado_por_id = ? WHERE id = ?`, [
        estornoId,
        original.id,
      ]);
    }

    // 3. Atualizar status
    executar(
      db,
      `UPDATE provisionamento_vistoria_log SET status = 'revertido' WHERE id = ?`,
      [provisionamento.id]
    );

    executar(
      db,
      `UPDATE vistorias SET status_provisionamento = ? WHERE id = ?`,
      [StatusProvisionamento.REVERTIDO, vistoriaId]
    );

    return true;
  } catch (erro) {
    return false;
  }
}

/**
 * Processar todas as vistorias concluídas pendentes de provisionamento
 */
export function processarVistoriasPendentes(
  db: Database,
  entidadeId: number,
  periodoId: number
): {
  processadas: number;
  provisionadas: number;
  sem_danos: number;
  erros: number;
} {
  // Obter vistorias concluídas mas ainda não provisionadas
  // `v.data_vistoria` não existe em `vistorias` (a coluna real é `data_realizada` —
  // schema.sql): a query estourava "no such column" sem nada capturar o erro (esta
  // função não tem try/catch), quebrando processarVistoriasPendentes por inteiro.
  const vistoriasPendentes = consultar<{ id: number }>(
    db,
    `SELECT DISTINCT v.id
     FROM vistorias v
     LEFT JOIN provisionamento_vistoria_log p ON v.id = p.vistoria_id AND p.status = 'provisionado'
     WHERE v.status = 'concluida'
       AND p.id IS NULL
     ORDER BY v.data_realizada ASC`,
    []
  );

  let provisionadas = 0;
  let sem_danos = 0;
  let erros = 0;

  vistoriasPendentes.forEach((vistoria) => {
    const resultado = sincronizarVistoriaConcluidaParaProvisionamento(
      db,
      vistoria.id,
      entidadeId,
      periodoId
    );

    if (resultado) {
      // Verificar se foi provisionada ou sem danos
      const [log] = consultar<{ status: string }>(
        db,
        `SELECT status FROM provisionamento_vistoria_log WHERE vistoria_id = ? ORDER BY criado_em DESC LIMIT 1`,
        [vistoria.id]
      );

      if (log?.status === StatusProvisionamento.PROVISIONADO) {
        provisionadas++;
      } else if (log?.status === StatusProvisionamento.NAO_REQUER) {
        sem_danos++;
      }
    } else {
      erros++;
    }
  });

  return {
    processadas: vistoriasPendentes.length,
    provisionadas,
    sem_danos,
    erros,
  };
}

/**
 * Validar consistência vistoria ↔ provisão
 */
export function validarConsistenciaVistoriaProvisionamento(
  db: Database,
  vistoriaId: number
): {
  consistente: boolean;
  discrepancias: string[];
  provisaoInfo?: ProvisionamentoVistoriaLog;
} {
  const discrepancias: string[] = [];

  // 1. Verificar vistoria
  const [vistoria] = consultar<{ id: number; status: string }>(
    db,
    `SELECT id, status FROM vistorias WHERE id = ?`,
    [vistoriaId]
  );

  if (!vistoria) {
    discrepancias.push("Vistoria não encontrada");
    return { consistente: false, discrepancias };
  }

  // 2. Obter dados de provisão
  const [provisao] = consultar<ProvisionamentoVistoriaLog>(
    db,
    `SELECT * FROM provisionamento_vistoria_log WHERE vistoria_id = ? ORDER BY criado_em DESC LIMIT 1`,
    [vistoriaId]
  );

  // 3. Validar lógica
  if (vistoria.status === "concluida" && !provisao) {
    discrepancias.push("Vistoria concluída mas sem registro de provisão");
  }

  if (provisao?.status === StatusProvisionamento.PROVISIONADO) {
    // Verificar se há lançamento no ledger
    const [ledgerEntry] = consultar<{ id: number }>(
      db,
      `SELECT id FROM ledger_entries WHERE origem_modulo = 'vistorias' AND origem_id = ?`,
      [vistoriaId]
    );

    if (!ledgerEntry) {
      discrepancias.push("Provisão registrada mas sem lançamento no ledger");
    }
  }

  return {
    consistente: discrepancias.length === 0,
    discrepancias,
    provisaoInfo: provisao,
  };
}

/**
 * Registrar evento de provisionamento
 */
function registrarProvisionamentoLog(
  db: Database,
  vistoriaId: number,
  imovelId: number,
  contratoId: number | undefined,
  status: string,
  valorDanos: number,
  valorProvision: number,
  valorDesconto: number,
  referencia: string
): void {
  executar(
    db,
    `INSERT INTO provisionamento_vistoria_log
     (vistoria_id, imovel_id, contrato_id, status, valor_danos_estimado, valor_provision_registrada, valor_desconto_caucao, referencia_documento, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      vistoriaId,
      imovelId,
      contratoId || null,
      status,
      valorDanos,
      valorProvision,
      valorDesconto,
      referencia,
    ]
  );
}

/**
 * Obter status de provisionamento de uma vistoria
 */
export function obterStatusProvisionamento(
  db: Database,
  vistoriaId: number
): {
  status: string;
  valor_danos?: number;
  valor_provision?: number;
  ultima_atualizacao?: string;
} {
  const [log] = consultar<{
    status: string;
    valor_danos_estimado: number;
    valor_provision_registrada: number;
    criado_em: string;
  }>(
    db,
    `SELECT status, valor_danos_estimado, valor_provision_registrada, criado_em
     FROM provisionamento_vistoria_log
     WHERE vistoria_id = ?
     ORDER BY criado_em DESC
     LIMIT 1`,
    [vistoriaId]
  );

  return {
    status: log?.status || StatusProvisionamento.PENDENTE,
    valor_danos: log?.valor_danos_estimado,
    valor_provision: log?.valor_provision_registrada,
    ultima_atualizacao: log?.criado_em,
  };
}

/**
 * Gerar relatório de provisões pendentes
 */
export function gerarRelatorioProvisionoesPendentes(
  db: Database,
  entidadeId: number
): {
  total_vistorias: number;
  provisionadas: number;
  pendentes: number;
  valor_total_pendente: number;
  vistorias_criticas: Array<{
    vistoria_id: number;
    imovel_id: number;
    valor_danos: number;
    dias_atraso: number;
  }>;
} {
  const [totalVistorias] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM vistorias WHERE status = 'concluida'`,
    []
  );

  const [provisionadas] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(DISTINCT vistoria_id) as count FROM provisionamento_vistoria_log WHERE status = 'provisionado'`,
    []
  );

  const [pendentes] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(DISTINCT v.id) as count
     FROM vistorias v
     LEFT JOIN provisionamento_vistoria_log p ON v.id = p.vistoria_id AND p.status = 'provisionado'
     WHERE v.status = 'concluida' AND p.id IS NULL`,
    []
  );

  const [valorTotalPendente] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor_estimado), 0) as total
     FROM vistoria_item vi
     WHERE vi.vistoria_id IN (
       SELECT v.id FROM vistorias v
       LEFT JOIN provisionamento_vistoria_log p ON v.id = p.vistoria_id AND p.status = 'provisionado'
       WHERE v.status = 'concluida' AND p.id IS NULL
     )
     AND vi.tipo IN ('dano', 'necessidade_reparo')`,
    []
  );

  // BUG real: destructuring `[vistoriasCriticas]` pegava só a primeira linha da
  // consulta (que devolve até 10, uma por vistoria crítica), não a lista inteira —
  // vistorias_criticas virava um objeto solto em vez do array esperado pelo retorno.
  const vistoriasCriticas = consultar<{
    vistoria_id: number;
    imovel_id: number;
    valor_danos: number;
    dias_atraso: number;
  }>(
    db,
    `SELECT v.id as vistoria_id, v.imovel_id,
            SUM(vi.valor_estimado) as valor_danos,
            CAST((julianday('now') - julianday(v.data_realizada)) AS INTEGER) as dias_atraso
     FROM vistorias v
     LEFT JOIN provisionamento_vistoria_log p ON v.id = p.vistoria_id AND p.status = 'provisionado'
     LEFT JOIN vistoria_item vi ON v.id = vi.vistoria_id AND vi.tipo IN ('dano', 'necessidade_reparo')
     WHERE v.status = 'concluida' AND p.id IS NULL
       AND dias_atraso > 30
     GROUP BY v.id
     ORDER BY dias_atraso DESC
     LIMIT 10`,
    []
  );

  return {
    total_vistorias: totalVistorias?.count || 0,
    provisionadas: provisionadas?.count || 0,
    pendentes: pendentes?.count || 0,
    valor_total_pendente: valorTotalPendente?.total || 0,
    vistorias_criticas: vistoriasCriticas || [],
  };
}
