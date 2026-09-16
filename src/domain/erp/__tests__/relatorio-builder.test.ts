import { describe, it, expect, beforeEach } from "vitest";
import RelatorioBuilder, {
  ColunasRelatorio,
  Agregacao,
  Validacao,
} from "../relatorio-builder";
import {
  TemplateApontamentos,
  TemplateAdvocacia,
  TemplateContas,
  TemplateImoveis,
  TemplateRegistry,
} from "../relatorio-templates";
import {
  FormatadorMoeda,
  FormatadorData,
  FormatadorPercentual,
  FormatadorSaldo,
  FormatadorHashAuditoria,
  FormatadorInteiro,
  FormatadorFactory,
} from "../relatorio-formatacoes";

describe("RelatorioBuilder - Fluent API", () => {
  let builder: RelatorioBuilder;

  beforeEach(() => {
    builder = new RelatorioBuilder("Teste Relatório");
  });

  describe("Chaining Methods", () => {
    it("deve encadear métodos com período", () => {
      const resultado = builder
        .comPeriodo(2026, 1)
        .comFiltroOrigem("apontamento_prestador")
        .comCentroCusto("CC-001");

      expect(resultado).toBe(builder);
    });

    it("deve encadear todos os métodos de configuração", () => {
      const resultado = builder
        .comPeriodo(2026, 1)
        .comFiltroOrigem("advocacia")
        .comCentroCusto("CC-002", "Centro de Custo 2", true)
        .comFormatacao({ moeda: "USD", casasDecimais: 3 })
        .comColunas([{ nome: "id", tipo: "inteiro" }])
        .comAgregacoes([
          { tipo: "SUM", campo: "valor", alias: "total" },
        ])
        .comValidacoes([{ campo: "id", tipo: "requerido" }])
        .comDados([{ id: 1, valor: 100 }]);

      expect(resultado).toBe(builder);
    });
  });

  describe("Configuração de Período", () => {
    it("deve definir período com ano e mês", () => {
      builder.comPeriodo(2026, 5);
      const config = builder.obterConfiguracao();

      expect(config.periodo).toBeDefined();
      expect(config.periodo?.ano).toBe(2026);
      expect(config.periodo?.mes).toBe(5);
    });

    it("deve definir período com datas opcionais", () => {
      builder.comPeriodo(2026, 1, "2026-01-01", "2026-01-31");
      const config = builder.obterConfiguracao();

      expect(config.periodo?.dataInicio).toBe("2026-01-01");
      expect(config.periodo?.dataFim).toBe("2026-01-31");
    });
  });

  describe("Configuração de Filtros", () => {
    it("deve definir filtro de origem", () => {
      builder.comFiltroOrigem("apontamento_prestador", 123, "Apontamento teste");
      const config = builder.obterConfiguracao();

      expect(config.filtroOrigem).toBeDefined();
      expect(config.filtroOrigem?.modulo).toBe("apontamento_prestador");
      expect(config.filtroOrigem?.origem_id).toBe(123);
    });

    it("deve definir centro de custo", () => {
      builder.comCentroCusto("CC-001", "Centro Principal", true);
      const config = builder.obterConfiguracao();

      expect(config.centroCusto).toBeDefined();
      expect(config.centroCusto?.id).toBe("CC-001");
      expect(config.centroCusto?.nome).toBe("Centro Principal");
      expect(config.centroCusto?.recursivar).toBe(true);
    });
  });

  describe("Configuração de Formatação", () => {
    it("deve definir formatação de moeda", () => {
      builder.comFormatacao({ moeda: "USD", casasDecimais: 3 });
      const config = builder.obterConfiguracao();

      expect(config.formatacao?.moeda).toBe("USD");
      expect(config.formatacao?.casasDecimais).toBe(3);
    });

    it("deve manter formatação padrão se não especificada", () => {
      const config = builder.obterConfiguracao();

      expect(config.formatacao?.moeda).toBe("BRL");
      expect(config.formatacao?.dataFormat).toBe("DD/MM/YYYY");
    });

    it("deve adicionar hash de auditoria por padrão", () => {
      const config = builder.obterConfiguracao();
      expect(config.formatacao?.incluirHashAuditoria).toBe(true);
    });
  });

  describe("Colunas", () => {
    it("deve adicionar coluna única", () => {
      builder.adicionarColuna({ nome: "id", tipo: "inteiro" });
      const config = builder.obterConfiguracao();

      expect(config.totalColunas).toBe(1);
    });

    it("deve adicionar múltiplas colunas", () => {
      const colunas: ColunasRelatorio[] = [
        { nome: "id", tipo: "inteiro" },
        { nome: "data", tipo: "data" },
        { nome: "valor", tipo: "moeda" },
      ];

      builder.comColunas(colunas);
      const config = builder.obterConfiguracao();

      expect(config.totalColunas).toBe(3);
    });

    it("deve definir propriedades de coluna", () => {
      builder.adicionarColuna({
        nome: "valor",
        tipo: "moeda",
        largura: 120,
        alinhamento: "direita",
      });

      const config = builder.obterConfiguracao();
      expect(config.totalColunas).toBe(1);
    });
  });

  describe("Agregações", () => {
    it("deve adicionar agregação única", () => {
      builder.adicionarAgregacao({
        tipo: "SUM",
        campo: "valor",
        alias: "total_valor",
      });

      const config = builder.obterConfiguracao();
      expect(config.totalAgregacoes).toBe(1);
    });

    it("deve adicionar múltiplas agregações", () => {
      const agregacoes: Agregacao[] = [
        { tipo: "SUM", campo: "valor", alias: "total" },
        { tipo: "COUNT", campo: "id", alias: "quantidade" },
        { tipo: "AVG", campo: "valor", alias: "media" },
      ];

      builder.comAgregacoes(agregacoes);
      const config = builder.obterConfiguracao();

      expect(config.totalAgregacoes).toBe(3);
    });

    it("deve suportar diferentes tipos de agregação", () => {
      const tipos = ["SUM", "AVG", "COUNT", "MAX", "MIN"] as const;

      for (const tipo of tipos) {
        const b = new RelatorioBuilder(`Test ${tipo}`);
        b.adicionarAgregacao({
          tipo: tipo,
          campo: "valor",
          alias: `${tipo.toLowerCase()}_valor`,
        });
        const config = b.obterConfiguracao();
        expect(config.totalAgregacoes).toBe(1);
      }
    });
  });

  describe("Validações", () => {
    it("deve adicionar validação única", () => {
      builder.adicionarValidacao({
        campo: "valor",
        tipo: "requerido",
        mensagem: "Valor é obrigatório",
      });

      const config = builder.obterConfiguracao();
      expect(config.totalValidacoes).toBe(1);
    });

    it("deve adicionar múltiplas validações", () => {
      const validacoes: Validacao[] = [
        { campo: "id", tipo: "requerido" },
        {
          campo: "valor",
          tipo: "faixa",
          parametros: { min: 0, max: 10000 },
        },
        {
          campo: "data",
          tipo: "formato",
          parametros: { regex: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
      ];

      builder.comValidacoes(validacoes);
      const config = builder.obterConfiguracao();

      expect(config.totalValidacoes).toBe(3);
    });
  });

  describe("Dados", () => {
    it("deve definir dados do relatório", () => {
      const dados = [
        { id: 1, nome: "Teste 1", valor: 100 },
        { id: 2, nome: "Teste 2", valor: 200 },
      ];

      builder.comDados(dados);
      const config = builder.obterConfiguracao();

      expect(config.totalLinhas).toBe(2);
    });

    it("deve suportar dados vazios", () => {
      builder.comDados([]);
      const config = builder.obterConfiguracao();

      expect(config.totalLinhas).toBe(0);
    });
  });

  describe("Geração de Saída - JSON", () => {
    it("deve gerar JSON válido", () => {
      builder
        .comPeriodo(2026, 1)
        .comFiltroOrigem("teste")
        .comColunas([
          { nome: "id", tipo: "inteiro" },
          { nome: "valor", tipo: "moeda" },
        ])
        .comDados([
          { id: 1, valor: 1000 },
          { id: 2, valor: 2000 },
        ]);

      const json = builder.gerarJSON();
      const obj = JSON.parse(json);

      expect(obj).toBeDefined();
      expect(obj.header).toBeDefined();
      expect(obj.metadata).toBeDefined();
      expect(obj.corpo).toBeDefined();
    });

    it("deve incluir header completo", () => {
      builder.comPeriodo(2026, 3);
      const json = builder.gerarJSON();
      const obj = JSON.parse(json);

      expect(obj.header.titulo).toBe("Teste Relatório");
      expect(obj.header.periodo).toBe("03/2026");
    });

    it("deve incluir metadata com parâmetros de filtro", () => {
      builder
        .comPeriodo(2026, 1)
        .comFiltroOrigem("apontamento")
        .comCentroCusto("CC-001");

      const json = builder.gerarJSON();
      const obj = JSON.parse(json);

      expect(obj.metadata.modulo).toBe("apontamento");
      expect(obj.metadata.parametrosFiltro.periodo).toBeDefined();
      expect(obj.metadata.parametrosFiltro.centroCusto).toBeDefined();
    });

    it("deve incluir hash de auditoria quando configurado", () => {
      builder
        .comFormatacao({ incluirHashAuditoria: true })
        .comDados([{ id: 1 }]);

      const json = builder.gerarJSON();
      const obj = JSON.parse(json);

      expect(obj.metadata.hashAuditoria).toBeDefined();
    });

    it("deve calcular agregações no JSON", () => {
      builder
        .comAgregacoes([
          { tipo: "SUM", campo: "valor", alias: "total_valor" },
        ])
        .comDados([
          { id: 1, valor: 100 },
          { id: 2, valor: 200 },
        ]);

      const json = builder.gerarJSON();
      const obj = JSON.parse(json);

      expect(obj.summary.agregacoes.total_valor).toBe(300);
    });
  });

  describe("Geração de Saída - CSV", () => {
    it("deve gerar CSV válido", () => {
      builder
        .comPeriodo(2026, 1)
        .comColunas([
          { nome: "id", tipo: "inteiro" },
          { nome: "nome", tipo: "texto" },
        ])
        .comDados([
          { id: 1, nome: "Teste" },
          { id: 2, nome: "Exemplo" },
        ]);

      const csv = builder.gerarCSV();

      expect(csv).toContain("Relatório: Teste Relatório");
      expect(csv).toContain("id");
      expect(csv).toContain("nome");
      expect(csv).toContain("1");
      expect(csv).toContain("Teste");
    });

    it("deve incluir cabeçalho quando solicitado", () => {
      builder
        .comColunas([{ nome: "id", tipo: "inteiro" }])
        .comDados([{ id: 1 }]);

      const csv = builder.gerarCSV(true);

      expect(csv).toContain("id");
    });

    it("deve incluir resumo com agregações", () => {
      builder
        .comColunas([{ nome: "valor", tipo: "moeda" }])
        .comAgregacoes([
          { tipo: "SUM", campo: "valor", alias: "total" },
        ])
        .comDados([
          { valor: 100 },
          { valor: 200 },
        ]);

      const csv = builder.gerarCSV();

      expect(csv).toContain("RESUMO");
      expect(csv).toContain("total");
    });

    it("deve escapar aspas duplas em dados", () => {
      builder
        .comColunas([{ nome: "texto", tipo: "texto" }])
        .comDados([{ texto: 'Contém "aspas"' }]);

      const csv = builder.gerarCSV();

      expect(csv).toContain('""aspas""');
    });
  });

  describe("Geração de Saída - PDF", () => {
    it("deve retornar estrutura para PDF", () => {
      builder
        .comPeriodo(2026, 1)
        .comDados([{ id: 1, valor: 100 }]);

      const pdf = builder.gerarPDF();

      expect(pdf).toBeDefined();
      expect(pdf.tipo).toBe("pdf");
      expect(pdf.titulo).toBe("Teste Relatório");
      expect(pdf.estrutura).toBeDefined();
    });
  });

  describe("Validação de Dados", () => {
    it("deve validar período requerido", () => {
      const erros = builder.validarDados();

      expect(erros.length).toBeGreaterThan(0);
      expect(erros.some((e) => e.includes("Período"))).toBe(true);
    });

    it("deve validar campos obrigatórios", () => {
      builder
        .comPeriodo(2026, 1)
        .comValidacoes([
          { campo: "id", tipo: "requerido" },
        ])
        .comColunas([{ nome: "id", tipo: "inteiro" }])
        .comDados([
          { id: 1 },
          { id: null },
        ]);

      const erros = builder.validarDados();

      expect(erros.length).toBeGreaterThan(0);
    });

    it("deve validar faixa de valores", () => {
      builder
        .comPeriodo(2026, 1)
        .comValidacoes([
          {
            campo: "valor",
            tipo: "faixa",
            parametros: { min: 0, max: 1000 },
          },
        ])
        .comColunas([{ nome: "valor", tipo: "moeda" }])
        .comDados([
          { valor: 500 },
          { valor: 1500 }, // Excede máximo
        ]);

      const erros = builder.validarDados();

      expect(erros.length).toBeGreaterThan(0);
    });

    it("deve retornar array vazio se válido", () => {
      builder
        .comPeriodo(2026, 1)
        .comValidacoes([
          { campo: "id", tipo: "requerido" },
        ])
        .comColunas([{ nome: "id", tipo: "inteiro" }])
        .comDados([
          { id: 1 },
          { id: 2 },
        ]);

      const erros = builder.validarDados();

      expect(erros.length).toBe(0);
    });
  });

  describe("Operações Utilitárias", () => {
    it("deve limpar dados e configuração", () => {
      builder
        .comPeriodo(2026, 1)
        .comDados([{ id: 1 }])
        .comColunas([{ nome: "id", tipo: "inteiro" }]);

      builder.limpar();
      const config = builder.obterConfiguracao();

      expect(config.totalLinhas).toBe(0);
      expect(config.totalColunas).toBe(0);
    });

    it("deve retornar builder após limpar", () => {
      const resultado = builder.limpar();

      expect(resultado).toBe(builder);
    });

    it("deve clonar instância", () => {
      builder
        .comPeriodo(2026, 1)
        .comFiltroOrigem("teste")
        .comDados([{ id: 1 }]);

      const clone = builder.clonar();

      expect(clone).not.toBe(builder);
      expect(clone.obterConfiguracao()).toEqual(
        builder.obterConfiguracao(),
      );
    });

    it("clon não deve afetar original", () => {
      builder.comDados([{ id: 1 }]);
      const clone = builder.clonar();

      clone.comDados([{ id: 1 }, { id: 2 }]);

      expect(builder.obterConfiguracao().totalLinhas).toBe(1);
      expect(clone.obterConfiguracao().totalLinhas).toBe(2);
    });
  });
});

describe("RelatorioBuilder - Template Integration", () => {
  it("deve aplicar template de Apontamentos", () => {
    const template = new TemplateApontamentos();
    const builder = new RelatorioBuilder("Relatório de Apontamentos")
      .comPeriodo(2026, 1)
      .comColunas(template.colunas)
      .comAgregacoes(template.agregacoes)
      .comValidacoes(template.validacoes)
      .comFormatacao(template.formatacao)
      .comDados([
        {
          id: 1,
          data_apontamento: "2026-01-15",
          prestador_nome: "João Silva",
          centro_custo_codigo: "CC-001",
          valor_total: 1500,
          horas_apontadas: 8,
        },
      ]);

    const json = builder.gerarJSON();
    const obj = JSON.parse(json);

    expect(obj.header.titulo).toBe("Relatório de Apontamentos");
    expect(obj.colunas.length).toBeGreaterThan(0);
  });

  it("deve aplicar template de Advocacia", () => {
    const template = new TemplateAdvocacia();
    const builder = new RelatorioBuilder("Relatório de Advocacia")
      .comColunas(template.colunas)
      .comAgregacoes(template.agregacoes);

    const config = builder.obterConfiguracao();

    expect(config.totalColunas).toBeGreaterThan(0);
    expect(config.totalAgregacoes).toBeGreaterThan(0);
  });

  it("deve usar TemplateRegistry para obter templates", () => {
    const apontamentos = TemplateRegistry.obter("apontamentos");
    const advocacia = TemplateRegistry.obter("advocacia");

    expect(apontamentos).not.toBeNull();
    expect(advocacia).not.toBeNull();
  });

  it("deve listar templates disponíveis", () => {
    const templates = TemplateRegistry.listar();

    expect(templates).toContain("apontamentos");
    expect(templates).toContain("advocacia");
    expect(templates).toContain("contas");
    expect(templates).toContain("imoveis");
  });
});

describe("RelatorioBuilder - Formatação de Dados", () => {
  let builder: RelatorioBuilder;

  beforeEach(() => {
    builder = new RelatorioBuilder("Teste Formatação");
  });

  it("deve usar FormatadorMoeda", () => {
    const formatador = new FormatadorMoeda("BRL", 2);

    expect(formatador.formatar(1500.5)).toContain("1.500");
    expect(formatador.formatar(1500.5)).toContain("R$");
  });

  it("deve usar FormatadorData", () => {
    const formatador = new FormatadorData("DD/MM/YYYY");

    expect(formatador.formatar("2026-01-15")).toBe("15/01/2026");
  });

  it("deve usar FormatadorPercentual", () => {
    const formatador = new FormatadorPercentual(2, true, true);

    expect(formatador.formatar(0.75)).toContain("75");
    expect(formatador.formatar(0.75)).toContain("%");
  });

  it("deve usar FormatadorSaldo", () => {
    const formatador = new FormatadorSaldo("BRL", 2, true);

    const positivo = formatador.formatar(1500);
    const negativo = formatador.formatar(-1500);

    expect(positivo).toContain("CRE");
    expect(negativo).toContain("DEV");
  });

  it("deve usar FormatadorHashAuditoria", () => {
    const formatador = new FormatadorHashAuditoria(32, true);
    const hash = formatador.formatar("abc123def456");

    expect(hash).toBe(hash.toUpperCase());
    expect(formatador.validar(hash)).toBe(true);
  });

  it("deve usar FormatadorFactory", () => {
    const moeda = FormatadorFactory.criar("moeda", { moeda: "BRL" });
    const data = FormatadorFactory.criar("data", { formato: "DD/MM/YYYY" });

    expect(moeda).toBeInstanceOf(FormatadorMoeda);
    expect(data).toBeInstanceOf(FormatadorData);
  });

  it("deve lançar erro para formatador desconhecido", () => {
    expect(() => FormatadorFactory.criar("desconhecido")).toThrow();
  });

  it("deve deformatar valores", () => {
    const moeda = new FormatadorMoeda("BRL", 2);
    const formatado = moeda.formatar(1500.5);
    const original = moeda.desformatar(formatado);

    expect(original).toBeCloseTo(1500.5, 1);
  });
});

describe("RelatorioBuilder - Calcular Agregações", () => {
  let builder: RelatorioBuilder;

  beforeEach(() => {
    builder = new RelatorioBuilder("Teste Agregações");
  });

  it("deve calcular SUM corretamente", () => {
    builder
      .comAgregacoes([{ tipo: "SUM", campo: "valor", alias: "total" }])
      .comDados([
        { valor: 100 },
        { valor: 200 },
        { valor: 300 },
      ]);

    const json = builder.gerarJSON();
    const obj = JSON.parse(json);

    expect(obj.summary.agregacoes.total).toBe(600);
  });

  it("deve calcular AVG corretamente", () => {
    builder
      .comAgregacoes([{ tipo: "AVG", campo: "valor", alias: "media" }])
      .comDados([
        { valor: 100 },
        { valor: 200 },
      ]);

    const json = builder.gerarJSON();
    const obj = JSON.parse(json);

    expect(obj.summary.agregacoes.media).toBe(150);
  });

  it("deve calcular COUNT corretamente", () => {
    builder
      .comAgregacoes([{ tipo: "COUNT", campo: "id", alias: "quantidade" }])
      .comDados([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);

    const json = builder.gerarJSON();
    const obj = JSON.parse(json);

    expect(obj.summary.agregacoes.quantidade).toBe(3);
  });

  it("deve calcular MAX e MIN", () => {
    builder
      .comAgregacoes([
        { tipo: "MAX", campo: "valor", alias: "maximo" },
        { tipo: "MIN", campo: "valor", alias: "minimo" },
      ])
      .comDados([
        { valor: 100 },
        { valor: 500 },
        { valor: 300 },
      ]);

    const json = builder.gerarJSON();
    const obj = JSON.parse(json);

    expect(obj.summary.agregacoes.maximo).toBe(500);
    expect(obj.summary.agregacoes.minimo).toBe(100);
  });
});
