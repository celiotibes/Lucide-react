import { describe, expect, it } from 'vitest';
import { interpretarWebhook, verificarTokenWebhook, WebhookInvalidoError } from './webhook';

describe('verificarTokenWebhook', () => {
  it('aceita quando o token bate', () => {
    expect(verificarTokenWebhook('segredo-123', 'segredo-123')).toBe(true);
  });

  it('rejeita quando o token não bate', () => {
    expect(verificarTokenWebhook('errado', 'segredo-123')).toBe(false);
  });

  it('rejeita quando não veio nenhum token (header ausente)', () => {
    expect(verificarTokenWebhook(null, 'segredo-123')).toBe(false);
  });

  it('lança erro se o token configurado estiver vazio (erro de operação, não de payload)', () => {
    expect(() => verificarTokenWebhook('qualquer', '')).toThrow(/configuração ausente/);
  });
});

describe('interpretarWebhook', () => {
  it('reconhece pagamento confirmado (PAYMENT_RECEIVED)', () => {
    const evento = interpretarWebhook({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', value: 1200, externalReference: 'fatura-1' },
    });
    expect(evento).toEqual({
      tipo: 'pagamento_confirmado',
      cobrancaId: 'pay_1',
      referenciaExterna: 'fatura-1',
      valor: 1200,
    });
  });

  it('reconhece pagamento confirmado (PAYMENT_CONFIRMED) — mesmo tratamento que RECEIVED', () => {
    const evento = interpretarWebhook({
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_2', value: 500, externalReference: null },
    });
    expect(evento.tipo).toBe('pagamento_confirmado');
  });

  it('reconhece atraso (PAYMENT_OVERDUE) sem exigir campo value', () => {
    const evento = interpretarWebhook({ event: 'PAYMENT_OVERDUE', payment: { id: 'pay_3' } });
    expect(evento).toEqual({ tipo: 'pagamento_atrasado', cobrancaId: 'pay_3', referenciaExterna: null });
  });

  it('reconhece estorno/chargeback', () => {
    const evento = interpretarWebhook({ event: 'PAYMENT_REFUNDED', payment: { id: 'pay_4' } });
    expect(evento.tipo).toBe('pagamento_estornado');
  });

  it('eventos desconhecidos (ex.: nova versão da API do Asaas) viram "ignorado", não erro', () => {
    const evento = interpretarWebhook({ event: 'ALGO_QUE_NAO_EXISTE_AINDA', payment: { id: 'pay_5' } });
    expect(evento).toEqual({ tipo: 'ignorado', eventoOriginal: 'ALGO_QUE_NAO_EXISTE_AINDA' });
  });

  // --- payloads adversariais: nunca devem lançar exceção não tratada,
  // sempre WebhookInvalidoError explícito ---

  it('rejeita payload que não é objeto', () => {
    expect(() => interpretarWebhook('isso não é json')).toThrow(WebhookInvalidoError);
    expect(() => interpretarWebhook(null)).toThrow(WebhookInvalidoError);
    expect(() => interpretarWebhook(42)).toThrow(WebhookInvalidoError);
  });

  it('rejeita payload sem campo event', () => {
    expect(() => interpretarWebhook({ payment: { id: 'pay_1' } })).toThrow(WebhookInvalidoError);
  });

  it('rejeita payload sem campo payment', () => {
    expect(() => interpretarWebhook({ event: 'PAYMENT_RECEIVED' })).toThrow(WebhookInvalidoError);
  });

  it('rejeita payment sem id', () => {
    expect(() => interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { value: 100 } })).toThrow(
      WebhookInvalidoError,
    );
  });

  it('rejeita confirmação de pagamento sem o campo value', () => {
    expect(() => interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })).toThrow(
      /value ausente/,
    );
  });

  it('não quebra com campos extras desconhecidos no payload (tolerante a evolução da API)', () => {
    const evento = interpretarWebhook({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', value: 100, externalReference: 'ref', campoFuturoQualquer: { a: 1 } },
      metadadosFuturos: true,
    });
    expect(evento.tipo).toBe('pagamento_confirmado');
  });
});
