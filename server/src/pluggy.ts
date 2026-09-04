import { PluggyClient, type Transaction } from "pluggy-sdk";

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  throw new Error("Defina CLIENT_ID e CLIENT_SECRET no .env (veja .env.example) antes de iniciar o servidor.");
}

export const pluggy = new PluggyClient({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
});

export interface TransacaoNormalizada {
  data: string;
  valor: number;
  descricaoOriginal: string;
  fitid: string;
  documentoFonte?: string;
}

/** Normaliza uma transação do Pluggy para o formato que o app web já sabe
 * importar (mesmo shape de src/domain/parsers/ofx.ts::TransacaoBruta).
 *
 * Usa `type` (DEBIT/CREDIT) para decidir o sinal em vez de confiar no sinal de
 * `amount`, porque a documentação não garante que `amount` já venha assinado.
 * Quando a transação é um boleto (paymentData.boletoMetadata), guarda a linha
 * digitável como documento-fonte — dá pra rastrear até o boleto original do
 * Sicredi/Itaú. Quando há dados do pagador/recebedor (PIX/TED), acrescenta o
 * nome à descrição — é o que permite ligar o pagamento a um locatário sem
 * depender só do texto livre do extrato. */
export function normalizarTransacao(transacao: Transaction): TransacaoNormalizada {
  const valorAbsoluto = Math.abs(transacao.amount);
  const valor = transacao.type === "DEBIT" ? -valorAbsoluto : valorAbsoluto;

  const contraparte = transacao.paymentData?.payer?.name ?? transacao.paymentData?.receiver?.name;
  const descricaoBase = transacao.descriptionRaw || transacao.description;
  const descricaoOriginal = contraparte ? `${descricaoBase} - ${contraparte}` : descricaoBase;

  const documentoFonte = transacao.paymentData?.boletoMetadata?.digitableLine ?? undefined;

  return {
    data: new Date(transacao.date).toISOString().slice(0, 10),
    valor,
    descricaoOriginal,
    fitid: transacao.id,
    documentoFonte,
  };
}
