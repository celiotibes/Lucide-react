import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { listarPartes, adicionarParte, removerParte } from "./locatarios";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function criarContrato(): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES ('Kitnet 1', 'kitnet', 0)");
  const imovelId = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, data_inicio)
     VALUES (?, 'Locatário Principal', 'residencial_fixo', 1000, '2025-01-01')`,
    [imovelId],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

describe("locatarios", () => {
  describe("adicionarParte / listarPartes", () => {
    it("adiciona uma parte com todos os campos e a lista de volta", () => {
      const contratoId = criarContrato();
      adicionarParte(db, contratoId, {
        nome: "Maria Responsável",
        cpf: "11144477735",
        papel: "responsavel_solidario",
        telefone: "48999998888",
        email: "maria@teste.com",
      });

      const partes = listarPartes(db, contratoId);
      expect(partes).toHaveLength(1);
      expect(partes[0]).toMatchObject({
        contrato_id: contratoId,
        nome: "Maria Responsável",
        cpf: "11144477735",
        papel: "responsavel_solidario",
        telefone: "48999998888",
        email: "maria@teste.com",
      });
    });

    it("campos opcionais (cpf, telefone, email) omitidos gravam null", () => {
      const contratoId = criarContrato();
      adicionarParte(db, contratoId, { nome: "João Locatário", papel: "locatario" });

      const [parte] = listarPartes(db, contratoId);
      expect(parte.cpf).toBeNull();
      expect(parte.telefone).toBeNull();
      expect(parte.email).toBeNull();
    });

    it("ordena por papel e depois por id — locatarios antes de responsaveis_solidarios", () => {
      const contratoId = criarContrato();
      adicionarParte(db, contratoId, { nome: "Responsável 1", papel: "responsavel_solidario" });
      adicionarParte(db, contratoId, { nome: "Locatário 1", papel: "locatario" });
      adicionarParte(db, contratoId, { nome: "Locatário 2", papel: "locatario" });

      const partes = listarPartes(db, contratoId);
      expect(partes.map((p) => p.papel)).toEqual(["locatario", "locatario", "responsavel_solidario"]);
      expect(partes.map((p) => p.nome)).toEqual(["Locatário 1", "Locatário 2", "Responsável 1"]);
    });

    it("lista só as partes do contrato pedido, não as de outro contrato", () => {
      const contrato1 = criarContrato();
      const contrato2 = criarContrato();
      adicionarParte(db, contrato1, { nome: "Parte do contrato 1", papel: "locatario" });
      adicionarParte(db, contrato2, { nome: "Parte do contrato 2", papel: "locatario" });

      const partesContrato1 = listarPartes(db, contrato1);
      expect(partesContrato1).toHaveLength(1);
      expect(partesContrato1[0].nome).toBe("Parte do contrato 1");
    });

    it("contrato sem nenhuma parte cadastrada retorna lista vazia", () => {
      const contratoId = criarContrato();
      expect(listarPartes(db, contratoId)).toEqual([]);
    });

    it("contrato inexistente retorna lista vazia (sem lançar erro)", () => {
      expect(listarPartes(db, 999999)).toEqual([]);
    });
  });

  describe("removerParte", () => {
    it("remove a parte pelo id", () => {
      const contratoId = criarContrato();
      adicionarParte(db, contratoId, { nome: "Para Remover", papel: "locatario" });
      const [parte] = listarPartes(db, contratoId);

      removerParte(db, parte.id);

      expect(listarPartes(db, contratoId)).toEqual([]);
    });

    it("remover um id inexistente não lança erro (idempotente) e não afeta outras partes", () => {
      const contratoId = criarContrato();
      adicionarParte(db, contratoId, { nome: "Permanece", papel: "locatario" });

      expect(() => removerParte(db, 999999)).not.toThrow();
      expect(listarPartes(db, contratoId)).toHaveLength(1);
    });
  });
});
