/**
 * API Gateway Streamlit (1A.1)
 * Interface entre app-bruxel Streamlit e ledger
 * Transforma diárias em lançamentos contábeis
 */

export interface StreamlitPayload {
  origem_modulo: "app-bruxel" | "skillos-integracao" | "imovel-gestao";
  tipo_documento: "diaria" | "despesa" | "folha_pagamento" | "receita";
  data_evento: string; // ISO 8601
  valor: number;
  descricao: string;
  centro_custo_id?: string;
  usuario_id: string;
  metadata?: Record<string, unknown>;
}

export interface APIGatewayResponse {
  sucesso: boolean;
  lancamento_id?: string;
  mensagem: string;
  timestamp: string;
  erros?: Array<{
    campo: string;
    descricao: string;
  }>;
}

export interface LancamentoGerado {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  conta_debito: string;
  conta_credito: string;
  centro_custo: string;
  origem_modulo: string;
  status: "pendente" | "aprovado" | "finalizado";
}

/**
 * Valida payload do Streamlit antes de processar
 */
export function validarPayloadStreamlit(
  payload: unknown
): { valido: boolean; erros: Array<{ campo: string; descricao: string }> } {
  const erros: Array<{ campo: string; descricao: string }> = [];

  if (!payload || typeof payload !== "object") {
    erros.push({ campo: "root", descricao: "Payload deve ser um objeto" });
    return { valido: false, erros };
  }

  const p = payload as Record<string, unknown>;

  if (!["app-bruxel", "skillos-integracao", "imovel-gestao"].includes(p.origem_modulo as string)) {
    erros.push({ campo: "origem_modulo", descricao: "Módulo de origem inválido" });
  }

  if (!["diaria", "despesa", "folha_pagamento", "receita"].includes(p.tipo_documento as string)) {
    erros.push({ campo: "tipo_documento", descricao: "Tipo de documento inválido" });
  }

  if (typeof p.data_evento !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(p.data_evento)) {
    erros.push({ campo: "data_evento", descricao: "Data deve estar em formato ISO 8601" });
  }

  if (typeof p.valor !== "number" || p.valor <= 0) {
    erros.push({ campo: "valor", descricao: "Valor deve ser um número positivo" });
  }

  if (typeof p.descricao !== "string" || p.descricao.trim().length === 0) {
    erros.push({ campo: "descricao", descricao: "Descrição não pode estar vazia" });
  }

  if (typeof p.usuario_id !== "string" || p.usuario_id.trim().length === 0) {
    erros.push({ campo: "usuario_id", descricao: "ID do usuário é obrigatório" });
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Transforma diária (app-bruxel) em lançamento contábil
 * Fluxo: [Diária] → [Débito: 2.1.01 Imovel] → [Crédito: 1.0.01 Caixa]
 */
export function transformarDiariaEmLancamento(
  payload: StreamlitPayload
): LancamentoGerado {
  const id = `LCT-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let conta_debito = "1.0.01"; // Caixa (padrão)
  let conta_credito = "2.1.01"; // Imóvel (padrão)

  // Roteamento por tipo de documento
  if (payload.tipo_documento === "diaria") {
    conta_debito = "2.1.01"; // Imóvel (Débito)
    conta_credito = "1.0.01"; // Caixa (Crédito)
  } else if (payload.tipo_documento === "despesa") {
    conta_debito = "3.1.01"; // Despesa Operacional
    conta_credito = "1.0.01"; // Caixa
  } else if (payload.tipo_documento === "folha_pagamento") {
    conta_debito = "6.2.01"; // Encargos com Pessoal
    conta_credito = "3.1.02"; // Salários a Pagar
  } else if (payload.tipo_documento === "receita") {
    conta_debito = "1.0.01"; // Caixa
    conta_credito = "4.1.01"; // Receita Aluguel
  }

  return {
    id,
    data: payload.data_evento,
    descricao: payload.descricao,
    valor: payload.valor,
    conta_debito,
    conta_credito,
    centro_custo: payload.centro_custo_id || "CC-GERAL",
    origem_modulo: payload.origem_modulo,
    status: "pendente",
  };
}

/**
 * Sincroniza lançamento com ledger
 * Em produção, aqui entra a integração com ledger.ts
 */
export function sincronizarComERP(
  lancamento: LancamentoGerado
): APIGatewayResponse {
  try {
    // Validações pré-ledger
    if (!lancamento.id || !lancamento.conta_debito || !lancamento.conta_credito) {
      return {
        sucesso: false,
        mensagem: "Lançamento incompleto",
        timestamp: new Date().toISOString(),
        erros: [{ campo: "lancamento", descricao: "Faltam contas ou ID" }],
      };
    }

    // TODO: Chamar ledger.registrarLancamento(lancamento) aqui
    // Por agora, simulamos sucesso
    return {
      sucesso: true,
      lancamento_id: lancamento.id,
      mensagem: `Lançamento ${lancamento.id} sincronizado com ERP`,
      timestamp: new Date().toISOString(),
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao sincronizar: ${erro instanceof Error ? erro.message : "Desconhecido"}`,
      timestamp: new Date().toISOString(),
      erros: [{ campo: "sincronizacao", descricao: "Falha na integração com ERP" }],
    };
  }
}

/**
 * Pipeline completo: Validação → Transformação → Sincronização
 */
export function processarPayloadStreamlit(payload: unknown): APIGatewayResponse {
  const validacao = validarPayloadStreamlit(payload);

  if (!validacao.valido) {
    return {
      sucesso: false,
      mensagem: "Validação de payload falhou",
      timestamp: new Date().toISOString(),
      erros: validacao.erros,
    };
  }

  try {
    const lancamento = transformarDiariaEmLancamento(payload as StreamlitPayload);
    return sincronizarComERP(lancamento);
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao processar: ${erro instanceof Error ? erro.message : "Desconhecido"}`,
      timestamp: new Date().toISOString(),
      erros: [{ campo: "processamento", descricao: "Falha no processamento do payload" }],
    };
  }
}
