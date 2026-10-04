import { describe, expect, it, vi } from "vitest";
import {
  calcularBackoffMs,
  criarArmazenamentoMemoria,
  criarFilaOffline,
  ErroAnexoGrande,
  type ArmazenamentoFila,
  type EnviarItem,
} from "../filaOffline";

type P = { n: number };

function montar(opts: { enviar: EnviarItem<P>; armazenamento?: ArmazenamentoFila<P>; online?: () => boolean } & Record<string, unknown>) {
  let t = 1_000_000;
  const armazenamento = opts.armazenamento ?? criarArmazenamentoMemoria<P>();
  let seq = 0;
  const fila = criarFilaOffline<P>({
    armazenamento,
    enviar: opts.enviar,
    agora: () => t,
    gerarUuid: () => `u${++seq}`,
    estaOnline: opts.online,
    backoff: { baseMs: 1000, maxMs: 8000, maxTentativas: 4 },
    ...(opts.limiteAnexoBytes ? { limiteAnexoBytes: opts.limiteAnexoBytes as number } : {}),
  });
  return { fila, armazenamento, avancar: (ms: number) => (t += ms), agora: () => t };
}

describe("calcularBackoffMs", () => {
  it("dobra a cada falha e respeita o teto", () => {
    const cfg = { baseMs: 1000, maxMs: 8000, maxTentativas: 9 };
    expect([1, 2, 3, 4, 5, 9].map((n) => calcularBackoffMs(n, cfg))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});

describe("filaOffline", () => {
  it("enfileirar é idempotente por uuid (não duplica nem sobrescreve)", async () => {
    const { fila } = montar({ enviar: async () => ({ confirmado: true }) });
    await fila.enfileirar({ uuid: "x", payload: { n: 1 } });
    const de_novo = await fila.enfileirar({ uuid: "x", payload: { n: 2 } });
    expect(de_novo.payload.n).toBe(1);
    expect(await fila.listar()).toHaveLength(1);
  });

  it("reenvio do mesmo item usa sempre o mesmo uuid (chave de idempotência)", async () => {
    const vistos: string[] = [];
    let falha = true;
    const enviar: EnviarItem<P> = async (i) => {
      vistos.push(i.uuid);
      return falha ? { confirmado: false, mensagem: "rede" } : { confirmado: true };
    };
    const { fila, avancar } = montar({ enviar });
    await fila.enfileirar({ uuid: "abc", payload: { n: 1 } });
    await fila.sincronizar();
    falha = false;
    avancar(1000);
    await fila.sincronizar();
    expect(vistos).toEqual(["abc", "abc"]);
  });

  it("backoff exponencial com relógio falso: adia até vencer a janela", async () => {
    const enviar = vi.fn<EnviarItem<P>>(async () => ({ confirmado: false, mensagem: "5xx" }));
    const { fila, avancar } = montar({ enviar });
    await fila.enfileirar({ payload: { n: 1 } });

    expect((await fila.sincronizar()).falhasTransitorias).toBe(1); // 1ª falha: espera 1000
    expect((await fila.sincronizar()).adiados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);

    avancar(999);
    expect((await fila.sincronizar()).adiados).toBe(1);
    avancar(1);
    await fila.sincronizar(); // 2ª falha: espera 2000
    expect(enviar).toHaveBeenCalledTimes(2);
    avancar(1999);
    expect((await fila.sincronizar()).adiados).toBe(1);
    avancar(1);
    await fila.sincronizar(); // 3ª falha: espera 4000
    expect(enviar).toHaveBeenCalledTimes(3);
    avancar(4000);
    const r = await fila.sincronizar(); // 4ª falha = maxTentativas -> erro
    expect(r.falhasPermanentes).toBe(1);
    const [item] = await fila.listar();
    expect(item.status).toBe("erro");
    expect(item.tentativas).toBe(4);
    avancar(60_000);
    await fila.sincronizar();
    expect(enviar).toHaveBeenCalledTimes(4); // erro não é retentado sozinho

    await fila.reenviar(item.uuid);
    expect((await fila.listar())[0]).toMatchObject({ status: "pendente", tentativas: 0 });
  });

  it("falha parcial: um item falhando não bloqueia os demais; só o confirmado é marcado enviado", async () => {
    const enviar: EnviarItem<P> = async (i) => (i.payload.n === 2 ? { confirmado: false, mensagem: "boom" } : { confirmado: true });
    const { fila, avancar } = montar({ enviar });
    for (const n of [1, 2, 3]) {
      await fila.enfileirar({ payload: { n } });
      avancar(1);
    }
    const r = await fila.sincronizar();
    expect(r).toMatchObject({ enviados: 2, falhasTransitorias: 1 });
    const porN = Object.fromEntries((await fila.listar()).map((i) => [i.payload.n, i.status]));
    expect(porN).toEqual({ 1: "enviado", 2: "pendente", 3: "enviado" });
  });

  it("exceção do enviar é falha transitória; rejeição permanente vai direto para erro", async () => {
    const enviar: EnviarItem<P> = async (i) => {
      if (i.payload.n === 1) throw new Error("offline");
      return { confirmado: false, permanente: true, mensagem: "422" };
    };
    const { fila } = montar({ enviar });
    await fila.enfileirar({ payload: { n: 1 } });
    await fila.enfileirar({ payload: { n: 2 } });
    await fila.sincronizar();
    const itens = await fila.listar();
    expect(itens.find((i) => i.payload.n === 1)).toMatchObject({ status: "pendente", ultimoErro: "offline" });
    expect(itens.find((i) => i.payload.n === 2)).toMatchObject({ status: "erro", ultimoErro: "422" });
  });

  it("anexos só são descartados após confirmação do servidor", async () => {
    let ok = false;
    const { fila, avancar } = montar({ enviar: async () => (ok ? { confirmado: true } : { confirmado: false }) });
    const foto = new Blob(["abc"], { type: "image/jpeg" });
    await fila.enfileirar({ uuid: "f", payload: { n: 1 }, anexos: [{ nome: "a.jpg", tipo: "image/jpeg", tamanho: 3, dados: foto }] });
    await fila.sincronizar();
    expect((await fila.listar())[0].anexos).toHaveLength(1);
    ok = true;
    avancar(1000);
    await fila.sincronizar();
    expect((await fila.listar())[0]).toMatchObject({ status: "enviado", anexos: [] });
    expect(await fila.limparEnviados()).toBe(1);
    expect(await fila.listar()).toHaveLength(0);
  });

  it("rejeita anexo acima do limite e não grava nada", async () => {
    const { fila } = montar({ enviar: async () => ({ confirmado: true }), limiteAnexoBytes: 10 });
    await expect(
      fila.enfileirar({ payload: { n: 1 }, anexos: [{ nome: "g.jpg", tipo: "image/jpeg", tamanho: 11, dados: new Blob(["x"]) }] }),
    ).rejects.toBeInstanceOf(ErroAnexoGrande);
    expect(await fila.listar()).toHaveLength(0);
  });

  it("offline: não tenta enviar e informa pulado", async () => {
    const enviar = vi.fn<EnviarItem<P>>(async () => ({ confirmado: true }));
    const { fila } = montar({ enviar, online: () => false });
    await fila.enfileirar({ payload: { n: 1 } });
    expect((await fila.sincronizar()).pulado).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sincronizações simultâneas compartilham a mesma execução (sem envio duplicado)", async () => {
    const enviar = vi.fn<EnviarItem<P>>(async () => ({ confirmado: true }));
    const { fila } = montar({ enviar });
    await fila.enfileirar({ payload: { n: 1 } });
    await Promise.all([fila.sincronizar(), fila.sincronizar()]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("retomada após reinício: nova fila sobre o mesmo armazenamento recupera pendentes e 'enviando' órfão", async () => {
    const armazenamento = criarArmazenamentoMemoria<P>();
    const antes = montar({ enviar: async () => ({ confirmado: false, mensagem: "x" }), armazenamento });
    await antes.fila.enfileirar({ uuid: "a", payload: { n: 1 } });
    await antes.fila.enfileirar({ uuid: "b", payload: { n: 2 } });
    // simula queda no meio do envio de "b"
    const b = (await armazenamento.obter("b"))!;
    await armazenamento.salvar({ ...b, status: "enviando" });

    const enviados: string[] = [];
    const depois = montar({
      armazenamento,
      enviar: async (i) => {
        enviados.push(i.uuid);
        return { confirmado: true };
      },
    });
    expect(await depois.fila.contar()).toMatchObject({ pendente: 1, enviando: 1 });
    await depois.fila.sincronizar();
    expect(enviados.sort()).toEqual(["a", "b"]);
    expect(await depois.fila.contar()).toMatchObject({ enviado: 2, pendente: 0 });
  });
});
