import type { default as jsPDF } from "jspdf";
import type { LinhaDre } from "../types";
import type { TransacaoDuplicada, OutlierEstatistico, LacunaMensal } from "../auditoria/auditoriaForense";
import type { StatusInadimplencia } from "../types";
import type { CapacidadeContributiva } from "../reports/capacidadeContributiva";
import type { LinhaAnaliseVertical, LinhaAnaliseHorizontal } from "../reports/analiseVerticalHorizontal";
import type { PatrimonioLiquido, LiquidezCorrente } from "../patrimonio/balancoPatrimonial";
import type { DesempenhoImovel } from "../reports/desempenhoPorImovel";
import { formatarMoeda } from "../formatarMoeda";

export interface DadosLaudo {
  periodoInicio: string;
  periodoFim: string;
  linhasDre: LinhaDre[];
  statusInadimplencia: StatusInadimplencia[];
  duplicatas: TransacaoDuplicada[];
  outliers: OutlierEstatistico[];
  lacunas: LacunaMensal[];
  capacidadeContributiva: CapacidadeContributiva;
  analiseVertical: LinhaAnaliseVertical[];
  analiseHorizontal: LinhaAnaliseHorizontal[];
  patrimonioLiquido: PatrimonioLiquido;
  liquidezCorrente: LiquidezCorrente;
  passivoCaucaoRetido: number;
  saldoCaixaAtual: number;
  desempenhoImoveis: DesempenhoImovel[];
}

/** Substitui variantes Unicode de hífen/menos (ex: MINUS SIGN "−" U+2212) por hífen ASCII
 * antes de desenhar no PDF. A fonte padrão helvetica do jsPDF usa WinAnsiEncoding, que
 * cobre bem acentuação portuguesa e até travessão/aspas curvas (—, –, ", ") — mas não
 * esses sinais de menos matemáticos, que quebram o kerning e renderizam letra por letra
 * (bug real encontrado e corrigido nesta seção). Aplicado a TODO texto que passa por
 * paragrafo()/linhaTabela(), não só às strings fixas — texto dinâmico (nome de
 * locatário, descrição bancária crua do OFX) pode conter o mesmo caractere. */
function sanitizarTextoPdf(texto: string): string {
  return texto.replace(/[−‐‑‒―]/g, "-").replace(/ /g, " ");
}

const MARGEM = 18;
const LARGURA_UTIL = 210 - MARGEM * 2;

class Escritor {
  doc: jsPDF;
  y = MARGEM;

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  private quebrarPaginaSeNecessario(alturaLinha: number) {
    if (this.y + alturaLinha > 297 - MARGEM) {
      this.doc.addPage();
      this.y = MARGEM;
    }
  }

  titulo(texto: string) {
    this.quebrarPaginaSeNecessario(10);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(texto, MARGEM, this.y);
    this.y += 8;
  }

  secao(texto: string) {
    this.quebrarPaginaSeNecessario(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11.5);
    this.doc.text(texto, MARGEM, this.y);
    this.y += 6.5;
  }

  paragrafo(texto: string) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    const linhas = this.doc.splitTextToSize(sanitizarTextoPdf(texto), LARGURA_UTIL);
    for (const linha of linhas) {
      this.quebrarPaginaSeNecessario(5);
      this.doc.text(linha, MARGEM, this.y);
      this.y += 4.6;
    }
    this.y += 2;
  }

  /** Corta texto que estouraria a largura da coluna, medindo a largura real no jsPDF
   * (fonte/tamanho já ajustados por quem chama) — antes o corte era só num ponto do
   * arquivo, com um limite de caracteres chutado; qualquer outra coluna com texto longo
   * (descrição bancária crua, nome de locatário) colava visualmente na coluna seguinte. */
  private truncarParaLargura(texto: string, larguraMm: number): string {
    const larguraDisponivel = larguraMm - 1;
    if (this.doc.getTextWidth(texto) <= larguraDisponivel) return texto;
    let cortado = texto;
    while (cortado.length > 1 && this.doc.getTextWidth(`${cortado}…`) > larguraDisponivel) {
      cortado = cortado.slice(0, -1);
    }
    return `${cortado}…`;
  }

  linhaTabela(colunas: string[], larguras: number[], negrito = false) {
    this.quebrarPaginaSeNecessario(5.5);
    this.doc.setFont("helvetica", negrito ? "bold" : "normal");
    this.doc.setFontSize(9);
    let x = MARGEM;
    colunas.forEach((coluna, indice) => {
      this.doc.text(this.truncarParaLargura(sanitizarTextoPdf(coluna), larguras[indice]), x, this.y);
      x += larguras[indice];
    });
    this.y += 5;
  }

  espaco(altura = 4) {
    this.y += altura;
  }
}

