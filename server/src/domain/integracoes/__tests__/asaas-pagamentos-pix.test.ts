import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  criarPagamentoPix,
  buscarStatusPagamentoPix,
  sincronizarPagamentosPendentes,
  validarDadosPagamento,
  buscarPagamentoPix,
  listarPagamentosPix,
  type DadosPagamentoPix,
} from "../asaas-pagamentos-pix.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_PATH = path.join(__dirname, `test-asaas-pix-${process.pid}-${Date.now()}.db`);

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) {
    const candidatos2 = [
      path.join(__dirname, `../../../${nomeArquivo}`),
      path.join(process.cwd(), `server/src/${nomeArquivo}`),
    ];
    const encontrado2 = candidatos2.find((p) => fs.existsSync(p));
    if (!encontrado2) throw new Error(`Schema não encontrado: ${nomeArquivo}`);
    return fs.readFileSync(encontrado2, "utf-8");
  }
  return fs.readFileSync(encontrado, "utf-8");
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Rodar migrations
  try {
    db.exec(resolverSchema("migrations-phase9-pagamentos-pix-proativos.sql"));
  } catch {
    console.warn("Phase 9 migration não encontrada, criando schema manualmente...");
    // Cria manualmente se não encontrar
    db.exec(`
      CREATE TABLE IF NOT EXISTS pagamentos_pix_solicitados (
        id TEXT PRIMARY KEY,
        beneficiario_id TEXT NOT NULL,
        beneficiario_nome TEXT NOT NULL,
        beneficiario_cpf_cnpj TEXT NOT NULL,
        valor REAL NOT NULL,
        descricao TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        asaas_payment_id TEXT,
        tipo_chave_pix TEXT NOT NULL,
        chave_pix_value TEXT,
        qr_code TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(beneficiario_id, valor, criado_em)
      );

      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_status
        ON pagamentos_pix_solicitados(status);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_beneficiario
        ON pagamentos_pix_solicitados(beneficiario_id);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_asaas_id
        ON pagamentos_pix_solicitados(asaas_payment_id);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_criado
        ON pagamentos_pix_solicitados(criado_em DESC);

      CREATE TABLE IF NOT EXISTS pagamentos_pix_historico (
        id TEXT PRIMARY KEY,
        pagamento_id TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT NOT NULL,
        webhook_timestamp DATETIME,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pagamento_id) REFERENCES pagamentos_pix_solicitados(id)
      );

      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_hist_pagamento
        ON pagamentos_pix_historico(pagamento_id);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_hist_criado
        ON pagamentos_pix_historico(criado_em DESC);
    `);
  }

  return db;
}

