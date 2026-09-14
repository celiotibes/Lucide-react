import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { agendar, listarPorImovel, listarPorStatus, buscarPorId } from "./agenda";
import { realizarInspecao, obterItens, calcularTotalDanos, obterHistorico } from "./inspecao";
import type { Database } from "sql.js";
import type { Vistoria } from "../types";

describe("Vistorias — Agendamento e Inspeção", () => {
  let db: Database;

  beforeEach(async () => {
    db = await criarBancoDeTeste();

    // Inserir imóvel de teste
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, financiado, uso_pessoal)
       VALUES (1, 'Apartamento Teste', 'apartamento', 'proprio', 0, 0)`,
    );

    // Inserir contrato de teste
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, percentual_aluguel_efetivo,
         multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, honorarios_percentual,
         dias_gatilho_judicial, duracao_minima_meses, multa_rescisoria_teto_meses, data_inicio)
       VALUES (1, 1, 'João Silva', 'residencial_fixo', 2000, 100, 2, 30, 20, 1, 20, 30, 12, 6, '2025-01-01')`,
    );
  });

  describe("agendar", () => {
    it("cria uma nova vistoria com status 'agendada'", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio Tibes",
        tipo: "entrada",
      });

      expect(vistoria.id).toBeDefined();
      expect(vistoria.status).toBe("agendada");
      expect(vistoria.responsavel).toBe("Celio Tibes");
      expect(vistoria.imovel_id).toBe(1);
    });

    it("rejeita data no passado", () => {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      expect(() => {
        agendar(db, {
          imovel_id: 1,
          data: ontem,
          responsavel: "Celio",
          tipo: "entrada",
        });
      }).toThrow("Data da vistoria não pode ser no passado");
    });

    it("rejeita imóvel inexistente", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      expect(() => {
        agendar(db, {
          imovel_id: 999,
          data: amanhã,
          responsavel: "Celio",
          tipo: "entrada",
        });
      }).toThrow("Imóvel 999 não encontrado");
    });

    it("registra ação 'agendada' no log de auditoria", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      const [log] = consultar<{ acao: string }>(
        db,
        "SELECT acao FROM vistoria_log WHERE vistoria_id = ?",
        [vistoria.id],
      );
      expect(log?.acao).toBe("agendada");
    });

    it("permite múltiplas vistorias no mesmo imóvel", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const data2 = new Date();
      data2.setDate(data2.getDate() + 2);

      const v1 = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      const v2 = agendar(db, {
        imovel_id: 1,
        data: data2,
        responsavel: "Pedrão",
        tipo: "saída",
      });

      expect(v1.id).not.toBe(v2.id);
      const vistorias = listarPorImovel(db, 1);
      expect(vistorias.length).toBe(2);
    });
  });

  describe("listarPorStatus", () => {
    it("retorna apenas vistorias com status solicitado", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      agendar(db, { imovel_id: 1, data: amanhã, responsavel: "Celio", tipo: "entrada" });

      const agendadas = listarPorStatus(db, "agendada");
      expect(agendadas.length).toBe(1);
      expect(agendadas[0].status).toBe("agendada");
    });

    it("retorna lista vazia quando nenhuma vistoria tem o status", () => {
      const aprovadas = listarPorStatus(db, "aprovada");
      expect(aprovadas).toEqual([]);
    });
  });

  describe("realizarInspecao", () => {
    it("muda status de 'agendada' para 'em_progresso'", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      const atualizada = realizarInspecao(db, vistoria.id, [], "Celio");
      expect(atualizada.status).toBe("em_progresso");
    });

    it("insere items de inspeção (danos, achados)", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [
        {
          tipo: "dano",
          descricao: "Porta danificada",
          severidade: "media",
          valor_estimado: 500,
        },
        {
          tipo: "dano",
          descricao: "Buraco na parede",
          severidade: "alta",
          valor_estimado: 1500,
        },
      ], "Celio");

      const items = obterItens(db, vistoria.id);
      expect(items.length).toBe(2);
      expect(items[0].descricao).toBe("Porta danificada");
    });

    it("calcula valor total dos danos corretamente", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [
        { tipo: "dano", descricao: "Dano 1", severidade: "media", valor_estimado: 1000 },
        { tipo: "dano", descricao: "Dano 2", severidade: "alta", valor_estimado: 2000 },
        {
          tipo: "achado_positivo",
          descricao: "Bom estado geral",
          valor_estimado: undefined,
        },
      ], "Celio");

      const total = calcularTotalDanos(db, vistoria.id);
      expect(total).toBe(3000);
    });

    it("registra 'inspecao_iniciada' no log de auditoria", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");

      const historico = obterHistorico(db, vistoria.id);
      const ultima_acao = historico[historico.length - 1];
      expect(ultima_acao.acao).toBe("inspecao_iniciada");
    });

    it("rejeita vistoria inexistente", () => {
      expect(() => {
        realizarInspecao(db, 999, [], "Celio");
      }).toThrow("Vistoria 999 não encontrada");
    });
  });

  describe("obterHistorico", () => {
    it("retorna eventos em ordem cronológica", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");

      const historico = obterHistorico(db, vistoria.id);
      expect(historico.length).toBe(2);
      expect(historico[0].acao).toBe("agendada");
      expect(historico[1].acao).toBe("inspecao_iniciada");
    });
  });

  describe("buscarPorId", () => {
    it("retorna vistoria quando existe", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria_original = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      const encontrada = buscarPorId(db, vistoria_original.id);
      expect(encontrada).not.toBeNull();
      expect(encontrada?.id).toBe(vistoria_original.id);
    });

    it("retorna null quando vistoria não existe", () => {
      const resultado = buscarPorId(db, 999);
      expect(resultado).toBeNull();
    });
  });
});
