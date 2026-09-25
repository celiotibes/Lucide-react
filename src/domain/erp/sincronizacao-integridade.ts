/**
 * Sincronização e Integridade ERP
 * Validação e reconciliação de dados entre módulos
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface RelatoriIntegridade {
  status: "ok" | "alerta" | "erro";
  data_verificacao: string;
  periodos_abertos: number;
  transacoes_pendentes_auditoria: number;
  discrepancias: DiscrepanciaEncontrada[];
  resumo_acoes_recomendadas: string[];
}

export interface DiscrepanciaEncontrada {
  tipo: string;
  descricao: string;
  modulo_afetado: string;
  severidade: "info" | "aviso" | "critico";
  dados: Record<string, unknown>;
}

export function verificarIntegridade(db: Database): RelatoriIntegridade {
  const discrepancias: DiscrepanciaEncontrada[] = [];
  const acoes_recomendadas: string[] = [];

  // 1. Verificar períodos contábeis abertos
  const [periodosAbertos] = consultar<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM periodos_contabeis WHERE status = 'aberto'",
    [],
  );

  if ((periodosAbertos?.count || 0) > 1) {
    discrepancias.push({
      tipo: "multiplos_periodos_abertos",
      descricao: `${periodosAbertos?.count} períodos contábeis abertos simultaneamente`,
      modulo_afetado: "core",
      severidade: "aviso",
      dados: { periodos_abertos: periodosAbertos?.count },
    });
    acoes_recomendadas.push("Fechar os períodos contábeis antigos antes de abrir novos");
  }

  // 2. Verificar lançamentos não auditados
  const [lancamentosNaoAuditados] = consultar<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM ledger_entries WHERE auditada = 0",
    [],
  );

  if ((lancamentosNaoAuditados?.count || 0) > 100) {
    discrepancias.push({
      tipo: "alto_volume_lancamentos_nao_auditados",
      descricao: `${lancamentosNaoAuditados?.count} lançamentos aguardando auditoria`,
      modulo_afetado: "core",
      severidade: "aviso",
      dados: { lancamentos_pendentes: lancamentosNaoAuditados?.count },
    });
    acoes_recomendadas.push("Executar auditoria de lançamentos contábeis");
  }

  // 3. Validar receitas de aluguel vs contratos ativos
  const [contratosAtivos] = consultar<{ count: number; valor_total: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(valor_referencia), 0) as valor_total
     FROM contratos_locacao WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
    [],
  );

  const [receitasAluguel] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '5.1.01'`,
    [],
  );

  if (contratosAtivos && receitasAluguel) {
    const diferenca = Math.abs((contratosAtivos.valor_total || 0) - (receitasAluguel.total || 0));
    if (diferenca > 100) {
      discrepancias.push({
        tipo: "receitas_aluguel_divergentes",
        descricao: `Diferença de R$ ${diferenca.toFixed(2)} entre contratos e receitas registradas`,
        modulo_afetado: "contratos",
        severidade: "critico",
        dados: {
          valor_esperado_contratos: contratosAtivos.valor_total,
          valor_registrado: receitasAluguel.total,
          diferenca,
        },
      });
      acoes_recomendadas.push("Revisar receitas de aluguel (possível período não contabilizado)");
    }
  }

  // 4. Verificar balancete (débitos = créditos)
  const [debitos] = consultar<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(valor_debito), 0) as total FROM ledger_entries",
    [],
  );

  const [creditos] = consultar<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(valor_credito), 0) as total FROM ledger_entries",
    [],
  );

  const diferenca = Math.abs((debitos?.total || 0) - (creditos?.total || 0));
  if (diferenca > 1) {
    discrepancias.push({
      tipo: "balancete_desbalanceado",
      descricao: `Débitos (R$ ${debitos?.total}) != Créditos (R$ ${creditos?.total}). Diferença: R$ ${diferenca}`,
      modulo_afetado: "core",
      severidade: "critico",
      dados: { debitos: debitos?.total, creditos: creditos?.total, diferenca },
    });
    acoes_recomendadas.push("Auditar lançamentos para encontrar erro de balanceamento");
  }

  // 5. Verificar períodos com lançamentos futuros
  const [lancamentosFuturos] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM ledger_entries
     WHERE data_lancamento > datetime('now')`,
    [],
  );

  if ((lancamentosFuturos?.count || 0) > 0) {
    discrepancias.push({
      tipo: "lancamentos_com_data_futura",
      descricao: `${lancamentosFuturos?.count} lançamentos com data anterior à data de processamento`,
      modulo_afetado: "core",
      severidade: "aviso",
      dados: { lancamentos_futuros: lancamentosFuturos?.count },
    });
    acoes_recomendadas.push("Revisar datas de lançamento para garantir conformidade");
  }

  // 6. Verificar estornos sem aprovação
  const [esturnosNaoAprovados] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM ledger_entries
     WHERE estornado_por_id IS NOT NULL AND auditada = 0`,
    [],
  );

  if ((esturnosNaoAprovados?.count || 0) > 0) {
    discrepancias.push({
      tipo: "estornos_nao_aprovados",
      descricao: `${esturnosNaoAprovados?.count} estornos aguardando aprovação`,
      modulo_afetado: "core",
      severidade: "aviso",
      dados: { estornos_pendentes: esturnosNaoAprovados?.count },
    });
    acoes_recomendadas.push("Revisar e aprovar estornos contábeis");
  }

  const status =
    discrepancias.some((d) => d.severidade === "critico")
      ? "erro"
      : discrepancias.length > 0
        ? "alerta"
        : "ok";

  return {
    status,
    data_verificacao: new Date().toISOString(),
    periodos_abertos: periodosAbertos?.count || 0,
    transacoes_pendentes_auditoria: lancamentosNaoAuditados?.count || 0,
    discrepancias,
    resumo_acoes_recomendadas: acoes_recomendadas,
  };
}

export function reconciliarAlugueis(db: Database): {
  valor_esperado: number;
  valor_recebido: number;
  divergencias: Array<{ imovel_id: number; contrato_id: number; diferenca: number }>;
} {
  const alugueisPorContrato = consultar<{
    contrato_id: number;
    imovel_id: number;
    valor_esperado: number;
    valor_recebido: number;
  }>(
    db,
    `SELECT
      c.id as contrato_id,
      c.imovel_id,
      c.valor_referencia as valor_esperado,
      COALESCE(SUM(le.valor_debito), 0) as valor_recebido
     FROM contratos_locacao c
     LEFT JOIN ledger_entries le ON le.origem_modulo = 'contratos'
       AND le.origem_id = c.id
       AND le.valor_debito > 0
     WHERE c.data_fim IS NULL OR c.data_fim >= DATE('now')
     GROUP BY c.id, c.imovel_id`,
    [],
  );

  const divergencias = (alugueisPorContrato || [])
    .filter((r: any) => Math.abs((r.valor_esperado || 0) - (r.valor_recebido || 0)) > 10)
    .map((r: any) => ({
      imovel_id: r.imovel_id,
      contrato_id: r.contrato_id,
      diferenca: (r.valor_esperado || 0) - (r.valor_recebido || 0),
    }));

  const valor_esperado = (alugueisPorContrato || []).reduce(
    (sum: number, r: any) => sum + (r.valor_esperado || 0),
    0,
  );
  const valor_recebido = (alugueisPorContrato || []).reduce(
    (sum: number, r: any) => sum + (r.valor_recebido || 0),
    0,
  );

  return {
    valor_esperado,
    valor_recebido,
    divergencias,
  };
}
