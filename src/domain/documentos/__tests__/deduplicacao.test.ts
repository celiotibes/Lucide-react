import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import {
  inserirDocumento,
  sha256Hex,
  type NovoDocumento,
} from "../documentos";
import {
  registrarSugestao,
  revisarSugestao,
  sugestoesPendentes,
  exigeRevisaoHumana,
  documentoPodeSerLancado,
  acuraciaIA,
} from "../revisaoIA";
import { migrarBancoExistente } from "../../../db/connection";
import type { Database } from "sql.js";

describe("Deduplicação e revisão de documentos", () => {
  let db: Database;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
  });

  describe("Deduplicação por hash SHA-256", () => {
    it("deve rejeitar documento com hash duplicado", async () => {
      const hash = "abc123def456abc123def456abc123def456abc1";
      const doc: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "nota.pdf",
        valor: 100,
        arquivo_hash_sha256: hash,
      };

      const id1 = inserirDocumento(db, doc);
      expect(id1).toBeGreaterThan(0);

      expect(() => inserirDocumento(db, doc)).toThrow(
        /documento duplicado.*#1.*hash/i,
      );
    });

    it("deve permitir documento sem hash", () => {
      const doc1: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "nota1.pdf",
        valor: 100,
      };

      const doc2: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "nota2.pdf",
        valor: 100,
      };

      const id1 = inserirDocumento(db, doc1);
      const id2 = inserirDocumento(db, doc2);

      expect(id1).not.toEqual(id2);
    });
  });

  describe("Deduplicação por chave NF-e", () => {
    it("deve rejeitar documento com chave NF-e duplicada", () => {
      const chave = "12345678901234567890123456789012345678901234";
      const doc: NovoDocumento = {
        tipo: "nota_fiscal",
        arquivo_nome: "nfe.xml",
        valor: 500,
        chave_nfe: chave,
      };

      const id1 = inserirDocumento(db, doc);
      expect(id1).toBeGreaterThan(0);

      expect(() => inserirDocumento(db, doc)).toThrow(
        /documento duplicado.*#1.*chave/i,
      );
    });

    it("deve permitir múltiplos documentos sem chave NF-e", () => {
      const doc1: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "fatura1.pdf",
      };

      const doc2: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "fatura2.pdf",
      };

      const id1 = inserirDocumento(db, doc1);
      const id2 = inserirDocumento(db, doc2);

      expect(id1).not.toEqual(id2);
    });
  });

  describe("Sugestões de IA", () => {
    it("deve criar sugestão com status 'pendente'", () => {
      const doc: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "fatura.pdf",
        valor: 1000,
      };
      const documentoId = inserirDocumento(db, doc);

      registrarSugestao(db, {
        documento_id: documentoId,
        campo: "nome_contraparte",
        valor_sugerido: "Empresa LTDA",
        confianca: 0.92,
        modelo: "claude-3.5-sonnet",
      });

      const pendentes = sugestoesPendentes(db, documentoId);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0].status).toEqual("pendente");
      expect(pendentes[0].confianca).toEqual(0.92);
    });

    it("deve rejeitar revisão dupla de mesma sugestão", () => {
      const sugestaoId = registrarSugestao(db, {
        campo: "tipo",
        valor_sugerido: "boleto",
        confianca: 0.88,
      });

      revisarSugestao(db, sugestaoId, {
        status: "aceita",
        revisado_por: "user@example.com",
      });

      expect(() => {
        revisarSugestao(db, sugestaoId, {
          status: "corrigida",
          valor_final: "fatura",
          revisado_por: "user@example.com",
        });
      }).toThrow(/já foi revisada/i);
    });

    it("deve exigir valor_final para status 'corrigida'", () => {
      const sugestaoId = registrarSugestao(db, {
        campo: "valor",
        valor_sugerido: "1000",
        confianca: 0.75,
      });

      expect(() => {
        revisarSugestao(db, sugestaoId, {
          status: "corrigida",
          revisado_por: "user@example.com",
        });
      }).toThrow(/valor final.*obrigatório/i);
    });
  });

  describe("Limiares de revisão humana", () => {
    it("deve exigir revisão para confiança < 0.85", () => {
      expect(exigeRevisaoHumana({ confianca: 0.84 })).toBe(true);
      expect(exigeRevisaoHumana({ confianca: 0.85 })).toBe(false);
    });

    it("deve exigir revisão para documento com valor >= 5000", () => {
      expect(exigeRevisaoHumana({ confianca: 0.95, valor: 4999 })).toBe(false);
      expect(exigeRevisaoHumana({ confianca: 0.95, valor: 5000 })).toBe(true);
    });
  });

  describe("documentoPodeSerLancado", () => {
    it("deve retornar false enquanto houver sugestão pendente que exige revisão", () => {
      const doc: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "fatura.pdf",
        valor: 6000,
      };
      const documentoId = inserirDocumento(db, doc);

      // Sugestão com confiança baixa
      registrarSugestao(db, {
        documento_id: documentoId,
        campo: "nome_contraparte",
        valor_sugerido: "Empresa",
        confianca: 0.75,
      });

      expect(documentoPodeSerLancado(db, documentoId)).toBe(false);
    });

    it("deve retornar true após revisão de todas as sugestões obrigatórias", () => {
      const doc: NovoDocumento = {
        tipo: "fatura",
        arquivo_nome: "fatura.pdf",
      };
      const documentoId = inserirDocumento(db, doc);

      const sugestaoId = registrarSugestao(db, {
        documento_id: documentoId,
        campo: "tipo",
        valor_sugerido: "boleto",
        confianca: 0.80,
      });

      revisarSugestao(db, sugestaoId, {
        status: "aceita",
        revisado_por: "user@example.com",
      });

      expect(documentoPodeSerLancado(db, documentoId)).toBe(true);
    });
  });

  describe("Acurácia de IA", () => {
    it("deve calcular taxa de acerto corretamente", () => {
      // Cria sugestões e as revisa com diferentes status
      const s1 = registrarSugestao(db, {
        campo: "nome",
        valor_sugerido: "Empresa A",
        confianca: 0.88,
      });
      const s2 = registrarSugestao(db, {
        campo: "nome",
        valor_sugerido: "Empresa B",
        confianca: 0.92,
      });
      const s3 = registrarSugestao(db, {
        campo: "nome",
        valor_sugerido: "Empresa C",
        confianca: 0.75,
      });

      revisarSugestao(db, s1, {
        status: "aceita",
        revisado_por: "user@test.com",
      });
      revisarSugestao(db, s2, {
        status: "corrigida",
        valor_final: "Empresa B Corrigida",
        revisado_por: "user@test.com",
      });
      revisarSugestao(db, s3, {
        status: "rejeitada",
        revisado_por: "user@test.com",
      });

      const acuracia = acuraciaIA(db);
      expect(acuracia.total.revisado).toEqual(3);
      expect(acuracia.total.aceitas).toEqual(1);
      expect(acuracia.total.corrigidas).toEqual(1);
      expect(acuracia.total.rejeitadas).toEqual(1);
      expect(acuracia.total.taxa_acerto).toBeCloseTo(1 / 3, 2);
    });

    it("deve ignorar sugestões pendentes em cálculo de acurácia", () => {
      registrarSugestao(db, {
        campo: "tipo",
        valor_sugerido: "boleto",
        confianca: 0.9,
      });

      const s1 = registrarSugestao(db, {
        campo: "nome",
        valor_sugerido: "Empresa",
        confianca: 0.85,
      });
      revisarSugestao(db, s1, {
        status: "aceita",
        revisado_por: "user@test.com",
      });

      // Sugestão pendente não deve contar
      const acuracia = acuraciaIA(db);
      expect(acuracia.total.revisado).toEqual(1);
      expect(acuracia.total.aceitas).toEqual(1);
    });
  });

  describe("SHA-256", () => {
    it("deve calcular hash SHA-256 corretamente", async () => {
      const dados = new TextEncoder().encode("test");
      const hash = await sha256Hex(dados);
      // SHA-256 de "test"
      expect(hash).toEqual(
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      );
    });
  });

  describe("Migrações em banco antigo", () => {
    it("um banco SEM as colunas/índices de deduplicação abre pelo caminho de migração e passa a deduplicar", async () => {
      // Banco criado por versão anterior do schema: sem as colunas nem os índices únicos.
      db.run("DROP INDEX IF EXISTS idx_documentos_arquivo_hash_unique");
      db.run("DROP INDEX IF EXISTS idx_documentos_chave_nfe_unique");
      db.run("ALTER TABLE documentos DROP COLUMN arquivo_hash_sha256");
      db.run("ALTER TABLE documentos DROP COLUMN chave_nfe");
      db.run("INSERT INTO documentos (tipo, arquivo_nome, criado_em) VALUES ('fatura', 'antigo.pdf', '2025-01-01')");

      migrarBancoExistente(db); // o mesmo caminho que abre um banco salvo no navegador

      const colunas = (db.exec("PRAGMA table_info(documentos)")[0].values).map((l) => String(l[1]));
      expect(colunas).toEqual(expect.arrayContaining(["arquivo_hash_sha256", "chave_nfe"]));
      expect(db.exec("SELECT COUNT(*) FROM documentos")[0].values[0][0]).toBe(1); // dado antigo preservado

      const doc: NovoDocumento = { tipo: "fatura", arquivo_nome: "novo.pdf", arquivo_hash_sha256: "f".repeat(64) };
      inserirDocumento(db, doc);
      expect(() => inserirDocumento(db, doc)).toThrow(/duplicado/i);
    });
  });
});

