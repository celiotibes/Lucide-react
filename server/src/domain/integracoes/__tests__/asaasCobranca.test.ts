import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validarDadosCobranca,
  emitirCobranca,
  obterCobranca,
  listarCobrancas,
  registrarPagamento,
  atualizarStatusCobranca,
  processarWebhookCobranca,
  cancelarCobranca,
  listarCobrancasVencidas,
  atualizarCobrancasVencidas,
  ErroValidacaoCobranca,
  type DadosNovaCobranca,
} from "../asaasCobranca";

let db: Database.Database;

beforeEach(() => {
  // Cria banco de dados em memória para testes
  db = new Database(":memory:");

  // Cria as tabelas necessárias
  db.exec(`
    CREATE TABLE asaas_cobrancas (
      id TEXT PRIMARY KEY,
      aluguel_id TEXT NOT NULL,
      imovel_id TEXT NOT NULL,
      valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
      data_vencimento TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pendente', 'processando', 'aberta', 'paga', 'vencida', 'cancelada')),
      numero_boleto TEXT,
      linha_digitavel TEXT,
      qr_code_pix TEXT,
      asaas_cobranca_id TEXT UNIQUE,
      data_criacao TEXT NOT NULL,
      data_pagamento TEXT,
      valor_pago DECIMAL(12, 2),
      tipo_pagamento TEXT,
      referencia_externa TEXT,
      CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE asaas_cobrancas_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cobranca_id TEXT NOT NULL,
      aluguel_id TEXT NOT NULL,
      acao TEXT NOT NULL,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      data_acao TEXT NOT NULL,
      descricao TEXT,
      CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cobranca_id) REFERENCES asaas_cobrancas(id)
    );
  `);
});

afterEach(() => {
  db.close();
});

