import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import initSqlJs from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { consultar, executar } from "../db/connection";
import { PLANO_DE_CONTAS, garantirPlanoDeContasPadrao } from "./planoDeContas";

let db: Database;

// Banco cru, sem passar por criarBancoDeTeste() (que já chama garantirPlanoDeContasPadrao
// para toda a suíte) — aqui o próprio teste precisa controlar quando a semeadura roda, para
// exercitar o caminho "banco sem nenhuma conta ainda" e o caminho "idempotente".
beforeEach(async () => {
  const SQL = await initSqlJs({ locateFile: (arquivo) => `node_modules/sql.js/dist/${arquivo}` });
  db = new SQL.Database();
  db.run(schemaSql);
});

describe("planoDeContas", () => {
  describe("PLANO_DE_CONTAS", () => {
    it("todo código é único", () => {
      const codigos = PLANO_DE_CONTAS.map((c) => c.codigo);
      expect(new Set(codigos).size).toBe(codigos.length);
    });

    it("toda conta tem grupo e natureza dentre os valores aceitos pelo CHECK do schema", () => {
      const gruposValidos = new Set(["receita", "despesa", "pessoal", "transferencia"]);
      const naturezasValidas = new Set(["debito", "credito"]);
      for (const conta of PLANO_DE_CONTAS) {
        expect(gruposValidos.has(conta.grupo)).toBe(true);
        expect(naturezasValidas.has(conta.natureza)).toBe(true);
      }
    });
  });

  describe("garantirPlanoDeContasPadrao", () => {
    it("num banco vazio, insere todas as contas do PLANO_DE_CONTAS", () => {
      expect(consultar(db, "SELECT * FROM plano_de_contas")).toEqual([]);

      garantirPlanoDeContasPadrao(db);

      const contas = consultar<{ codigo: string }>(db, "SELECT codigo FROM plano_de_contas");
      expect(contas).toHaveLength(PLANO_DE_CONTAS.length);
      expect(new Set(contas.map((c) => c.codigo))).toEqual(new Set(PLANO_DE_CONTAS.map((c) => c.codigo)));
    });

    it("é idempotente: chamar duas vezes não duplica nem falha", () => {
      garantirPlanoDeContasPadrao(db);
      expect(() => garantirPlanoDeContasPadrao(db)).not.toThrow();
      const contas = consultar(db, "SELECT * FROM plano_de_contas");
      expect(contas).toHaveLength(PLANO_DE_CONTAS.length);
    });

    it("não sobrescreve uma conta já existente com descrição diferente (só insere os códigos que faltam)", () => {
      // Simula um banco de uma versão anterior do app, com uma conta cujo texto mudou desde
      // então — a regressão que o comentário da função documenta: a versão antiga parava na
      // primeira linha existente e nunca semeava contas novas; aqui garantimos que, além de
      // semear as que faltam, ela não pisa no que já está lá.
      executar(db, "INSERT INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('1.1.01', 'Descrição antiga', 'receita', 'credito')");

      garantirPlanoDeContasPadrao(db);

      const conta = consultar<{ descricao: string }>(db, "SELECT descricao FROM plano_de_contas WHERE codigo = '1.1.01'")[0];
      expect(conta.descricao).toBe("Descrição antiga");

      // mas as outras contas do plano padrão, que de fato faltavam, foram semeadas.
      const total = consultar(db, "SELECT * FROM plano_de_contas");
      expect(total).toHaveLength(PLANO_DE_CONTAS.length);
    });

    it("grava codigo/descricao/grupo/natureza corretamente para cada conta", () => {
      garantirPlanoDeContasPadrao(db);
      for (const esperado of PLANO_DE_CONTAS) {
        const [linha] = consultar<{ codigo: string; descricao: string; grupo: string; natureza: string }>(
          db,
          "SELECT codigo, descricao, grupo, natureza FROM plano_de_contas WHERE codigo = ?",
          [esperado.codigo],
        );
        expect(linha).toEqual({
          codigo: esperado.codigo,
          descricao: esperado.descricao,
          grupo: esperado.grupo,
          natureza: esperado.natureza,
        });
      }
    });
  });
});
