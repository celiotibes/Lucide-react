// pdfjs-dist (com o worker WASM/JS) só é carregado quando um PDF é de fato enviado —
// import() dinâmico em vez de estático tira ~2MB do bundle inicial da aplicação.
async function carregarPdfjs() {
  const [pdfjsLib, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}

/** Extrai o texto de um PDF (extrato bancário ou fatura de cartão) linha a linha.
 * Funciona apenas para PDFs com camada de texto — PDFs escaneados (imagem pura)
 * devem passar por OCR (ver ocrImagem.ts). */
export async function extrairTextoPdf(arquivo: File): Promise<string[]> {
  const pdfjsLib = await carregarPdfjs();
  const bytes = await arquivo.arrayBuffer();
  const documento = await pdfjsLib.getDocument({ data: bytes }).promise;

  const linhas: string[] = [];
  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina);
    const conteudo = await pagina.getTextContent();

    let linhaAtual = "";
    let ultimoY: number | null = null;
    for (const item of conteudo.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (ultimoY !== null && Math.abs(y - ultimoY) > 2) {
        if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
        linhaAtual = "";
      }
      linhaAtual += item.str + " ";
      ultimoY = y;
    }
    if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
  }
  return linhas;
}

/** Heurística simples para distinguir extrato bancário de fatura de cartão de crédito,
 * a partir de palavras-chave típicas de cada documento. Sempre permita ao usuário
 * corrigir a classificação na tela de importação. */
export function classificarDocumentoPdf(linhas: string[]): "extrato" | "fatura_cartao" | "desconhecido" {
  const textoCompleto = linhas.join(" ").toLowerCase();
  const marcadoresFatura = ["fatura", "cartão de crédito", "cartao de credito", "limite disponível", "melhor dia de compra"];
  const marcadoresExtrato = ["extrato", "saldo anterior", "saldo do dia", "extrato de conta corrente"];

  const pontosFatura = marcadoresFatura.filter((m) => textoCompleto.includes(m)).length;
  const pontosExtrato = marcadoresExtrato.filter((m) => textoCompleto.includes(m)).length;

  if (pontosFatura > pontosExtrato) return "fatura_cartao";
  if (pontosExtrato > pontosFatura) return "extrato";
  return "desconhecido";
}
