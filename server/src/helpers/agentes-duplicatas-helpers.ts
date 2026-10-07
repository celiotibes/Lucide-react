/**
 * Helper functions para deduplicação de agentes econômicos
 * Funções que eram PL/pgSQL no PostgreSQL, reescritas para SQLite em TypeScript
 */

import Database from "better-sqlite3";

/**
 * Conta referências de um agente em várias tabelas
 * Equivalente a: count_agent_references(agent_id UUID)
 */
export function countAgentReferences(db: Database.Database, agentId: string): Array<{
  table_name: string;
  reference_count: number;
}> {
  const results: Array<{ table_name: string; reference_count: number }> = [];

  // Contar em ledger_entries
  const ledgerCount = db
    .prepare("SELECT COUNT(*) as count FROM ledger_entries WHERE agente_id = ?")
    .get(agentId) as { count: number };
  results.push({
    table_name: "ledger_entries",
    reference_count: ledgerCount?.count || 0,
  });

  // Contar em agentes_validacoes
  const validacoesCount = db
    .prepare("SELECT COUNT(*) as count FROM agentes_validacoes WHERE agente_id = ?")
    .get(agentId) as { count: number };
  results.push({
    table_name: "agentes_validacoes",
    reference_count: validacoesCount?.count || 0,
  });

  // Contar em agentes_vinculacoes
  const vinculacoesCount = db
    .prepare("SELECT COUNT(*) as count FROM agentes_vinculacoes WHERE agente_id = ?")
    .get(agentId) as { count: number };
  results.push({
    table_name: "agentes_vinculacoes",
    reference_count: vinculacoesCount?.count || 0,
  });

  return results;
}

/**
 * Valida se um merge de agentes é possível
 * Equivalente a: validate_agent_merge(primary_agent_id UUID, secondary_agent_id UUID)
 */
export function validateAgentMerge(
  db: Database.Database,
  primaryAgentId: string,
  secondaryAgentId: string
): {
  can_merge: boolean;
  message: string;
  issues: string[];
} {
  const issues: string[] = [];

  // Verificar se agentes existem
  const primaryExists = db
    .prepare("SELECT 1 FROM agentes_economicos WHERE id = ?")
    .get(primaryAgentId);
  const secondaryExists = db
    .prepare("SELECT 1 FROM agentes_economicos WHERE id = ?")
    .get(secondaryAgentId);

  if (!primaryExists) {
    issues.push("Agente primário não existe");
  }

  if (!secondaryExists) {
    issues.push("Agente secundário não existe");
  }

  if (primaryAgentId === secondaryAgentId) {
    issues.push("Não é possível fundir um agente com ele mesmo");
  }

  const can_merge = issues.length === 0;
  const message = can_merge
    ? "Merge pode ser realizado"
    : "Merge não pode ser realizado: " + issues.join("; ");

  return {
    can_merge,
    message,
    issues,
  };
}
