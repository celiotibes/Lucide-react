/**
 * Integração: Skillos Habilidades → Ledger Central
 * Persistência de desenvolvimento/aquisição/manutenção de habilidades
 *
 * Fluxo:
 * validarHabilidade() (skillos-module)
 *   → registrarHabilidadeParaAquisicao() / registrarHabilidadeAdquirida()
 *   → registrarLancamentoContabil() (origem_modulo = 'skillos')
 *   → skillos_ledger_entries (rastreamento bidirecional)
 *
 * Mapas de Contas:
 * - Aquisição: Débito 5.3.05 (Despesa Desenvolvimento) / Crédito 3.1.02 (Contas a Pagar)
 * - Certificação: Débito 1.2.10 (Ativos Intangíveis) / Crédito 3.1.02 (Contas a Pagar)
 * - Manutenção: Débito 5.3.06 (Despesa Manutenção Habilidades) / Crédito 3.1.02
 * - Depreciação: Débito 5.3.07 (Depreciação Habilidades) / Crédito 1.2.10 (Ativos Intangíveis)
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil, LancamentoContabil } from "./ledger";

/**
 * Rastreamento bidirecional: habilidade ↔ ledger
 * Permite auditoria completa e reversão de lançamentos
 */
export interface SkillsLedgerEntry {
  id?: number;
  habilidade_id: number;
  tipo_habilidade: "aquisicao" | "manutencao" | "certificacao";
  ledger_entry_id: number;
  ledger_entry_id_contrapartida?: number;
  pessoa_id: number;
  entidade_id: number;
  periodo_id: number;
  valor: number;
  conta_debito_id: number;
  conta_credito_id: number;
  descricao: string;
  status_ciclo_vida: "ativa" | "depreciadaTotal" | "obsoleta";
  data_criacao?: string;
}

/**
 * Informações de ROI de habilidades por pessoa
 */
export interface RelatorioROIHabilidades {
  pessoa_id: number;
  pessoa_nome: string;
  total_investimento: number;
  total_habilidades_ativas: number;
  valor_assets_intangibles: number;
  roi_percentual: number;
  por_habilidade: Array<{
    habilidade_id: number;
    habilidade_nome: string;
    investimento: number;
    data_aquisicao: string;
    status: string;
    valor_asset: number;
  }>;
}

/**
 * Mapeamento de contas contábeis para skillos
 */
const CONTAS_SKILLOS = {
  // Despesas (Débito)
  DESPESA_DESENVOLVIMENTO: 45, // 5.3.05 - Despesa de Desenvolvimento
  DESPESA_MANUTENCAO_HABILIDADES: 46, // 5.3.06 - Despesa Manutenção Habilidades
  DESPESA_DEPRECIACAO_HABILIDADES: 47, // 5.3.07 - Depreciação Habilidades

  // Ativos (Débito na aquisição)
  ATIVOS_INTANGIVEIS: 20, // 1.2.10 - Ativos Intangíveis

  // Passivos (Crédito)
  CONTAS_A_PAGAR: 13, // 3.1.02 - Contas a Pagar
};

/**
 * Registrar habilidade em aquisição (fase de treinamento)
 * Cria lançamento duplo: débito Despesa Desenvolvimento + crédito Contas a Pagar
 */
