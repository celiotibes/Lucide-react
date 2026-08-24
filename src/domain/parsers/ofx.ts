import { normalizarValor } from "./normalizarValor";

export interface TransacaoBruta {
  data: string; // YYYY-MM-DD
  valor: number;
  descricaoOriginal: string;
  fitid: string;
  documentoFonte?: string; // ex: linha digitável do boleto, quando conhecida por transação
}

function formatarDataOfx(bruta: string): string {
  // OFX usa YYYYMMDDHHMMSS (hora opcional). Pegamos só os 8 primeiros dígitos.
  const digitos = bruta.replace(/\D/g, "").slice(0, 8);
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;
}

function extrairCampo(bloco: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const casado = bloco.match(regex);
  return casado?.[1]?.trim();
}

/** Parser tolerante de OFX (SGML, tags sem fechamento são comuns em extratos reais de bancos brasileiros).
 * TRNAMT deveria vir sempre com ponto decimal pela especificação OFX, mas extratos reais de
 * bancos brasileiros nem sempre seguem a especificação à risca (mesmo motivo do comentário
 * acima sobre tags sem fechamento) — por isso passa pelo mesmo normalizarValor tolerante a
 * vírgula decimal usado no parser de CSV, em vez de um parseFloat cru que corromperia por
 * ordem de grandeza qualquer TRNAMT exportado com vírgula (achado de auditoria adversarial). */
export function analisarOfx(conteudo: string): TransacaoBruta[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocos
    .map((bloco): TransacaoBruta | null => {
      const dataBruta = extrairCampo(bloco, "DTPOSTED");
      const valorBruto = extrairCampo(bloco, "TRNAMT");
      const fitid = extrairCampo(bloco, "FITID");
      const memo = extrairCampo(bloco, "MEMO") ?? extrairCampo(bloco, "NAME") ?? "";

      if (!dataBruta || !valorBruto || !fitid) return null;

      return {
        data: formatarDataOfx(dataBruta),
        valor: normalizarValor(valorBruto),
        descricaoOriginal: memo,
        fitid,
      };
    })
    .filter((t): t is TransacaoBruta => t !== null);
}
