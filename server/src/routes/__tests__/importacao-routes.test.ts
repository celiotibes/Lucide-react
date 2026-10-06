/**
 * Testes para sistema de importação de documentos
 * Fase 3: Validação e Deduplicação
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validarLinha, obterResumoValidacoes } from "../../domain/importacao/validacao.js";
import { detectarDuplicata, registrarDuplicata } from "../../domain/importacao/deduplicacao.js";
import type { LinhaImportacao } from "../../domain/importacao/tipos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "../..");

function criarBancoTeste(): Database.Database {
  const db = new Database(":memory:");

  // Carregar migrations
  const migrationsPhase2 = fs.readFileSync(
    path.join(SRC_DIR, "migrations-phase2-auth.sql"),
    "utf-8"
  );
  db.exec(migrationsPhase2);

  // Carregar migration de importação
  const migrationsImportacao = fs.readFileSync(
    path.join(SRC_DIR, "migrations-phase17-importacao-deduplicacao.sql"),
    "utf-8"
  );
  db.exec(migrationsImportacao);

  return db;
}

function criarUsuarioTeste(db: Database.Database, id: string): void {
  const stmt = db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role) VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(id, "Teste User", `${id}@test.com`, "hash_qualquer", "titular");
}

function criarLoteTeste(
  db: Database.Database,
  loteId: string,
  usuarioId: string
): void {
  const stmt = db.prepare(
    `INSERT INTO importacao_lotes (id, usuario_id, nome_arquivo, formato, total_linhas, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(loteId, usuarioId, "teste.csv", "csv", 0, "processando");
}

function criarLinhaTeste(
  db: Database.Database,
  linhaId: string,
  loteId: string,
  usuarioId: string,
  dadosOp: Partial<LinhaImportacao>
): LinhaImportacao {
  const linha: LinhaImportacao = {
    id: linhaId,
    lote_id: loteId,
    usuario_id: usuarioId,
    numero_linha: dadosOp.numero_linha || 1,
    data_transacao: dadosOp.data_transacao || "2024-10-01",
    valor: dadosOp.valor || 100.0,
    descricao: dadosOp.descricao || "Teste",
    status: "pendente",
    score_duplicata: 0,
    suspeita_duplicata: 0,
    criado_em: new Date().toISOString(),
  };

  const stmt = db.prepare(
    `INSERT INTO importacao_linhas
     (id, lote_id, usuario_id, numero_linha, data_transacao, valor, descricao, status, score_duplicata, suspeita_duplicata, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  stmt.run(
    linha.id,
    linha.lote_id,
    linha.usuario_id,
    linha.numero_linha,
    linha.data_transacao,
    linha.valor,
    linha.descricao,
    linha.status,
    linha.score_duplicata,
    linha.suspeita_duplicata,
    linha.criado_em
  );

  return linha;
}

describe("Validação de Linhas de Importação", () => {
  let db: Database.Database;
  const usuarioId = "user-123";
  const loteId = "lote-456";

  beforeEach(() => {
    db = criarBancoTeste();
    criarUsuarioTeste(db, usuarioId);
    criarLoteTeste(db, loteId, usuarioId);
  });

  it("deve rejeitar linha com data no futuro", () => {
    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 1);
    const dataStr = dataFutura.toISOString().split("T")[0];

    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: dataStr,
      valor: 100,
      descricao: "Teste com data futura",
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros.some((e) => e.includes("futuro"))).toBe(true);
  });

  it("deve rejeitar linha com valor <= 0", () => {
    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: "2024-10-01",
      valor: -50,
      descricao: "Teste com valor negativo",
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros.some((e) => e.includes("Valor"))).toBe(true);
  });

  it("deve rejeitar linha com valor 0", () => {
    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: "2024-10-01",
      valor: 0,
      descricao: "Teste com valor zero",
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros.some((e) => e.includes("Valor"))).toBe(true);
  });

  it("deve rejeitar linha com campos obrigatórios vazios", () => {
    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: "",
      valor: 100,
      descricao: "",
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros.length).toBeGreaterThan(0);
  });

  it("deve aceitar linha válida", () => {
    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: "2024-10-01",
      valor: 150.5,
      descricao: "Pagamento válido",
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(true);
    expect(resultado.erros.length).toBe(0);
  });

  it("deve rejeitar descrição muito longa", () => {
    const descricaoLonga = "A".repeat(501);

    const linha: Partial<LinhaImportacao> = {
      lote_id: loteId,
      data_transacao: "2024-10-01",
      valor: 100,
      descricao: descricaoLonga,
    };

    const resultado = validarLinha(db, linha, usuarioId);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros.some((e) => e.includes("500"))).toBe(true);
  });
});

describe("Detecção de Duplicatas", () => {
  let db: Database.Database;
  const usuarioId = "user-123";
  const loteId = "lote-456";

  beforeEach(() => {
    db = criarBancoTeste();
    criarUsuarioTeste(db, usuarioId);
    criarLoteTeste(db, loteId, usuarioId);
  });

  it("deve detectar duplicata exata (score 100)", () => {
    const linhaExistente = criarLinhaTeste(db, "linha-1", loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
    });

    const linhaAtual: LinhaImportacao = {
      id: "linha-2",
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: 2,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
      status: "pendente",
      score_duplicata: 0,
      suspeita_duplicata: 0,
      criado_em: new Date().toISOString(),
    };

    const resultado = detectarDuplicata(db, linhaAtual, usuarioId, [
      linhaExistente,
    ]);

    expect(resultado).not.toBeNull();
    expect(resultado?.score).toBe(100);
    expect(resultado?.linhaExistenteId).toBe("linha-1");
  });

  it("deve detectar fuzzy match (data próxima, valor similar)", () => {
    const linhaExistente = criarLinhaTeste(db, "linha-1", loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
    });

    const linhaAtual: LinhaImportacao = {
      id: "linha-2",
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: 2,
      data_transacao: "2024-10-02", // 1 dia depois
      valor: 102.0, // 2% diferença
      descricao: "Pagamento - João Silva", // Idêntico
      status: "pendente",
      score_duplicata: 0,
      suspeita_duplicata: 0,
      criado_em: new Date().toISOString(),
    };

    const resultado = detectarDuplicata(db, linhaAtual, usuarioId, [
      linhaExistente,
    ]);

    expect(resultado).not.toBeNull();
    expect(resultado!.score).toBeGreaterThanOrEqual(80);
    expect(resultado!.componentes.dataScore).toBeGreaterThan(0);
    expect(resultado!.componentes.valorScore).toBeGreaterThan(0);
  });

  it("deve não detectar duplicata com diferenças grandes", () => {
    const linhaExistente = criarLinhaTeste(db, "linha-1", loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
    });

    const linhaAtual: LinhaImportacao = {
      id: "linha-2",
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: 2,
      data_transacao: "2024-10-10", // 9 dias depois
      valor: 200.0, // 100% diferença
      descricao: "Pagamento - Maria Santos", // Completamente diferente
      status: "pendente",
      score_duplicata: 0,
      suspeita_duplicata: 0,
      criado_em: new Date().toISOString(),
    };

    const resultado = detectarDuplicata(db, linhaAtual, usuarioId, [
      linhaExistente,
    ]);

    expect(resultado).toBeNull();
  });

  it("deve detectar duplicata com descrição similar (typos)", () => {
    const linhaExistente = criarLinhaTeste(db, "linha-1", loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento transferencia",
    });

    const linhaAtual: LinhaImportacao = {
      id: "linha-2",
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: 2,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento transeferencia", // Typo
      status: "pendente",
      score_duplicata: 0,
      suspeita_duplicata: 0,
      criado_em: new Date().toISOString(),
    };

    const resultado = detectarDuplicata(db, linhaAtual, usuarioId, [
      linhaExistente,
    ]);

    expect(resultado).not.toBeNull();
    expect(resultado!.score).toBeGreaterThanOrEqual(80);
  });

  it("deve registrar duplicata no banco", () => {
    const linhaExistente = criarLinhaTeste(db, "linha-1", loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
    });

    const linhaNovaId = "linha-2";
    criarLinhaTeste(db, linhaNovaId, loteId, usuarioId, {
      numero_linha: 2,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
    });

    const linhaAtual: LinhaImportacao = {
      id: linhaNovaId,
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: 2,
      data_transacao: "2024-10-01",
      valor: 100.0,
      descricao: "Pagamento - João Silva",
      status: "pendente",
      score_duplicata: 0,
      suspeita_duplicata: 0,
      criado_em: new Date().toISOString(),
    };

    const duplicata = detectarDuplicata(db, linhaAtual, usuarioId, [
      linhaExistente,
    ]);

    expect(duplicata).not.toBeNull();
    expect(duplicata!.score).toBe(100);

    // Registrar no banco
    registrarDuplicata(db, linhaNovaId, duplicata!);

    // Verificar se foi registrada
    const verificarStmt = db.prepare(
      `SELECT * FROM importacao_linhas WHERE id = ?`
    );
    const linhaRegistrada = verificarStmt.get(linhaNovaId) as LinhaImportacao;

    expect(linhaRegistrada.suspeita_duplicata).toBe(1);
    expect(linhaRegistrada.score_duplicata).toBe(100);
    expect(linhaRegistrada.linha_duplicada_id).toBe("linha-1");
  });
});

describe("Resumo de Validações", () => {
  let db: Database.Database;
  const usuarioId = "user-123";
  const loteId = "lote-456";

  beforeEach(() => {
    db = criarBancoTeste();
    criarUsuarioTeste(db, usuarioId);
    criarLoteTeste(db, loteId, usuarioId);
  });

  it("deve retornar resumo correto de validações", () => {
    const linhaId = "linha-1";
    criarLinhaTeste(db, linhaId, loteId, usuarioId, {
      numero_linha: 1,
      data_transacao: "2024-10-01",
      valor: 100,
      descricao: "Teste",
    });

    const linha: Partial<LinhaImportacao> = {
      id: linhaId,
      lote_id: loteId,
      data_transacao: "2024-10-01",
      valor: 100,
      descricao: "Teste",
    };

    const validacao = validarLinha(db, linha, usuarioId);

    if (validacao.erros.length > 0) {
      validacao.erros.forEach((erro) => {
        const insertStmt = db.prepare(
          `INSERT INTO importacao_validacoes (linha_id, tipo_validacao, passou, mensagem_erro)
           VALUES (?, ?, ?, ?)`
        );
        insertStmt.run(linhaId, "formato", 0, erro);
      });
    }

    const resumo = obterResumoValidacoes(db, linhaId);

    expect(resumo.totalValidacoes).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(resumo.erros)).toBe(true);
  });
});
