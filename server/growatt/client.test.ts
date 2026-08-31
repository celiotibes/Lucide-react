import { describe, expect, it, vi } from 'vitest';
import { GrowattApiError, GrowattClient } from './client';

function fetchMockado(respostas: Array<{ status: number; corpo: unknown; setCookie?: string }>) {
  let chamada = 0;
  return vi.fn().mockImplementation(async () => {
    const r = respostas[Math.min(chamada, respostas.length - 1)];
    chamada += 1;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corpo,
      headers: { get: (nome: string) => (nome === 'set-cookie' ? (r.setCookie ?? null) : null) },
    };
  }) as unknown as typeof fetch;
}

describe('GrowattClient', () => {
  it('autentica e lista plantas', async () => {
    const fetchFake = fetchMockado([
      { status: 200, corpo: { back: { success: true, user: { id: 'user_1' } } }, setCookie: 'JSESSIONID=abc' },
      { status: 200, corpo: { back: [{ plantId: 'plant_1', plantName: 'Residencial João Pottker' }] } },
    ]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'senha', fetchImpl: fetchFake });

    const plantas = await client.listarPlantas();

    expect(plantas).toEqual([{ plantId: 'plant_1', plantName: 'Residencial João Pottker' }]);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    expect(fetchFake).toHaveBeenNthCalledWith(1, expect.stringContaining('newTwoLoginAPI.do'), expect.any(Object));
    expect(fetchFake).toHaveBeenNthCalledWith(2, expect.stringContaining('PlantListAPI.do?userId=user_1'), expect.any(Object));
  });

  it('reaproveita a sessão autenticada numa segunda chamada, sem logar de novo', async () => {
    const fetchFake = fetchMockado([
      { status: 200, corpo: { back: { success: true, user: { id: 'user_1' } } } },
      { status: 200, corpo: { back: [{ plantId: 'plant_1', plantName: 'Planta 1' }] } },
      { status: 200, corpo: { back: [{ plantId: 'plant_1', plantName: 'Planta 1' }] } },
    ]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'senha', fetchImpl: fetchFake });

    await client.listarPlantas();
    await client.listarPlantas();

    // 1 login + 2 listagens = 3 chamadas, não 4 — a segunda listarPlantas() não repete o login.
    expect(fetchFake).toHaveBeenCalledTimes(3);
  });

  it('rejeita quando o login falha (usuário/senha incorretos)', async () => {
    const fetchFake = fetchMockado([{ status: 200, corpo: { back: { success: false } } }]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'errada', fetchImpl: fetchFake });

    await expect(client.listarPlantas()).rejects.toThrow(GrowattApiError);
  });

  it('propaga erro HTTP do login como GrowattApiError', async () => {
    const fetchFake = fetchMockado([{ status: 500, corpo: {} }]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'senha', fetchImpl: fetchFake });

    await expect(client.listarPlantas()).rejects.toThrow(GrowattApiError);
  });

  it('busca energia diária e converte o mapa data->valor em uma lista tipada', async () => {
    const fetchFake = fetchMockado([
      { status: 200, corpo: { back: { success: true, user: { id: 'user_1' } } } },
      {
        status: 200,
        corpo: { back: { chartData: { '2026-07-01': '32.5', '2026-07-02': '28.1' } } },
      },
    ]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'senha', fetchImpl: fetchFake });

    const energia = await client.buscarEnergiaDiaria('plant_1');

    expect(energia).toEqual([
      { data: '2026-07-01', energiaGeradaKwh: 32.5 },
      { data: '2026-07-02', energiaGeradaKwh: 28.1 },
    ]);
  });

  it('lista de plantas vazia quando a API não devolve "back"', async () => {
    const fetchFake = fetchMockado([
      { status: 200, corpo: { back: { success: true, user: { id: 'user_1' } } } },
      { status: 200, corpo: {} },
    ]);
    const client = new GrowattClient({ usuario: 'teste', senha: 'senha', fetchImpl: fetchFake });

    expect(await client.listarPlantas()).toEqual([]);
  });
});
