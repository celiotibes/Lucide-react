/**
 * Testes para módulos de Alertas (Email e Slack)
 * Validar: envio, tratamento de erros, templates, graceful degradation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { enviarAlertaEmail, templateAlertaCritico, _resetProvedorParaTestes } from "../utils/email-alertas.js";
import { enviarAlertaSlack, enviarNotificacaoSlack, enviarResumoSlack } from "../utils/slack-alertas.js";

// Mock fetch global
const fetchMock = vi.fn();
global.fetch = fetchMock as any;

describe("Email Alertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetProvedorParaTestes();
    // Configura environment para mode "none" (mock) se não estiver configurado
    if (!process.env.ALERTS_EMAIL_PROVIDER) {
      process.env.ALERTS_EMAIL_PROVIDER = "none";
    }
  });

  describe("enviarAlertaEmail", () => {
    it("deve logar alerta com severidade quando provider = none", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await enviarAlertaEmail({
        assunto: "Teste",
        corpo: "Corpo teste",
        destinatario: "test@example.com",
        severidade: "warning",
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("deve não travar em erro de envio", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock fetch para falhar
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      // Não deve lançar erro
      await expect(
        enviarAlertaEmail({
          assunto: "Teste",
          corpo: "Corpo",
          destinatario: "test@example.com",
        }),
      ).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("templateAlertaCritico", () => {
    it("deve gerar HTML válido com título", () => {
      const html = templateAlertaCritico({
        titulo: "Falha na Reconciliação PIX",
        mensagem: "123 lançamentos não foram conciliados",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Falha na Reconciliação PIX");
      expect(html).toContain("123 lançamentos não foram conciliados");
      expect(html).toContain("</html>");
    });

    it("deve incluir detalhes se fornecidos", () => {
      const html = templateAlertaCritico({
        titulo: "Erro",
        mensagem: "Msg",
        detalhes: { tentativas: 3, erro: "timeout" },
      });

      expect(html).toContain("tentativas");
      expect(html).toContain("timeout");
    });

    it("deve incluir timestamp", () => {
      const html = templateAlertaCritico({
        titulo: "Erro",
        mensagem: "Msg",
        timestamp: "2026-10-02T09:30:00Z",
      });

      expect(html).toContain("2026-10-02T09:30:00Z");
    });

    it("deve usar timestamp atual se não fornecido", () => {
      const html = templateAlertaCritico({
        titulo: "Erro",
        mensagem: "Msg",
      });

      // Deve conter um timestamp ISO válido
      expect(html).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

describe("Slack Alertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Limpa webhook para testes (graceful degradation)
    delete process.env.SLACK_WEBHOOK_URL;
  });

  describe("enviarAlertaSlack", () => {
    it("deve fazer graceful degradation sem webhook configurado", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Não deve lançar erro
      await enviarAlertaSlack({
        mensagem: "Teste",
        severidade: "warning",
      });

      expect(fetchMock).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it("deve enviar para webhook quando configurado", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
      fetchMock.mockResolvedValueOnce({ ok: true });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await enviarAlertaSlack({
        mensagem: "Falha na DRE",
        severidade: "critical",
        campos: { tentativas: "3" },
      });

      expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/test", expect.any(Object));
      consoleLogSpy.mockRestore();
    });

    it("deve usar cor correta por severidade", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
      fetchMock.mockResolvedValueOnce({ ok: true });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await enviarAlertaSlack({
        mensagem: "Crítico",
        severidade: "critical",
      });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.attachments[0].color).toBe("#DC3545"); // Red

      consoleLogSpy.mockRestore();
    });

    it("deve logar erro sem travar", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Não deve lançar erro
      await expect(
        enviarAlertaSlack({
          mensagem: "Teste",
          severidade: "warning",
        }),
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("enviarNotificacaoSlack", () => {
    it("deve fazer graceful degradation sem webhook", async () => {
      // Não deve lançar erro
      await expect(enviarNotificacaoSlack("Teste", "Status OK")).resolves.not.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("deve enviar notificação com emoji", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
      fetchMock.mockResolvedValueOnce({ ok: true });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await enviarNotificacaoSlack("Relatório DRE", "Gerado com sucesso", "info");

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.text).toContain("ℹ️"); // emoji info
      expect(body.text).toContain("Relatório DRE");

      consoleLogSpy.mockRestore();
    });
  });

  describe("enviarResumoSlack", () => {
    it("deve enviar resumo com múltiplos campos", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
      fetchMock.mockResolvedValueOnce({ ok: true });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await enviarResumoSlack(
        [
          { titulo: "Transações", valor: "156" },
          { titulo: "Discrepâncias", valor: "3" },
        ],
        "Resumo Diário",
      );

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.attachments[0].fields.length).toBe(2);
      expect(body.attachments[0].title).toContain("Resumo Diário");

      consoleLogSpy.mockRestore();
    });

    it("deve fazer graceful degradation sem webhook", async () => {
      await expect(
        enviarResumoSlack(
          [{ titulo: "Test", valor: "123" }],
          "Teste",
        ),
      ).resolves.not.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("Integração: Email + Slack", () => {
  it("deve permitir enviar alertas paralelos via email e Slack", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
    fetchMock.mockResolvedValueOnce({ ok: true });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Envia em paralelo
    await Promise.all([
      enviarAlertaEmail({
        assunto: "Falha na DRE",
        corpo: "Erro: timeout",
        destinatario: "admin@example.com",
        severidade: "critical",
      }),
      enviarAlertaSlack({
        mensagem: "Falha na DRE",
        detalhes: "Query timeout após 30s",
        severidade: "critical",
      }),
    ]);

    // Email via mock (provider = none)
    expect(consoleLogSpy).toHaveBeenCalled();
    // Slack via fetch
    expect(fetchMock).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
