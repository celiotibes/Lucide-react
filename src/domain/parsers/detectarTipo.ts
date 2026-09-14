import type { TransacaoBruta } from "./ofx";
import { analisarOfx } from "./ofx";
import { analisarCsv } from "./csv";
import { extrairTextoPdf, classificarDocumentoPdf } from "./pdfDocumento";
import { extrairLinhasExtrato, extrairLinhasFatura } from "./linhasTransacao";
import { ocrImagem, extrairCamposComprovante, comprovanteParaTransacao } from "./ocrImagem";

export type TipoArquivoDetectado =
  | "ofx"
  | "csv"
  | "pdf_extrato"
  | "pdf_fatura"
  | "pdf_desconhecido"
  | "imagem_comprovante"
  | "open_finance"
  | "nao_suportado";

export interface ResultadoImportacao {
  tipoDetectado: TipoArquivoDetectado;
  transacoes: TransacaoBruta[];
  avisos: string[];
}

// Uma linha de extrato/fatura real quase sempre tem "algo parecido com data" — se o PDF tem
// conteúdo de sobra mas a extração não achou NENHUM lançamento, o motivo quase certo é que o
// layout deste banco/administradora específico não bate com o padrão que REGEX_LINHA
// (linhasTransacao.ts) reconhece — nunca um extrato genuinamente vazio. Achado de auditoria:
// com 3+ bancos diferentes envolvidos no caso, um layout não reconhecido silenciosamente virava
// "0 transações encontradas" sem nenhuma explicação, fácil de confundir com "este PDF
// realmente não tem lançamento nenhum".
export function contarLinhasComData(linhas: string[]): number {
  return linhas.filter((l) => /\d{2}\/\d{2}(\/\d{2,4})?/.test(l)).length;
}

export function avisoExtracaoPdfVazia(tipoDocumento: "extrato" | "fatura", transacoesExtraidas: number, linhasComData: number): string[] {
  if (transacoesExtraidas > 0 || linhasComData < 3) return [];
  const rotulo = tipoDocumento === "extrato" ? "extrato" : "fatura";
  return [
    `O PDF parece ter ${linhasComData} linha(s) com data, mas nenhum lançamento foi reconhecido — o layout deste ${rotulo} pode ser diferente do padrão esperado (comum ao trocar de banco). Confira o arquivo manualmente ou lance à mão.`,
  ];
}

function detectarPorExtensao(nome: string): "ofx" | "csv" | "pdf" | "imagem" | null {
  const extensao = nome.toLowerCase().split(".").pop();
  if (extensao === "ofx" || extensao === "qfx") return "ofx";
  if (extensao === "csv") return "csv";
  if (extensao === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(extensao ?? "")) return "imagem";
  return null;
}

/** Ponto único de entrada da importação: recebe um File do drag-and-drop,
 * detecta o formato e devolve as transações já normalizadas, prontas para
 * revisão do usuário antes de persistir no banco. */
export async function processarArquivo(
  arquivo: File,
  opcoes: { anoReferencia?: number; mesReferenciaFatura?: number } = {},
): Promise<ResultadoImportacao> {
  const anoReferencia = opcoes.anoReferencia ?? new Date().getFullYear();
  const categoria = detectarPorExtensao(arquivo.name);

  if (categoria === "ofx") {
    const conteudo = await arquivo.text();
    return { tipoDetectado: "ofx", transacoes: analisarOfx(conteudo), avisos: [] };
  }

  if (categoria === "csv") {
    const conteudo = await arquivo.text();
    try {
      return { tipoDetectado: "csv", transacoes: analisarCsv(conteudo), avisos: [] };
    } catch (erro) {
      return { tipoDetectado: "csv", transacoes: [], avisos: [(erro as Error).message] };
    }
  }

  if (categoria === "pdf") {
    const linhas = await extrairTextoPdf(arquivo);
    const classificacao = classificarDocumentoPdf(linhas);
    const linhasComData = contarLinhasComData(linhas);

    if (classificacao === "fatura_cartao") {
      const mes = opcoes.mesReferenciaFatura ?? new Date().getMonth() + 1;
      const transacoes = extrairLinhasFatura(linhas, mes, anoReferencia);
      return { tipoDetectado: "pdf_fatura", transacoes, avisos: avisoExtracaoPdfVazia("fatura", transacoes.length, linhasComData) };
    }
    if (classificacao === "extrato") {
      const transacoes = extrairLinhasExtrato(linhas, anoReferencia);
      return { tipoDetectado: "pdf_extrato", transacoes, avisos: avisoExtracaoPdfVazia("extrato", transacoes.length, linhasComData) };
    }
    return {
      tipoDetectado: "pdf_desconhecido",
      transacoes: extrairLinhasExtrato(linhas, anoReferencia),
      avisos: ["Não foi possível classificar automaticamente como extrato ou fatura — revise as linhas extraídas com atenção."],
    };
  }

  if (categoria === "imagem") {
    const textoOcr = await ocrImagem(arquivo);
    const extraido = extrairCamposComprovante(textoOcr);
    const transacao = comprovanteParaTransacao(extraido);
    return {
      tipoDetectado: "imagem_comprovante",
      transacoes: transacao ? [transacao] : [],
      avisos: transacao
        ? ["Lançamento extraído por OCR — confira valor e data contra a imagem original antes de aceitar."]
        : ["OCR não conseguiu identificar valor e data nesta imagem. Cadastre manualmente."],
    };
  }

  return { tipoDetectado: "nao_suportado", transacoes: [], avisos: [`Formato de arquivo não suportado: ${arquivo.name}`] };
}
