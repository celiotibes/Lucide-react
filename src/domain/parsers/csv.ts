import Papa from "papaparse";
import type { TransacaoBruta } from "./ofx";
import { normalizarValor } from "./normalizarValor";

export interface MapeamentoColunasCsv {
  data: string;
  valor: string;
  descricao: string;
}

/** Tenta adivinhar as colunas de data/valor/descrição a partir de cabeçalhos comuns
 * de exportação de bancos brasileiros (Itaú, BB, Caixa, Bradesco, Nubank, Inter...). */
export function adivinharMapeamento(colunas: string[]): MapeamentoColunasCsv | null {
  const normalizar = (s: string) => s.toLowerCase().trim();
  const candidatosData = ["data", "date", "dt", "data lancamento", "data lançamento"];
  const candidatosValor = ["valor", "amount", "valor (r$)", "vl_transacao", "valor transacao"];
  const candidatosDescricao = ["descricao", "descrição", "historico", "histórico", "memo", "title", "lançamento"];

  const acharColuna = (candidatos: string[]) =>
    colunas.find((coluna) => candidatos.includes(normalizar(coluna)));

  const data = acharColuna(candidatosData);
  const valor = acharColuna(candidatosValor);
  const descricao = acharColuna(candidatosDescricao);

  if (!data || !valor || !descricao) return null;
  return { data, valor, descricao };
}

function normalizarData(bruta: string): string {
  // aceita YYYY-MM-DD ou DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruta)) return bruta;
  const [dia, mes, ano] = bruta.split("/");
  if (dia && mes && ano) return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  return bruta;
}


export function analisarCsv(conteudo: string, mapeamento?: MapeamentoColunasCsv): TransacaoBruta[] {
  const resultado = Papa.parse<Record<string, string>>(conteudo, { header: true, skipEmptyLines: true });
  const colunas = resultado.meta.fields ?? [];
  const mapa = mapeamento ?? adivinharMapeamento(colunas);
  if (!mapa) {
    throw new Error(
      "Não foi possível identificar as colunas de data/valor/descrição neste CSV. Informe o mapeamento manualmente.",
    );
  }

  return resultado.data
    .filter((linha) => linha[mapa.data] && linha[mapa.valor])
    .map((linha): TransacaoBruta => {
      const data = normalizarData(linha[mapa.data]);
      const valor = normalizarValor(linha[mapa.valor]);
      const descricaoOriginal = linha[mapa.descricao] ?? "";
      return { data, valor, descricaoOriginal, fitid: `${data}|${valor}|${descricaoOriginal}` };
    });
}