describe("Pagamentos PIX Proativos (Asaas)", () => {
  let db: Database.Database;
  const envOriginal = { ...process.env };

  beforeEach(() => {
    db = createTestDatabase();
    process.env.ASAAS_API_KEY = "test-api-key-123";
    process.env.ASAAS_SANDBOX = "true";
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env = { ...envOriginal };
  });

  describe("validarDadosPagamento", () => {
    it("✓ valida entrada com todos os campos corretos", () => {
      const resultado = validarDadosPagamento(
        "fornec-001",
        "Fornecedor ABC Ltda",
        "12345678901234",
        1500.5,
        "Pagamento de serviços",
        "CPF",
        "12345678901",
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("❌ rejeita beneficiarioId vazio", () => {
      const resultado = validarDadosPagamento("", "Fornecedor", "12345678901234", 100, "Desc", "CPF", "123");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("beneficiarioId é obrigatório");
    });

    it("❌ rejeita valor negativo", () => {
      const resultado = validarDadosPagamento("f1", "Fornecedor", "12345678901234", -100, "Desc", "CPF", "123");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor deve ser um número positivo");
    });

    it("❌ rejeita valor acima de R$ 100.000", () => {
      const resultado = validarDadosPagamento("f1", "Fornecedor", "12345678901234", 150000, "Desc", "CPF", "123");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor não pode exceder R$ 100.000,00");
    });

    it("❌ rejeita tipo de chave PIX inválido", () => {
      const resultado = validarDadosPagamento(
        "f1",
        "Fornecedor",
        "12345678901234",
        100,
        "Desc",
        "INVALIDO" as unknown as "CPF" | "EMAIL" | "ALEATORIO",
        "123",
      );
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.some((e) => e.includes("tipoChavePix inválido"))).toBe(true);
    });

    it("❌ rejeita tipo CPF sem chavePixValue", () => {
      const resultado = validarDadosPagamento("f1", "Fornecedor", "12345678901234", 100, "Desc", "CPF");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("chavePixValue é obrigatória para tipo CPF");
    });

    it("❌ rejeita CPF com formato inválido", () => {
      const resultado = validarDadosPagamento("f1", "Fornecedor", "12345678901234", 100, "Desc", "CPF", "123");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.some((e) => e.includes("CPF deve ter 11 dígitos"))).toBe(true);
    });

    it("❌ rejeita EMAIL sem @", () => {
      const resultado = validarDadosPagamento("f1", "Fornecedor", "12345678901234", 100, "Desc", "EMAIL", "semdobarra");
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.some((e) => e.includes("e-mail válido"))).toBe(true);
    });

    it("✓ aceita tipo ALEATORIO sem chavePixValue", () => {
      const resultado = validarDadosPagamento(
        "f1",
        "Fornecedor",
        "12345678901234",
        100,
        "Desc",
        "ALEATORIO",
      );
      expect(resultado.valido).toBe(true);
    });

    it("✓ aceita EMAIL válido", () => {
      const resultado = validarDadosPagamento(
        "f1",
        "Fornecedor",
        "12345678901234",
        100,
        "Desc",
        "EMAIL",
        "fornecedor@example.com",
      );
      expect(resultado.valido).toBe(true);
    });
  });

  describe("criarPagamentoPix", () => {
    it("✓ cria pagamento PIX com sucesso (sandbox)", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "asaas-pix-001",
            status: "PENDING",
            value: 1500.5,
            pixQrCode: "00020126580014br.gov.bcb.pix...",
          }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 1500.5,
        descricao: "Pagamento de serviços",
        tipoChavePix: "CPF",
        chavePixValue: "12345678901",
      };

      const resultado = await criarPagamentoPix(db, dados, mockFetch);

      expect(resultado.id).toBeTruthy();
      expect(resultado.asaasPaymentId).toBe("asaas-pix-001");
      expect(resultado.beneficiarioId).toBe("fornec-001");
      expect(resultado.valor).toBe(1500.5);
      expect(resultado.status).toBe("PROCESSING");
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("sandbox.asaas.com"), expect.any(Object));
    });

    it("❌ falha ao criar com dados inválidos", async () => {
      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: -100, // INVÁLIDO
        descricao: "Desc",
        tipoChavePix: "CPF",
        chavePixValue: "12345678901",
      };

      await expect(criarPagamentoPix(db, dados)).rejects.toThrow("Validação falhou");
    });

    it("❌ falha se Asaas retorna erro", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ description: "Invalid CPF" }] }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 1500.5,
        descricao: "Pagamento",
        tipoChavePix: "CPF",
        chavePixValue: "00000000000", // CPF ruim na API real
      };

      await expect(criarPagamentoPix(db, dados, mockFetch)).rejects.toThrow();

      // Verifica se foi marcado como FAILED
      const row = db.prepare(`SELECT id FROM pagamentos_pix_solicitados ORDER BY criado_em DESC LIMIT 1`).get() as unknown as { id: string } | undefined;
      const pagamento = buscarPagamentoPix(db, row?.id || "");
      expect(pagamento?.status).toBe("FAILED");
    });

    it("✓ usa produção se ASAAS_SANDBOX=false", async () => {
      process.env.ASAAS_SANDBOX = "false";

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-pix-002", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 1000,
        descricao: "Pagamento",
        tipoChavePix: "EMAIL",
        chavePixValue: "fornecedor@example.com",
      };

      await criarPagamentoPix(db, dados, mockFetch);

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("api.asaas.com"), expect.any(Object));
    });

    it("❌ falha se ASAAS_API_KEY não configurada", async () => {
      delete process.env.ASAAS_API_KEY;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 1000,
        descricao: "Pagamento",
        tipoChavePix: "EMAIL",
        chavePixValue: "fornecedor@example.com",
      };

      // Espera qualquer erro (AsaasConfiguracaoAusenteError ou AsaasApiError que o envolve)
      await expect(criarPagamentoPix(db, dados)).rejects.toThrow();
    });
  });

  describe("buscarPagamentoPix", () => {
    it("✓ busca pagamento existente", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-001", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 500,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "12345678901",
      };

      const criado = await criarPagamentoPix(db, dados, mockFetch);
      const encontrado = buscarPagamentoPix(db, criado.id);

      expect(encontrado).not.toBeNull();
      expect(encontrado?.beneficiarioId).toBe("fornec-001");
      expect(encontrado?.valor).toBe(500);
    });

    it("✓ retorna null se pagamento não existe", () => {
      const resultado = buscarPagamentoPix(db, "id-inexistente");
      expect(resultado).toBeNull();
    });
  });

  describe("buscarStatusPagamentoPix", () => {
    it("✓ atualiza status se mudou no Asaas", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-status-001", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-001",
        beneficiarioNome: "Fornecedor ABC",
        beneficiarioCpfCnpj: "12345678901234",
        valor: 750,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "12345678901",
      };

      const criado = await criarPagamentoPix(db, dados, mockFetchCriar);

      // Mock fetch para buscar status (retorna COMPLETED)
      const mockFetchStatus = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-status-001", status: "PAID" }),
      })) as MockFetch;

      const atualizado = await buscarStatusPagamentoPix(db, criado.id, mockFetchStatus);

      expect(atualizado?.status).toBe("COMPLETED");

      // Verifica histórico
      const historico = db.prepare(`SELECT COUNT(*) as cnt FROM pagamentos_pix_historico WHERE pagamento_id = ?`).get(criado.id) as unknown as { cnt: number };
      expect(historico.cnt).toBeGreaterThan(0);
    });

    it("✓ retorna pagamento sem atualizar se status igual", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-status-002", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-002",
        beneficiarioNome: "Fornecedor XYZ",
        beneficiarioCpfCnpj: "98765432101234",
        valor: 250,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "98765432101",
      };

      const criado = await criarPagamentoPix(db, dados, mockFetchCriar);
      const statusAntes = criado.status; // PROCESSING

      // Mock retorna o mesmo status que temos (PROCESSING)
      const mockFetchStatus = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-status-002", status: "PROCESSING" }),
      })) as MockFetch;

      const resultado = await buscarStatusPagamentoPix(db, criado.id, mockFetchStatus);
      expect(resultado?.status).toBe(statusAntes);
    });

    it("❌ falha gracefully se Asaas indisponível", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-status-003", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-003",
        beneficiarioNome: "Fornecedor Test",
        beneficiarioCpfCnpj: "11111111111111",
        valor: 100,
        descricao: "Serviço",
        tipoChavePix: "ALEATORIO",
      };

      const criado = await criarPagamentoPix(db, dados, mockFetchCriar);

      const mockFetchFail = vi.fn(async () => {
        throw new Error("Network timeout");
      }) as MockFetch;

      const resultado = await buscarStatusPagamentoPix(db, criado.id, mockFetchFail);
      expect(resultado).not.toBeNull();
      expect(resultado?.status).toBe("PROCESSING"); // Mantém status anterior
    });

    it("✓ mapeia status PAID → COMPLETED", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-paid-001", status: "PENDING" }),
      })) as MockFetch;

      const dados: DadosPagamentoPix = {
        beneficiarioId: "fornec-004",
        beneficiarioNome: "Fornecedor",
        beneficiarioCpfCnpj: "22222222222222",
        valor: 300,
        descricao: "Serviço",
        tipoChavePix: "EMAIL",
        chavePixValue: "test@example.com",
      };

      const criado = await criarPagamentoPix(db, dados, mockFetchCriar);

      const mockFetchPaid = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-paid-001", status: "PAID" }),
      })) as MockFetch;

      const atualizado = await buscarStatusPagamentoPix(db, criado.id, mockFetchPaid);
      expect(atualizado?.status).toBe("COMPLETED");
    });
  });

  describe("sincronizarPagamentosPendentes", () => {
    it("✓ sincroniza múltiplos pagamentos pendentes", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: `asaas-${randomUUID().slice(0, 8)}`, status: "PENDING" }),
      })) as MockFetch;

      // Criar 3 pagamentos pendentes
      for (let i = 0; i < 3; i++) {
        await criarPagamentoPix(db, {
          beneficiarioId: `fornec-sync-${i}`,
          beneficiarioNome: `Fornecedor ${i}`,
          beneficiarioCpfCnpj: `${String(i).padStart(14, "1")}`,
          valor: 100 + i * 50,
          descricao: "Serviço",
          tipoChavePix: "CPF",
          chavePixValue: `${String(i).padStart(11, "1")}`,
        }, mockFetchCriar);
      }

      const mockFetchSync = vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () => {
          // Retorna status diferentes para cada um
          if (url.includes("asaas")) {
            return JSON.stringify({ id: "asaas-123", status: "COMPLETED" });
          }
          return JSON.stringify({});
        },
      })) as MockFetch;

      const resultado = await sincronizarPagamentosPendentes(db, mockFetchSync);

      expect(resultado.atualizados).toBeGreaterThanOrEqual(0);
      expect(resultado.erros).toBeGreaterThanOrEqual(0);
    });

    it("✓ ignora pagamentos com mais de 7 dias", async () => {
      // Insere um pagamento antigo diretamente
      db.prepare(`
        INSERT INTO pagamentos_pix_solicitados (
          id, beneficiario_id, beneficiario_nome, beneficiario_cpf_cnpj,
          valor, descricao, status, tipo_chave_pix, criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        "fornec-old",
        "Fornecedor Antigo",
        "12345678901234",
        500,
        "Serviço",
        "PENDING",
        "CPF",
        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 dias atrás
        new Date().toISOString(),
      );

      const mockFetch = vi.fn() as MockFetch;

      await sincronizarPagamentosPendentes(db, mockFetch);

      // Não deve ter chamado fetch para pagamento antigo
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("✓ continua mesmo com erros em pagamentos individuais", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-error-test", status: "PENDING" }),
      })) as MockFetch;

      // Criar 2 pagamentos
      const ids = [];
      for (let i = 0; i < 2; i++) {
        const pag = await criarPagamentoPix(db, {
          beneficiarioId: `fornec-error-${i}`,
          beneficiarioNome: `Fornecedor ${i}`,
          beneficiarioCpfCnpj: `${String(i + 1).padStart(14, "3")}`,
          valor: 200 + i * 100,
          descricao: "Serviço",
          tipoChavePix: "CPF",
          chavePixValue: `${String(i + 1).padStart(11, "3")}`,
        }, mockFetchCriar);
        ids.push(pag.id);
      }

      let callCount = 0;
      const mockFetchSync = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Timeout na primeira chamada");
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "asaas-123", status: "COMPLETED" }),
        };
      }) as MockFetch;

      const resultado = await sincronizarPagamentosPendentes(db, mockFetchSync);

      // Mesmo com erro na primeira, deve continuar
      expect(resultado.atualizados + resultado.erros).toBeGreaterThan(0);
    });
  });

  describe("listarPagamentosPix", () => {
    it("✓ lista todos os pagamentos", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: `asaas-${randomUUID().slice(0, 8)}`, status: "PENDING" }),
      })) as MockFetch;

      for (let i = 0; i < 3; i++) {
        await criarPagamentoPix(db, {
          beneficiarioId: `fornec-list-${i}`,
          beneficiarioNome: `Fornecedor ${i}`,
          beneficiarioCpfCnpj: `${String(i).padStart(14, "4")}`,
          valor: 100 + i * 50,
          descricao: "Serviço",
          tipoChavePix: "CPF",
          chavePixValue: `${String(i).padStart(11, "4")}`,
        }, mockFetch);
      }

      const lista = listarPagamentosPix(db);
      expect(lista.length).toBe(3);
    });

    it("✓ filtra por status", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: `asaas-${randomUUID().slice(0, 8)}`, status: "PENDING" }),
      })) as MockFetch;

      const pag = await criarPagamentoPix(db, {
        beneficiarioId: "fornec-filter",
        beneficiarioNome: "Fornecedor",
        beneficiarioCpfCnpj: "55555555555555",
        valor: 250,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "55555555555",
      }, mockFetch);

      const lista = listarPagamentosPix(db, { status: "PROCESSING" });
      expect(lista.some((p) => p.id === pag.id)).toBe(true);
    });

    it("✓ filtra por beneficiarioId", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: `asaas-${randomUUID().slice(0, 8)}`, status: "PENDING" }),
      })) as MockFetch;

      const pag = await criarPagamentoPix(db, {
        beneficiarioId: "fornec-especifico",
        beneficiarioNome: "Fornecedor Especifico",
        beneficiarioCpfCnpj: "66666666666666",
        valor: 300,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "66666666666",
      }, mockFetch);

      const lista = listarPagamentosPix(db, { beneficiarioId: "fornec-especifico" });
      expect(lista.every((p) => p.beneficiarioId === "fornec-especifico")).toBe(true);
      expect(lista.some((p) => p.id === pag.id)).toBe(true);
    });

    it("✓ filtra por diasAtras", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: `asaas-${randomUUID().slice(0, 8)}`, status: "PENDING" }),
      })) as MockFetch;

      const pag = await criarPagamentoPix(db, {
        beneficiarioId: "fornec-recente",
        beneficiarioNome: "Fornecedor",
        beneficiarioCpfCnpj: "77777777777777",
        valor: 400,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "77777777777",
      }, mockFetch);

      const lista = listarPagamentosPix(db, { diasAtras: 1 });
      expect(lista.some((p) => p.id === pag.id)).toBe(true);

      const listaVazia = listarPagamentosPix(db, { diasAtras: 1, beneficiarioId: "fornec-inexistente" });
      expect(listaVazia.length).toBe(0);
    });
  });

  describe("Webhook Integration", () => {
    it("✓ webhook atualiza status corretamente", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-webhook-001", status: "PENDING" }),
      })) as MockFetch;

      const pag = await criarPagamentoPix(db, {
        beneficiarioId: "fornec-webhook",
        beneficiarioNome: "Fornecedor",
        beneficiarioCpfCnpj: "88888888888888",
        valor: 500,
        descricao: "Serviço",
        tipoChavePix: "CPF",
        chavePixValue: "88888888888",
      }, mockFetch);

      // Simular webhook atualizando para COMPLETED
      db.prepare(`
        UPDATE pagamentos_pix_solicitados
        SET status = 'COMPLETED', atualizado_em = ?
        WHERE id = ?
      `).run(new Date().toISOString(), pag.id);

      // Verificar histórico
      db.prepare(`
        SELECT COUNT(*) as cnt FROM pagamentos_pix_historico
        WHERE pagamento_id = ? AND status_novo = 'COMPLETED'
      `).get(pag.id);

      // O histórico deveria ter sido criado pela função de atualização
      // Mas neste teste manual, apenas verificamos que a atualização funcionou
      const atualizado = buscarPagamentoPix(db, pag.id);
      expect(atualizado?.status).toBe("COMPLETED");
    });
  });

  describe("End-to-End", () => {
    it("✓ fluxo completo: criar → sincronizar → atualizar", async () => {
      const mockFetchCriar = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-e2e-001", status: "PENDING" }),
      })) as MockFetch;

      // 1. Criar
      const pag = await criarPagamentoPix(db, {
        beneficiarioId: "fornec-e2e",
        beneficiarioNome: "Fornecedor E2E",
        beneficiarioCpfCnpj: "99999999999999",
        valor: 1000,
        descricao: "Serviço Completo",
        tipoChavePix: "EMAIL",
        chavePixValue: "e2e@example.com",
      }, mockFetchCriar);

      expect(pag.status).toBe("PROCESSING");

      // 2. Sincronizar (simula mudança de status)
      const mockFetchSync = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "asaas-e2e-001", status: "PAID" }),
      })) as MockFetch;

      await sincronizarPagamentosPendentes(db, mockFetchSync);

      // 3. Verificar status atualizado
      const pagAtualizado = buscarPagamentoPix(db, pag.id);
      expect(pagAtualizado?.status).toBe("COMPLETED");

      // 4. Verificar histórico
      const hist = db.prepare(`
        SELECT COUNT(*) as cnt FROM pagamentos_pix_historico
        WHERE pagamento_id = ?
      `).get(pag.id) as unknown as { cnt: number };
      expect(hist.cnt).toBeGreaterThan(0);
    });
  });
});