/** Monta o laudo em PDF: metodologia, DRE do período, inadimplência e achados de
 * auditoria forense — o mesmo tipo de documento que Ábacus/Peritus/ForenseAI
 * entregam para anexar a processo judicial. Revisão humana obrigatória antes de
 * protocolar: este é um apoio à instrução, não uma peça jurídica pronta.
 * jspdf só é importado quando o laudo é de fato gerado — import() dinâmico tira o
 * pacote (que arrasta html2canvas) do bundle inicial da aplicação. */
export async function gerarLaudoPdf(dados: DadosLaudo): Promise<jsPDF> {
  const { default: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const w = new Escritor(doc);

  w.titulo("CRMT Histórico Contábil & Financeiro");
  w.secao("Laudo de reconstituição contábil");
  w.paragrafo(
    `Período analisado: ${dados.periodoInicio} a ${dados.periodoFim}. Documento gerado localmente pelo CRMT ` +
      `Histórico Contábil & Financeiro, a partir de extratos bancários, contratos de locação e comprovantes ` +
      `importados pelo próprio interessado. Não substitui a análise de um contador ou perito habilitado.`,
  );
  w.espaco(2);

  w.secao("1. Metodologia");
  w.paragrafo(
    "Os lançamentos foram extraídos de extratos bancários (OFX/CSV/PDF), XML de nota fiscal e comprovantes " +
      "fotografados, categorizados por regra determinística e revisão manual, e conciliados contra os contratos de " +
      "locação vigentes com tolerância de 5% no valor e 10 dias na data de vencimento. Despesas coletivas foram " +
      "rateadas entre imóveis por fração ideal, área ou divisão igual, conforme indicado em cada lançamento. O " +
      "regime de caixa (data efetiva de entrada/saída) foi usado para a reconstituição do fluxo; o DRE demonstra o " +
      "resultado por competência dentro do mesmo período.",
  );

  const cc = dados.capacidadeContributiva;
  w.secao("2. Capacidade contributiva real");
  w.paragrafo(
    "Recebimento bruto não equivale a capacidade de pagar: parte do valor recebido é reembolso de custeio " +
      "(rateio de água/energia/condomínio repassado pelo locatário, sem natureza de renda) e o restante ainda é " +
      "consumido por despesa operacional (manutenção, prestadores, financiamento, taxas). O resultado líquido real " +
      "abaixo é o que efetivamente sobra, decomposto passo a passo.",
  );
  w.linhaTabela(["Total recebido bruto", formatarMoeda(cc.totalRecebidoBruto)], [110, 64], true);
  w.linhaTabela(["(-) Reembolso de rateio (não tributável)", formatarMoeda(cc.reembolsoNaoTributavel)], [110, 64]);
  w.linhaTabela(["(-) Despesa operacional", formatarMoeda(cc.despesaOperacionalTotal)], [110, 64]);
  w.linhaTabela(["= Resultado líquido real", formatarMoeda(cc.resultadoLiquidoReal)], [110, 64], true);
  if (cc.percentualDisponivelSobreRecebido !== null) {
    w.espaco(1);
    w.paragrafo(
      `Apenas ${cc.percentualDisponivelSobreRecebido.toFixed(1)}% do valor bruto recebido no período corresponde a ` +
        `resultado líquido real disponível — o restante é reembolso de terceiros ou já foi consumido por custo de operação.`,
    );
  }
  w.espaco(4);

  w.secao("3. Demonstração de resultado (DRE) do período");
  w.linhaTabela(["Código", "Descrição", "Grupo", "Valor"], [20, 90, 25, 45], true);
  let receitaTotal = 0;
  let despesaTotal = 0;
  for (const linha of dados.linhasDre) {
    w.linhaTabela([linha.codigo, linha.descricao, linha.grupo, formatarMoeda(linha.total)], [20, 90, 25, 45]);
    if (linha.grupo === "receita") receitaTotal += linha.total;
    else despesaTotal += linha.total;
  }
  w.espaco(1);
  w.linhaTabela(["", "Resultado líquido", "", formatarMoeda(receitaTotal + despesaTotal)], [20, 90, 25, 45], true);
  w.espaco(4);

  w.secao("3.1 Análise vertical e horizontal do DRE");
  w.paragrafo(
    "Cada linha como % da receita do período (vertical) e sua variação contra o período imediatamente anterior de " +
      "mesma duração (horizontal) — evidencia se o custo subiu na mesma proporção da receita (capacidade " +
      "contributiva estável) ou ficou para trás (capacidade contributiva caindo apesar da receita bruta subir). " +
      "Com período de análise longo (ex: 3 anos), a comparação horizontal usa como base os 3 anos anteriores ao " +
      "início do período — se a atividade ainda não existia ou tinha poucas transações nessa janela-base, a " +
      "variação percentual perde significado; para isso, use um período mais curto (ex: 12 meses) ao interpretar a " +
      "coluna de variação.",
  );
  const linhasRelevantes = dados.analiseVertical
    .filter((l) => l.grupo !== "transferencia")
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, 10);
  if (linhasRelevantes.length > 0) {
    const porCodigoHorizontal = new Map(dados.analiseHorizontal.map((l) => [l.codigo, l]));
    w.linhaTabela(["Categoria", "Valor (período)", "% receita", "Variação vs. anterior"], [70, 40, 25, 39], true);
    for (const l of linhasRelevantes) {
      const horizontal = porCodigoHorizontal.get(l.codigo);
      const variacaoTexto = horizontal?.variacaoPercentual != null ? `${horizontal.variacaoPercentual >= 0 ? "+" : ""}${horizontal.variacaoPercentual.toFixed(1)}%` : "novo";
      const percentualTexto = l.percentualSobreReceita != null ? `${l.percentualSobreReceita.toFixed(1)}%` : "—";
      w.linhaTabela([`${l.codigo} · ${l.descricao}`, formatarMoeda(l.total), percentualTexto, variacaoTexto], [70, 40, 25, 39]);
    }
  }
  w.espaco(4);

  const pl = dados.patrimonioLiquido;
  const liq = dados.liquidezCorrente;
  w.secao("4. Patrimônio líquido e alavancagem");
  w.paragrafo(
    "Possuir vários imóveis não significa ter liquidez disponível: o ativo imobilizado só vira dinheiro se vendido, " +
      "enquanto financiamentos e dívidas de consumo são exigíveis presentes. O indicador abaixo separa patrimônio " +
      "(bens menos dívidas) de liquidez corrente (caixa disponível frente aos compromissos de curto prazo).",
  );
  w.linhaTabela(["Ativo imobiliário (valor venal, imóveis próprios)", formatarMoeda(pl.ativoImobiliario)], [110, 64], true);
  w.linhaTabela(["(-) Passivo de financiamentos", formatarMoeda(pl.passivoFinanciamentos)], [110, 64]);
  w.linhaTabela(["(-) Passivo de dívidas de consumo", formatarMoeda(pl.passivoConsumo)], [110, 64]);
  w.linhaTabela(["= Patrimônio líquido", formatarMoeda(pl.patrimonioLiquido)], [110, 64], true);
  if (pl.imoveisSemValorVenal.length > 0) {
    w.espaco(1);
    w.paragrafo(
      `Excluídos do ativo por falta de valor venal cadastrado (não estimado): ${pl.imoveisSemValorVenal.join(", ")}.`,
    );
  }
  w.espaco(2);
  w.linhaTabela(["Caixa disponível hoje", formatarMoeda(liq.saldoCaixaAtual)], [110, 64]);
  w.linhaTabela(["Passivo circulante (dívida + caução, 12 meses)", formatarMoeda(liq.passivoCirculante)], [110, 64]);
  w.linhaTabela(
    ["Índice de liquidez corrente", liq.indiceLiquidezCorrente !== null ? liq.indiceLiquidezCorrente.toFixed(2) : "indefinido (sem passivo circulante)"],
    [110, 64],
    true,
  );
  w.espaco(4);

  const emAberto = dados.statusInadimplencia.filter((s) => s.diasAtraso > 0);
  w.secao("5. Inadimplência");
  if (emAberto.length === 0) {
    w.paragrafo("Nenhuma competência em aberto identificada dentro do período analisado.");
  } else {
    const totalEmAberto = emAberto.reduce((acc, s) => acc + s.totalDevido, 0);
    w.paragrafo(`${emAberto.length} competência(s) em aberto, totalizando ${formatarMoeda(totalEmAberto)} (valor original + multa + juros de mora contratuais).`);
    w.linhaTabela(["Competência", "Valor devido", "Dias de atraso", "Situação"], [40, 45, 40, 45], true);
    for (const s of emAberto.slice(0, 25)) {
      w.linhaTabela([s.competencia.mes_referencia.slice(0, 7), formatarMoeda(s.totalDevido), String(s.diasAtraso), s.situacao], [40, 45, 40, 45]);
    }
    if (emAberto.length > 25) w.paragrafo(`(+${emAberto.length - 25} competência(s) adicional(is) — ver relatório completo no sistema.)`);
  }
  w.espaco(4);

  w.secao("6. Passivo de caução");
  w.paragrafo(
    "Depósito caução não é receita — é obrigação de devolver, corrigida mês a mês pelo índice contratado. O " +
      "indicador abaixo compara o total ainda retido contra o caixa disponível hoje: se o caixa não cobre o " +
      "passivo, parte do dinheiro do caução já foi consumida no fluxo geral em vez de mantida em reserva.",
  );
  const caucaoDescoberto = dados.saldoCaixaAtual < dados.passivoCaucaoRetido;
  w.linhaTabela(["Passivo de caução retido (corrigido)", formatarMoeda(dados.passivoCaucaoRetido)], [110, 64]);
  w.linhaTabela(["Caixa disponível hoje", formatarMoeda(dados.saldoCaixaAtual)], [110, 64]);
  w.linhaTabela(["Cobertura", caucaoDescoberto ? `descoberto em ${formatarMoeda(dados.passivoCaucaoRetido - dados.saldoCaixaAtual)}` : "coberto"], [110, 64], true);
  w.espaco(4);

  w.secao("7. Desempenho por imóvel");
  w.paragrafo("Resultado líquido do período por imóvel, do maior para o menor — a receita do portfólio não se distribui de forma uniforme entre as unidades.");
  if (dados.desempenhoImoveis.length > 0) {
    w.linhaTabela(["Imóvel", "Receita", "Despesa", "Resultado"], [70, 35, 35, 34], true);
    for (const d of dados.desempenhoImoveis) {
      w.linhaTabela([d.imovel.apelido, formatarMoeda(d.receita), formatarMoeda(d.despesa), formatarMoeda(d.resultadoLiquido)], [70, 35, 35, 34]);
    }
  } else {
    w.paragrafo("Nenhum imóvel cadastrado (excluídos os de uso pessoal, que não entram na atividade de locação).");
  }
  w.espaco(4);

  w.secao("8. Achados de auditoria forense");
  w.paragrafo(
    `Duplicidades: ${dados.duplicatas.length}. Outliers estatísticos (>3 desvios-padrão da categoria): ${dados.outliers.length}. ` +
      `Lacunas em despesas recorrentes: ${dados.lacunas.length}.`,
  );
  if (dados.duplicatas.length > 0) {
    w.linhaTabela(["Data", "Descrição", "Valor", "Ocorrências"], [30, 90, 35, 30], true);
    for (const d of dados.duplicatas.slice(0, 10)) {
      w.linhaTabela([d.data, d.descricao_original, formatarMoeda(d.valor), `${d.ocorrencias}x`], [30, 90, 35, 30]);
    }
  }
  if (dados.outliers.length > 0) {
    w.espaco(2);
    w.linhaTabela(["Data", "Descrição", "Valor", "Z-score"], [30, 90, 35, 30], true);
    for (const o of dados.outliers.slice(0, 10)) {
      w.linhaTabela([o.data, o.descricao, formatarMoeda(o.valor), o.zScore.toFixed(1)], [30, 90, 35, 30]);
    }
  }
  w.espaco(6);

  w.secao("9. Ressalvas");
  w.paragrafo(
    "Este laudo é um apoio à organização documental e não constitui parecer contábil ou pericial formal. Valores, " +
      "critérios de rateio e categorizações devem ser conferidos por um contador ou perito habilitado antes de uso " +
      "em juízo. Divergências identificadas na seção de auditoria forense são indícios estatísticos, não conclusões — " +
      "cada uma deve ser investigada contra o documento-fonte correspondente. As figuras de \"caixa disponível hoje\" " +
      "(seções 4 e 6) somam todas as transações lançadas no sistema — são um proxy válido do saldo real apenas se o " +
      "histórico bancário importado cobrir o período inteiro desde a abertura das contas; um mês faltando no meio " +
      "do histórico distorce a liquidez corrente e a cobertura de caução mostradas. Em síntese: a receita bruta " +
      "recebida no período (seção 2) não equivale a capacidade contributiva, dado o reembolso de rateio sem " +
      "natureza de renda, a despesa operacional necessária à manutenção dos imóveis, a alavancagem e o " +
      "comprometimento de renda com dívida (seção 4) e o passivo de caução ainda a devolver (seção 6).",
  );

  w.espaco(10);
  w.paragrafo(`Documento gerado em ${new Date().toLocaleString("pt-BR")}.`);

  return doc;
}

export async function baixarLaudoPdf(dados: DadosLaudo, nomeArquivo: string): Promise<void> {
  const doc = await gerarLaudoPdf(dados);
  doc.save(nomeArquivo);
}