describe("asaasCobranca", () => {
  describe("validarDadosCobranca", () => {
    it("deve validar dados válidos", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("deve rejeitar valor negativo ou zero", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: -100,
        data_vencimento: "2026-11-30",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor deve ser um número positivo");
    });

    it("deve rejeitar valor acima do limite", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 200000000,
        data_vencimento: "2026-11-30",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor não pode exceder R$ 100.000,00");
    });

    it("deve rejeitar data no passado", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2020-01-01",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("data_vencimento deve ser uma data futura");
    });

    it("deve rejeitar formato de data inválido", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "30/11/2026",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("data_vencimento deve estar no formato YYYY-MM-DD");
    });

    it("deve rejeitar aluguel_id vazio", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("aluguel_id é obrigatório");
    });

    it("deve rejeitar imovel_id vazio", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const resultado = validarDadosCobranca(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("imovel_id é obrigatório");
    });
  });

  describe("emitirCobranca", () => {
    it("deve criar uma cobrança com status pendente", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);

      expect(cobranca).toBeDefined();
      expect(cobranca.aluguel_id).toBe("aluguel-123");
      expect(cobranca.imovel_id).toBe("imovel-456");
      expect(cobranca.valor).toBe(1500.0);
      expect(cobranca.status).toBe("pendente");
      expect(cobranca.numero_boleto).toBeNull();
      expect(cobranca.asaas_cobranca_id).toBeNull();
    });

    it("deve lançar erro se dados forem inválidos", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: -100,
        data_vencimento: "2026-11-30",
      };

      expect(() => {
        emitirCobranca(db, dados);
      }).toThrow(ErroValidacaoCobranca);
    });

    it("deve permitir apenas um boleto aberto por aluguel", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      emitirCobranca(db, dados);

      const dadosSegundo: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 2000.0,
        data_vencimento: "2026-12-30",
      };

      expect(() => {
        emitirCobranca(db, dadosSegundo);
      }).toThrow();
    });

    it("deve criar registro de auditoria", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);

      const stmtAudit = db.prepare(`
        SELECT * FROM asaas_cobrancas_historico WHERE cobranca_id = ?
      `);
      const historicos = stmtAudit.all(cobranca.id) as Record<string, unknown>[];

      expect(historicos.length).toBeGreaterThan(0);
      expect(historicos[0].acao).toBe("CRIACAO");
      expect(historicos[0].status_novo).toBe("pendente");
    });
  });

  describe("obterCobranca", () => {
    it("deve obter uma cobrança existente", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobrancaCriada = emitirCobranca(db, dados);
      const cobrancaObtida = obterCobranca(db, cobrancaCriada.id);

      expect(cobrancaObtida).toBeDefined();
      expect(cobrancaObtida?.id).toBe(cobrancaCriada.id);
      expect(cobrancaObtida?.valor).toBe(1500.0);
    });

    it("deve retornar null se cobrança não existir", () => {
      const cobranca = obterCobranca(db, "id-inexistente");
      expect(cobranca).toBeNull();
    });
  });

  describe("listarCobrancas", () => {
    it("deve listar todas as cobrancas", () => {
      const dados1: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const dados2: DadosNovaCobranca = {
        aluguel_id: "aluguel-789",
        imovel_id: "imovel-456",
        valor: 2000.0,
        data_vencimento: "2026-12-30",
      };

      emitirCobranca(db, dados1);
      emitirCobranca(db, dados2);

      const cobrancas = listarCobrancas(db);

      expect(cobrancas.length).toBe(2);
    });

    it("deve filtrar cobrancas por imovel_id", () => {
      const dados1: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const dados2: DadosNovaCobranca = {
        aluguel_id: "aluguel-789",
        imovel_id: "imovel-999",
        valor: 2000.0,
        data_vencimento: "2026-12-30",
      };

      emitirCobranca(db, dados1);
      emitirCobranca(db, dados2);

      const cobrancas = listarCobrancas(db, "imovel-456");

      expect(cobrancas.length).toBe(1);
      expect(cobrancas[0].imovel_id).toBe("imovel-456");
    });

    it("deve filtrar cobrancas por status", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);
      atualizarStatusCobranca(db, cobranca.id, "aberta");

      const cobrancasPendentes = listarCobrancas(db, undefined, { status: "pendente" });
      const cobrancasAbertas = listarCobrancas(db, undefined, { status: "aberta" });

      expect(cobrancasPendentes.length).toBe(0);
      expect(cobrancasAbertas.length).toBe(1);
    });
  });

  describe("registrarPagamento", () => {
    it("deve registrar pagamento de uma cobrança", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);
      const cobrancaPaga = registrarPagamento(
        db,
        cobranca.id,
        1500.0,
        "boleto",
      );

      expect(cobrancaPaga.status).toBe("paga");
      expect(cobrancaPaga.valor_pago).toBe(1500.0);
      expect(cobrancaPaga.tipo_pagamento).toBe("boleto");
      expect(cobrancaPaga.data_pagamento).not.toBeNull();
    });

    it("deve rejeitar valor_pago negativo", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);

      expect(() => {
        registrarPagamento(db, cobranca.id, -100, "boleto");
      }).toThrow();
    });
  });

  describe("atualizarStatusCobranca", () => {
    it("deve atualizar status de uma cobrança", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);
      const cobrancaAtualizada = atualizarStatusCobranca(
        db,
        cobranca.id,
        "processando",
      );

      expect(cobrancaAtualizada.status).toBe("processando");
    });

    it("deve lançar erro se status for inválido", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);

      expect(() => {
        atualizarStatusCobranca(db, cobranca.id, "invalido" as unknown);
      }).toThrow();
    });
  });

  describe("processarWebhookCobranca", () => {
    it("deve processar webhook de pagamento recebido", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);

      // Simula que o Asaas processou o pagamento
      const stmt = db.prepare("UPDATE asaas_cobrancas SET asaas_cobranca_id = ? WHERE id = ?");
      stmt.run("asaas-123", cobranca.id);

      const webhook = {
        type: "PAYMENT_RECEIVED",
        data: {
          id: "asaas-123",
          status: "paid",
          amount: 1500.0,
          paymentDate: new Date().toISOString(),
          paymentMethod: "boleto",
        },
      };

      processarWebhookCobranca(db, webhook);

      const cobrancaAtualizada = obterCobranca(db, cobranca.id);
      expect(cobrancaAtualizada?.status).toBe("paga");
      expect(cobrancaAtualizada?.valor_pago).toBe(1500.0);
    });
  });

  describe("cancelarCobranca", () => {
    it("deve cancelar uma cobrança aberta", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);
      const cobrancaCancelada = cancelarCobranca(db, cobranca.id);

      expect(cobrancaCancelada.status).toBe("cancelada");
    });

    it("deve rejeitar cancelamento de cobrança já paga", () => {
      const dados: DadosNovaCobranca = {
        aluguel_id: "aluguel-123",
        imovel_id: "imovel-456",
        valor: 1500.0,
        data_vencimento: "2026-11-30",
      };

      const cobranca = emitirCobranca(db, dados);
      registrarPagamento(db, cobranca.id, 1500.0, "boleto");

      expect(() => {
        cancelarCobranca(db, cobranca.id);
      }).toThrow();
    });
  });

  describe("listarCobrancasVencidas", () => {
    it("deve listar cobrancas vencidas", () => {
      // Inserir manualmente uma cobrança com data no passado
      const stmt = db.prepare(`
        INSERT INTO asaas_cobrancas (
          id, aluguel_id, imovel_id, valor, data_vencimento, status,
          data_criacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        "cobranca-vencida-1",
        "aluguel-123",
        "imovel-456",
        1500.0,
        "2020-01-01",
        "aberta",
        new Date().toISOString(),
      );

      const vencidas = listarCobrancasVencidas(db);
      expect(vencidas.length).toBeGreaterThan(0);
    });
  });

  describe("atualizarCobrancasVencidas", () => {
    it("deve atualizar cobrancas vencidas para status 'vencida'", () => {
      // Inserir uma cobrança com data no passado
      const stmt = db.prepare(`
        INSERT INTO asaas_cobrancas (
          id, aluguel_id, imovel_id, valor, data_vencimento, status,
          data_criacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        "cobranca-vencida-1",
        "aluguel-123",
        "imovel-456",
        1500.0,
        "2020-01-01",
        "aberta",
        new Date().toISOString(),
      );

      const count = atualizarCobrancasVencidas(db);
      expect(count).toBeGreaterThan(0);

      const cobrancaAtualizada = obterCobranca(db, "cobranca-vencida-1");
      expect(cobrancaAtualizada?.status).toBe("vencida");
    });

    it("deve processar múltiplas cobrancas vencidas em uma única transação (PERF-002)", () => {
      // PERF-002: Batch transaction optimization test
      // Inserir múltiplas cobrancas com data no passado
      const stmt = db.prepare(`
        INSERT INTO asaas_cobrancas (
          id, aluguel_id, imovel_id, valor, data_vencimento, status,
          data_criacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const numCobrancas = 50;
      for (let i = 1; i <= numCobrancas; i++) {
        stmt.run(
          `cobranca-vencida-${i}`,
          `aluguel-${i}`,
          `imovel-${Math.floor(i / 10)}`,
          1500.0 + i * 100,
          "2020-01-01",
          "aberta",
          new Date().toISOString(),
        );
      }

      // Executar batch update com transaction
      const startTime = Date.now();
      const count = atualizarCobrancasVencidas(db);
      const duration = Date.now() - startTime;

      // Verificar que todas foram atualizadas
      expect(count).toBe(numCobrancas);

      // Verificar que todas têm status 'vencida'
      for (let i = 1; i <= numCobrancas; i++) {
        const cobranca = obterCobranca(db, `cobranca-vencida-${i}`);
        expect(cobranca?.status).toBe("vencida");
      }

      // Verificar que registros de auditoria foram criados
      const auditStmt = db.prepare(`
        SELECT COUNT(*) as count FROM asaas_cobrancas_historico
        WHERE acao = 'ATUALIZACAO_STATUS' AND status_novo = 'vencida'
      `);
      const auditResult = auditStmt.get() as Record<string, unknown>;
      expect(auditResult.count).toBe(numCobrancas);

      // Log performance info (transaction should be fast)
      console.log(
        `PERF-002: Batch updated ${numCobrancas} overdue charges in ${duration}ms (transaction-based)`,
      );
    });

    it("deve retornar 0 se não houver cobrancas vencidas", () => {
      const count = atualizarCobrancasVencidas(db);
      expect(count).toBe(0);
    });
  });
});
