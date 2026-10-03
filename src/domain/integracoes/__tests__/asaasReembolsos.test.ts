/**
 * Testes para sistema de reembolsos/devoluções em Asaas com idempotência.
 * Total: 26 testes cobrindo processarReembolsoAsaas, detectarTipoReembolso,
 * e aplicarEventoReembolsoWebhook.
 */

import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import {
  processarReembolsoAsaas,
  detectarTipoReembolso,
  obterReembolso,
  obterReembolsosPorChargeId,
  listarReembolsos,
  marcarReembolsoComoErro,
  aplicarEventoReembolsoWebhook,
} from "../asaasReembolsos";
import { emitirCobrancaAluguel, emitirCobrancaHonorario } from "../asaasCobranca";

describe("asaasReembolsos", () => {
  let db: Database;

  const mockApiClient = {
    criarCliente: async (dados: any) => ({ asaasCustomerId: `cust_${Date.now()}` }),
    criarCobranca: async (dados: any) => ({
      asaasChargeId: `charge_${Date.now()}`,
      status: "PENDING",
      boletoUrl: "https://example.com/boleto",
      linhaDigitavel: "12345.67890 12345.678901 12345.678901 1 12345678901234",
      pixQrCode: "00020126580014br.gov.bcb.brcode0136123e4567-e12b-12d1-a456-426655440000520400005303986540510.005802BR5913Fulano de Tal6009BRASILIA62110503***63041234",
    }),
    consultarCobranca: async (chargeId: string) => ({
      id: chargeId,
      status: "RECEIVED",
      boletoUrl: "https://example.com/boleto",
      linhaDigitavel: "12345.67890 12345.678901 12345.678901 1 12345678901234",
      pixQrCode: "qrcode",
    }),
  };

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Setup schema mínimo
    db.run(`
      CREATE TABLE usuarios (id TEXT PRIMARY KEY);
      CREATE TABLE usuarios_funcoes (usuario_id TEXT, funcao TEXT);

      CREATE TABLE contratos_locacao (
        id INTEGER PRIMARY KEY,
        locatario TEXT NOT NULL
      );

      CREATE TABLE contrato_locatarios (
        id INTEGER PRIMARY KEY,
        contrato_id INTEGER,
        papel TEXT,
        cpf TEXT,
        email TEXT,
        telefone TEXT
      );

      CREATE TABLE aluguel_competencias (
        id INTEGER PRIMARY KEY,
        contrato_id INTEGER,
        valor_devido REAL,
        data_vencimento TEXT,
        status TEXT DEFAULT 'pendente',
        data_recebimento TEXT
      );

      CREATE TABLE entidades_legais (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        cpf_cnpj TEXT NOT NULL
      );

      CREATE TABLE processos_legais (
        id INTEGER PRIMARY KEY,
        entidade_id INTEGER
      );

      CREATE TABLE honorarios_advocaticios (
        id INTEGER PRIMARY KEY,
        processo_id INTEGER,
        valor_devido REAL,
        data_vencimento TEXT,
        status TEXT DEFAULT 'pendente',
        data_recebimento TEXT
      );

      CREATE TABLE asaas_clientes_externos (
        id INTEGER PRIMARY KEY,
        referencia_tipo TEXT,
        referencia_id INTEGER,
        asaas_customer_id TEXT UNIQUE,
        nome TEXT,
        cpf_cnpj TEXT,
        email TEXT,
        telefone TEXT
      );

      CREATE TABLE cobrancas_asaas (
        id INTEGER PRIMARY KEY,
        origem_tipo TEXT NOT NULL,
        origem_id INTEGER NOT NULL,
        asaas_customer_id TEXT,
        asaas_charge_id TEXT UNIQUE,
        tipo_cobranca TEXT,
        valor REAL,
        data_vencimento TEXT,
        status TEXT DEFAULT 'pendente',
        boleto_url TEXT,
        linha_digitavel TEXT,
        pix_qrcode TEXT,
        multa_percentual REAL,
        juros_percentual_mensal REAL,
        data_pagamento_confirmado TEXT,
        webhook_ultimo_evento TEXT,
        webhook_recebido_em TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE reembolsos_asaas (
        id INTEGER PRIMARY KEY,
        asaas_charge_id TEXT UNIQUE,
        motivo TEXT,
        tipo TEXT,
        status TEXT DEFAULT 'processando',
        data_processamento TEXT,
        origem_tipo TEXT,
        origem_id INTEGER,
        mensagem_erro TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (origem_tipo, origem_id)
      );
    `);

    // Insere dados mínimos para testes
    db.run(
      "INSERT INTO contratos_locacao (id, locatario) VALUES (1, 'João Silva')",
    );
    db.run(
      "INSERT INTO contrato_locatarios (id, contrato_id, papel, cpf, email, telefone) VALUES (1, 1, 'locatario', '123.456.789-00', 'joao@example.com', '11999999999')",
    );
    db.run(
      "INSERT INTO aluguel_competencias (id, contrato_id, valor_devido, data_vencimento, status) VALUES (1, 1, 1500.00, '2025-01-31', 'pendente')",
    );
    db.run(
      "INSERT INTO entidades_legais (id, nome, cpf_cnpj) VALUES (1, 'Acme LTDA', '12.345.678/0001-90')",
    );
    db.run(
      "INSERT INTO processos_legais (id, entidade_id) VALUES (1, 1)",
    );
    db.run(
      "INSERT INTO honorarios_advocaticios (id, processo_id, valor_devido, data_vencimento, status) VALUES (1, 1, 5000.00, '2025-02-28', 'pendente')",
    );
  });

  describe("processarReembolsoAsaas", () => {
    it("deve processar reembolso para cobrança paga", async () => {
      // Emite uma cobrança de aluguel
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      // Atualiza status para pago
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      // Processa reembolso
      const reembolso = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Cliente desistiu do contrato",
      });

      expect(reembolso).toBeDefined();
      expect(reembolso.status).toBe("sucesso");
      expect(reembolso.motivo).toBe("Cliente desistiu do contrato");
      expect(reembolso.tipo).toMatch(/^(reversao|devolucao)$/);
      expect(reembolso.asaasChargeId).toBe(cobranca.asaasChargeId);
    });

    it("deve rejeitar reembolso de cobrança não paga", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      await expect(
        processarReembolsoAsaas(db, {
          chargeId: cobranca.asaasChargeId,
          motivo: "Cliente desistiu",
        }),
      ).rejects.toThrow("'pendente'");
    });

    it("deve rejeitar reembolso de cobrança não encontrada", async () => {
      await expect(
        processarReembolsoAsaas(db, {
          chargeId: "charge_inexistente",
          motivo: "Cliente desistiu",
        }),
      ).rejects.toThrow("não encontrada");
    });

    it("deve ser idempotente — segunda chamada retorna reembolso existente", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const reembolso1 = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Cliente desistiu",
      });

      const reembolso2 = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Motivo diferente (não importa para idempotência)",
      });

      expect(reembolso1.id).toBe(reembolso2.id);
      expect(reembolso1.motivo).toBe(reembolso2.motivo);
    });

    it("deve atualizar cobrança para status 'reembolsado'", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "pix",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Erro na cobrança",
      });

      const stmt = db.prepare("SELECT status FROM cobrancas_asaas WHERE asaas_charge_id = ?");
      stmt.bind([cobranca.asaasChargeId]);
      let status: string | undefined;
      if (stmt.step()) {
        const row = stmt.getAsObject() as { status: string };
        status = row.status;
      }
      stmt.free();
      expect(status).toBe("reembolsado");
    });

    it("deve permitir tipoForce para override manual", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const reembolso = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Erro manual",
        tipoForce: "reversao",
      });

      expect(reembolso.tipo).toBe("reversao");
    });

    it("deve funcionar com cobrança de honorários", async () => {
      const cobranca = await emitirCobrancaHonorario(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const reembolso = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Erro na emissão",
      });

      expect(reembolso.origemTipo).toBe("honorario_advocaticio");
      expect(reembolso.origemId).toBe(1);
    });
  });

  describe("detectarTipoReembolso", () => {
    it("deve retornar 'reversao' para cobrança < 24h", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      const tipo = detectarTipoReembolso(db, cobranca.asaasChargeId);
      expect(tipo).toBe("reversao");
    });

    it("deve retornar 'devolucao' para cobrança ≥ 24h", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      // Simula cobrança criada há 25 horas
      const dataAnterior = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      db.run("UPDATE cobrancas_asaas SET criado_em = ? WHERE asaas_charge_id = ?", [dataAnterior, cobranca.asaasChargeId]);

      const tipo = detectarTipoReembolso(db, cobranca.asaasChargeId);
      expect(tipo).toBe("devolucao");
    });

    it("deve respeitar tipoForce override", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      const tipo = detectarTipoReembolso(db, cobranca.asaasChargeId, "devolucao");
      expect(tipo).toBe("devolucao");
    });

    it("deve rejeitar charge não encontrada", () => {
      expect(() => detectarTipoReembolso(db, "charge_inexistente")).toThrow("não encontrada");
    });

    it("deve detectar corretamente no limite de 24h", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      // Exatamente 24 horas atrás (deve ser 'devolucao')
      const data24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      db.run("UPDATE cobrancas_asaas SET criado_em = ? WHERE asaas_charge_id = ?", [data24h, cobranca.asaasChargeId]);

      const tipo = detectarTipoReembolso(db, cobranca.asaasChargeId);
      expect(tipo).toBe("devolucao");
    });
  });

  describe("obterReembolso e obterReembolsosPorChargeId", () => {
    it("deve obter reembolso por ID", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const reembolso = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Teste",
      });

      const obtido = obterReembolso(db, reembolso.id);
      expect(obtido.id).toBe(reembolso.id);
      expect(obtido.motivo).toBe("Teste");
    });

    it("deve rejeitar ID de reembolso não encontrado", () => {
      expect(() => obterReembolso(db, 999)).toThrow("não encontrado");
    });

    it("deve listar reembolsos de uma cobrança", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Motivo 1",
      });

      const reembolsos = obterReembolsosPorChargeId(db, cobranca.asaasChargeId);
      expect(reembolsos).toHaveLength(1);
      expect(reembolsos[0].motivo).toBe("Motivo 1");
    });

    it("deve retornar vazio para cobrança sem reembolsos", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      const reembolsos = obterReembolsosPorChargeId(db, cobranca.asaasChargeId);
      expect(reembolsos).toHaveLength(0);
    });
  });

  describe("listarReembolsos", () => {
    it("deve listar todos os reembolsos", async () => {
      const cobranca1 = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca1.id]);

      await processarReembolsoAsaas(db, {
        chargeId: cobranca1.asaasChargeId,
        motivo: "Reembolso 1",
        tipoForce: "reversao",
      });

      const reembolsos = listarReembolsos(db);
      expect(reembolsos.length).toBeGreaterThanOrEqual(1);
    });

    it("deve filtrar por tipo", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      // Simula < 24h para garantir tipo 'reversao'
      await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Teste",
        tipoForce: "reversao",
      });

      const reembolsos = listarReembolsos(db, { tipo: "reversao" });
      expect(reembolsos.length).toBeGreaterThanOrEqual(1);
      expect(reembolsos[0].tipo).toBe("reversao");
    });

    it("deve filtrar por status", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Teste",
      });

      const reembolsos = listarReembolsos(db, { status: "sucesso" });
      expect(reembolsos.length).toBeGreaterThanOrEqual(1);
      expect(reembolsos[0].status).toBe("sucesso");
    });
  });

  describe("marcarReembolsoComoErro", () => {
    it("deve marcar reembolso como erro", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const reembolso = await processarReembolsoAsaas(db, {
        chargeId: cobranca.asaasChargeId,
        motivo: "Teste",
      });

      const atualizado = marcarReembolsoComoErro(db, reembolso.id, "API rejeitou reversão");
      expect(atualizado.status).toBe("erro");
      expect(atualizado.mensagemErro).toBe("API rejeitou reversão");
    });
  });

  describe("aplicarEventoReembolsoWebhook", () => {
    it("deve processar PAYMENT_REFUNDED webhook", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const resultado = aplicarEventoReembolsoWebhook(db, {
        event: "PAYMENT_REFUNDED",
        payment: {
          id: cobranca.asaasChargeId,
          refundedAmount: 1500,
          refundDate: "2025-01-15",
        },
      });

      expect(resultado.aplicado).toBe(true);

      // Verifica se cobrança foi marcada como reembolsada
      const stmt = db.prepare("SELECT status FROM cobrancas_asaas WHERE asaas_charge_id = ?");
      stmt.bind([cobranca.asaasChargeId]);
      let status: string | undefined;
      if (stmt.step()) {
        const row = stmt.getAsObject() as { status: string };
        status = row.status;
      }
      stmt.free();
      expect(status).toBe("reembolsado");
    });

    it("deve ignorar webhook sem payment.id", () => {
      const resultado = aplicarEventoReembolsoWebhook(db, {
        event: "PAYMENT_REFUNDED",
        payment: {},
      });

      expect(resultado.aplicado).toBe(false);
      expect(resultado.motivo).toContain("payment.id");
    });

    it("deve ignorar webhook de cobrança não encontrada", () => {
      const resultado = aplicarEventoReembolsoWebhook(db, {
        event: "PAYMENT_REFUNDED",
        payment: {
          id: "charge_inexistente",
        },
      });

      expect(resultado.aplicado).toBe(false);
      expect(resultado.motivo).toContain("nenhuma cobrança");
    });

    it("deve ser idempotente — segundo webhook é ignorado", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const evento = {
        event: "PAYMENT_REFUNDED" as const,
        payment: {
          id: cobranca.asaasChargeId,
          refundedAmount: 1500,
          refundDate: "2025-01-15",
        },
      };

      const resultado1 = aplicarEventoReembolsoWebhook(db, evento);
      const resultado2 = aplicarEventoReembolsoWebhook(db, evento);

      expect(resultado1.aplicado).toBe(true);
      expect(resultado2.aplicado).toBe(false);
      expect(resultado2.motivo).toContain("já registrado");
    });

    it("deve usar refundDate do webhook se disponível", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      aplicarEventoReembolsoWebhook(db, {
        event: "PAYMENT_REFUNDED",
        payment: {
          id: cobranca.asaasChargeId,
          refundDate: "2025-12-25",
        },
      });

      const stmt = db.prepare("SELECT data_processamento FROM reembolsos_asaas WHERE asaas_charge_id = ?");
      stmt.bind([cobranca.asaasChargeId]);
      let dataProcessamento: string | undefined;
      if (stmt.step()) {
        const row = stmt.getAsObject() as { data_processamento: string };
        dataProcessamento = row.data_processamento;
      }
      stmt.free();
      expect(dataProcessamento).toBe("2025-12-25");
    });
  });
});