export function registrarHabilidadeParaAquisicao(
  db: Database,
  habilidade_id: number,
  pessoa_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_treinamento: number,
  descricao_habilidade: string,
  data_inicio_treinamento: string
): SkillsLedgerEntry {
  if (!habilidade_id || !pessoa_id || !entidade_id || !periodo_id) {
    throw new Error("Habilidade: parâmetros obrigatórios ausentes");
  }

  if (valor_treinamento <= 0) {
    throw new Error("Habilidade: valor_treinamento deve ser positivo");
  }

  const descricao = `Aquisição Habilidade: ${descricao_habilidade} - Pessoa ${pessoa_id}`;

  // Lançamento débito: Despesa de Desenvolvimento
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.DESPESA_DESENVOLVIMENTO,
    data_lancamento: data_inicio_treinamento,
    valor_debito: valor_treinamento,
    descricao,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-ACQ-${habilidade_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de aquisição de habilidade");
  }

  // Lançamento crédito: Contas a Pagar
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    data_lancamento: data_inicio_treinamento,
    valor_credito: valor_treinamento,
    descricao: `Pagável - ${descricao_habilidade}`,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-ACQ-${habilidade_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de aquisição de habilidade");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoHabilidade(db, {
    habilidade_id,
    tipo_habilidade: "aquisicao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_treinamento,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_DESENVOLVIMENTO,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  });

  return {
    habilidade_id,
    tipo_habilidade: "aquisicao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_treinamento,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_DESENVOLVIMENTO,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  };
}

/**
 * Registrar habilidade adquirida como ativo intangível
 * Para certificações: capitaliza como asset após sucesso na avaliação
 * Cria lançamento duplo: débito Ativos Intangíveis + crédito Contas a Pagar
 */
export function registrarHabilidadeAdquirida(
  db: Database,
  habilidade_id: number,
  pessoa_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_certificacao: number,
  descricao_habilidade: string,
  data_certificacao: string
): SkillsLedgerEntry {
  if (!habilidade_id || !pessoa_id || !entidade_id || !periodo_id) {
    throw new Error("Habilidade certificada: parâmetros obrigatórios ausentes");
  }

  if (valor_certificacao <= 0) {
    throw new Error("Habilidade certificada: valor_certificacao deve ser positivo");
  }

  const descricao = `Certificação Habilidade: ${descricao_habilidade} - Pessoa ${pessoa_id}`;

  // Lançamento débito: Ativos Intangíveis (capitalização)
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    data_lancamento: data_certificacao,
    valor_debito: valor_certificacao,
    descricao,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-CERT-${habilidade_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de certificação de habilidade");
  }

  // Lançamento crédito: Contas a Pagar
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    data_lancamento: data_certificacao,
    valor_credito: valor_certificacao,
    descricao: `Pagável Certificação - ${descricao_habilidade}`,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-CERT-${habilidade_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de certificação de habilidade");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoHabilidade(db, {
    habilidade_id,
    tipo_habilidade: "certificacao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_certificacao,
    conta_debito_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  });

  return {
    habilidade_id,
    tipo_habilidade: "certificacao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_certificacao,
    conta_debito_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  };
}

/**
 * Registrar manutenção anual de habilidade (refresh/atualização)
 * Despesa recorrente para manter skill ativa: débito Despesa Manutenção + crédito Contas a Pagar
 */
export function registrarManutenacaoHabilidade(
  db: Database,
  habilidade_id: number,
  pessoa_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_manutencao: number,
  descricao_habilidade: string,
  data_manutencao: string
): SkillsLedgerEntry {
  if (!habilidade_id || !pessoa_id || !entidade_id || !periodo_id) {
    throw new Error("Manutenção habilidade: parâmetros obrigatórios ausentes");
  }

  if (valor_manutencao <= 0) {
    throw new Error("Manutenção habilidade: valor_manutencao deve ser positivo");
  }

  const descricao = `Manutenção Habilidade: ${descricao_habilidade} - Pessoa ${pessoa_id}`;

  // Lançamento débito: Despesa Manutenção Habilidades
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.DESPESA_MANUTENCAO_HABILIDADES,
    data_lancamento: data_manutencao,
    valor_debito: valor_manutencao,
    descricao,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-MAINT-${habilidade_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de manutenção de habilidade");
  }

  // Lançamento crédito: Contas a Pagar
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    data_lancamento: data_manutencao,
    valor_credito: valor_manutencao,
    descricao: `Pagável Manutenção - ${descricao_habilidade}`,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-MAINT-${habilidade_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de manutenção de habilidade");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoHabilidade(db, {
    habilidade_id,
    tipo_habilidade: "manutencao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_manutencao,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_MANUTENCAO_HABILIDADES,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  });

  return {
    habilidade_id,
    tipo_habilidade: "manutencao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_manutencao,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_MANUTENCAO_HABILIDADES,
    conta_credito_id: CONTAS_SKILLOS.CONTAS_A_PAGAR,
    descricao,
    status_ciclo_vida: "ativa",
  };
}

/**
 * Registrar depreciação mensal de habilidades capitalizadas
 * Amortiza assets intangíveis ao longo do tempo
 * Débito Depreciação Habilidades + crédito Ativos Intangíveis
 */
export function registrarDepreciacaoHabilidade(
  db: Database,
  habilidade_id: number,
  pessoa_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_depreciacao_mensal: number,
  descricao_habilidade: string,
  data_depreciacao: string
): SkillsLedgerEntry {
  if (!habilidade_id || !pessoa_id || !entidade_id || !periodo_id) {
    throw new Error("Depreciação habilidade: parâmetros obrigatórios ausentes");
  }

  if (valor_depreciacao_mensal <= 0) {
    throw new Error("Depreciação habilidade: valor_depreciacao_mensal deve ser positivo");
  }

  const descricao = `Depreciação Habilidade: ${descricao_habilidade} - Pessoa ${pessoa_id}`;

  // Lançamento débito: Despesa Depreciação Habilidades
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.DESPESA_DEPRECIACAO_HABILIDADES,
    data_lancamento: data_depreciacao,
    valor_debito: valor_depreciacao_mensal,
    descricao,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-DEPR-${habilidade_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de depreciação de habilidade");
  }

  // Lançamento crédito: Redução em Ativos Intangíveis
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    data_lancamento: data_depreciacao,
    valor_credito: valor_depreciacao_mensal,
    descricao: `Depreciação Acumulada - ${descricao_habilidade}`,
    origem_modulo: "skillos",
    origem_id: habilidade_id,
    referencia_documento: `SKL-DEPR-${habilidade_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de depreciação de habilidade");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoHabilidade(db, {
    habilidade_id,
    tipo_habilidade: "manutencao", // Agrupa com manutenção para análise
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_depreciacao_mensal,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_DEPRECIACAO_HABILIDADES,
    conta_credito_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    descricao,
    status_ciclo_vida: "ativa",
  });

  return {
    habilidade_id,
    tipo_habilidade: "manutencao",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    pessoa_id,
    entidade_id,
    periodo_id,
    valor: valor_depreciacao_mensal,
    conta_debito_id: CONTAS_SKILLOS.DESPESA_DEPRECIACAO_HABILIDADES,
    conta_credito_id: CONTAS_SKILLOS.ATIVOS_INTANGIVEIS,
    descricao,
    status_ciclo_vida: "ativa",
  };
}

/**
 * Obter saldo total de investimento em habilidades (desenvolvimento + manutenção)
 */
export function obterSaldoHabilidades(
  db: Database,
  entidade_id: number,
  periodo_id: number
): { total_investimento: number; por_tipo: Array<{ tipo: string; valor: number }> } {
  const [total] = consultar<{ total_valor: number }>(
    db,
    `SELECT
      SUM(sle.valor) as total_valor
    FROM skillos_ledger_entries sle
    WHERE sle.entidade_id = ? AND sle.periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const por_tipo = consultar<{ tipo: string; valor: number }>(
    db,
    `SELECT
      sle.tipo_habilidade as tipo,
      SUM(sle.valor) as valor
    FROM skillos_ledger_entries sle
    WHERE sle.entidade_id = ? AND sle.periodo_id = ?
    GROUP BY sle.tipo_habilidade`,
    [entidade_id, periodo_id]
  );

  return {
    total_investimento: total?.[0]?.total_valor || 0,
    por_tipo: por_tipo.map((t) => ({
      tipo: t.tipo || "desconhecido",
      valor: t.valor || 0,
    })),
  };
}

/**
 * Sincronização em lote de habilidades para ledger com validação de período
 */
export function sincronizarHabilidadesParaLedger(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  limiteEntries: number = 50
): {
  processadas: number;
  sucessos: number;
  falhas: number;
  detalhes: Array<{ habilidade_id: number; status: string; mensagem?: string }>;
} {
  const detalhes: Array<{ habilidade_id: number; status: string; mensagem?: string }> = [];

  const habilidades = consultar<{
    id: number;
    pessoa_id: number;
    descricao: string;
    tipo: string;
    valor_investimento: number;
    data_evento: string;
    status_persistencia: string;
  }>(
    db,
    `SELECT id, pessoa_id, descricao, tipo, valor_investimento, data_evento, status_persistencia
     FROM habilidades_aquisicoes
     WHERE entidade_id = ? AND status_persistencia IN ('pendente', 'erro')
     ORDER BY criado_em ASC
     LIMIT ?`,
    [entidade_id, limiteEntries]
  );

  let sucessos = 0;
  let falhas = 0;

  habilidades.forEach((hab) => {
    try {
      let resultado: SkillsLedgerEntry | null = null;

      switch (hab.tipo) {
        case "aquisicao":
          resultado = registrarHabilidadeParaAquisicao(
            db,
            hab.id,
            hab.pessoa_id,
            entidade_id,
            periodo_id,
            hab.valor_investimento,
            hab.descricao,
            hab.data_evento
          );
          break;
        case "certificacao":
          resultado = registrarHabilidadeAdquirida(
            db,
            hab.id,
            hab.pessoa_id,
            entidade_id,
            periodo_id,
            hab.valor_investimento,
            hab.descricao,
            hab.data_evento
          );
          break;
        case "manutencao":
          resultado = registrarManutenacaoHabilidade(
            db,
            hab.id,
            hab.pessoa_id,
            entidade_id,
            periodo_id,
            hab.valor_investimento,
            hab.descricao,
            hab.data_evento
          );
          break;
        default:
          throw new Error(`Tipo de habilidade inválido: ${hab.tipo}`);
      }

      if (resultado) {
        // Marcar como sincronizado
        executar(
          db,
          `UPDATE habilidades_aquisicoes SET status_persistencia = 'sincronizado' WHERE id = ?`,
          [hab.id]
        );
        sucessos++;
        detalhes.push({
          habilidade_id: hab.id,
          status: "sucesso",
        });
      } else {
        falhas++;
        detalhes.push({
          habilidade_id: hab.id,
          status: "erro",
          mensagem: "Resultado nulo da operação",
        });
      }
    } catch (erro) {
      falhas++;
      detalhes.push({
        habilidade_id: hab.id,
        status: "erro",
        mensagem: (erro as Error).message,
      });

      // Atualizar status no banco
      executar(
        db,
        `UPDATE habilidades_aquisicoes SET status_persistencia = 'erro' WHERE id = ?`,
        [hab.id]
      );
    }
  });

  return {
    processadas: habilidades.length,
    sucessos,
    falhas,
    detalhes,
  };
}

/**
 * Gerar relatório de investimento em habilidades por pessoa
 * Inclui: total investido, assets intangíveis, ROI calculado
 */
export function gerarRelatorioInvestimentoHabilidades(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  pessoa_id?: number
): RelatorioROIHabilidades[] {
  const filtro_pessoa = pessoa_id ? ` AND sle.pessoa_id = ?` : "";
  const params = pessoa_id ? [entidade_id, periodo_id, pessoa_id] : [entidade_id, periodo_id];

  const registros = consultar<{
    pessoa_id: number;
    pessoa_nome: string;
    habilidade_id: number;
    habilidade_nome: string;
    tipo_habilidade: string;
    valor_total: number;
    valor_assets: number;
    data_aquisicao: string;
    status_ciclo_vida: string;
  }>(
    db,
    `SELECT
      sle.pessoa_id,
      p.nome as pessoa_nome,
      sle.habilidade_id,
      ha.descricao as habilidade_nome,
      sle.tipo_habilidade,
      SUM(sle.valor) as valor_total,
      CASE WHEN sle.tipo_habilidade = 'certificacao' THEN SUM(sle.valor) ELSE 0 END as valor_assets,
      MIN(sle.data_criacao) as data_aquisicao,
      sle.status_ciclo_vida
    FROM skillos_ledger_entries sle
    LEFT JOIN pessoas p ON p.id = sle.pessoa_id
    LEFT JOIN habilidades_aquisicoes ha ON ha.id = sle.habilidade_id
    WHERE sle.entidade_id = ? AND sle.periodo_id = ?${filtro_pessoa}
    GROUP BY sle.pessoa_id, sle.habilidade_id
    ORDER BY sle.pessoa_id, sle.habilidade_id`,
    params as any[]
  );

  // Agregar por pessoa
  const mapPessoas = new Map<number, RelatorioROIHabilidades>();

  registros.forEach((reg) => {
    if (!mapPessoas.has(reg.pessoa_id)) {
      mapPessoas.set(reg.pessoa_id, {
        pessoa_id: reg.pessoa_id,
        pessoa_nome: reg.pessoa_nome || "Desconhecida",
        total_investimento: 0,
        total_habilidades_ativas: 0,
        valor_assets_intangibles: 0,
        roi_percentual: 0,
        por_habilidade: [],
      });
    }

    const relatorio = mapPessoas.get(reg.pessoa_id)!;
    relatorio.total_investimento += reg.valor_total || 0;
    relatorio.valor_assets_intangibles += reg.valor_assets || 0;

    if (reg.status_ciclo_vida === "ativa") {
      relatorio.total_habilidades_ativas += 1;
    }

    relatorio.por_habilidade.push({
      habilidade_id: reg.habilidade_id,
      habilidade_nome: reg.habilidade_nome || "Desconhecida",
      investimento: reg.valor_total || 0,
      data_aquisicao: reg.data_aquisicao || "",
      status: reg.status_ciclo_vida,
      valor_asset: reg.valor_assets || 0,
    });
  });

  // Calcular ROI
  const resultados = Array.from(mapPessoas.values()).map((relatorio) => {
    if (relatorio.total_investimento > 0 && relatorio.valor_assets_intangibles > 0) {
      relatorio.roi_percentual =
        ((relatorio.valor_assets_intangibles - relatorio.total_investimento) /
          relatorio.total_investimento) *
        100;
    } else if (relatorio.total_investimento > 0) {
      // Se não há assets (só despesas), ROI é negativo (100%)
      relatorio.roi_percentual = -100;
    }
    return relatorio;
  });

  return resultados;
}

/**
 * Registrar rastreamento bidirecional no banco
 * Permite auditoria e reversão de lançamentos
 */
function registrarRastreamentoHabilidade(
  db: Database,
  entrada: SkillsLedgerEntry
): number {
  executar(
    db,
    `INSERT INTO skillos_ledger_entries (
      habilidade_id, tipo_habilidade, ledger_entry_id,
      ledger_entry_id_contrapartida, pessoa_id, entidade_id,
      periodo_id, valor, conta_debito_id, conta_credito_id,
      descricao, status_ciclo_vida, data_criacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      entrada.habilidade_id,
      entrada.tipo_habilidade,
      entrada.ledger_entry_id,
      entrada.ledger_entry_id_contrapartida || null,
      entrada.pessoa_id,
      entrada.entidade_id,
      entrada.periodo_id,
      entrada.valor,
      entrada.conta_debito_id,
      entrada.conta_credito_id,
      entrada.descricao,
      entrada.status_ciclo_vida,
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
 * Obter rastreamento completo de uma habilidade
 */
export function obterRastreamentoHabilidade(
  db: Database,
  habilidade_id: number
): SkillsLedgerEntry[] {
  return consultar<SkillsLedgerEntry>(
    db,
    `SELECT * FROM skillos_ledger_entries WHERE habilidade_id = ? ORDER BY data_criacao DESC`,
    [habilidade_id]
  );
}

/**
 * Marcar habilidade como obsoleta (depreciation completo)
 * Não gera mais lançamentos, mas mantém histórico
 */
export function marcarHabilidadeObsoleta(
  db: Database,
  habilidade_id: number,
  motivo: string
): { sucesso: boolean; mensagem: string } {
  try {
    executar(
      db,
      `UPDATE skillos_ledger_entries
       SET status_ciclo_vida = 'obsoleta'
       WHERE habilidade_id = ?`,
      [habilidade_id]
    );

    executar(
      db,
      `UPDATE habilidades_aquisicoes
       SET status = 'obsoleta', motivo_obsoleto = ?
       WHERE id = ?`,
      [motivo, habilidade_id]
    );

    return {
      sucesso: true,
      mensagem: `Habilidade ${habilidade_id} marcada como obsoleta`,
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao marcar como obsoleta: ${(erro as Error).message}`,
    };
  }
}

/**
 * Reverter lançamentos de uma habilidade (estorno duplo)
 * Útil para correções após lançamento
 */
export function reverterHabilidadeNoLedger(
  db: Database,
  habilidade_id: number,
  motivo_reversao: string
): { sucesso: boolean; mensagem: string; lançamentos_revertidos: number } {
  const rastreamentos = obterRastreamentoHabilidade(db, habilidade_id);

  if (rastreamentos.length === 0) {
    return {
      sucesso: false,
      mensagem: "Nenhum rastreamento encontrado para esta habilidade",
      lançamentos_revertidos: 0,
    };
  }

  let lançamentos_revertidos = 0;

  rastreamentos.forEach((rastreamento) => {
    try {
      // Estornar lançamento de débito
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
          NULL, datetime('now')
        FROM ledger_entries WHERE id = ?`,
        [rastreamento.ledger_entry_id]
      );

      // Estornar lançamento de crédito se existir
      if (rastreamento.ledger_entry_id_contrapartida) {
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
            NULL, datetime('now')
          FROM ledger_entries WHERE id = ?`,
          [rastreamento.ledger_entry_id_contrapartida]
        );

        lançamentos_revertidos += 2;
      } else {
        lançamentos_revertidos += 1;
      }

      // Marcar rastreamento como revertido
      executar(
        db,
        `UPDATE skillos_ledger_entries SET descricao = ? WHERE id = ?`,
        [`${rastreamento.descricao} [REVERTIDO: ${motivo_reversao}]`, rastreamento.id]
      );
    } catch (erro) {
      console.error(`Erro ao reverter rastreamento ${rastreamento.id}:`, erro);
    }
  });

  return {
    sucesso: lançamentos_revertidos > 0,
    mensagem: `${lançamentos_revertidos} lançamentos revertidos com sucesso`,
    lançamentos_revertidos,
  };
}
