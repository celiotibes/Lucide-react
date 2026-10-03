import { describe, it, expect } from "vitest";
import { SandboxPaymentProvider } from "../payment-provider";

describe("SandboxPaymentProvider", () => {
  it("simula sucesso e devolve um idExternoPsp estável para conciliação futura", async () => {
    const provider = new SandboxPaymentProvider();

    const resultado = await provider.iniciarPagamentoPix({
      chaveIdempotencia: "pedido-1",
      valorCentavos: 1500_00,
      destinatarioChavePix: "locatario@example.com",
      destinatarioDocumento: "12345678900",
    });

    expect(resultado.status).toBe("enviado");
    expect(resultado.idExternoPsp).toContain("pedido-1");
    expect(resultado.motivoFalha).toBeUndefined();
  });

  it("simula falha quando a chave PIX contém 'falha' (gancho de teste, não regra real de PSP)", async () => {
    const provider = new SandboxPaymentProvider();

    const resultado = await provider.iniciarPagamentoPix({
      chaveIdempotencia: "pedido-2",
      valorCentavos: 100_00,
      destinatarioChavePix: "chave-de-falha@example.com",
      destinatarioDocumento: "12345678900",
    });

    expect(resultado.status).toBe("falhou");
    expect(resultado.motivoFalha).toBeDefined();
  });

  it("rejeita valor não positivo antes de simular qualquer resposta do PSP", async () => {
    const provider = new SandboxPaymentProvider();

    await expect(
      provider.iniciarPagamentoPix({
        chaveIdempotencia: "pedido-3",
        valorCentavos: 0,
        destinatarioChavePix: "x@example.com",
        destinatarioDocumento: "12345678900",
      }),
    ).rejects.toThrow("valorCentavos precisa ser positivo.");
  });

  it("rejeita chaveIdempotencia vazia", async () => {
    const provider = new SandboxPaymentProvider();

    await expect(
      provider.iniciarPagamentoPix({
        chaveIdempotencia: "  ",
        valorCentavos: 100_00,
        destinatarioChavePix: "x@example.com",
        destinatarioDocumento: "12345678900",
      }),
    ).rejects.toThrow("chaveIdempotencia é obrigatória.");
  });

  it("nunca faz chamada de rede — é só um simulador local (contador cresce por instância, não persiste)", async () => {
    const provider = new SandboxPaymentProvider();

    const primeiro = await provider.iniciarPagamentoPix({
      chaveIdempotencia: "a",
      valorCentavos: 1_00,
      destinatarioChavePix: "x@example.com",
      destinatarioDocumento: "12345678900",
    });
    const segundo = await provider.iniciarPagamentoPix({
      chaveIdempotencia: "b",
      valorCentavos: 1_00,
      destinatarioChavePix: "x@example.com",
      destinatarioDocumento: "12345678900",
    });

    expect(primeiro.idExternoPsp).not.toBe(segundo.idExternoPsp);
  });
});
