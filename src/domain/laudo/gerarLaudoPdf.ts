import jsPDF from "jspdf";
import type { LinhaDre } from "../types";
import type { TransacaoDuplicada, OutlierEstatistico, LacunaMensal } from "../auditoria/auditoriaForense";
import type { StatusInadimplencia } from "../types";

export interface DadosLaudo {
  periodoInicio: string;
  periodoFim: string;
  linhasDre: LinhaDre[];
  statusInadimplencia: StatusInadimplencia[];
  duplicatas: TransacaoDuplicada[];
  outliers: OutlierEstatistico[];
  lacunas: LacunaMensal[];
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const linhas = this.doc.splitTextToSize(texto, LARGURA_UTIL);
    for (const linha of linhas) {
      this.quebrarPaginaSeNecessario(5);
      this.doc.text(linha, MARGEM, this.y);
      this.y += 4.6;
    }
    this.y += 2;
  }

  linhaTabela(colunas: string[], larguras: number[], negrito = false) {
    this.quebrarPaginaSeNecessario(5.5);
    this.doc.setFont("helvetica", negrito ? "bold" : "normal");
    this.doc.setFontSize(9);
    let x = MARGEM;
    colunas.forEach((coluna, indice) => {
      this.doc.text(coluna, x, this.y, { maxWidth: larguras[indice] });
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
 * protocolar: este é um apoio à instrução, não uma peça jurídica pronta. */
export function gerarLaudoPdf(dados: DadosLaudo): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = new Escritor(doc);

  w.titulo("Laudo de reconstituição contábil");
  w.paragrafo(
    `Período analisado: ${dados.periodoInicio} a ${dados.periodoFim}. Documento gerado localmente pelo sistema de ` +
      `reconstituição contábil, a partir de extratos bancários, contratos de locação e comprovantes importados pelo ` +
      `próprio interessado. Não substitui a análise de um contador ou perito habilitado.`,
  );
  w.espaco(2);

  w.secao("1. Metodologia");
  w.paragrafo(
    "Os lançamentos foram extraídos de extratos bancários (OFX/CSV/PDF) e comprovantes fotografados, categorizados " +
      "por regra determinística e revisão manual, e conciliados contra os contratos de locação vigentes com " +
      "tolerância de 5% no valor e 10 dias na data de vencimento. Despesas coletivas foram rateadas entre imóveis " +
      "por fração ideal, área ou divisão igual, conforme indicado em cada lançamento.",
  );

  w.secao("2. Demonstração de resultado (DRE) do período");
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

  const emAberto = dados.statusInadimplencia.filter((s) => s.diasAtraso > 0);
  w.secao("3. Inadimplência");
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

  w.secao("4. Achados de auditoria forense");
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

  w.secao("5. Ressalvas");
  w.paragrafo(
    "Este laudo é um apoio à organização documental e não constitui parecer contábil ou pericial formal. Valores, " +
      "critérios de rateio e categorizações devem ser conferidos por um contador ou perito habilitado antes de uso " +
      "em juízo. Divergências identificadas na seção de auditoria forense são indícios estatísticos, não conclusões — " +
      "cada uma deve ser investigada contra o documento-fonte correspondente.",
  );

  w.espaco(10);
  w.paragrafo(`Documento gerado em ${new Date().toLocaleString("pt-BR")}.`);

  return doc;
}

export function baixarLaudoPdf(dados: DadosLaudo, nomeArquivo: string): void {
  gerarLaudoPdf(dados).save(nomeArquivo);
}
