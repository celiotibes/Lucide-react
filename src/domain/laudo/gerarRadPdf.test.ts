import { describe, expect, it, vi } from "vitest";
import type JsPdf from "jspdf";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { gerarRadPdf, baixarRadPdf } from "./gerarRadPdf";
import type { DadosRad } from "./gerarRadPdf";
import { Escritor } from "./escritorPdf";
import type { ContratoLocacao, Imovel, ItemInventarioBem } from "../types";
import type { ResultadoCalculoCaucao } from "../caucao/calculoCaucao";

function imovelBase(overrides: Partial<Imovel> = {}): Imovel {
  return {
    id: 1,
    apelido: "Kitnet 302",
    tipo: "kitnet",
    financiado: 0,
    uso_pessoal: 0,
    regime_patrimonial: "proprio",
    ...overrides,
  };
}

function contratoBase(overrides: Partial<ContratoLocacao> = {}): ContratoLocacao {
  return {
    id: 1,
    imovel_id: 1,
    locatario: "Fulano de Tal",
    tipo: "residencial_fixo",
    valor_referencia: 1000,
    percentual_aluguel_efetivo: 100,
    data_inicio: "2025-01-01",
    multa_percentual: 2,
    multa_ate_dias: 30,
    multa_percentual_substitutiva: 20,
    juros_mensal_percentual: 1,
    honorarios_percentual: 20,
    dias_gatilho_judicial: 30,
    duracao_minima_meses: 12,
    multa_rescisoria_teto_meses: 6,
    ...overrides,
  };
}

function resultadoCaucaoBase(overrides: Partial<ResultadoCalculoCaucao> = {}): ResultadoCalculoCaucao {
  return {
    caucao: {
      id: 1,
      contrato_id: 1,
      valor_inicial: 1000,
      data_deposito: "2025-01-01",
      indice_correcao: "poupanca",
    },
    saldoCorrigido: 1050,
    valorADevolver: 1050,
    mesesSemIndiceDisponivel: [],
    ...overrides,
  };
}

function dadosRadBase(overrides: Partial<DadosRad> = {}): DadosRad {
  return {
    imovel: imovelBase(),
    contrato: contratoBase(),
    resultadoCaucao: resultadoCaucaoBase(),
    itensInventario: [],
    dataEmissao: "2026-01-31",
    ...overrides,
  };
}

/** Mesma técnica (e mesma razão) de gerarLaudoPdf.test.ts: espiona Escritor.prototype em vez
 * de jsPDF.prototype.text, porque text() é atribuído como propriedade própria de cada
 * instância de jsPDF (não vive no protótipo) — vi.spyOn(JsPdf.prototype, "text") lançaria
 * "The property 'text' is not defined on the object". Escritor é onde o conteúdo dinâmico de
 * gerarRadPdf() de fato entra no documento, então espionar ali é equivalente e funciona. */
async function gerarComTextos(dados: DadosRad): Promise<{ doc: JsPdf; textos: string[] }> {
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

  const doc = await gerarRadPdf(dados);

  spyTitulo.mockRestore();
  spySecao.mockRestore();
  spyParagrafo.mockRestore();
  spyLinhaTabela.mockRestore();

  return { doc, textos };
}

