import { describe, expect, it, vi } from "vitest";
import type JsPdf from "jspdf";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { gerarLaudoPdf, baixarLaudoPdf } from "./gerarLaudoPdf";
import type { DadosLaudo } from "./gerarLaudoPdf";
import { AMOSTRA_MINIMA_BENFORD_INDICATIVA } from "../auditoria/auditoriaForense";
import { Escritor } from "./escritorPdf";

function dadosLaudoBase(overrides: Partial<DadosLaudo> = {}): DadosLaudo {
  return {
    periodoInicio: "2026-01-01",
    periodoFim: "2026-01-31",
    linhasDre: [],
    statusInadimplencia: [],
    duplicatas: [],
    outliers: [],
    lacunas: [],
    capacidadeContributiva: {
      periodoInicio: "2026-01-01",
      periodoFim: "2026-01-31",
      totalRecebidoBruto: 0,
      rendaTributavel: 0,
      reembolsoNaoTributavel: 0,
      despesaOperacionalTotal: 0,
      resultadoLiquidoReal: 0,
      percentualDisponivelSobreRecebido: null,
    },
    analiseVertical: [],
    analiseHorizontal: [],
    patrimonioLiquido: {
      ativoImobiliario: 0,
      imoveisSemValorVenal: [],
      passivoFinanciamentos: 0,
      financiamentosSemSaldoDevedor: [],
      passivoConsumo: 0,
      patrimonioLiquido: 0,
    },
    liquidezCorrente: {
      saldoCaixaAtual: 0,
      cauçõesADevolverProximos12Meses: 0,
      parcelasDividaProximos12Meses: 0,
      passivoCirculante: 0,
      indiceLiquidezCorrente: null,
    },
    passivoCaucaoRetido: 0,
    saldoCaixaAtual: 0,
    desempenhoImoveis: [],
    ...overrides,
  };
}

/** Gera o laudo espionando os métodos de Escritor (titulo/secao/paragrafo/linhaTabela) para
 * inspecionar o conteúdo exato que gerarLaudoPdf() decide escrever — a forma recomendada pelo
 * padrão de teste do projeto de validar o PDF sem comparar bytes do arquivo renderizado.
 * BUG REAL ENCONTRADO E CORRIGIDO NESTE TESTE (não em código de produção): a versão anterior
 * fazia `vi.spyOn(JsPdf.prototype, "text")`, partindo da premissa de que gerarLaudoPdf() —
 * que cria seu próprio jsPDF via `import("jspdf")` dinâmico — compartilharia o protótipo com
 * o `JsPdf` importado estaticamente aqui. A premissa de módulo compartilhado está certa, mas
 * `text()` (e as demais primitivas de desenho) não vivem no protótipo de jsPDF: o construtor
 * as atribui como propriedade própria de cada instância (confirmado inspecionando
 * node_modules/jspdf em runtime: `Object.getOwnPropertyDescriptor(JsPdf.prototype, "text")`
 * retorna `undefined`, enquanto a mesma chamada na instância retorna a função). Por isso
 * `vi.spyOn(JsPdf.prototype, "text")` lançava "The property 'text' is not defined on the
 * object" em toda chamada, e os 17 testes abaixo que dependiam dele falhavam. A correção
 * espiona `Escritor.prototype`, que são métodos de classe normais (ficam no protótipo de
 * verdade) e é exatamente onde o conteúdo dinâmico de gerarLaudoPdf() entra no documento —
 * chamando através da implementação original para preservar avanço de `y` e quebra de
 * página automática. */
async function gerarComTextos(dados: DadosLaudo): Promise<{ doc: JsPdf; textos: string[] }> {
  const textos: string[] = [];
  const tituloOriginal = Escritor.prototype.titulo;
  const secaoOriginal = Escritor.prototype.secao;
  const paragrafoOriginal = Escritor.prototype.paragrafo;
  const linhaTabelaOriginal = Escritor.prototype.linhaTabela;

  const spyTitulo = vi.spyOn(Escritor.prototype, "titulo").mockImplementation(function (this: Escritor, texto: string) {
    textos.push(texto);
    return tituloOriginal.call(this, texto);
  });
  const spySecao = vi.spyOn(Escritor.prototype, "secao").mockImplementation(function (this: Escritor, texto: string) {
    textos.push(texto);
    return secaoOriginal.call(this, texto);
  });
  const spyParagrafo = vi.spyOn(Escritor.prototype, "paragrafo").mockImplementation(function (this: Escritor, texto: string) {
    textos.push(texto);
    return paragrafoOriginal.call(this, texto);
  });
  const spyLinhaTabela = vi
    .spyOn(Escritor.prototype, "linhaTabela")
    .mockImplementation(function (this: Escritor, colunas: string[], larguras: number[], negrito?: boolean) {
      textos.push(...colunas);
      return linhaTabelaOriginal.call(this, colunas, larguras, negrito);
    });

  const doc = await gerarLaudoPdf(dados);

  spyTitulo.mockRestore();
  spySecao.mockRestore();
  spyParagrafo.mockRestore();
  spyLinhaTabela.mockRestore();

  return { doc, textos };
}

