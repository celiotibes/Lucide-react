import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { agendar } from "./agenda";
import { avaliarEnvioLaudo, montarAssuntoLaudo } from "./envioLaudo";

describe("avaliarEnvioLaudo / montarAssuntoLaudo", () => {
  let db: Database;

  beforeEach(async () => {
    db = await criarBancoDeTeste();

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, financiado, uso_pessoal)
       VALUES (1, 'Apartamento Teste', 'apartamento', 'proprio', 0, 0)`,
    );

    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, percentual_aluguel_efetivo,
         multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, honorarios_percentual,
         dias_gatilho_judicial, duracao_minima_meses, multa_rescisoria_teto_meses, data_inicio)
       VALUES (1, 1, 'João Silva', 'residencial_fixo', 2000, 100, 2, 30, 20, 1, 20, 30, 12, 6, '2025-01-01')`,
    );
  });

  function amanha(): Date {
    const data = new Date();
    data.setDate(data.getDate() + 1);
    return data;
  }

  describe("avaliarEnvioLaudo", () => {
    it("desabilita o envio quando a vistoria não tem contrato vinculado", () => {
      const vistoria = agendar(db, { imovel_id: 1, data: amanha(), responsavel: "Celio", tipo: "entrada" });

      const avaliacao = avaliarEnvioLaudo(vistoria);
      expect(avaliacao.podeEnviar).toBe(false);
      expect(avaliacao.motivo).toMatch(/sem contrato vinculado/i);
    });

    it("habilita o envio quando a vistoria tem contrato vinculado", () => {
      const vistoria = agendar(db, { imovel_id: 1, data: amanha(), responsavel: "Celio", tipo: "entrada" });
      executar(db, "UPDATE vistorias SET contrato_id = ? WHERE id = ?", [1, vistoria.id]);

      const avaliacao = avaliarEnvioLaudo({ ...vistoria, contrato_id: 1 });
      expect(avaliacao.podeEnviar).toBe(true);
      expect(avaliacao.motivo).toBeUndefined();
    });
  });

  describe("montarAssuntoLaudo", () => {
    it("monta o assunto com o apelido do imóvel e o id da vistoria", () => {
      const vistoria = agendar(db, { imovel_id: 1, data: amanha(), responsavel: "Celio", tipo: "entrada" });

      const assunto = montarAssuntoLaudo(vistoria, "Apartamento Teste");
      expect(assunto).toBe(`Laudo de vistoria — Apartamento Teste (#${vistoria.id})`);
    });
  });
});
