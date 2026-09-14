import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { agendar, listarPorImovel, listarPorStatus, buscarPorId } from "./agenda";
import { realizarInspecao, obterItens, calcularTotalDanos, obterHistorico } from "./inspecao";
import { concluirInspecao, aprovar, rejeitar } from "./aprova";
import { obterAudit, obterTempoDecorrido } from "./audit";
import { gerarDadosLaudo, registrarGeracaoLaudo, obterLaudosGerados, formatarLaudoTexto } from "./laudo";
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

  describe("concluirInspecao", () => {
    it("muda status de 'em_progresso' para 'concluida'", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      const concluida = concluirInspecao(db, vistoria.id, "Inspeção sem danos");

      expect(concluida.status).toBe("concluida");
    });

    it("registra 'concluida' no log de auditoria com motivo", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      concluirInspecao(db, vistoria.id, "Tudo ok");

      const historico = obterHistorico(db, vistoria.id);
      const ultima = historico[historico.length - 1];
      expect(ultima.acao).toBe("concluida");
      expect(ultima.motivo).toBe("Tudo ok");
    });

    it("rejeita vistoria que não está em progresso", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      expect(() => {
        concluirInspecao(db, vistoria.id);
      }).toThrow("não está em progresso");
    });
  });

  describe("aprovar", () => {
    it("muda status de 'concluida' para 'aprovada'", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      concluirInspecao(db, vistoria.id);
      const aprovada = aprovar(db, { vistoria_id: vistoria.id });

      expect(aprovada.status).toBe("aprovada");
    });

    it("registra 'aprovada' no log de auditoria", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      concluirInspecao(db, vistoria.id);
      aprovar(db, { vistoria_id: vistoria.id, motivo: "Aprovado para débito" });

      const historico = obterHistorico(db, vistoria.id);
      const ultima = historico[historico.length - 1];
      expect(ultima.acao).toBe("aprovada");
      expect(ultima.motivo).toBe("Aprovado para débito");
    });

    it("rejeita aprovação de vistoria que não está concluida", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      expect(() => {
        aprovar(db, { vistoria_id: vistoria.id });
      }).toThrow("não pode ser aprovada");
    });
  });

  describe("rejeitar", () => {
    it("volta vistoria para 'agendada' a partir de 'em_progresso'", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      const rejeitada = rejeitar(db, { vistoria_id: vistoria.id, motivo: "Danos inaceitáveis" });

      expect(rejeitada.status).toBe("agendada");
    });

    it("registra 'rejeitada' no log com motivo", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      rejeitar(db, { vistoria_id: vistoria.id, motivo: "Revisão necessária" });

      const historico = obterHistorico(db, vistoria.id);
      const ultima = historico[historico.length - 1];
      expect(ultima.acao).toBe("rejeitada");
      expect(ultima.motivo).toBe("Revisão necessária");
    });
  });

  describe("obterAudit", () => {
    it("retorna resumo completo de auditoria com tempo decorrido", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      concluirInspecao(db, vistoria.id);
      aprovar(db, { vistoria_id: vistoria.id });

      const audit = obterAudit(db, vistoria.id);
      expect(audit.total_acoes).toBe(4); // agendada, inspecao_iniciada, concluida, aprovada
      expect(audit.primeira_acao.acao).toBe("agendada");
      expect(audit.ultima_acao.acao).toBe("aprovada");
      expect(audit.acoes.length).toBe(4);
    });

    it("calcula tempo desde ação anterior", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");

      const audit = obterAudit(db, vistoria.id);
      expect(audit.acoes[1].tempo_desde_anterior).toBeDefined();
      expect(audit.acoes[1].tempo_desde_anterior).toMatch(/^[\d]+[smhd]/);
    });
  });

  describe("obterTempoDecorrido", () => {
    it("calcula tempo total desde primeira até última ação", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(db, vistoria.id, [], "Celio");
      concluirInspecao(db, vistoria.id);

      const tempo = obterTempoDecorrido(db, vistoria.id);
      expect(tempo.criado_em).toBeDefined();
      expect(tempo.tempo_decorrido).toBeDefined();
      expect(tempo.duracao_em_segundos).toBeGreaterThanOrEqual(0);
    });
  });

  describe("gerarDadosLaudo", () => {
    it("coleta todos os dados necessários para gerar laudo", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(
        db,
        vistoria.id,
        [{ tipo: "dano", descricao: "Parede rachada", severidade: "alta", valor_estimado: 500 }],
        "Celio",
      );

      const laudo = gerarDadosLaudo(db, vistoria.id);

      expect(laudo.vistoria.id).toBe(vistoria.id);
      expect(laudo.imovel.apelido).toBe("Apartamento Teste");
      expect(laudo.items.length).toBe(1);
      expect(laudo.historico.length).toBeGreaterThan(0);
      expect(laudo.gerado_em).toBeDefined();
    });

    it("inclui dados do contrato quando disponível", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      const laudo = gerarDadosLaudo(db, vistoria.id);
      expect(laudo.contrato).toBeUndefined(); // Vistoria não foi vinculada a contrato

      // Update vistoria para ter contrato
      executar(db, "UPDATE vistorias SET contrato_id = ? WHERE id = ?", [1, vistoria.id]);
      const laudoComContrato = gerarDadosLaudo(db, vistoria.id);
      expect(laudoComContrato.contrato).toBeDefined();
      expect(laudoComContrato.contrato?.locatario).toBe("João Silva");
    });
  });

  describe("registrarGeracaoLaudo", () => {
    it("registra geração de laudo em documentos_gerados", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      registrarGeracaoLaudo(
        db,
        vistoria.id,
        "laudo_vistoria_001.pdf",
        "abc123def456",
        15240,
      );

      const laudos = obterLaudosGerados(db, vistoria.id);
      expect(laudos.length).toBe(1);
      expect(laudos[0].nome_arquivo).toBe("laudo_vistoria_001.pdf");
    });
  });

  describe("formatarLaudoTexto", () => {
    it("gera texto de laudo com todas as seções", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(
        db,
        vistoria.id,
        [
          { tipo: "dano", descricao: "Porta danificada", severidade: "media", valor_estimado: 500 },
          { tipo: "achado_positivo", descricao: "Bom estado geral das paredes" },
        ],
        "Celio",
      );

      const laudo = gerarDadosLaudo(db, vistoria.id);
      const texto = formatarLaudoTexto(laudo);

      expect(texto).toContain("LAUDO TÉCNICO DE VISTORIA");
      expect(texto).toContain("Apartamento Teste");
      expect(texto).toContain("Celio");
      expect(texto).toContain("Porta danificada");
      expect(texto).toContain("Bom estado geral");
      expect(texto).toContain("agendada");
    });

    it("formata valor estimado corretamente", () => {
      const amanhã = new Date();
      amanhã.setDate(amanhã.getDate() + 1);

      const vistoria = agendar(db, {
        imovel_id: 1,
        data: amanhã,
        responsavel: "Celio",
        tipo: "entrada",
      });

      realizarInspecao(
        db,
        vistoria.id,
        [
          { tipo: "dano", descricao: "Dano 1", valor_estimado: 1500.50 },
          { tipo: "dano", descricao: "Dano 2", valor_estimado: 2300.75 },
        ],
        "Celio",
      );

      const laudo = gerarDadosLaudo(db, vistoria.id);
      const texto = formatarLaudoTexto(laudo);

      expect(texto).toContain("R$ 3801.25"); // total = 1500.50 + 2300.75
    });
  });
});
