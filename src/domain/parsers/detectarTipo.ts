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
  | "nao_suportado";

export interface ResultadoImportacao {
  tipoDetectado: TipoArquivoDetectado;
  transacoes: TransacaoBruta[];
  avisos: string[];
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

    if (classificacao === "fatura_cartao") {
      const mes = opcoes.mesReferenciaFatura ?? new Date().getMonth() + 1;
      return { tipoDetectado: "pdf_fatura", transacoes: extrairLinhasFatura(linhas, mes, anoReferencia), avisos: [] };
    }
    if (classificacao === "extrato") {
      return { tipoDetectado: "pdf_extrato", transacoes: extrairLinhasExtrato(linhas, anoReferencia), avisos: [] };
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
