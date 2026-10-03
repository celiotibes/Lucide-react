import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import {
  atualizarStatusProjeto,
  calcularFluxoCaixaLiquidoMensal,
  calcularPaybackSimplesProjeto,
  calcularRoiAcumuladoProjeto,
  calcularViabilidadeProjeto,
  calcularYieldAnualProjeto,
  compararProjetos,
  criarProjetoExpansao,
  listarProjetosExpansao,
} from "./projetosExpansao";

describe("projetosExpansao", () => {
  let db: Database;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
  });

  // ==========================================================================
  // Criação e validação
  // ==========================================================================

  describe("criarProjetoExpansao", () => {
    it("cria com status inicial 'rascunho' e devolve o id", () => {
      const id = criarProjetoExpansao(db, {
        descricao: "Construir 2 kitnets novas no fundo do lote",
        custoObraEstimado: 120000,
        receitaAdicionalMensalEstimada: 2400,
        dataEstimativa: "2026-09-29",
      });
      expect(id).toBeGreaterThan(0);
      const [projeto] = listarProjetosExpansao(db, {});
      expect(projeto.id).toBe(id);
      expect(projeto.status).toBe("rascunho");
      expect(projeto.despesa_adicional_mensal_estimada).toBe(0); // default quando omitida
      expect(projeto.imovel_id).toBeNull();
    });

    it("aceita imovel_id quando o imóvel existe", () => {
      executar(db, `INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)`);
      const id = criarProjetoExpansao(db, {
        imovelId: 1,
        descricao: "Ampliar Kitnet 1",
        custoObraEstimado: 50000,
        receitaAdicionalMensalEstimada: 800,
        despesaAdicionalMensalEstimada: 100,
        dataEstimativa: "2026-09-29",
      });
      const [projeto] = listarProjetosExpansao(db, { imovelId: 1 });
      expect(projeto.id).toBe(id);
      expect(projeto.imovel_id).toBe(1);
    });

    it("rejeita imovel_id inexistente", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          imovelId: 999,
          descricao: "Ampliação inválida",
          custoObraEstimado: 10000,
          receitaAdicionalMensalEstimada: 500,
          dataEstimativa: "2026-09-29",
        }),
      ).toThrow(/não encontrado/);
    });

    it("rejeita descrição vazia", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          descricao: "   ",
          custoObraEstimado: 10000,
          receitaAdicionalMensalEstimada: 500,
          dataEstimativa: "2026-09-29",
        }),
      ).toThrow(/Descrição/);
    });

    it("rejeita custo de obra <= 0", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          descricao: "Projeto sem custo",
          custoObraEstimado: 0,
          receitaAdicionalMensalEstimada: 500,
          dataEstimativa: "2026-09-29",
        }),
      ).toThrow(/Custo de obra/);
    });

    it("rejeita receita adicional negativa", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          descricao: "Projeto com receita negativa",
          custoObraEstimado: 10000,
          receitaAdicionalMensalEstimada: -1,
          dataEstimativa: "2026-09-29",
        }),
      ).toThrow(/Receita adicional/);
    });

    it("rejeita despesa adicional negativa", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          descricao: "Projeto com despesa negativa",
          custoObraEstimado: 10000,
          receitaAdicionalMensalEstimada: 500,
          despesaAdicionalMensalEstimada: -1,
          dataEstimativa: "2026-09-29",
        }),
      ).toThrow(/Despesa adicional/);
    });

    it("rejeita data de estimativa ausente/mal formatada", () => {
      expect(() =>
        criarProjetoExpansao(db, {
          descricao: "Projeto sem data",
          custoObraEstimado: 10000,
          receitaAdicionalMensalEstimada: 500,
          dataEstimativa: "29/09/2026",
        }),
      ).toThrow(/Data da estimativa/);
    });
  });

  // ==========================================================================
  // Ciclo de status
  // ==========================================================================

  describe("atualizarStatusProjeto", () => {
    function criar(): number {
      return criarProjetoExpansao(db, {
        descricao: "Projeto de teste de status",
        custoObraEstimado: 100000,
        receitaAdicionalMensalEstimada: 2000,
        dataEstimativa: "2026-09-29",
      });
    }

    it("percorre o ciclo completo rascunho → em_analise → aprovado", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "em_analise");
      expect(listarProjetosExpansao(db, {}).find((p) => p.id === id)?.status).toBe("em_analise");

      atualizarStatusProjeto(db, id, "aprovado");
      expect(listarProjetosExpansao(db, {}).find((p) => p.id === id)?.status).toBe("aprovado");
    });

    it("permite descartar a partir de rascunho", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "descartado");
      expect(listarProjetosExpansao(db, {}).find((p) => p.id === id)?.status).toBe("descartado");
    });

    it("permite descartar a partir de em_analise", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "em_analise");
      atualizarStatusProjeto(db, id, "descartado");
      expect(listarProjetosExpansao(db, {}).find((p) => p.id === id)?.status).toBe("descartado");
    });

    it("rejeita pular direto de rascunho para aprovado", () => {
      const id = criar();
      expect(() => atualizarStatusProjeto(db, id, "aprovado")).toThrow(/Transição de status inválida/);
    });

    it("rejeita transição a partir de status terminal 'aprovado'", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "em_analise");
      atualizarStatusProjeto(db, id, "aprovado");
      expect(() => atualizarStatusProjeto(db, id, "em_analise")).toThrow(/estado terminal|status terminal/);
      expect(() => atualizarStatusProjeto(db, id, "descartado")).toThrow(/estado terminal|status terminal/);
    });

    it("rejeita transição a partir de status terminal 'descartado'", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "descartado");
      expect(() => atualizarStatusProjeto(db, id, "em_analise")).toThrow(/estado terminal|status terminal/);
    });

    it("rejeita voltar de em_analise para rascunho", () => {
      const id = criar();
      atualizarStatusProjeto(db, id, "em_analise");
      expect(() => atualizarStatusProjeto(db, id, "rascunho")).toThrow(/Transição de status inválida/);
    });

    it("rejeita status inválido fora do enum", () => {
      const id = criar();
      // @ts-expect-error -- testando entrada inválida deliberadamente
      expect(() => atualizarStatusProjeto(db, id, "cancelado")).toThrow(/inválido/);
    });

    it("rejeita projeto inexistente", () => {
      expect(() => atualizarStatusProjeto(db, 999, "em_analise")).toThrow(/não encontrado/);
    });
  });

  // ==========================================================================
  // Listagem com filtros
  // ==========================================================================

  describe("listarProjetosExpansao", () => {
    it("filtra por status e por imovelId", () => {
      executar(db, `INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)`);
      const id1 = criarProjetoExpansao(db, {
        imovelId: 1,
        descricao: "Projeto A",
        custoObraEstimado: 10000,
        receitaAdicionalMensalEstimada: 500,
        dataEstimativa: "2026-09-29",
      });
      const id2 = criarProjetoExpansao(db, {
        descricao: "Projeto B (unidade nova)",
        custoObraEstimado: 20000,
        receitaAdicionalMensalEstimada: 700,
        dataEstimativa: "2026-09-29",
      });
      atualizarStatusProjeto(db, id1, "em_analise");

      expect(listarProjetosExpansao(db, { status: "em_analise" }).map((p) => p.id)).toEqual([id1]);
      expect(listarProjetosExpansao(db, { status: "rascunho" }).map((p) => p.id)).toEqual([id2]);
      expect(listarProjetosExpansao(db, { imovelId: 1 }).map((p) => p.id)).toEqual([id1]);
      expect(listarProjetosExpansao(db, { imovelId: null }).map((p) => p.id)).toEqual([id2]);
      expect(listarProjetosExpansao(db).map((p) => p.id).sort()).toEqual([id1, id2].sort());
    });
  });

  // ==========================================================================
  // Fórmulas puras — números exatos
  // ==========================================================================

  describe("fórmulas de viabilidade (números exatos)", () => {
    it("fluxo de caixa líquido mensal = receita − despesa", () => {
      expect(calcularFluxoCaixaLiquidoMensal(2000, 300).valor).toBe(1700);
      expect(calcularFluxoCaixaLiquidoMensal(500, 800).valor).toBe(-300);
    });

    it("payback simples = custo ÷ fluxo mensal × 12", () => {
      // custo 120.000, fluxo mensal 2.000 → anual 24.000 → payback = 120000/2000*12 = 720 ... espera: 120000/24000 = 5 anos
      const resultado = calcularPaybackSimplesProjeto(120000, 2000);
      expect(resultado.valor).toBe(5);
    });

    it("payback é null quando fluxo mensal é zero ou negativo", () => {
      expect(calcularPaybackSimplesProjeto(100000, 0).valor).toBeNull();
      expect(calcularPaybackSimplesProjeto(100000, 0).motivoNulo).toMatch(/não gera fluxo positivo/);
      expect(calcularPaybackSimplesProjeto(100000, -50).valor).toBeNull();
    });

    it("yield anual = fluxo mensal × 12 ÷ custo × 100", () => {
      // fluxo mensal 2.000 → anual 24.000 ÷ 120.000 × 100 = 20%
      expect(calcularYieldAnualProjeto(120000, 2000).valor).toBe(20);
    });

    it("yield anual pode ser negativo (fluxo mensal negativo)", () => {
      expect(calcularYieldAnualProjeto(100000, -500).valor).toBe(-6);
    });

    it("ROI acumulado em N anos = (fluxo mensal × 12 × N − custo) ÷ custo × 100", () => {
      // custo 120.000, fluxo mensal 2.000 (anual 24.000):
      // 5 anos: (24000*5 - 120000)/120000*100 = 0%  (ponto exato de payback)
      expect(calcularRoiAcumuladoProjeto(120000, 2000, 5).valor).toBe(0);
      // 10 anos: (24000*10 - 120000)/120000*100 = 100%
      expect(calcularRoiAcumuladoProjeto(120000, 2000, 10).valor).toBe(100);
    });
  });

  // ==========================================================================
  // calcularViabilidadeProjeto — agregação + comparação com imóvel existente
  // ==========================================================================

  describe("calcularViabilidadeProjeto", () => {
    it("calcula todos os indicadores para um projeto sem imóvel vinculado", () => {
      const id = criarProjetoExpansao(db, {
        descricao: "Unidade nova hipotética",
        custoObraEstimado: 150000,
        receitaAdicionalMensalEstimada: 2500,
        despesaAdicionalMensalEstimada: 400,
        dataEstimativa: "2026-09-29",
      });

      const viabilidade = calcularViabilidadeProjeto(db, id);

      expect(viabilidade.fluxoCaixaLiquidoMensal.valor).toBe(2100);
      // payback = 150000 / (2100*12) = 150000/25200 = 5.952380... arredondado
      expect(viabilidade.paybackSimplesAnos.valor).toBeCloseTo(150000 / 25200, 2);
      expect(viabilidade.yieldAnual.valor).toBeCloseTo((25200 / 150000) * 100, 2);
      expect(viabilidade.roiAcumulado5Anos.valor).toBeCloseTo(((25200 * 5 - 150000) / 150000) * 100, 2);
      expect(viabilidade.roiAcumulado10Anos.valor).toBeCloseTo(((25200 * 10 - 150000) / 150000) * 100, 2);
      expect(viabilidade.comparacaoComImovelExistente).toBeNull();
    });

    it("payback null quando fluxo é negativo, mas yield/ROI continuam calculados (negativos)", () => {
      const id = criarProjetoExpansao(db, {
        descricao: "Projeto ruim",
        custoObraEstimado: 100000,
        receitaAdicionalMensalEstimada: 300,
        despesaAdicionalMensalEstimada: 500,
        dataEstimativa: "2026-09-29",
      });

      const viabilidade = calcularViabilidadeProjeto(db, id);
      expect(viabilidade.fluxoCaixaLiquidoMensal.valor).toBe(-200);
      expect(viabilidade.paybackSimplesAnos.valor).toBeNull();
      expect(viabilidade.paybackSimplesAnos.motivoNulo).toMatch(/não gera fluxo positivo/);
      expect(viabilidade.yieldAnual.valor).toBe(-2.4); // (-200*12)/100000*100 = -2.4
    });

    it("compara com o imóvel existente quando imovel_id está preenchido", () => {
      // Imóvel existente: valor_aquisicao 300.000, sem entidade legal cadastrada nesta
      // fixture → NOI sai só com a receita (24.000, sem desconto de despesa — comportamento
      // documentado em indicadoresHistorico.ts para o sentinela sem entidade) → yield
      // líquido = 24000/300000*100 = 8%.
      executar(
        db,
        `INSERT INTO imoveis (id, apelido, tipo, uso_pessoal, valor_aquisicao) VALUES (1, 'Kitnet 1', 'kitnet', 0, 300000)`,
      );
      executar(
        db,
        `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
         VALUES (1, 1, 'Inquilino A', 'residencial_fixo', 2000, '2020-01-01', NULL)`,
      );

      // Projeto de expansão vinculado ao imóvel 1, com yield anual bem maior (40%) — deve
      // ser avaliado como "melhor" que o yield líquido do imóvel existente (7.2%).
      const id = criarProjetoExpansao(db, {
        imovelId: 1,
        descricao: "Ampliar Kitnet 1",
        custoObraEstimado: 50000,
        receitaAdicionalMensalEstimada: 1666.67, // fluxo mensal ~1666.67 -> anual ~20000 -> yield 40%
        dataEstimativa: "2026-09-29",
      });

      const viabilidade = calcularViabilidadeProjeto(db, id);
      expect(viabilidade.comparacaoComImovelExistente).not.toBeNull();
      const comparacao = viabilidade.comparacaoComImovelExistente!;
      expect(comparacao.imovelId).toBe(1);
      expect(comparacao.apelido).toBe("Kitnet 1");
      expect(comparacao.yieldLiquidoImovelExistente.valor).toBeCloseTo(8, 1);
      expect(comparacao.avaliacao).toBe("melhor");
      expect(comparacao.diferencaPontosPercentuais).not.toBeNull();
      expect(comparacao.diferencaPontosPercentuais!).toBeGreaterThan(1);
    });

    it("avalia 'parecido' quando a diferença de yield é pequena", () => {
      executar(
        db,
        `INSERT INTO imoveis (id, apelido, tipo, uso_pessoal, valor_aquisicao) VALUES (1, 'Kitnet 1', 'kitnet', 0, 300000)`,
      );
      executar(
        db,
        `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
         VALUES (1, 1, 'Inquilino A', 'residencial_fixo', 2000, '2020-01-01', NULL)`,
      );
      // NOI anual = 24.000 (sem despesa lançada em contas_a_pagar) → yield líquido do imóvel
      // existente = 24000/300000*100 = 8%.
      const id = criarProjetoExpansao(db, {
        imovelId: 1,
        descricao: "Ampliação com retorno parecido",
        custoObraEstimado: 100000,
        receitaAdicionalMensalEstimada: 666.67, // anual ~8000 -> yield 8%
        dataEstimativa: "2026-09-29",
      });

      const viabilidade = calcularViabilidadeProjeto(db, id);
      const comparacao = viabilidade.comparacaoComImovelExistente!;
      expect(comparacao.avaliacao).toBe("parecido");
    });

    it("lança erro para projeto inexistente", () => {
      expect(() => calcularViabilidadeProjeto(db, 999)).toThrow(/não encontrado/);
    });
  });

  // ==========================================================================
  // compararProjetos — ordenação por payback
  // ==========================================================================

  describe("compararProjetos", () => {
    it("ordena por payback simples, menor primeiro, e joga paybacks null para o final", () => {
      // Projeto rápido: payback = 100000/(2000*12) ≈ 4.17 anos
      const idRapido = criarProjetoExpansao(db, {
        descricao: "Payback rápido",
        custoObraEstimado: 100000,
        receitaAdicionalMensalEstimada: 2000,
        dataEstimativa: "2026-09-29",
      });
      // Projeto lento: payback = 200000/(1000*12) ≈ 16.67 anos
      const idLento = criarProjetoExpansao(db, {
        descricao: "Payback lento",
        custoObraEstimado: 200000,
        receitaAdicionalMensalEstimada: 1000,
        dataEstimativa: "2026-09-29",
      });
      // Projeto sem payback: fluxo negativo
      const idSemPayback = criarProjetoExpansao(db, {
        descricao: "Sem payback",
        custoObraEstimado: 50000,
        receitaAdicionalMensalEstimada: 100,
        despesaAdicionalMensalEstimada: 300,
        dataEstimativa: "2026-09-29",
      });

      const comparacao = compararProjetos(db, [idLento, idSemPayback, idRapido]);

      expect(comparacao.map((c) => c.projetoId)).toEqual([idRapido, idLento, idSemPayback]);
      expect(comparacao[0].paybackSimplesAnos.valor).toBeLessThan(comparacao[1].paybackSimplesAnos.valor!);
      expect(comparacao[2].paybackSimplesAnos.valor).toBeNull();
    });
  });
});
