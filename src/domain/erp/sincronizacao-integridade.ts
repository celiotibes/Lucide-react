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

/** Verificação de integridade do ERP */
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

  // 2. Verificar transações não auditadas
  const [transacoesNaoAuditadas] = consultar<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM transacoes_integradas WHERE auditada = 0",
    [],
  );

  if ((transacoesNaoAuditadas?.count || 0) > 100) {
    discrepancias.push({
      tipo: "alto_volume_transacoes_nao_auditadas",
      descricao: `${transacoesNaoAuditadas?.count} transações aguardando auditoria`,
      modulo_afetado: "core",
      severidade: "aviso",
      dados: { transacoes_pendentes: transacoesNaoAuditadas?.count },
    });
    acoes_recomendadas.push("Executar auditoria de transações integradas");
  }

  // 3. Validar receitas de aluguel vs contratos ativos
  const [contatosAtivos] = consultar<{ count: number; valor_total: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(valor_mensal), 0) as valor_total
     FROM contratos_locacao WHERE status = 'ativo'`,
    [],
  );

  const [receitasEsperadas] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas WHERE conta_id = 1 AND tipo = 'credit'`,
    [],
  );

  if (contatosAtivos && receitasEsperadas) {
    const diferenca = Math.abs((contatosAtivos.valor_total || 0) - (receitasEsperadas.total || 0));
    if (diferenca > 100) {
      discrepancias.push({
        tipo: "receitas_aluguel_divergentes",
        descricao: `Diferença de R$ ${diferenca.toFixed(2)} entre contratos e receitas registradas`,
        modulo_afetado: "contratos",
        severidade: "critico",
        dados: {
          valor_esperado_contratos: contatosAtivos.valor_total,
          valor_registrado: receitasEsperadas.total,
          diferenca,
        },
      });
      acoes_recomendadas.push(
        "Revisar mapeamento de receitas de aluguel nos contratos (possível contrato não contabilizado)",
      );
    }
  }

  // 4. Verificar rateios vs despesas
  const [despesasComuns] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE conta_id IN (20, 21, 22, 23, 24) AND tipo = 'debit'`,
    [],
  );

  const [rateiados] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE conta_id IN (25, 26) AND tipo = 'credit'`,
    [],
  );

  if (despesasComuns && rateiados && Math.abs((despesasComuns.total || 0) - (rateiados.total || 0)) > 50) {
    discrepancias.push({
      tipo: "rateios_incompletos",
      descricao: `Despesas (R$ ${despesasComuns.total}) não correspondem a rateios (R$ ${rateiados.total})`,
      modulo_afetado: "rateio",
      severidade: "aviso",
      dados: { despesas: despesasComuns.total, rateiados: rateiados.total },
    });
    acoes_recomendadas.push("Verificar rateios de despesas comuns (possível falta de alocação)");
  }

  // 5. Verificar balancete (débitos = créditos)
  const [debitos] = consultar<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes_integradas WHERE tipo = 'debit'",
    [],
  );

  const [creditos] = consultar<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes_integradas WHERE tipo = 'credit'",
    [],
  );

  const diferenca = Math.abs((debitos?.total || 0) - (creditos?.total || 0));
  if (diferenca > 1) {
    // Permite margem de arredondamento
    discrepancias.push({
      tipo: "balancete_desbalanceado",
      descricao: `Débitos (R$ ${debitos?.total}) != Créditos (R$ ${creditos?.total}). Diferença: R$ ${diferenca}`,
      modulo_afetado: "core",
      severidade: "critico",
      dados: { debitos: debitos?.total, creditos: creditos?.total, diferenca },
    });
    acoes_recomendadas.push(
      "Auditar transações integradas para encontrar lançamento duplo ou faltante",
    );
  }

  // 6. Verificar inadimplência não contabilizada
  const [inadimplentes] = consultar<{ total: number; quantidade: number }>(
    db,
    `SELECT COALESCE(SUM(c.valor_mensal), 0) as total, COUNT(*) as quantidade
     FROM contratos_locacao c
     WHERE c.status = 'inadimplente'`,
    [],
  );

  if ((inadimplentes?.quantidade || 0) > 0) {
    discrepancias.push({
      tipo: "inadimplencia_nao_provisionada",
      descricao: `${inadimplentes?.quantidade} contratos inadimplentes sem provisão contábil registrada`,
      modulo_afetado: "contratos",
      severidade: "aviso",
      dados: {
        contratos_inadimplentes: inadimplentes?.quantidade,
        valor_em_risco: inadimplentes?.total,
      },
    });
    acoes_recomendadas.push("Criar provisão para devedora em conta de resultado");
  }

  const status = discrepancias.some((d) => d.severidade === "critico") ? "erro" :
                 discrepancias.length > 0 ? "alerta" : "ok";

  return {
    status,
    data_verificacao: new Date().toISOString(),
    periodos_abertos: periodosAbertos?.count || 0,
    transacoes_pendentes_auditoria: transacoesNaoAuditadas?.count || 0,
    discrepancias,
    resumo_acoes_recomendadas: acoes_recomendadas,
  };
}

/** Reconciliação automática: Aluguel esperado vs Recebido */
export function reconciliarAlugueis(db: Database): {
  valor_esperado: number;
  valor_recebido: number;
  divergencias: Array<{ imovel_id: number; diferenca: number }>;
} {
  const alugueisPorImovel = consultar<{
    imovel_id: number;
    valor_mensal: number;
    valor_recebido: number;
  }>(
    db,
    `SELECT
      c.imovel_id,
      c.valor_mensal,
      COALESCE(SUM(t.valor), 0) as valor_recebido
     FROM contratos_locacao c
     LEFT JOIN transacoes_integradas t ON t.origem_id = c.id
       AND t.origem_modulo = 'contratos' AND t.conta_id = 2
     WHERE c.status = 'ativo'
     GROUP BY c.imovel_id`,
    [],
  );

  const divergencias = (alugueisPorImovel || [])
    .filter((r: any) => Math.abs((r.valor_mensal || 0) - (r.valor_recebido || 0)) > 10)
    .map((r: any) => ({
      imovel_id: r.imovel_id,
      diferenca: (r.valor_mensal || 0) - (r.valor_recebido || 0),
    }));

  const valor_esperado = (alugueisPorImovel || []).reduce((sum: number, r: any) => sum + (r.valor_mensal || 0), 0);
  const valor_recebido = (alugueisPorImovel || []).reduce((sum: number, r: any) => sum + (r.valor_recebido || 0), 0);

  return {
    valor_esperado,
    valor_recebido,
    divergencias,
  };
}
