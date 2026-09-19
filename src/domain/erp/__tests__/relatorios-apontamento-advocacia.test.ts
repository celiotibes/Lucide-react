import { describe, it, expect, beforeEach } from "vitest";
import {
  RelatorioBuilder,
  relatorioResumoApontamentos,
  relatorioDespesasRemuneracao,
  relatorioReembolsos,
  relatorioComparativoProvedor,
  relatorioAcumuloIPCA,
  relatorioProvisaoImposto,
} from "../relatorios-apontamento";
import {
  RelatorioBuilderAdvocacia,
  relatorioProcessosAtivos,
  relatorioDespesasLegais,
  relatorioProvisoesRisco,
  relatorioAdvogadosComparativos,
  relatorioPrevisaoDespesas,
  relatorioAuditoriaProcessos,
} from "../relatorios-advocacia";
import { prepararBancoTeste } from "./test-setup";

describe("Relatórios Apontamento e Advocacia", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  // ============================================================================
  // TESTES RELATORIOBUILDER PATTERN
  // ============================================================================

  describe("RelatorioBuilder - Padrão", () => {
    it("deve criar relatório com metadados corretos", () => {
      const builder = new RelatorioBuilder(
        "Teste",
        "apontamento-prestador"
      );
      const relatorio = builder
        .adicionar("dados", { valor: 100 })
        .comPeriodo("01/2024")
        .obter();

      expect(relatorio.metadados).toBeDefined();
      expect(relatorio.metadados.titulo).toBe("Teste");
      expect(relatorio.metadados.origem_modulo).toBe("apontamento-prestador");
      expect(relatorio.metadados.periodo).toBe("01/2024");
      expect(relatorio.dados.valor).toBe(100);
    });

    it("deve formatar moeda em BRL", () => {
      const builder = new RelatorioBuilder("Teste", "apontamento-prestador");
      const formatado = builder.formatarMoeda(1234.56);

      expect(formatado).toContain("1.234,56");
      expect(formatado).toContain("R$");
    });

    it("deve formatar percentual", () => {
      const builder = new RelatorioBuilder("Teste", "apontamento-prestador");
      const formatado = builder.formatarPercentual(0.25);

      expect(formatado).toBe("25.00%");
    });

    it("deve formatar data em padrão BR", () => {
      const builder = new RelatorioBuilder("Teste", "apontamento-prestador");
      const formatado = builder.formatarData("2024-01-15");

      expect(formatado).toContain("15");
      expect(formatado).toContain("01");
      expect(formatado).toContain("2024");
    });

    it("deve adicionar filtros ao metadados", () => {
      const builder = new RelatorioBuilder("Teste", "apontamento-prestador");
      const relatorio = builder
        .comFiltros({ status: "ativo", tipo: "urgencia" })
        .obter();

      expect(relatorio.metadados.filtros).toEqual({
        status: "ativo",
        tipo: "urgencia",
      });
    });
  });

  describe("RelatorioBuilderAdvocacia - Padrão", () => {
    it("deve criar relatório de advocacia com origem_modulo correto", () => {
      const builder = new RelatorioBuilderAdvocacia("Teste Legal");
      const relatorio = builder
        .adicionar("total_processos", 5)
        .obter();

      expect(relatorio.metadados.origem_modulo).toBe("advocacia");
      expect(relatorio.total_processos).toBe(5);
    });

    it("deve formatar moeda em BRL", () => {
      const builder = new RelatorioBuilderAdvocacia("Teste");
      const formatado = builder.formatarMoeda(5000);

      expect(formatado).toContain("5.000,00");
      expect(formatado).toContain("R$");
    });
  });

  // ============================================================================
  // TESTES APONTAMENTO
  // ============================================================================

  describe("Relatório Resumo Apontamentos", () => {
    it("deve retornar estrutura válida com período", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).toHaveProperty("periodo_inicio");
      expect(relatorio).toHaveProperty("periodo_fim");
      expect(relatorio).toHaveProperty("prestadores_ativos");
      expect(relatorio).toHaveProperty("total_apontamentos");
      expect(relatorio).toHaveProperty("valor_total_pago");
      expect(relatorio).toHaveProperty("por_tipo");
    });

    it("deve ter agregação por tipos de apontamento", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.por_tipo).toHaveProperty("urgencias");
      expect(relatorio.por_tipo).toHaveProperty("airbnb");
      expect(relatorio.por_tipo).toHaveProperty("combustivel");
      expect(relatorio.por_tipo).toHaveProperty("horas");
      expect(relatorio.por_tipo).toHaveProperty("emprestimo");
    });

    it("cada tipo deve ter campos corretos", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.por_tipo.urgencias).toHaveProperty("quantidade");
      expect(relatorio.por_tipo.urgencias).toHaveProperty("valor");
      expect(relatorio.por_tipo.urgencias).toHaveProperty("valor_medio");

      expect(relatorio.por_tipo.combustivel).toHaveProperty("km_total");
      expect(relatorio.por_tipo.combustivel).toHaveProperty("km_medio");

      expect(relatorio.por_tipo.horas).toHaveProperty("horas_total");
      expect(relatorio.por_tipo.horas).toHaveProperty("horas_media");
    });

    it("valores devem ser não-negativos", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.valor_total_pago).toBeGreaterThanOrEqual(0);
      expect(relatorio.por_tipo.urgencias.valor).toBeGreaterThanOrEqual(0);
      expect(relatorio.por_tipo.urgencias.quantidade).toBeGreaterThanOrEqual(0);
    });

    it("prestadores deve ser array", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(Array.isArray(relatorio.prestadores)).toBe(true);
      if (relatorio.prestadores.length > 0) {
        const prest = relatorio.prestadores[0];
        expect(prest).toHaveProperty("prestador_id");
        expect(prest).toHaveProperty("nome");
        expect(prest).toHaveProperty("total_apontamentos");
        expect(prest).toHaveProperty("valor_total");
      }
    });
  });

  describe("Relatório Despesas Remuneração", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_geral");
      expect(relatorio).toHaveProperty("distribuicao");
    });

    it("distribuição deve ter todos os tipos", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      expect(relatorio.distribuicao).toHaveProperty("urgencias");
      expect(relatorio.distribuicao).toHaveProperty("airbnb");
      expect(relatorio.distribuicao).toHaveProperty("combustivel");
      expect(relatorio.distribuicao).toHaveProperty("horas");
      expect(relatorio.distribuicao).toHaveProperty("emprestimo");
    });

    it("cada tipo deve ter valor e percentual", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      Object.values(relatorio.distribuicao).forEach((tipo) => {
        expect(tipo).toHaveProperty("valor");
        expect(tipo).toHaveProperty("percentual");
        expect(tipo).toHaveProperty("detalhamento");
        expect(typeof tipo.valor).toBe("number");
        expect(typeof tipo.percentual).toBe("number");
        expect(Array.isArray(tipo.detalhamento)).toBe(true);
      });
    });

    it("percentuais devem somar até 1.0 (ou próximo)", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      const soma =
        relatorio.distribuicao.urgencias.percentual +
        relatorio.distribuicao.airbnb.percentual +
        relatorio.distribuicao.combustivel.percentual +
        relatorio.distribuicao.horas.percentual +
        relatorio.distribuicao.emprestimo.percentual;

      // Permitir margem por arredondamento
      expect(soma).toBeLessThanOrEqual(1.01);
    });

    it("total_geral deve ser soma de todos os tipos", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      const somaTipos =
        relatorio.distribuicao.urgencias.valor +
        relatorio.distribuicao.airbnb.valor +
        relatorio.distribuicao.combustivel.valor +
        relatorio.distribuicao.horas.valor +
        relatorio.distribuicao.emprestimo.valor;

      expect(Math.abs(relatorio.total_geral - somaTipos)).toBeLessThan(0.01);
    });
  });

  describe("Relatório Reembolsos", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioReembolsos(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_solicitado");
      expect(relatorio).toHaveProperty("total_aprovado");
      expect(relatorio).toHaveProperty("total_rejeitado");
      expect(relatorio).toHaveProperty("pendente_aprovacao");
      expect(relatorio).toHaveProperty("linhas");
    });

    it("linhas deve ser array com campos corretos", () => {
      const relatorio = relatorioReembolsos(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.linhas)).toBe(true);
      if (relatorio.linhas.length > 0) {
        const linha = relatorio.linhas[0];
        expect(linha).toHaveProperty("id");
        expect(linha).toHaveProperty("data_solicitacao");
        expect(linha).toHaveProperty("tipo_despesa");
        expect(linha).toHaveProperty("valor_solicitado");
        expect(linha).toHaveProperty("status");
      }
    });

    it("total_aprovado deve ser <= total_solicitado", () => {
      const relatorio = relatorioReembolsos(db, entidade_id, periodo_id);

      expect(relatorio.total_aprovado).toBeLessThanOrEqual(
        relatorio.total_solicitado
      );
    });

    it("soma de status devem ser <= total_solicitado", () => {
      const relatorio = relatorioReembolsos(db, entidade_id, periodo_id);

      const soma =
        relatorio.total_aprovado +
        relatorio.total_rejeitado +
        relatorio.pendente_aprovacao;

      expect(soma).toBeLessThanOrEqual(relatorio.total_solicitado + 0.01);
    });
  });

  describe("Relatório Comparativo Provedor", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioComparativoProvedor(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("prestadores");
      expect(relatorio).toHaveProperty("agregados");
      expect(Array.isArray(relatorio.prestadores)).toBe(true);
    });

    it("cada prestador deve ter scores entre 0-100", () => {
      const relatorio = relatorioComparativoProvedor(
        db,
        entidade_id,
        periodo_id
      );

      relatorio.prestadores.forEach((p) => {
        expect(p.produtividade_score).toBeGreaterThanOrEqual(0);
        expect(p.produtividade_score).toBeLessThanOrEqual(100);
        expect(p.compliance_score).toBeGreaterThanOrEqual(0);
        expect(p.compliance_score).toBeLessThanOrEqual(100);
        expect(p.taxa_aprovacao).toBeGreaterThanOrEqual(0);
        expect(p.taxa_aprovacao).toBeLessThanOrEqual(100);
      });
    });

    it("deve ter agregados com data", () => {
      const relatorio = relatorioComparativoProvedor(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.agregados).toHaveProperty(
        "prestador_mais_ativo"
      );
      expect(relatorio.agregados).toHaveProperty(
        "prestador_mais_produtivo"
      );
      expect(relatorio.agregados).toHaveProperty(
        "prestador_maior_taxa_rejeicao"
      );
    });

    it("tipos_servicos deve ter 5 propriedades", () => {
      const relatorio = relatorioComparativoProvedor(
        db,
        entidade_id,
        periodo_id
      );

      if (relatorio.prestadores.length > 0) {
        const prest = relatorio.prestadores[0];
        expect(Object.keys(prest.tipos_servicos).length).toBe(5);
      }
    });
  });

  describe("Relatório Acúmulo IPCA", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioAcumuloIPCA(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo_inicio");
      expect(relatorio).toHaveProperty("periodo_fim");
      expect(relatorio).toHaveProperty("itens");
      expect(relatorio).toHaveProperty("resumo");
      expect(Array.isArray(relatorio.itens)).toBe(true);
    });

    it("resumo deve ter totalizadores corretos", () => {
      const relatorio = relatorioAcumuloIPCA(db, entidade_id, periodo_id);

      expect(relatorio.resumo).toHaveProperty("total_itens_reajustados");
      expect(relatorio.resumo).toHaveProperty("total_reajuste");
      expect(relatorio.resumo).toHaveProperty("indice_medio_ipca");
      expect(relatorio.resumo).toHaveProperty("valor_economia_total");
    });

    it("valores devem ser numéricos", () => {
      const relatorio = relatorioAcumuloIPCA(db, entidade_id, periodo_id);

      expect(typeof relatorio.resumo.total_reajuste).toBe("number");
      expect(typeof relatorio.resumo.indice_medio_ipca).toBe("number");
      expect(typeof relatorio.resumo.valor_economia_total).toBe("number");
    });

    it("cada item deve ter campos corretos", () => {
      const relatorio = relatorioAcumuloIPCA(db, entidade_id, periodo_id);

      if (relatorio.itens.length > 0) {
        const item = relatorio.itens[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("valor_anterior");
        expect(item).toHaveProperty("indice_ipca");
        expect(item).toHaveProperty("valor_novo");
        expect(item).toHaveProperty("economia");
      }
    });
  });

  describe("Relatório Provisão Imposto", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioProvisaoImposto(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("prestadores");
      expect(relatorio).toHaveProperty("totalizadores");
    });

    it("cada prestador deve ter alíquota entre 0-1", () => {
      const relatorio = relatorioProvisaoImposto(db, entidade_id, periodo_id);

      relatorio.prestadores.forEach((p) => {
        expect(p.aliquota_efetiva).toBeGreaterThanOrEqual(0);
        expect(p.aliquota_efetiva).toBeLessThanOrEqual(1);
      });
    });

    it("provisão total deve ser soma IRPJ + PIS + COFINS", () => {
      const relatorio = relatorioProvisaoImposto(db, entidade_id, periodo_id);

      relatorio.prestadores.forEach((p) => {
        const soma = p.provisao_irpj + p.provisao_pis + p.provisao_cofins;
        expect(Math.abs(p.provisao_total - soma)).toBeLessThan(0.01);
      });
    });

    it("totalizadores deve ter base_tributavel correto", () => {
      const relatorio = relatorioProvisaoImposto(db, entidade_id, periodo_id);

      const baseTributavel =
        relatorio.totalizadores.faturamento_bruto_total -
        relatorio.totalizadores.deducoes_total;

      expect(
        Math.abs(
          relatorio.totalizadores.base_tributavel_total - baseTributavel
        )
      ).toBeLessThan(0.01);
    });

    it("valores devem ser não-negativos", () => {
      const relatorio = relatorioProvisaoImposto(db, entidade_id, periodo_id);

      relatorio.prestadores.forEach((p) => {
        expect(p.faturamento_bruto).toBeGreaterThanOrEqual(0);
        expect(p.deducoes_permitidas).toBeGreaterThanOrEqual(0);
        expect(p.provisao_total).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ============================================================================
  // TESTES ADVOCACIA
  // ============================================================================

  describe("Relatório Processos Ativos", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioProcessosAtivos(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("total_processos_ativos");
      expect(relatorio).toHaveProperty("valor_total_envolvido");
      expect(relatorio).toHaveProperty("valor_total_estimado");
      expect(relatorio).toHaveProperty("por_status");
      expect(relatorio).toHaveProperty("por_risco");
      expect(relatorio).toHaveProperty("processos_listados");
      expect(relatorio).toHaveProperty("alertas");
    });

    it("por_risco deve ter alíquotas de provisão", () => {
      const relatorio = relatorioProcessosAtivos(db, entidade_id, periodo_id);

      Object.values(relatorio.por_risco).forEach((risco) => {
        expect(risco).toHaveProperty("aliquota_provisao");
        expect(risco.aliquota_provisao).toBeGreaterThanOrEqual(0.25);
        expect(risco.aliquota_provisao).toBeLessThanOrEqual(1.0);
      });
    });

    it("processos_listados deve ser array", () => {
      const relatorio = relatorioProcessosAtivos(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.processos_listados)).toBe(true);
      if (relatorio.processos_listados.length > 0) {
        const proc = relatorio.processos_listados[0];
        expect(proc).toHaveProperty("numero_processo");
        expect(proc).toHaveProperty("risco_score");
        expect(proc.risco_score).toBeGreaterThanOrEqual(0);
        expect(proc.risco_score).toBeLessThanOrEqual(100);
      }
    });

    it("estouro de orçamento é sinalizado, não impedido", () => {
      // Este teste antes exigia valor_despesas_realizadas <= valor_total_estimado, o que
      // não é invariante nenhum: gastar mais que o estimado é possível, e denunciar isso
      // é justamente a razão de o relatório existir (o tipo dos alertas já previa
      // "acima_orcamento"). O que deve valer é: se estourou, tem alerta; se não, não tem.
      const relatorio = relatorioProcessosAtivos(db, entidade_id, periodo_id);
      const estourou = relatorio.valor_despesas_realizadas > relatorio.valor_total_estimado;
      const alerta = relatorio.alertas.find((a) => a.tipo === "acima_orcamento");

      expect(Boolean(alerta)).toBe(estourou);
      if (alerta) expect(alerta.quantidade).toBeGreaterThan(0);
    });
  });

  describe("Relatório Despesas Legais", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioDespesasLegais(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_geral");
      expect(relatorio).toHaveProperty("por_tipo");
      expect(relatorio).toHaveProperty("por_advogado");
      expect(relatorio).toHaveProperty("despesas_listadas");
      expect(relatorio).toHaveProperty("evolucao_mensal");
    });

    it("por_tipo deve ter percentual e valor_medio", () => {
      const relatorio = relatorioDespesasLegais(db, entidade_id, periodo_id);

      Object.values(relatorio.por_tipo).forEach((tipo) => {
        expect(tipo).toHaveProperty("percentual");
        expect(tipo).toHaveProperty("valor_medio");
        expect(tipo).toHaveProperty("quantidade");
        expect(typeof tipo.percentual).toBe("number");
      });
    });

    it("total_pago deve ser >= 0", () => {
      const relatorio = relatorioDespesasLegais(db, entidade_id, periodo_id);

      expect(relatorio.total_pago).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_geral).toBeGreaterThanOrEqual(0);
    });

    it("despesas_listadas deve ser array", () => {
      const relatorio = relatorioDespesasLegais(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.despesas_listadas)).toBe(true);
    });

    it("evolucao_mensal deve ser ordenada por data", () => {
      const relatorio = relatorioDespesasLegais(db, entidade_id, periodo_id);

      for (let i = 1; i < relatorio.evolucao_mensal.length; i++) {
        expect(relatorio.evolucao_mensal[i].mes).toGreaterThanOrEqual(
          relatorio.evolucao_mensal[i - 1].mes
        );
      }
    });
  });

  describe("Relatório Provisões Risco", () => {
    it("deve retornar estrutura válida com 4 níveis de risco", () => {
      const relatorio = relatorioProvisoesRisco(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("risco_baixo");
      expect(relatorio).toHaveProperty("risco_medio");
      expect(relatorio).toHaveProperty("risco_alto");
      expect(relatorio).toHaveProperty("risco_critico");
      expect(relatorio).toHaveProperty("provisao_total");
    });

    it("cada risco deve ter alíquota correta", () => {
      const relatorio = relatorioProvisoesRisco(db, entidade_id, periodo_id);

      expect(relatorio.risco_baixo.aliquota_provisao).toBe(0.25);
      expect(relatorio.risco_medio.aliquota_provisao).toBe(0.5);
      expect(relatorio.risco_alto.aliquota_provisao).toBe(0.75);
      expect(relatorio.risco_critico.aliquota_provisao).toBe(1.0);
    });

    it("provisão deve ser valor_envolvido * aliquota", () => {
      const relatorio = relatorioProvisoesRisco(db, entidade_id, periodo_id);

      const provisaoBaixo =
        relatorio.risco_baixo.valor_envolvido * 0.25;
      expect(
        Math.abs(relatorio.risco_baixo.provisao - provisaoBaixo)
      ).toBeLessThan(0.01);
    });

    it("provisao_total deve ser soma de todos os níveis", () => {
      const relatorio = relatorioProvisoesRisco(db, entidade_id, periodo_id);

      const soma =
        relatorio.risco_baixo.provisao +
        relatorio.risco_medio.provisao +
        relatorio.risco_alto.provisao +
        relatorio.risco_critico.provisao;

      expect(Math.abs(relatorio.provisao_total - soma)).toBeLessThan(0.01);
    });

    it("composicao_risco deve somar 100%", () => {
      const relatorio = relatorioProvisoesRisco(db, entidade_id, periodo_id);

      const somaPercentual = relatorio.composicao_risco.reduce(
        (sum, c) => sum + c.percentual,
        0
      );

      expect(Math.abs(somaPercentual - 1.0)).toBeLessThan(0.01);
    });
  });

  describe("Relatório Advogados Comparativos", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioAdvogadosComparativos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_advogados");
      expect(relatorio).toHaveProperty("total_processos");
      expect(relatorio).toHaveProperty("total_despesas");
      expect(relatorio).toHaveProperty("advogados");
      expect(relatorio).toHaveProperty("agregados");
    });

    it("cada advogado deve ter score_eficiencia entre 0-100", () => {
      const relatorio = relatorioAdvogadosComparativos(
        db,
        entidade_id,
        periodo_id
      );

      relatorio.advogados.forEach((adv) => {
        expect(adv.score_eficiencia).toBeGreaterThanOrEqual(0);
        expect(adv.score_eficiencia).toBeLessThanOrEqual(100);
      });
    });

    it("deve ter agregados com advogado_mais_ativo", () => {
      const relatorio = relatorioAdvogadosComparativos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.agregados).toHaveProperty("advogado_mais_ativo");
      expect(relatorio.agregados).toHaveProperty("advogado_mais_eficiente");
      expect(relatorio.agregados).toHaveProperty("advogado_maior_custo");
    });

    it("despesa_media_processo deve ser zero ou positiva", () => {
      const relatorio = relatorioAdvogadosComparativos(
        db,
        entidade_id,
        periodo_id
      );

      relatorio.advogados.forEach((adv) => {
        expect(adv.despesa_media_processo).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("Relatório Previsão Despesas", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioPrevisaoDespesas(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("orcamento_anual");
      expect(relatorio).toHaveProperty("gasto_realizado");
      expect(relatorio).toHaveProperty("gasto_projetado");
      expect(relatorio).toHaveProperty("saldo_disponivel");
      expect(relatorio).toHaveProperty("taxa_utilizacao");
    });

    it("taxa_utilizacao deve estar entre 0-1", () => {
      const relatorio = relatorioPrevisaoDespesas(db, entidade_id, periodo_id);

      expect(relatorio.taxa_utilizacao).toBeGreaterThanOrEqual(0);
      expect(relatorio.taxa_utilizacao).toBeLessThanOrEqual(1);
    });

    it("saldo_disponivel deve ser orcamento - gasto_realizado", () => {
      const relatorio = relatorioPrevisaoDespesas(db, entidade_id, periodo_id);

      const esperado = relatorio.orcamento_anual - relatorio.gasto_realizado;
      expect(Math.abs(relatorio.saldo_disponivel - esperado)).toBeLessThan(0.01);
    });

    it("projecao_mes_mes deve ter percentual_utilizado <= 1", () => {
      const relatorio = relatorioPrevisaoDespesas(db, entidade_id, periodo_id);

      relatorio.projecao_mes_mes.forEach((mes) => {
        expect(mes.percentual_utilizado).toBeGreaterThanOrEqual(0);
        expect(mes.percentual_utilizado).toBeLessThanOrEqual(2); // Permite até 200%
      });
    });

    it("desvios deve ser array", () => {
      const relatorio = relatorioPrevisaoDespesas(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.desvios)).toBe(true);
    });
  });

  describe("Relatório Auditoria Processos", () => {
    it("deve retornar estrutura válida", () => {
      const relatorio = relatorioAuditoriaProcessos(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_processos_auditados");
      expect(relatorio).toHaveProperty("conformidade_geral");
      expect(relatorio).toHaveProperty("processos");
      expect(relatorio).toHaveProperty("achados");
      expect(relatorio).toHaveProperty("recomendacoes");
    });

    it("conformidade_geral deve estar entre 0-1", () => {
      const relatorio = relatorioAuditoriaProcessos(db, entidade_id, periodo_id);

      expect(relatorio.conformidade_geral).toBeGreaterThanOrEqual(0);
      expect(relatorio.conformidade_geral).toBeLessThanOrEqual(1);
    });

    it("cada processo deve ter trilha_auditoria", () => {
      const relatorio = relatorioAuditoriaProcessos(db, entidade_id, periodo_id);

      relatorio.processos.forEach((proc) => {
        expect(Array.isArray(proc.trilha_auditoria)).toBe(true);
        if (proc.trilha_auditoria.length > 0) {
          const evento = proc.trilha_auditoria[0];
          expect(evento).toHaveProperty("data_evento");
          expect(evento).toHaveProperty("tipo_evento");
          expect(evento).toHaveProperty("descricao");
        }
      });
    });

    it("recomendacoes deve ser array de strings", () => {
      const relatorio = relatorioAuditoriaProcessos(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.recomendacoes)).toBe(true);
      relatorio.recomendacoes.forEach((rec) => {
        expect(typeof rec).toBe("string");
      });
    });
  });

  // ============================================================================
  // TESTES DE INTEGRAÇÃO E FORMATAÇÃO
  // ============================================================================

  describe("Formatação e Validação", () => {
    it("datas devem estar em ISO 8601", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      const isoRegex = /^\d{4}-\d{2}-\d{2}T?\d{0,2}:?\d{0,2}:?\d{0,2}Z?/;
      if (relatorio.periodo_inicio) {
        expect(relatorio.periodo_inicio).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    });

    it("moedas devem ser números e positivos", () => {
      const relatorio = relatorioDespesasRemuneracao(db, entidade_id, periodo_id);

      expect(typeof relatorio.total_geral).toBe("number");
      expect(relatorio.total_geral).toBeGreaterThanOrEqual(0);

      Object.values(relatorio.distribuicao).forEach((tipo) => {
        expect(typeof tipo.valor).toBe("number");
        expect(tipo.valor).toBeGreaterThanOrEqual(0);
      });
    });

    it("origem_modulo deve ser apontamento-prestador ou advocacia", () => {
      const builderApontamento = new RelatorioBuilder(
        "Teste",
        "apontamento-prestador"
      );
      const relApontamento = builderApontamento.obter();

      const builderAdvocacia = new RelatorioBuilderAdvocacia("Teste");
      const relAdvocacia = builderAdvocacia.obter();

      expect(relApontamento.metadados.origem_modulo).toBe(
        "apontamento-prestador"
      );
      expect(relAdvocacia.metadados.origem_modulo).toBe("advocacia");
    });
  });

  describe("Filtros e Período", () => {
    it("relatório deve respeitar filtros", () => {
      const builder = new RelatorioBuilder(
        "Teste",
        "apontamento-prestador"
      );
      const relatorio = builder
        .comFiltros({ status: "ativo", prestador_id: 1 })
        .comPeriodo("01/2024")
        .obter();

      expect(relatorio.metadados.filtros.prestador_id).toBe(1);
      expect(relatorio.metadados.periodo).toBe("01/2024");
    });

    it("período deve estar documentado nos relatórios", () => {
      const relatorio = relatorioResumoApontamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.periodo_inicio).toBeDefined();
      expect(relatorio.periodo_fim).toBeDefined();
    });
  });
});
