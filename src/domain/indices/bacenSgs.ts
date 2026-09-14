import type { Database } from "sql.js";
import { executar, consultar } from "../../db/connection";

// Códigos de série do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central —
// https://www3.bcb.gov.br/sgspub. Todas as três são variação percentual mensal, série
// mensal. Se os valores baixados parecerem implausíveis (fora de -5% a +5% a.m.), confira
// o código da série no link acima antes de confiar no resultado — a poupança em particular
// tem múltiplas séries por causa da mudança de regra em mai/2012 (série 195 = regra atual).
export const SERIES_BACEN: Record<"igpm" | "ipca" | "poupanca", number> = {
  igpm: 189,
  ipca: 433,
  poupanca: 195,
};

export interface TaxaMensal {
  mes_referencia: string; // YYYY-MM-01
  taxa_mensal: number; // percentual, ex: 0.53 (= 0,53%)
}

function paraDataBacen(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function paraMesReferencia(dataBacen: string): string {
  const [dia, mes, ano] = dataBacen.split("/");
  if (!dia || !mes || !ano) throw new Error(`Data em formato inesperado do BACEN: "${dataBacen}"`);
  return `${ano}-${mes}-01`;
}

/** Busca a série mensal de um índice direto da API pública do BACEN (SGS), sem passar por
 * nenhum backend — roda inteiramente no navegador do usuário. Lança erro com mensagem
 * explicável em vez de deixar `fetch` falhar silenciosamente, porque o chamador precisa
 * decidir entre tentar de novo ou cair para lançamento manual. */
export async function buscarIndiceBacen(
  indice: "igpm" | "ipca" | "poupanca",
  dataInicioIso: string,
  dataFimIso: string,
): Promise<TaxaMensal[]> {
  const codigo = SERIES_BACEN[indice];
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados` +
    `?formato=json&dataInicial=${paraDataBacen(dataInicioIso)}&dataFinal=${paraDataBacen(dataFimIso)}`;

  let resposta: Response;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error(
      "Não foi possível conectar à API do Banco Central (api.bcb.gov.br). Verifique sua conexão " +
        "ou lance os valores manualmente abaixo.",
    );
  }
  if (!resposta.ok) {
    throw new Error(`API do BACEN respondeu ${resposta.status} para a série ${indice} (código ${codigo}).`);
  }

  const dados = (await resposta.json()) as unknown;
  if (!Array.isArray(dados)) {
    throw new Error(`Formato de resposta inesperado da API do BACEN para a série ${indice} — a API pode ter mudado.`);
  }

  return dados.map((linha) => {
    const { data, valor } = linha as { data?: string; valor?: string };
    if (!data || valor === undefined) {
      throw new Error(`Registro sem "data" ou "valor" na resposta do BACEN para a série ${indice}.`);
    }
    const taxa = Number.parseFloat(valor.replace(",", "."));
    if (Number.isNaN(taxa)) throw new Error(`Valor não numérico ("${valor}") retornado pelo BACEN para ${indice} em ${data}.`);
    return { mes_referencia: paraMesReferencia(data), taxa_mensal: taxa };
  });
}

export const ROTULO_INDICE: Record<"igpm" | "ipca" | "poupanca", string> = {
  igpm: "IGP-M (FGV)",
  ipca: "IPCA (IBGE)",
  poupanca: "Poupança",
};

export const TODOS_INDICES = Object.keys(SERIES_BACEN) as (keyof typeof SERIES_BACEN)[];

/** Grava (ou sobrescreve) as taxas na tabela indices_economicos. Sobrescrever é intencional:
 * um mês baixado de novo do BACEN é sempre mais confiável do que um valor simulado ou um
 * lançamento manual anterior para o mesmo mês — (indice, mes_referencia) é a chave primária. */
export function salvarTaxas(db: Database, indice: "igpm" | "ipca" | "poupanca", taxas: TaxaMensal[]): void {
  for (const t of taxas) {
    executar(
      db,
      "INSERT OR REPLACE INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES (?, ?, ?)",
      [indice, t.mes_referencia, t.taxa_mensal],
    );
  }
}

export function listarTaxas(db: Database, indice: "igpm" | "ipca" | "poupanca"): TaxaMensal[] {
  return consultar<TaxaMensal>(
    db,
    "SELECT mes_referencia, taxa_mensal FROM indices_economicos WHERE indice = ? ORDER BY mes_referencia",
    [indice],
  );
}

/** Menor data_inicio entre todos os contratos + cauções — janela mínima que os índices
 * precisam cobrir para que nenhum cálculo de reajuste/mora/correção fique sem taxa. */
export function dataMinimaNecessaria(db: Database, hoje: string): string {
  const linhas = consultar<{ minimo: string | null }>(
    db,
    `SELECT MIN(data) AS minimo FROM (
       SELECT data_inicio AS data FROM contratos_locacao
       UNION ALL
       SELECT data_deposito AS data FROM caucoes
     )`,
  );
  return linhas[0]?.minimo ?? hoje;
}
