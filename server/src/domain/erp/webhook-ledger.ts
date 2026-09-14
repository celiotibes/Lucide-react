/**
 * Webhook para Ledger Imediato (3A.1)
 * Lançamento automático no ledger quando eventos ocorrem
 * Suporta webhooks de: skillos-integracao, app-bruxel, imovel-gestao
 */

export interface WebhookEvent {
  id: string;
  timestamp: string;
  origem_modulo: "skillos-integracao" | "app-bruxel" | "imovel-gestao";
  tipo_evento: "diaria_criada" | "despesa_criada" | "folha_processada" | "receita_recebida";
  entidade_id: string;
  dados_lancamento: {
    data: string;
    valor: number;
    descricao: string;
    conta_debito: string;
    conta_credito: string;
    centro_custo?: string;
  };
}

export interface RegistroWebhook {
  id: string;
  webhook_event_id: string;
  timestamp_recebimento: string;
  status: "recebido" | "processando" | "finalizado" | "erro";
  lancamento_id?: string;
  mensagem_erro?: string;
  tentativas: number;
  proxima_tentativa?: string;
}

/**
 * Mapeia tipos de evento para rotas de webhook
 */
const ROTAS_WEBHOOK: Record<string, string> = {
  "skillos-integracao": "POST /webhooks/skillos",
  "app-bruxel": "POST /webhooks/app-bruxel",
  "imovel-gestao": "POST /webhooks/imovel-gestao",
};

/**
 * Valida integridade do evento webhook
 */
export function validarEventoWebhook(evento: unknown): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!evento || typeof evento !== "object") {
    erros.push("Evento deve ser um objeto");
    return { valido: false, erros };
  }

  const e = evento as Record<string, unknown>;

  if (!["skillos-integracao", "app-bruxel", "imovel-gestao"].includes(e.origem_modulo as string)) {
    erros.push("Módulo de origem inválido");
  }

  if (
    ![
      "diaria_criada",
      "despesa_criada",
      "folha_processada",
      "receita_recebida",
    ].includes(e.tipo_evento as string)
  ) {
    erros.push("Tipo de evento inválido");
  }

  if (typeof e.entidade_id !== "string" || (e.entidade_id as string).trim().length === 0) {
    erros.push("ID da entidade é obrigatório");
  }

  const dados = e.dados_lancamento as Record<string, unknown> | undefined;
  if (!dados) {
    erros.push("Dados do lançamento são obrigatórios");
  } else {
    if (typeof dados.valor !== "number" || dados.valor <= 0) {
      erros.push("Valor deve ser um número positivo");
    }
    if (typeof dados.conta_debito !== "string" || (dados.conta_debito as string).trim().length === 0) {
      erros.push("Conta de débito é obrigatória");
    }
    if (typeof dados.conta_credito !== "string" || (dados.conta_credito as string).trim().length === 0) {
      erros.push("Conta de crédito é obrigatória");
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(dados.data as string)) {
      erros.push("Data deve estar em formato ISO 8601");
    }
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Cria novo evento webhook
 */
export function criarEventoWebhook(
  dados: Omit<WebhookEvent, "id" | "timestamp">
): WebhookEvent {
  return {
    id: `WH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...dados,
  };
}

/**
 * Registra recebimento do webhook
 */
export function registrarWebhook(evento: WebhookEvent): RegistroWebhook {
  return {
    id: `WHR-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    webhook_event_id: evento.id,
    timestamp_recebimento: new Date().toISOString(),
    status: "recebido",
    tentativas: 0,
  };
}

/**
 * Processa webhook e registra tentativa
 * TODO: Integrar com ledger.registrarLancamento
 */
export function processarWebhook(
  evento: WebhookEvent,
  registro: RegistroWebhook
): RegistroWebhook {
  const registroAtualizado = { ...registro };

  try {
    // Validação do evento
    const validacao = validarEventoWebhook(evento);
    if (!validacao.valido) {
      registroAtualizado.status = "erro";
      registroAtualizado.mensagem_erro = `Validação falhou: ${validacao.erros.join(", ")}`;
      registroAtualizado.tentativas += 1;
      return registroAtualizado;
    }

    // Aqui entra a chamada real para ledger.registrarLancamento(evento.dados_lancamento)
    // Por agora, simulamos sucesso com ID de lançamento fictício
    registroAtualizado.status = "finalizado";
    registroAtualizado.lancamento_id = `LCT-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    registroAtualizado.tentativas += 1;

    return registroAtualizado;
  } catch (erro) {
    registroAtualizado.status = "erro";
    registroAtualizado.mensagem_erro =
      erro instanceof Error ? erro.message : "Erro desconhecido ao processar webhook";
    registroAtualizado.tentativas += 1;

    // Retry: próxima tentativa em 5 minutos
    if (registroAtualizado.tentativas < 3) {
      const proximaTentativa = new Date();
      proximaTentativa.setMinutes(proximaTentativa.getMinutes() + 5);
      registroAtualizado.proxima_tentativa = proximaTentativa.toISOString();
    }

    return registroAtualizado;
  }
}

/**
 * Cria lista de webhooks para disparar baseado na origem do módulo
 * Cada origem gera webhooks para seus provedores
 */
export function obterRotasWebhook(origem_modulo: string): string[] {
  const rota = ROTAS_WEBHOOK[origem_modulo];
  return rota ? [rota] : [];
}

/**
 * Simula disparo de webhook em tempo real
 * Em produção, seria integrado com sistema de fila/retry
 */
export async function disparaWebhook(
  evento: WebhookEvent,
  _urlWebhook: string
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    // Simulação: em produção seria um fetch/axios para a URL
    const validacao = validarEventoWebhook(evento);

    if (!validacao.valido) {
      return {
        sucesso: false,
        mensagem: `Webhook não disparado: ${validacao.erros.join(", ")}`,
      };
    }

    // TODO: fetch(_urlWebhook, { method: "POST", body: JSON.stringify(evento) })
    return {
      sucesso: true,
      mensagem: `Webhook disparado para ${_urlWebhook}`,
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao disparar webhook: ${erro instanceof Error ? erro.message : "Desconhecido"}`,
    };
  }
}

/**
 * Reconecta webhooks após falha (retry logic)
 */
export function reconectarWebhook(
  registro: RegistroWebhook,
  evento: WebhookEvent
): RegistroWebhook {
  if (registro.tentativas >= 3) {
    return {
      ...registro,
      status: "erro",
      mensagem_erro: "Máximo de tentativas excedido",
    };
  }

  const registroAtualizado = processarWebhook(evento, {
    ...registro,
    status: "processando",
  });

  return registroAtualizado;
}