describe("gerarRadPdf", () => {
  it("caminho feliz: gera um PDF válido (>0 bytes, 1 página) com dados mínimos", async () => {
    const doc = await gerarRadPdf(dadosRadBase());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = doc.output("arraybuffer") as ArrayBuffer;
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("cabeçalho: inclui imóvel, locatário e período do contrato", async () => {
    const dados = dadosRadBase({
      imovel: imovelBase({ apelido: "Kitnet 302", endereco: "Rua das Flores, 10" }),
      contrato: contratoBase({ locatario: "Maria Souza", data_inicio: "2024-05-01", data_fim: "2026-01-15" }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Kitnet 302") && t.includes("Rua das Flores, 10"))).toBe(true);
    expect(textos.some((t) => t.includes("Maria Souza"))).toBe(true);
    expect(textos.some((t) => t.includes("2024-05-01") && t.includes("2026-01-15"))).toBe(true);
  });

  it("cabeçalho: sem endereço cadastrado, não desenha o travessão de endereço", async () => {
    const dados = dadosRadBase({ imovel: imovelBase({ endereco: undefined }) });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Kitnet 302 —"))).toBe(false);
  });

  it("cabeçalho: contrato sem data_fim (ainda vigente) não menciona data final de vigência", async () => {
    const dados = dadosRadBase({ contrato: contratoBase({ data_fim: undefined }) });
    const { textos } = await gerarComTextos(dados);
    // "Saldo corrigido até <dataEmissao>" (seção 2) também contém " até " — por isso a
    // asserção é restrita à frase do cabeçalho de vigência do contrato, não a " até " em geral.
    expect(textos.some((t) => t.includes("Contrato vigente desde") && t.includes(" até "))).toBe(false);
    expect(textos.some((t) => t.includes("Contrato vigente desde 2025-01-01"))).toBe(true);
  });

  it("inventário vazio: mostra aviso para cadastrar itens antes de fechar o relatório", async () => {
    const { textos } = await gerarComTextos(dadosRadBase({ itensInventario: [] }));
    expect(textos.some((t) => t.includes("Nenhum item de inventário cadastrado"))).toBe(true);
  });

  it("inventário: lista item com valor de reposição formatado e data de vistoria", async () => {
    const itensInventario: ItemInventarioBem[] = [
      { id: 1, imovel_id: 1, descricao: "Geladeira Brastemp", valor_reposicao: 2500, data_vistoria: "2025-02-01" },
    ];
    const { textos } = await gerarComTextos(dadosRadBase({ itensInventario }));
    expect(textos.some((t) => t.includes("Geladeira Brastemp"))).toBe(true);
    expect(textos.some((t) => t.includes("2.500,00"))).toBe(true);
    expect(textos.some((t) => t === "2025-02-01")).toBe(true);
  });

  it("inventário: item sem valor de reposição mostra 'não informado'", async () => {
    const itensInventario: ItemInventarioBem[] = [{ id: 1, imovel_id: 1, descricao: "Armário" }];
    const { textos } = await gerarComTextos(dadosRadBase({ itensInventario }));
    expect(textos.some((t) => t === "não informado")).toBe(true);
  });

  it("inventário: item sem data de vistoria mostra 'não informada'", async () => {
    const itensInventario: ItemInventarioBem[] = [{ id: 1, imovel_id: 1, descricao: "Armário", valor_reposicao: 300 }];
    const { textos } = await gerarComTextos(dadosRadBase({ itensInventario }));
    expect(textos.some((t) => t === "não informada")).toBe(true);
  });

  it("inventário: item com vistoria POSTERIOR ao fim do contrato é sinalizado e listado na ressalva", async () => {
    const dados = dadosRadBase({
      contrato: contratoBase({ data_fim: "2026-01-01" }),
      itensInventario: [
        { id: 1, imovel_id: 1, descricao: "Fogão 4 bocas", valor_reposicao: 800, data_vistoria: "2026-03-01" },
        { id: 2, imovel_id: 1, descricao: "Microondas", valor_reposicao: 400, data_vistoria: "2025-12-01" },
      ],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("1 item(ns)") && t.includes("POSTERIOR"))).toBe(true);
    expect(textos.some((t) => t.includes("Fogão 4 bocas") && t.includes("(posterior ao contrato!)"))).toBe(true);
    // o item com vistoria dentro do período não deve carregar o aviso
    expect(textos.some((t) => t.includes("Microondas") && t.includes("(posterior ao contrato!)"))).toBe(false);
  });

  it("inventário: sem contrato finalizado (data_fim ausente), nenhum item é sinalizado como posterior", async () => {
    const dados = dadosRadBase({
      contrato: contratoBase({ data_fim: undefined }),
      itensInventario: [{ id: 1, imovel_id: 1, descricao: "Fogão", valor_reposicao: 800, data_vistoria: "2030-01-01" }],
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("POSTERIOR"))).toBe(false);
    expect(textos.some((t) => t.includes("(posterior ao contrato!)"))).toBe(false);
  });

  it("depósito caução: mostra valor inicial, data e índice, e o saldo corrigido na data de emissão", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({
        caucao: { id: 1, contrato_id: 1, valor_inicial: 1200, data_deposito: "2024-06-10", indice_correcao: "ipca" },
        saldoCorrigido: 1300.5,
      }),
      dataEmissao: "2026-02-28",
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("1.200,00"))).toBe(true);
    expect(textos.some((t) => t === "2024-06-10")).toBe(true);
    expect(textos.some((t) => t === "ipca")).toBe(true);
    expect(textos.some((t) => t.includes("2026-02-28") && t.includes("1.300,50"))).toBe(true);
  });

  it("deduções: sem dedução registrada, avisa para registrar antes de fechar a versão final", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({ caucao: { id: 1, contrato_id: 1, valor_inicial: 1000, data_deposito: "2025-01-01", indice_correcao: "poupanca" } }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Nenhuma dedução registrada"))).toBe(true);
  });

  it("deduções: com dedução registrada e descrita, mostra descrição e valor", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({
        caucao: {
          id: 1,
          contrato_id: 1,
          valor_inicial: 1000,
          data_deposito: "2025-01-01",
          indice_correcao: "poupanca",
          deducoes_descricao: "Pintura de parede danificada",
          deducoes_valor: 350,
        },
      }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Pintura de parede danificada") && t.includes("350,00"))).toBe(true);
    expect(textos.some((t) => t.includes("Nenhuma dedução registrada"))).toBe(false);
  });

  it("deduções: valor registrado mas sem descrição usa o texto padrão 'sem descrição detalhada'", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({
        caucao: { id: 1, contrato_id: 1, valor_inicial: 1000, data_deposito: "2025-01-01", indice_correcao: "poupanca", deducoes_valor: 200 },
      }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Dedução registrada sem descrição detalhada"))).toBe(true);
  });

  it("deduções: deducoes_valor zero é tratado como 'sem dedução', não como dedução de R$ 0,00", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({
        caucao: { id: 1, contrato_id: 1, valor_inicial: 1000, data_deposito: "2025-01-01", indice_correcao: "poupanca", deducoes_valor: 0 },
      }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("Nenhuma dedução registrada"))).toBe(true);
  });

  it("valor a devolver: combina saldo corrigido, deduções e o valor final já calculado em calculoCaucao", async () => {
    const dados = dadosRadBase({
      resultadoCaucao: resultadoCaucaoBase({
        caucao: { id: 1, contrato_id: 1, valor_inicial: 1000, data_deposito: "2025-01-01", indice_correcao: "poupanca", deducoes_valor: 150 },
        saldoCorrigido: 1050,
        valorADevolver: 900,
      }),
    });
    const { textos } = await gerarComTextos(dados);
    expect(textos.some((t) => t.includes("1.050,00") && t.includes("150,00") && t.includes("900,00"))).toBe(true);
  });
});

