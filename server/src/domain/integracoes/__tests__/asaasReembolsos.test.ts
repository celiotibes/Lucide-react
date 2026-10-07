import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validarDadosReembolso,
  criarReembolso,
  obterReembolso,
  listarReembolsos,
  atualizarStatusReembolso,
  processarWebhookReembolso,
  ErroValidacaoReembolso,
  type DadosNovoReembolso,
} from "../asaasReembolsos";

let db: Database.Database;

beforeEach(() => {
  // Cria banco de dados em memória para testes
  db = new Database(":memory:");

  // Cria as tabelas necessárias
  db.exec(`
    CREATE TABLE asaas_reembolsos (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
      status TEXT NOT NULL CHECK(status IN ('pendente', 'processando', 'confirmado', 'rejeitado', 'cancelado')),
      data_solicitacao TEXT NOT NULL,
      data_confirmacao TEXT,
      motivo TEXT NOT NULL,
      numero_transacao_original TEXT NOT NULL,
      asaas_reembolso_id TEXT UNIQUE,
      descricao_erro TEXT,
      CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE asaas_reembolsos_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reembolso_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      acao TEXT NOT NULL,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      data_acao TEXT NOT NULL,
      descricao TEXT,
      CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reembolso_id) REFERENCES asaas_reembolsos(id)
    );
  `);
});

afterEach(() => {
  db.close();
});

