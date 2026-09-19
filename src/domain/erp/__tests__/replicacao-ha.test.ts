import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GerenciadorReplicacaoHA } from "../replicacao-ha";

describe("GerenciadorReplicacaoHA.sincronizarReplicas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("conta as réplicas sincronizadas com sucesso (bug: typo 'syncronizadas' zerava o contador)", async () => {
    const gerenciador = new GerenciadorReplicacaoHA();

    const promessa = gerenciador.sincronizarReplicas();
    // simularSincronizacao() espera de 1 a 3s por réplica (sequencial); avançamos o
    // relógio falso o suficiente para todas terminarem sem esperar tempo real.
    await vi.advanceTimersByTimeAsync(10_000);
    const resultado = await promessa;

    // 4 réplicas no total (inicializarReplicas), 1 é a primária e é pulada — sobram 3.
    // Antes da correção, "syncronizadas++" referenciava um nome inexistente, o que
    // lançava ReferenceError (capturado pelo catch da própria função) e incrementava
    // `falhadas` em vez de `sincronizadas` — o contador de sucesso ficava sempre em 0.
    expect(resultado.replicas_sincronizadas).toBe(3);
    expect(resultado.replicas_falhadas).toBe(0);
  });
});
