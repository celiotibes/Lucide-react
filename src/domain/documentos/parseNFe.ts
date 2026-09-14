export interface CamposExtraidosNFe {
  valor?: number;
  data?: string;
  cnpjCpf?: string;
  nomeContraparte?: string;
  descricaoProdutoServico?: string;
  numeroDocumento?: string;
}

function formatarCnpj(digitos: string): string {
  if (!/^\d{14}$/.test(digitos)) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
}

/** Detecta se o texto de um documento é XML de nota fiscal (NF-e modelo 55 ou NFS-e) —
 * usado para desviar da extração por regex (pensada para texto de PDF/OCR, com vírgula
 * decimal e CNPJ pontuado) para a extração estruturada por tag, muito mais confiável
 * quando o dado já vem em XML. */
export function pareceSerXmlNota(texto: string): boolean {
  const inicio = texto.trimStart().slice(0, 300).toLowerCase();
  return (
    inicio.startsWith("<?xml") ||
    inicio.includes("<nfeproc") ||
    inicio.includes("<nfe ") ||
    inicio.includes("<nfe>") ||
    inicio.includes("<compnfse") ||
    inicio.includes("<nfse")
  );
}

/** NF-e (modelo 55, nota de produto/mercadoria) segue o layout nacional único do SEFAZ
 * (infNFe/emit/det/total) — estrutura estável, extração direta por tag. */
function extrairNFeProduto(doc: Document): CamposExtraidosNFe | null {
  const infNFe = doc.getElementsByTagName("infNFe")[0];
  if (!infNFe) return null;

  const emit = doc.getElementsByTagName("emit")[0];
  const emitCnpj = emit?.getElementsByTagName("CNPJ")[0]?.textContent?.trim();
  const emitNome = emit?.getElementsByTagName("xNome")[0]?.textContent?.trim();

  const icmsTot = doc.getElementsByTagName("ICMSTot")[0];
  const vNF = icmsTot?.getElementsByTagName("vNF")[0]?.textContent?.trim();

  const ide = doc.getElementsByTagName("ide")[0];
  const nNF = ide?.getElementsByTagName("nNF")[0]?.textContent?.trim();
  const dhEmi = ide?.getElementsByTagName("dhEmi")[0]?.textContent?.trim() ?? ide?.getElementsByTagName("dEmi")[0]?.textContent?.trim();

  const produtos = Array.from(doc.getElementsByTagName("xProd"))
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => !!t);

  return {
    cnpjCpf: emitCnpj ? formatarCnpj(emitCnpj) : undefined,
    nomeContraparte: emitNome || undefined,
    valor: vNF ? Number.parseFloat(vNF) : undefined,
    data: dhEmi ? dhEmi.slice(0, 10) : undefined,
    descricaoProdutoServico: produtos.length ? produtos.join("; ") : undefined,
    numeroDocumento: nNF || undefined,
  };
}

/** NFS-e (nota de serviço) NÃO tem padrão nacional único — cada prefeitura define seu
 * próprio layout XML (a maioria segue variações do padrão ABRASF, mas não é garantido).
 * Isto é best-effort: tenta os nomes de tag mais comuns e retorna null se não reconhecer
 * nada — nunca finge sucesso com campos vazios. Sempre confira o texto extraído. */
function extrairNFSe(doc: Document): CamposExtraidosNFe | null {
  const pegar = (candidatos: string[]): string | undefined => {
    for (const tag of candidatos) {
      const valor = doc.getElementsByTagName(tag)[0]?.textContent?.trim();
      if (valor) return valor;
    }
    return undefined;
  };

  const cnpj = pegar(["Cnpj", "CNPJ", "CpfCnpj"]);
  const valorTexto = pegar(["ValorServicos", "ValorLiquidoNfse", "ValorLiquido", "ValorTotal"]);
  if (!cnpj && !valorTexto) return null;

  const dataTexto = pegar(["DataEmissao", "Competencia"]);

  return {
    cnpjCpf: cnpj && /^\d{14}$/.test(cnpj) ? formatarCnpj(cnpj) : cnpj,
    nomeContraparte: pegar(["RazaoSocial", "Nome", "NomeFantasia"]),
    valor: valorTexto ? Number.parseFloat(valorTexto.replace(",", ".")) : undefined,
    data: dataTexto ? dataTexto.slice(0, 10) : undefined,
    descricaoProdutoServico: pegar(["Discriminacao", "DiscriminacaoServicos", "Descricao"]),
    numeroDocumento: pegar(["Numero", "NumeroNfse"]),
  };
}

/** Extrai campos de um XML de nota fiscal (NF-e ou NFS-e). Retorna null se o XML não
 * for válido ou não corresponder a nenhum layout reconhecido — quem chama deve cair de
 * volta para a extração por regex/OCR genérica em vez de aceitar um resultado vazio. */
export function extrairCamposXmlNota(xml: string): CamposExtraidosNFe | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return extrairNFeProduto(doc) ?? extrairNFSe(doc);
}
