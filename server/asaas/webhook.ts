// Interpreta o payload de webhook do Asaas. Isto processa dado que vem de
// fora do nosso controle direto (a rede), então valida a forma do payload
// explicitamente em vez de confiar que ele bate com o tipo declarado — um
// webhook malformado ou de uma versão futura da API do Asaas não pode
// derrubar o processamento com uma exceção não tratada.

export type EventoAsaasNormalizado =
  | { tipo: 'pagamento_confirmado'; cobrancaId: string; referenciaExterna: string | null; valor: number }
  | { tipo: 'pagamento_atrasado'; cobrancaId: string; referenciaExterna: string | null }
  | { tipo: 'pagamento_estornado'; cobrancaId: string; referenciaExterna: string | null }
  | { tipo: 'ignorado'; eventoOriginal: string };

const EVENTOS_CONFIRMACAO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const EVENTOS_ATRASO = new Set(['PAYMENT_OVERDUE']);
const EVENTOS_ESTORNO = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']);

export class WebhookInvalidoError extends Error {}

/**
 * Verifica o token de autenticidade do webhook (configurado no painel do
 * Asaas, enviado no header `asaas-access-token`). Sem isso, qualquer um
 * que descubra a URL do endpoint poderia forjar "pagamento confirmado"
 * para uma fatura que nunca foi paga.
 */
export function verificarTokenWebhook(tokenRecebido: string | null, tokenConfigurado: string): boolean {
  if (!tokenConfigurado) {
    throw new Error('tokenConfigurado não pode ser vazio — configuração ausente é erro de operação, não de payload');
  }
  return tokenRecebido === tokenConfigurado;
}

export function interpretarWebhook(payloadBruto: unknown): EventoAsaasNormalizado {
  if (typeof payloadBruto !== 'object' || payloadBruto === null) {
    throw new WebhookInvalidoError('Payload de webhook não é um objeto JSON');
  }

  const payload = payloadBruto as Record<string, unknown>;
  const evento = payload.event;
  const pagamento = payload.payment;

  if (typeof evento !== 'string') {
    throw new WebhookInvalidoError('Campo "event" ausente ou não é string');
  }
  if (typeof pagamento !== 'object' || pagamento === null) {
    throw new WebhookInvalidoError('Campo "payment" ausente ou não é objeto');
  }

  const dadosPagamento = pagamento as Record<string, unknown>;
  const cobrancaId = dadosPagamento.id;
  if (typeof cobrancaId !== 'string') {
    throw new WebhookInvalidoError('payment.id ausente ou não é string');
  }

  const referenciaExterna =
    typeof dadosPagamento.externalReference === 'string' ? dadosPagamento.externalReference : null;

  if (EVENTOS_CONFIRMACAO.has(evento)) {
    const valor = dadosPagamento.value;
    if (typeof valor !== 'number') {
      throw new WebhookInvalidoError('payment.value ausente ou não é número num evento de confirmação de pagamento');
    }
    return { tipo: 'pagamento_confirmado', cobrancaId, referenciaExterna, valor };
  }

  if (EVENTOS_ATRASO.has(evento)) {
    return { tipo: 'pagamento_atrasado', cobrancaId, referenciaExterna };
  }

  if (EVENTOS_ESTORNO.has(evento)) {
    return { tipo: 'pagamento_estornado', cobrancaId, referenciaExterna };
  }

  return { tipo: 'ignorado', eventoOriginal: evento };
}
