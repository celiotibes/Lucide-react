/**
 * Integração: Skillos → Ledger
 * Sincroniza eventos mapeados do Skillos para lançamentos contábeis
 *
 * Fluxo:
 * SkillsLogEntry (skillos-integracao)
 *   → sincronizarSkillsParaLedger()
 *   → registrarLancamentoContabil() (origem_modulo = origem específica)
 *   → Rastreamento de provenance
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import crypto from "crypto";

export interface SincronizacaoSkillsLog {
  id: number;
  skills_log_id: number;
  ledger_id: number;
  skill_skillos: string;
  tipo_evento: string;
  origem_modulo: string;
  status: "sucesso" | "erro" | "duplicado" | "descartado";
  hash_provenance: string;
  mensagem_erro?: string;
  criado_em: string;
  tentativas: number;
}

export interface MapeamentoSkillsLedger {
  skill_skillos: string;
  tipo_evento: string;
  origem_modulo: "transacoes" | "contratos" | "patrimonio" | "caucao" | "financiamento" | "rateios" | "vistorias" | "advocacia" | "contas-pessoais" | "imovel-gestao" | "manual";
  prioridade: "critica" | "alta" | "media" | "baixa";
  conta_id_debito?: number;
  conta_id_credito?: number;
  mapeamento_campos: Record<string, string>; // campo_skillsLogEntry → campo_ledger
}

/**
 * MAPEAMENTO DEFINITIVO: Skillos → Ledger
 * Expande o mapeamento existente em skillos-integracao.ts com suporte a ledger
 */
const MAPEAMENTO_SKILLS_LEDGER: MapeamentoSkillsLedger[] = [
  // === CONTRATOS (já existia) ===
  {
    skill_skillos: "accounting-reconstruction",
    tipo_evento: "aluguel_recebido",
    origem_modulo: "contratos",
    prioridade: "critica",
    conta_id_debito: 1, // Conta corrente (ativo circulante)
    conta_id_credito: 5, // Receita de aluguel
    mapeamento_campos: {
      "data_evento": "data_lancamento",
      "valor": "valor",
      "referencia_documento": "referencia_documento",
    },
  },
  {
    skill_skillos: "accounting-reconstruction",
    tipo_evento: "inadimplencia_juros",
    origem_modulo: "contratos",
    prioridade: "alta",
    conta_id_debito: 6, // Conta a receber (inadimplência)
    conta_id_credito: 7, // Receita de juros
    mapeamento_campos: {
      "data_evento": "data_lancamento",
      "valor": "valor",
    },
  },

  // === ADVOCACIA (NOVO) ===
  {
    skill_skillos: "legal-document-analysis",
    tipo_evento: "despesa_honorarios",
    origem_modulo: "advocacia",
    prioridade: "alta",
    conta_id_debito: 30, // Despesa com Processos Legais (criar se não existir)
    conta_id_credito: 8, // Conta a pagar (passivo)
    mapeamento_campos: {
      "data_evento": "data_lancamento",
      "valor_despesa": "valor",
      "beneficiario": "descricao",
    },
  },
  {
    skill_skillos: "legal-document-analysis",
    tipo_evento: "despesa_custas_judiciais",
    origem_modulo: "advocacia",
    prioridade: "alta",
    conta_id_debito: 31, // Despesa com Custas Judiciais
    conta_id_credito: 8, // Conta a pagar
    mapeamento_campos: {
      "data_evento": "data_lancamento",
      "valor_despesa": "valor",
    },
  },

  // === CONTAS-PESSOAIS (NOVO) ===
  {
    skill_skillos: "personal-accounting",
    tipo_evento: "entrada_pessoal",
    origem_modulo: "contas-pessoais",
    prioridade: "media",
    conta_id_debito: 9, // Conta pessoal (ativo circulante)
    conta_id_credito: 10, // Receita pessoal (não operacional)
    mapeamento_campos: {
      "data_movimento": "data_lancamento",
      "valor": "valor",
      "categoria": "descricao",
    },
  },
  {
    skill_skillos: "personal-accounting",
    tipo_evento: "saida_pessoal",
    origem_modulo: "contas-pessoais",
    prioridade: "media",
    conta_id_debito: 11, // Despesa pessoal (não operacional)
    conta_id_credito: 9, // Conta pessoal
    mapeamento_campos: {
      "data_movimento": "data_lancamento",
      "valor": "valor",
      "categoria": "descricao",
    },
  },

  // === IMOVEL-GESTAO (NOVO) ===
  {
    skill_skillos: "property-management",
    tipo_evento: "despesa_manutencao",
    origem_modulo: "imovel-gestao",
    prioridade: "alta",
    conta_id_debito: 32, // Despesa com Manutenção
    conta_id_credito: 8, // Conta a pagar
    mapeamento_campos: {
      "data_manutencao": "data_lancamento",
      "valor_manutencao": "valor",
      "descricao": "descricao",
    },
  },
  {
    skill_skillos: "property-management",
    tipo_evento: "despesa_operacional",
    origem_modulo: "imovel-gestao",
    prioridade: "alta",
    conta_id_debito: 33, // Despesa Operacional (água, luz, etc)
    conta_id_credito: 8, // Conta a pagar
    mapeamento_campos: {
      "data_evento": "data_lancamento",
      "valor": "valor",
      "tipo_despesa": "descricao",
    },
  },
];