describe("asaasReembolsos", () => {
  describe("validarDadosReembolso", () => {
    it("deve validar dados válidos", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução de pagamento indevido",
        numero_transacao_original: "txn-456",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("deve rejeitar valor negativo ou zero", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: -100,
        motivo: "Motivo",
        numero_transacao_original: "txn-456",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor deve ser um número positivo");
    });

    it("deve rejeitar valor acima do limite", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 2000000,
        motivo: "Motivo",
        numero_transacao_original: "txn-456",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor não pode exceder R$ 1.000.000,00");
    });

    it("deve rejeitar usuario_id vazio", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "",
        valor: 100,
        motivo: "Motivo",
        numero_transacao_original: "txn-456",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("usuario_id é obrigatório");
    });

    it("deve rejeitar motivo vazio", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 100,
        motivo: "",
        numero_transacao_original: "txn-456",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("motivo é obrigatório");
    });

    it("deve rejeitar numero_transacao_original vazio", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 100,
        motivo: "Motivo",
        numero_transacao_original: "",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("numero_transacao_original é obrigatório");
    });

    it("deve rejeitar múltiplos erros", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "",
        valor: 0,
        motivo: "",
        numero_transacao_original: "",
      };

      const resultado = validarDadosReembolso(dados);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(1);
    });
  });

  describe("criarReembolso", () => {
    it("deve criar um reembolso com status pendente", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);

      expect(reembolso).toBeDefined();
      expect(reembolso.usuario_id).toBe("user-123");
      expect(reembolso.valor).toBe(500.0);
      expect(reembolso.status).toBe("pendente");
      expect(reembolso.data_confirmacao).toBeNull();
      expect(reembolso.asaas_reembolso_id).toBeNull();
    });

    it("deve lançar erro se dados forem inválidos", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: -100,
        motivo: "Motivo",
        numero_transacao_original: "txn-456",
      };

      expect(() => {
        criarReembolso(db, dados);
      }).toThrow(ErroValidacaoReembolso);
    });

    it("deve criar registro de auditoria", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);

      const stmtAudit = db.prepare(`
        SELECT * FROM asaas_reembolsos_historico WHERE reembolso_id = ?
      `);
      const historicos = stmtAudit.all(reembolso.id) as Record<string, unknown>[];

      expect(historicos.length).toBeGreaterThan(0);
      expect(historicos[0].acao).toBe("CRIACAO");
      expect(historicos[0].status_novo).toBe("pendente");
    });
  });

  describe("obterReembolso", () => {
    it("deve obter um reembolso existente", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolsoCriado = criarReembolso(db, dados);
      const reembolsoObtido = obterReembolso(db, reembolsoCriado.id);

      expect(reembolsoObtido).toBeDefined();
      expect(reembolsoObtido?.id).toBe(reembolsoCriado.id);
      expect(reembolsoObtido?.valor).toBe(500.0);
    });

    it("deve retornar null se reembolso não existir", () => {
      const reembolso = obterReembolso(db, "id-inexistente");
      expect(reembolso).toBeNull();
    });
  });

  describe("listarReembolsos", () => {
    it("deve listar todos os reembolsos", () => {
      const dados1: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const dados2: DadosNovoReembolso = {
        usuario_id: "user-456",
        valor: 750.0,
        motivo: "Devolução 2",
        numero_transacao_original: "txn-789",
      };

      criarReembolso(db, dados1);
      criarReembolso(db, dados2);

      const reembolsos = listarReembolsos(db);

      expect(reembolsos.length).toBe(2);
    });

    it("deve filtrar reembolsos por usuario_id", () => {
      const dados1: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const dados2: DadosNovoReembolso = {
        usuario_id: "user-456",
        valor: 750.0,
        motivo: "Devolução 2",
        numero_transacao_original: "txn-789",
      };

      criarReembolso(db, dados1);
      criarReembolso(db, dados2);

      const reembolsos = listarReembolsos(db, { usuario_id: "user-123" });

      expect(reembolsos.length).toBe(1);
      expect(reembolsos[0].usuario_id).toBe("user-123");
    });

    it("deve filtrar reembolsos por status", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);
      atualizarStatusReembolso(db, reembolso.id, "confirmado");

      const reembolsosPendentes = listarReembolsos(db, { status: "pendente" });
      const reembolsosConfirmados = listarReembolsos(db, { status: "confirmado" });

      expect(reembolsosPendentes.length).toBe(0);
      expect(reembolsosConfirmados.length).toBe(1);
    });
  });

  describe("atualizarStatusReembolso", () => {
    it("deve atualizar status de um reembolso", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);
      const reembolsoAtualizado = atualizarStatusReembolso(
        db,
        reembolso.id,
        "processando",
      );

      expect(reembolsoAtualizado.status).toBe("processando");
    });

    it("deve atualizar data_confirmacao ao confirmar", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);
      const reembolsoAtualizado = atualizarStatusReembolso(
        db,
        reembolso.id,
        "confirmado",
      );

      expect(reembolsoAtualizado.status).toBe("confirmado");
      expect(reembolsoAtualizado.data_confirmacao).not.toBeNull();
    });

    it("deve lançar erro se status for inválido", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);

      expect(() => {
        atualizarStatusReembolso(db, reembolso.id, "invalido" as unknown);
      }).toThrow();
    });

    it("deve registrar auditoria de mudança de status", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);
      atualizarStatusReembolso(db, reembolso.id, "confirmado");

      const stmtAudit = db.prepare(`
        SELECT * FROM asaas_reembolsos_historico WHERE reembolso_id = ? AND acao = 'ATUALIZACAO_STATUS'
      `);
      const historicos = stmtAudit.all(reembolso.id) as Record<string, unknown>[];

      expect(historicos.length).toBeGreaterThan(0);
      expect(historicos[0].status_anterior).toBe("pendente");
      expect(historicos[0].status_novo).toBe("confirmado");
    });
  });

  describe("processarWebhookReembolso", () => {
    it("deve processar webhook de reembolso confirmado", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);

      // Simula que o Asaas processou o reembolso
      const stmt = db.prepare("UPDATE asaas_reembolsos SET asaas_reembolso_id = ? WHERE id = ?");
      stmt.run("asaas-123", reembolso.id);

      const webhook = {
        type: "TRANSFER_RECEIVED",
        data: {
          id: "asaas-123",
          status: "completed",
          amount: 500.0,
          originalTransactionId: "txn-456",
        },
      };

      processarWebhookReembolso(db, webhook);

      const reembolsoAtualizado = obterReembolso(db, reembolso.id);
      expect(reembolsoAtualizado?.status).toBe("confirmado");
    });

    it("deve processar webhook de reembolso rejeitado", () => {
      const dados: DadosNovoReembolso = {
        usuario_id: "user-123",
        valor: 500.0,
        motivo: "Devolução",
        numero_transacao_original: "txn-456",
      };

      const reembolso = criarReembolso(db, dados);

      // Simula que o Asaas processou o reembolso
      const stmt = db.prepare("UPDATE asaas_reembolsos SET asaas_reembolso_id = ? WHERE id = ?");
      stmt.run("asaas-123", reembolso.id);

      const webhook = {
        type: "TRANSFER_RECEIVED",
        data: {
          id: "asaas-123",
          status: "failed",
          amount: 500.0,
          originalTransactionId: "txn-456",
          error: "Transação original não encontrada",
        },
      };

      processarWebhookReembolso(db, webhook);

      const reembolsoAtualizado = obterReembolso(db, reembolso.id);
      expect(reembolsoAtualizado?.status).toBe("rejeitado");
      expect(reembolsoAtualizado?.descricao_erro).not.toBeNull();
    });
  });
});