describe("DocumentoDuplicadoError e imutabilidade da revisão", () => {
  it("o erro traz o id existente e o motivo correto (hash x chave NF-e)", async () => {
    const db = await criarBancoDeTeste();
    const chave = "1".repeat(44);
    const id = inserirDocumento(db, { tipo: "nota_fiscal", arquivo_nome: "a.xml", chave_nfe: chave });
    try {
      inserirDocumento(db, { tipo: "nota_fiscal", arquivo_nome: "b.xml", arquivo_hash_sha256: "e".repeat(64), chave_nfe: chave });
      throw new Error("deveria ter lançado");
    } catch (erro: unknown) {
      const error = erro as Record<string, unknown>;
      expect(error.name).toBe("DocumentoDuplicadoError");
      expect(error.documentoExistenteId).toBe(id);
      expect(error.motivo).toBe("chave_nfe"); // o hash era novo: a causa é a chave, não o hash
    }
  });

  it("sugestão revisada é imutável no banco (não só por convenção do código)", async () => {
    const db = await criarBancoDeTeste();
    const sid = registrarSugestao(db, { campo: "tipo", valor_sugerido: "fatura", confianca: 0.9 });
    revisarSugestao(db, sid, { status: "aceita", revisado_por: "celio" });
    expect(() => db.run("UPDATE sugestoes_ia_documentos SET status = 'rejeitada' WHERE id = ?", [sid])).toThrow(/já revisada/);
    expect(() => db.run("DELETE FROM sugestoes_ia_documentos WHERE id = ?", [sid])).toThrow(/já revisada/);
  });
});
