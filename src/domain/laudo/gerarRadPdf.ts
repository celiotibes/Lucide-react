import type { default as jsPDF } from "jspdf";
import { Escritor } from "./escritorPdf";
import { formatarMoeda } from "../formatarMoeda";
import type { ResultadoCalculoCaucao } from "../caucao/calculoCaucao";
import type { ContratoLocacao, Imovel, ItemInventarioBem } from "../types";

export interface DadosRad {
  imovel: Imovel;
  contrato: ContratoLocacao;
  resultadoCaucao: ResultadoCalculoCaucao;
  itensInventario: ItemInventarioBem[];
  dataEmissao: string;
}

/** Monta o Relatório de Apuração de Débitos (RAD) em PDF — o documento que contratos reais
 * (ex: Anexo II) exigem ao final da locação: inventário de bens entregues + deduções apuradas
 * na vistoria de saída + cálculo de quanto sobra da caução para devolver. Nunca calcula uma
 * dedução por conta própria — usa só o que já está registrado no depósito caução
 * (caucoes.deducoes_descricao/deducoes_valor); se nada foi registrado, o relatório deixa
 * isso explícito em vez de presumir "sem danos". jsPDF só é importado quando o RAD é de fato
 * gerado, mesmo padrão de gerarLaudoPdf(). */
export async function gerarRadPdf(dados: DadosRad): Promise<jsPDF> {
  const { default: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const w = new Escritor(doc);
  const { imovel, contrato, resultadoCaucao, itensInventario, dataEmissao } = dados;
  const { caucao, saldoCorrigido, valorADevolver } = resultadoCaucao;

  w.titulo("CRMT Histórico Contábil & Financeiro");
  w.secao("Relatório de Apuração de Débitos (RAD)");
  w.paragrafo(
    `Imóvel: ${imovel.apelido}${imovel.endereco ? ` — ${imovel.endereco}` : ""}. Locatário: ${contrato.locatario}. ` +
      `Contrato vigente desde ${contrato.data_inicio}${contrato.data_fim ? ` até ${contrato.data_fim}` : ""}. ` +
      `Documento gerado localmente em ${dataEmissao}, apoio à instrução — não substitui a vistoria física nem a análise de um contador ou perito habilitado.`,
  );
  w.espaco(2);

  w.secao("1. Inventário de bens registrado na entrada");
  if (itensInventario.length > 0) {
    w.paragrafo(
      "Mobiliário e equipamentos entregues com o imóvel, com valor de reposição de referência. " +
        "A confirmação de que cada item permanece íntegro depende da vistoria de saída — este " +
        "relatório não presume avaria nem integridade sem uma vistoria registrada.",
    );
    w.linhaTabela(["Item", "Valor de reposição"], [140, 40], true);
    for (const item of itensInventario) {
      w.linhaTabela(
        [item.descricao, item.valor_reposicao !== undefined && item.valor_reposicao !== null ? formatarMoeda(item.valor_reposicao) : "não informado"],
        [140, 40],
      );
    }
  } else {
    w.paragrafo("Nenhum item de inventário cadastrado para este imóvel — cadastre em Imóveis antes de fechar este relatório para fins periciais.");
  }
  w.espaco(4);

  w.secao("2. Depósito caução");
  w.linhaTabela(["Valor inicial", "Data do depósito", "Índice de correção"], [60, 60, 60], true);
  w.linhaTabela([formatarMoeda(caucao.valor_inicial), caucao.data_deposito, caucao.indice_correcao], [60, 60, 60]);
  w.espaco(2);
  w.paragrafo(`Saldo corrigido até ${dataEmissao}: ${formatarMoeda(saldoCorrigido)}.`);
  w.espaco(4);

  w.secao("3. Deduções apuradas");
  if ((caucao.deducoes_valor ?? 0) > 0) {
    w.paragrafo(`${caucao.deducoes_descricao ?? "Dedução registrada sem descrição detalhada."} — ${formatarMoeda(caucao.deducoes_valor ?? 0)}.`);
  } else {
    w.paragrafo(
      "Nenhuma dedução registrada até o momento. Se a vistoria de saída já ocorreu e apurou dano ou " +
        "débito, registre a descrição e o valor no cadastro do depósito caução antes de emitir a versão final deste relatório.",
    );
  }
  w.espaco(4);

  w.secao("4. Valor a devolver");
  w.paragrafo(`Saldo corrigido (${formatarMoeda(saldoCorrigido)}) menos deduções (${formatarMoeda(caucao.deducoes_valor ?? 0)}) = ${formatarMoeda(valorADevolver)}.`);

  return doc;
}

export async function baixarRadPdf(dados: DadosRad, nomeArquivo: string): Promise<void> {
  const doc = await gerarRadPdf(dados);
  doc.save(nomeArquivo);
}