describe("gerarLaudoPdf", () => {
  it("caminho feliz: gera um PDF válido (>0 bytes, 1 página) com dados totalmente vazios", async () => {
    const doc = await gerarLaudoPdf(dadosLaudoBase());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = doc.output("arraybuffer") as ArrayBuffer;
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("DRE: resultado líquido soma receita (positiva) e despesa (negativa, padrão de gerarDre)", async () => {
    const dados = dadosLaudoBase({
      linhasDre: [
        { codigo: "1.1", descricao: "Aluguéis recebidos", grupo: "receita", total: 1000 },
        { codigo: "2.1", descricao: "Manutenção", grupo: "despesa", total: -300 },
      ],
    });
    const { textos } = await gerarComTextos(dados);
    // R$ 700,00 = 1000 - 300
    expect(textos.some((t) => t.includes("700,00"))).toBe(true);
  });

  it("inadimplência: sem competências em aberto, mostra o parágrafo de ausência", async () => {
    const dados = dadosLaudoBase({
      statusInadimplencia: [
        {
          competencia: { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 },
          diasAtraso: 0,
          multa: 0,
          juros: 0,
          correcaoMonetaria: 0,
          honorarios: 0,
          totalDevido: 0,
          situacao: "pago",
        },
      ],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Nenhuma competência em aberto"))).toBe(true);
  });

  it("inadimplência: lista até 25 competências em aberto e resume o excedente", async () => {
    const competencias = Array.from({ length: 27 }, (_, i) => ({
      competencia: { contrato_id: 1, imovel_id: 1, mes_referencia: `2026-${String((i % 12) + 1).padStart(2, "0")}-01`, valor_esperado: 1000 },
      diasAtraso: 10 + i,
      multa: 20,
      juros: 5,
      correcaoMonetaria: 0,
      honorarios: 0,
      totalDevido: 1025,
      situacao: "inadimplente" as const,
    }));
    const dados = dadosLaudoBase({ statusInadimplencia: competencias });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("27 competência"))).toBe(true);
    expect(textos.some((t) => t.includes("+2 competência(s) adicional"))).toBe(true);
  });

  it("caução: caixa menor que o passivo retido mostra 'descoberto'", async () => {
    const dados = dadosLaudoBase({ passivoCaucaoRetido: 5000, saldoCaixaAtual: 3000 });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("descoberto em"))).toBe(true);
    expect(textos.some((t) => t.includes("2.000,00"))).toBe(true);
  });

  it("caução: caixa suficiente mostra 'coberto'", async () => {
    const dados = dadosLaudoBase({ passivoCaucaoRetido: 1000, saldoCaixaAtual: 5000 });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t === "coberto")).toBe(true);
  });

  it("liquidez corrente: passivo circulante zero mostra 'indefinido', não divide por zero", async () => {
    const dados = dadosLaudoBase({
      liquidezCorrente: {
        saldoCaixaAtual: 1000,
        cauçõesADevolverProximos12Meses: 0,
        parcelasDividaProximos12Meses: 0,
        passivoCirculante: 0,
        indiceLiquidezCorrente: null,
      },
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("indefinido"))).toBe(true);
  });

  it("patrimônio: imóveis sem valor venal cadastrado aparecem listados em ressalva", async () => {
    const dados = dadosLaudoBase({
      patrimonioLiquido: {
        ativoImobiliario: 500000,
        imoveisSemValorVenal: ["Kitnet 302", "Sala 10"],
        passivoFinanciamentos: 100000,
        financiamentosSemSaldoDevedor: [],
        passivoConsumo: 0,
        patrimonioLiquido: 400000,
      },
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Kitnet 302, Sala 10"))).toBe(true);
  });

  it("desempenho por imóvel vazio mostra aviso de que nenhum imóvel elegível está cadastrado", async () => {
    const { textos } = await gerarComTextos(dadosLaudoBase());
    expect(textos.some((t) => t.includes("Nenhum imóvel cadastrado"))).toBe(true);
  });

  it("desempenho por imóvel: lista cada imóvel com receita/despesa/resultado", async () => {
    const dados = dadosLaudoBase({
      desempenhoImoveis: [
        {
          imovel: { id: 1, apelido: "Kitnet 1", tipo: "kitnet", financiado: 0, uso_pessoal: 0, regime_patrimonial: "proprio" },
          receita: 1200,
          despesa: -400,
          resultadoLiquido: 800,
        },
      ],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Kitnet 1"))).toBe(true);
    expect(textos.some((t) => t.includes("800,00"))).toBe(true);
  });

  it("achados de auditoria: duplicatas e outliers aparecem na seção 8, lacunas só no resumo", async () => {
    const dados = dadosLaudoBase({
      duplicatas: [{ conta_id: 1, data: "2026-01-05", valor: 150, descricao_original: "PIX duplicado", ocorrencias: 2, transacaoIds: [10, 11] }],
      outliers: [{ transacaoId: 5, data: "2026-01-10", descricao: "Reforma atípica", valor: 9999, planoContaCodigo: "2.1.02", mediaCategoria: 500, desvioPadraoCategoria: 100, zScore: 4.2 }],
      lacunas: [{ imovelId: 1, imovelApelido: "Kitnet 1", planoContaCodigo: "2.1.01", mesesFaltantes: ["2026-02"] }],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Duplicidades: 1"))).toBe(true);
    expect(textos.some((t) => t.includes("Outliers estatísticos"))).toBe(true);
    expect(textos.some((t) => t.includes("PIX duplicado"))).toBe(true);
    expect(textos.some((t) => t.includes("4.2"))).toBe(true);
  });

  it("Benford: amostra abaixo do piso indicativo inclui a ressalva explícita de que não deve ser lida como indício", async () => {
    const amostraPequena = AMOSTRA_MINIMA_BENFORD_INDICATIVA - 1;
    const dados = dadosLaudoBase({
      benford: [{ digito: 1, frequenciaObservada: 0.4, frequenciaEsperada: 0.301 }],
      amostraBenford: amostraPequena,
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("NÃO deve ser lido como indício"))).toBe(true);
    expect(textos.some((t) => t.includes(String(amostraPequena)))).toBe(true);
  });

  it("Benford: amostra acima do piso indicativo NÃO inclui a ressalva", async () => {
    const dados = dadosLaudoBase({
      benford: [{ digito: 1, frequenciaObservada: 0.32, frequenciaEsperada: 0.301 }],
      amostraBenford: AMOSTRA_MINIMA_BENFORD_INDICATIVA + 10,
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("NÃO deve ser lido como indício"))).toBe(false);
  });

  it("Benford: array vazio não desenha a seção (guard dados.benford.length > 0)", async () => {
    const dados = dadosLaudoBase({ benford: [], amostraBenford: 10 });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Lei de Benford"))).toBe(false);
  });

  it("divergências de anatocismo: conta financiamentos distintos corretamente e lista as parcelas", async () => {
    const dados = dadosLaudoBase({
      divergenciasAnatocismo: [
        { numero: 1, mes: "2026-01", jurosTeorico: 100, jurosCobrado: 120, amortizacaoTeorica: 50, amortizacaoCobrada: 48, divergenciaJurosPercentual: 0.2, possivelAnatocismo: true, financiamentoId: 1, instituicao: "Caixa" },
        { numero: 2, mes: "2026-02", jurosTeorico: 95, jurosCobrado: 115, amortizacaoTeorica: 50, amortizacaoCobrada: 48, divergenciaJurosPercentual: 0.21, possivelAnatocismo: true, financiamentoId: 1, instituicao: "Caixa" },
        { numero: 1, mes: "2026-01", jurosTeorico: 200, jurosCobrado: 230, amortizacaoTeorica: 80, amortizacaoCobrada: 78, divergenciaJurosPercentual: 0.15, possivelAnatocismo: true, financiamentoId: 2, instituicao: "Bradesco" },
      ],
    });
    const { textos } = await gerarComTextos(dados);
    // 3 parcelas, em 2 financiamentos distintos (ids 1 e 2)
    expect(textos.some((t) => t.includes("3 parcela(s)") && t.includes("2 financiamento(s)"))).toBe(true);
    expect(textos.some((t) => t.includes("Bradesco"))).toBe(true);
  });

  it("consistência entre módulos: cada tipo de achado aparece com sua contagem correta", async () => {
    const dados = dadosLaudoBase({
      caucoesSemTransacao: [{ caucaoId: 1, imovelId: 1, imovelApelido: "Kitnet 1", locatario: "Fulano", valorInicial: 1000, dataDeposito: "2026-01-01" }],
      transacoesCaucaoSemRegistro: [
        { transacaoId: 1, imovelApelido: "Kitnet 1", valor: 500, data: "2026-01-02" },
        { transacaoId: 2, imovelApelido: "Kitnet 2", valor: 700, data: "2026-01-03" },
      ],
      financiamentosSemLancamento: [],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("1 caução(ões) cadastrada(s)"))).toBe(true);
    expect(textos.some((t) => t.includes("2 transação(ões) de caução"))).toBe(true);
    // financiamentosSemLancamento vazio: não deve gerar a linha de financiamento
    expect(textos.some((t) => t.includes("financiamento(s) sem nenhuma parcela"))).toBe(false);
  });

  it("consistência entre módulos: todos os achados vazios (default) não desenha a seção 'Consistência'", async () => {
    const { textos } = await gerarComTextos(dadosLaudoBase());
    expect(textos.some((t) => t.includes("Consistência entre módulos"))).toBe(false);
  });

  it("análise vertical/horizontal: ignora linhas 'transferencia' e mantém só as 10 maiores por valor absoluto", async () => {
    const analiseVertical = [
      { codigo: "9.0", descricao: "Transferência interna", grupo: "transferencia" as const, total: 999999, percentualSobreReceita: null },
      ...Array.from({ length: 12 }, (_, i) => ({
        codigo: `2.${i}`,
        descricao: `Despesa ${i}`,
        grupo: "despesa" as const,
        total: -(100 + i), // valores crescentes em módulo: 2.11 tem o maior valor absoluto
        percentualSobreReceita: 5,
      })),
    ];
    const dados = dadosLaudoBase({ analiseVertical, analiseHorizontal: [] });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Transferência interna"))).toBe(false);
    // a maior despesa (índice 11, total -111) deve aparecer; a menor (índice 0, total -100)
    // fica de fora das 10 maiores
    expect(textos.some((t) => t.includes("Despesa 11"))).toBe(true);
    expect(textos.some((t) => t.includes("Despesa 0 "))).toBe(false);
  });
});

describe("baixarLaudoPdf", () => {
  it("persiste o documento gerado no histórico do banco com hash e tipo corretos", async () => {
    const db = await criarBancoDeTeste();
    const dados = dadosLaudoBase({ periodoFim: "2026-03-31" });

    await baixarLaudoPdf(db, dados, "laudo-marco-2026.pdf");

    const historico = consultar<{ tipo: string; nome_arquivo: string; data_emissao: string; hash_sha256: string; contrato_id: number | null; imovel_id: number | null }>(
      db,
      "SELECT * FROM documentos_gerados",
    );
    expect(historico).toHaveLength(1);
    expect(historico[0].tipo).toBe("laudo_pericial");
    expect(historico[0].nome_arquivo).toBe("laudo-marco-2026.pdf");
    expect(historico[0].data_emissao).toBe("2026-03-31");
    expect(historico[0].hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    // laudo é do portfólio inteiro, nunca amarrado a um contrato/imóvel específico
    expect(historico[0].contrato_id).toBeNull();
    expect(historico[0].imovel_id).toBeNull();
  });

  it("dois laudos com conteúdo diferente geram hashes diferentes", async () => {
    const db = await criarBancoDeTeste();
    await baixarLaudoPdf(db, dadosLaudoBase({ periodoFim: "2026-01-31" }), "laudo-1.pdf");
    await baixarLaudoPdf(db, dadosLaudoBase({ periodoFim: "2026-02-28" }), "laudo-2.pdf");

    executar(db, "UPDATE documentos_gerados SET gerado_em = ? WHERE nome_arquivo = ?", ["2026-01-01T00:00:00.000Z", "laudo-1.pdf"]);
    executar(db, "UPDATE documentos_gerados SET gerado_em = ? WHERE nome_arquivo = ?", ["2026-02-01T00:00:00.000Z", "laudo-2.pdf"]);

    const [laudo1, laudo2] = consultar<{ hash_sha256: string }>(db, "SELECT hash_sha256 FROM documentos_gerados ORDER BY gerado_em ASC");
    expect(laudo1.hash_sha256).not.toBe(laudo2.hash_sha256);
  });
});