/**
 * Gerar hash SHA-256 para rastreamento de provenance
 * Impede processamento duplicado do mesmo evento
 */
function gerarHashProvenance(
  skillsLogId: number,
  tipoEvento: string,
  valor: number,
  dataEvento: string
): string {
  const dados = `${skillsLogId}|${tipoEvento}|${valor}|${dataEvento}`;
  return crypto.createHash("sha256").update(dados).digest("hex");
}

/**
 * Obter mapeamento de skill para ledger
 */
export function obterMapeamentoSkill(
  skillSkillos: string,
  tipoEvento: string
): MapeamentoSkillsLedger | null {
  return (
    MAPEAMENTO_SKILLS_LEDGER.find(
      (m) => m.skill_skillos === skillSkillos && m.tipo_evento === tipoEvento
    ) || null
  );
}

/**
 * Validar se SkillsLogEntry pode ser sincronizado para ledger
 */
export function validarDadosParaLedger(
  dadosJson: Record<string, unknown>,
  mapeamento: MapeamentoSkillsLedger
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  // Validar campos obrigatórios
  const camposObrigatorios = ["data_evento", "valor"];
  camposObrigatorios.forEach((campo) => {
    if (!dadosJson[campo]) {
      erros.push(`Campo obrigatório ausente: ${campo}`);
    }
  });

  // Validar tipos
  if (typeof dadosJson.valor !== "number" || (dadosJson.valor as number) < 0) {
    erros.push(`Valor inválido: deve ser número positivo`);
  }

  if (typeof dadosJson.data_evento !== "string") {
    erros.push(`Data evento deve ser string em formato ISO`);
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Sincronizar um evento Skillos para ledger
 * Retorna ID do lançamento contábil criado ou null se falha
 */
export function sincronizarEventoSkillsParaLedger(
  db: Database,
  skillsLogId: number,
  skillSkillos: string,
  tipoEvento: string,
  entidadeId: number,
  periodoId: number,
  dadosJson: Record<string, unknown>,
  tentativa: number = 1
): { lancamento_id: number; sincronizacao_id: number } | null {
  try {
    // 1. Obter mapeamento
    const mapeamento = obterMapeamentoSkill(skillSkillos, tipoEvento);
    if (!mapeamento) {
      registrarSincronizacaoError(
        db,
        skillsLogId,
        skillSkillos,
        tipoEvento,
        "descartado",
        "Mapeamento não encontrado",
        tentativa
      );
      return null;
    }

    // 2. Validar dados
    const validacao = validarDadosParaLedger(dadosJson, mapeamento);
    if (!validacao.valido) {
      registrarSincronizacaoError(
        db,
        skillsLogId,
        skillSkillos,
        tipoEvento,
        "erro",
        validacao.erros.join("; "),
        tentativa
      );
      return null;
    }

    // 3. Verificar duplicação via hash de provenance
    const hashProvenance = gerarHashProvenance(
      skillsLogId,
      tipoEvento,
      dadosJson.valor as number,
      dadosJson.data_evento as string
    );

    const [existente] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_skillos_ledger
       WHERE hash_provenance = ? AND status = 'sucesso'`,
      [hashProvenance]
    );

    if (existente) {
      registrarSincronizacaoError(
        db,
        skillsLogId,
        skillSkillos,
        tipoEvento,
        "duplicado",
        `Evento já sincronizado: ${existente.id}`,
        tentativa
      );
      return null;
    }

    // 4. Registrar lançamento contábil
    const lancamentoId = registrarLancamentoContabil(db, {
      entidade_id: entidadeId,
      periodo_id: periodoId,
      conta_id: mapeamento.conta_id_debito || 1,
      data_lancamento: dadosJson.data_evento as string,
      valor_debito: (dadosJson.valor as number) || undefined,
      valor_credito: mapeamento.conta_id_credito ? (dadosJson.valor as number) : undefined,
      descricao: (dadosJson.descricao as string) || `Evento Skillos: ${tipoEvento}`,
      origem_modulo: mapeamento.origem_modulo as any,
      origem_id: skillsLogId,
      referencia_documento: `SKILLOS-${skillsLogId}`,
    });

    if (lancamentoId <= 0) {
      throw new Error("Falha ao registrar lançamento contábil");
    }

    // 5. Registrar sincronização com sucesso
    const sincronizacaoId = registrarSincronizacaoSucesso(
      db,
      skillsLogId,
      lancamentoId,
      skillSkillos,
      tipoEvento,
      mapeamento.origem_modulo,
      hashProvenance
    );

    return { lancamento_id: lancamentoId, sincronizacao_id: sincronizacaoId };
  } catch (erro) {
    registrarSincronizacaoError(
      db,
      skillsLogId,
      skillSkillos,
      tipoEvento,
      "erro",
      (erro as Error).message,
      tentativa
    );
    return null;
  }
}

/**
 * Sincronizar todos os SkillsLogEntry pendentes para ledger
 */
export function sincronizarSkillsParaLedger(
  db: Database,
  entidadeId: number,
  periodoId: number,
  limiteEntries: number = 100
): { processados: number; sucessos: number; falhas: number } {
  const skillsEntries = consultar<{
    id: number;
    skillos_ref_id: string;
    lucide_tabela: string;
    lucide_id: number;
    tipo_evento: string;
    dados_json: string;
    status: string;
    tentativas: number;
  }>(
    db,
    `SELECT id, skillos_ref_id, lucide_tabela, lucide_id, tipo_evento, dados_json, status, tentativas
     FROM skillos_log_entries
     WHERE status IN ('pendente', 'erro')
       AND tentativas < 3
     ORDER BY criado_em ASC
     LIMIT ?`,
    [limiteEntries]
  );

  let sucessos = 0;
  let falhas = 0;

  if (skillsEntries.length === 0) {
    return { processados: 0, sucessos: 0, falhas: 0 };
  }

  skillsEntries.forEach((entry) => {
    try {
      const dadosJson = JSON.parse(entry.dados_json);
      const resultado = sincronizarEventoSkillsParaLedger(
        db,
        entry.id,
        entry.lucide_tabela, // skill_skillos
        entry.tipo_evento,
        entidadeId,
        periodoId,
        dadosJson,
        entry.tentativas + 1
      );

      if (resultado) {
        sucessos++;
      } else {
        falhas++;
      }
    } catch (erro) {
      registrarSincronizacaoError(
        db,
        entry.id,
        entry.lucide_tabela,
        entry.tipo_evento,
        "erro",
        (erro as Error).message,
        entry.tentativas + 1
      );
      falhas++;
    }
  });

  return {
    processados: skillsEntries.length,
    sucessos,
    falhas,
  };
}

/**
 * Registrar sucesso na tabela de sincronização
 */
function registrarSincronizacaoSucesso(
  db: Database,
  skillsLogId: number,
  ledgerId: number,
  skillSkillos: string,
  tipoEvento: string,
  origemModulo: string,
  hashProvenance: string
): number {
  executar(
    db,
    `INSERT INTO sincronizacoes_skillos_ledger
     (skills_log_id, ledger_id, skill_skillos, tipo_evento, origem_modulo, status, hash_provenance, tentativas, criado_em)
     VALUES (?, ?, ?, ?, ?, 'sucesso', ?, 1, datetime('now'))`,
    [
      skillsLogId,
      ledgerId,
      skillSkillos,
      tipoEvento,
      origemModulo,
      hashProvenance,
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
 * Registrar erro na tabela de sincronização
 */
function registrarSincronizacaoError(
  db: Database,
  skillsLogId: number,
  skillSkillos: string,
  tipoEvento: string,
  status: "erro" | "duplicado" | "descartado",
  mensagemErro: string,
  tentativas: number
): void {
  executar(
    db,
    `INSERT INTO sincronizacoes_skillos_ledger
     (skills_log_id, skill_skillos, tipo_evento, status, mensagem_erro, tentativas, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [skillsLogId, skillSkillos, tipoEvento, status, mensagemErro, tentativas]
  );
}

/**
 * Gerar relatório de sincronização
 */
export function gerarRelatoriaSincronizacao(
  db: Database,
  entidadeId: number,
  periodoId: number
): {
  total_processados: number;
  sucessos: number;
  erros: number;
  duplicados: number;
  descartados: number;
  ultimos_30_dias: SincronizacaoSkillsLog[];
} {
  const [total] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_skillos_ledger`,
    []
  );

  const [sucessos] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_skillos_ledger WHERE status = 'sucesso'`,
    []
  );

  const [erros] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_skillos_ledger WHERE status = 'erro'`,
    []
  );

  const [duplicados] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_skillos_ledger WHERE status = 'duplicado'`,
    []
  );

  const [descartados] = consultar<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM sincronizacoes_skillos_ledger WHERE status = 'descartado'`,
    []
  );

  const [ultimos30] = consultar<SincronizacaoSkillsLog>(
    db,
    `SELECT * FROM sincronizacoes_skillos_ledger
     WHERE datetime(criado_em) >= datetime('now', '-30 days')
     ORDER BY criado_em DESC
     LIMIT 50`,
    []
  );

  return {
    total_processados: total?.count || 0,
    sucessos: sucessos?.count || 0,
    erros: erros?.count || 0,
    duplicados: duplicados?.count || 0,
    descartados: descartados?.count || 0,
    ultimos_30_dias: ultimos30 || [],
  };
}
