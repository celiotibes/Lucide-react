import { describe, expect, it, vi } from 'vitest';
import { AsaasApiError, AsaasClient } from './client';

function fetchMockado(status: number, corpo: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }) as unknown as typeof fetch;
}

describe('AsaasClient', () => {
  it('rejeita construção sem apiKey', () => {
    expect(() => new AsaasClient({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('criarCobranca monta a requisição corretamente (endpoint, headers, corpo)', async () => {
    const fetchFake = fetchMockado(200, {
      id: 'pay_123',
      status: 'PENDING',
      value: 1200,
      invoiceUrl: 'https://asaas.com/i/pay_123',
      bankSlipUrl: 'https://asaas.com/b/pay_123',
    });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    const resultado = await client.criarCobranca({
      customerId: 'cus_1',
      valor: 1200,
      vencimento: '2026-08-10',
      tipo: 'BOLETO',
      referenciaExterna: 'fatura-uuid-1',
    });

    expect(fetchFake).toHaveBeenCalledWith(
      'https://api.asaas.com/v3/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ access_token: 'chave-teste' }),
      }),
    );
    const corpoEnviado = JSON.parse((fetchFake as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(corpoEnviado).toMatchObject({
      customer: 'cus_1',
      billingType: 'BOLETO',
      value: 1200,
      dueDate: '2026-08-10',
      externalReference: 'fatura-uuid-1',
    });

    expect(resultado).toEqual({
      id: 'pay_123',
      status: 'PENDING',
      valor: 1200,
      linkFatura: 'https://asaas.com/i/pay_123',
      linkBoleto: 'https://asaas.com/b/pay_123',
      qrCodePix: undefined,
    });
  });

  it('lança AsaasApiError com o status e corpo quando a API responde erro', async () => {
    const fetchFake = fetchMockado(401, { errors: [{ description: 'Chave de API inválida' }] });
    const client = new AsaasClient({ apiKey: 'chave-invalida', fetchImpl: fetchFake });

    await expect(
      client.criarCobranca({
        customerId: 'cus_1',
        valor: 100,
        vencimento: '2026-08-10',
        tipo: 'PIX',
        referenciaExterna: 'ref',
      }),
    ).rejects.toThrow(AsaasApiError);
  });

  it('consultarCobranca usa o método correto e propaga o id', async () => {
    const fetchFake = fetchMockado(200, {
      id: 'pay_999',
      status: 'RECEIVED',
      value: 500,
      invoiceUrl: 'https://asaas.com/i/pay_999',
    });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    const resultado = await client.consultarCobranca('pay_999');
    expect(fetchFake).toHaveBeenCalledWith(
      'https://api.asaas.com/v3/payments/pay_999',
      expect.objectContaining({ headers: expect.objectContaining({ access_token: 'chave-teste' }) }),
    );
    expect(resultado.status).toBe('RECEIVED');
  });

  it('respeita baseUrl customizada (ex.: ambiente sandbox)', async () => {
    const fetchFake = fetchMockado(200, { id: 'x', status: 'PENDING', value: 1, invoiceUrl: 'u' });
    const client = new AsaasClient({
      apiKey: 'chave-teste',
      baseUrl: 'https://sandbox.asaas.com/api/v3',
      fetchImpl: fetchFake,
    });
    await client.consultarCobranca('x');
    expect(fetchFake).toHaveBeenCalledWith('https://sandbox.asaas.com/api/v3/payments/x', expect.anything());
  });

  it('criarCliente monta a requisição corretamente e mapeia a resposta', async () => {
    const fetchFake = fetchMockado(200, { id: 'cus_1', name: 'Maria Teste', cpfCnpj: '11122233344' });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    const resultado = await client.criarCliente({ nome: 'Maria Teste', cpfCnpj: '11122233344', email: 'maria@ex.com' });

    expect(fetchFake).toHaveBeenCalledWith(
      'https://api.asaas.com/v3/customers',
      expect.objectContaining({ method: 'POST' }),
    );
    const corpoEnviado = JSON.parse((fetchFake as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(corpoEnviado).toMatchObject({ name: 'Maria Teste', cpfCnpj: '11122233344', email: 'maria@ex.com' });
    expect(resultado).toEqual({ id: 'cus_1', nome: 'Maria Teste', cpfCnpj: '11122233344' });
  });

  it('criarCliente lança AsaasApiError quando a API responde erro', async () => {
    const fetchFake = fetchMockado(400, { errors: [{ description: 'CPF inválido' }] });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    await expect(client.criarCliente({ nome: 'X', cpfCnpj: '000' })).rejects.toThrow(AsaasApiError);
  });

  it('buscarClientePorCpfCnpj devolve o cliente quando encontrado', async () => {
    const fetchFake = fetchMockado(200, { data: [{ id: 'cus_2', name: 'João', cpfCnpj: '55566677788' }] });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    const resultado = await client.buscarClientePorCpfCnpj('55566677788');

    expect(fetchFake).toHaveBeenCalledWith(
      'https://api.asaas.com/v3/customers?cpfCnpj=55566677788',
      expect.anything(),
    );
    expect(resultado).toEqual({ id: 'cus_2', nome: 'João', cpfCnpj: '55566677788' });
  });

  it('buscarClientePorCpfCnpj devolve null quando não encontrado', async () => {
    const fetchFake = fetchMockado(200, { data: [] });
    const client = new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });

    const resultado = await client.buscarClientePorCpfCnpj('00000000000');
    expect(resultado).toBeNull();
  });
});
