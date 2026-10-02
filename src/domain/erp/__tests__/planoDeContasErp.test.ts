import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { PLANO_DE_CONTAS_ERP, garantirPlanoDeContasErp } from "../planoDeContasErp";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

/** `contas_plano_contas.entidade_id` é NOT NULL REFERENCES entidades_legais(id) — toda
 * conta precisa de uma entidade titular para existir, então o teste cria uma antes de
 * chamar garantirPlanoDeContasErp. */
function criarEntidade(cpf = "52998224725"): number {
  executar(db, "INSERT INTO entidades_legais (tipo, cpf_cnpj, nome) VALUES ('pessoa_fisica', ?, 'Titular de Teste')", [cpf]);
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

describe("planoDeContasErp", () => {
  describe("PLANO_DE_CONTAS_ERP", () => {
    it("todo id é único", () => {
      const ids = PLANO_DE_CONTAS_ERP.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("todo código é único", () => {
      const codigos = PLANO_DE_CONTAS_ERP.map((c) => c.codigo);
      expect(new Set(codigos).size).toBe(codigos.length);
    });

    it("o id é sempre derivado do código pela convenção documentada (A.B.CC → id A*1000 + B*100 + CC)", () => {
      for (const conta of PLANO_DE_CONTAS_ERP) {
        const [a, b, cc] = conta.codigo.split(".").map(Number);
        const idEsperado = a * 1000 + b * 100 + cc;
        expect(conta.id, `código ${conta.codigo} tem id ${conta.id}, esperado ${idEsperado}`).toBe(idEsperado);
      }
    });

    it("toda conta tem grupo e natureza dentre os valores aceitos pelo CHECK do schema", () => {
      const gruposValidos = new Set(["ativo", "passivo", "patrimonio_liquido", "receita", "despesa", "resultado"]);
      const naturezasValidas = new Set(["debito", "credito"]);
      for (const conta of PLANO_DE_CONTAS_ERP) {
        expect(gruposValidos.has(conta.grupo), `grupo inválido em ${conta.codigo}: ${conta.grupo}`).toBe(true);
        expect(naturezasValidas.has(conta.natureza), `natureza inválida em ${conta.codigo}: ${conta.natureza}`).toBe(true);
      }
    });

    it("natureza segue a convenção contábil padrão por grupo, com a única excecão documentada (1106, contra-ativo)", () => {
      // ativo e despesa são normalmente devedoras; passivo, PL e receita são credoras.
      // 1106 "(-) Provisão para devedores duvidosos" é a excecão deliberada: é um
      // contra-ativo, por isso é credora mesmo estando no grupo "ativo" (reduz o saldo
      // líquido do grupo, mesmo papel de "Depreciação acumulada").
      for (const conta of PLANO_DE_CONTAS_ERP) {
        if (conta.id === 1106) {
          expect(conta.natureza).toBe("credito");
          continue;
        }
        if (conta.grupo === "ativo" || conta.grupo === "despesa") {
          expect(conta.natureza, `${conta.codigo} (${conta.descricao})`).toBe("debito");
        } else if (conta.grupo === "passivo" || conta.grupo === "patrimonio_liquido" || conta.grupo === "receita") {
          expect(conta.natureza, `${conta.codigo} (${conta.descricao})`).toBe("credito");
        }
      }
    });
  });

  describe("garantirPlanoDeContasErp", () => {
    it("numa entidade sem nenhuma conta, semeia as 47 contas do PLANO_DE_CONTAS_ERP com os campos corretos", () => {
      const entidadeId = criarEntidade();
      expect(consultar(db, "SELECT * FROM contas_plano_contas")).toEqual([]);

      garantirPlanoDeContasErp(db, entidadeId);

      const contas = consultar<{ id: number; entidade_id: number; codigo: string; descricao: string; grupo: string; natureza: string; analisavel: number; ativo: number }>(
        db,
        "SELECT * FROM contas_plano_contas ORDER BY id",
      );
      expect(contas).toHaveLength(PLANO_DE_CONTAS_ERP.length);
      expect(PLANO_DE_CONTAS_ERP.length).toBe(47);

      for (const esperado of PLANO_DE_CONTAS_ERP) {
        const linha = contas.find((c) => c.id === esperado.id);
        expect(linha, `conta ${esperado.codigo} (id ${esperado.id}) não foi semeada`).toBeDefined();
        expect(linha).toMatchObject({
          entidade_id: entidadeId,
          codigo: esperado.codigo,
          descricao: esperado.descricao,
          grupo: esperado.grupo,
          natureza: esperado.natureza,
          analisavel: 1,
          ativo: 1,
        });
      }
    });

    it("é idempotente: chamar duas vezes para a mesma entidade não duplica nem falha", () => {
      const entidadeId = criarEntidade();
      garantirPlanoDeContasErp(db, entidadeId);
      expect(() => garantirPlanoDeContasErp(db, entidadeId)).not.toThrow();

      const contas = consultar(db, "SELECT * FROM contas_plano_contas");
      expect(contas).toHaveLength(PLANO_DE_CONTAS_ERP.length);
    });

    it("não sobrescreve uma conta já existente (ex: descrição editada manualmente depois de semeada)", () => {
      const entidadeId = criarEntidade();
      garantirPlanoDeContasErp(db, entidadeId);
      executar(db, "UPDATE contas_plano_contas SET descricao = 'Descrição editada pelo usuário' WHERE id = 1101");

      garantirPlanoDeContasErp(db, entidadeId);

      const conta = consultar<{ descricao: string }>(db, "SELECT descricao FROM contas_plano_contas WHERE id = 1101")[0];
      expect(conta.descricao).toBe("Descrição editada pelo usuário");
      // e o total continua o mesmo — nenhuma linha extra foi inserida por cima.
      expect(consultar(db, "SELECT * FROM contas_plano_contas")).toHaveLength(PLANO_DE_CONTAS_ERP.length);
    });

    it("usa entidade_id = 1 por padrão quando nenhum é informado", () => {
      criarEntidade(); // garante que a entidade 1 existe para a FK
      garantirPlanoDeContasErp(db);

      const conta = consultar<{ entidade_id: number }>(db, "SELECT entidade_id FROM contas_plano_contas WHERE id = 1101")[0];
      expect(conta.entidade_id).toBe(1);
    });
  });
});