/** documentos_gerados.contrato_id/imovel_id são FK reais no schema — ao contrário do laudo
 * (sempre NULL, nunca amarrado a um contrato específico), o RAD é documento de UM contrato e
 * precisa das linhas correspondentes existindo em imoveis/contratos_locacao antes do INSERT. */
function inserirImovelEContrato(db: Database, imovelId: number, contratoId: number): void {
  executar(
    db,
    `INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, financiado, uso_pessoal) VALUES (?, 'Kitnet 302', 'kitnet', 'proprio', 0, 0)`,
    [imovelId],
  );
  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, percentual_aluguel_efetivo,
       multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, honorarios_percentual,
       dias_gatilho_judicial, duracao_minima_meses, multa_rescisoria_teto_meses, data_inicio)
     VALUES (?, ?, 'Fulano de Tal', 'residencial_fixo', 1000, 100, 2, 30, 20, 1, 20, 30, 12, 6, '2025-01-01')`,
    [contratoId, imovelId],
  );
}

describe("baixarRadPdf", () => {
  it("persiste o documento no histórico já vinculado ao contrato e ao imóvel (diferente do laudo, que é do portfólio inteiro)", async () => {
    const db = await criarBancoDeTeste();
    inserirImovelEContrato(db, 7, 9);
    const dados = dadosRadBase({ imovel: imovelBase({ id: 7 }), contrato: contratoBase({ id: 9 }) });

    await baixarRadPdf(db, dados, "rad-kitnet-302.pdf");

    const historico = consultar<{ tipo: string; nome_arquivo: string; data_emissao: string; hash_sha256: string; contrato_id: number | null; imovel_id: number | null }>(
      db,
      "SELECT * FROM documentos_gerados",
    );
    expect(historico).toHaveLength(1);
    expect(historico[0].tipo).toBe("rad");
    expect(historico[0].nome_arquivo).toBe("rad-kitnet-302.pdf");
    expect(historico[0].hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(historico[0].contrato_id).toBe(9);
    expect(historico[0].imovel_id).toBe(7);
  });

  it("dois RADs com conteúdo diferente geram hashes diferentes", async () => {
    const db = await criarBancoDeTeste();
    inserirImovelEContrato(db, 1, 1);
    await baixarRadPdf(db, dadosRadBase({ dataEmissao: "2026-01-31" }), "rad-1.pdf");
    await baixarRadPdf(db, dadosRadBase({ dataEmissao: "2026-02-28" }), "rad-2.pdf");

    executar(db, "UPDATE documentos_gerados SET gerado_em = ? WHERE nome_arquivo = ?", ["2026-01-01T00:00:00.000Z", "rad-1.pdf"]);
    executar(db, "UPDATE documentos_gerados SET gerado_em = ? WHERE nome_arquivo = ?", ["2026-02-01T00:00:00.000Z", "rad-2.pdf"]);

    const [rad1, rad2] = consultar<{ hash_sha256: string }>(db, "SELECT hash_sha256 FROM documentos_gerados ORDER BY gerado_em ASC");
    expect(rad1.hash_sha256).not.toBe(rad2.hash_sha256);
  });
});
