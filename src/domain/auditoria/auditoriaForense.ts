import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface TransacaoDuplicada {
  conta_id: number;
  data: string;
  valor: number;
  descricao_original: string;
  ocorrencias: number;
  transacaoIds: number[];
}

/** Mesma conta, mesma data, mesmo valor e mesma descrição em mais de um lançamento —
 * o sintoma mais comum de pagamento em duplicidade (boleto pago duas vezes, PIX
 * repetido). O import já evita duplicar o mesmo arquivo (fitid único), então isso
 * captura duplicidade "real" entre documentos diferentes. */
export function detectarDuplicatas(db: Database): TransacaoDuplicada[] {
  const grupos = consultar<{ conta_id: number; data: string; valor: number; descricao_original: string; ocorrencias: number; ids: string }>(
    db,
    `SELECT conta_id, data, valor, descricao_original, COUNT(*) AS ocorrencias, GROUP_CONCAT(id) AS ids
     FROM transacoes
     GROUP BY conta_id, data, valor, descricao_original
     HAVING COUNT(*) > 1
     ORDER BY ABS(valor) DESC`,
  );
  return grupos.map((g) => ({
    conta_id: g.conta_id,
    data: g.data,
    valor: g.valor,
    descricao_original: g.descricao_original,
    ocorrencias: g.ocorrencias,
    transacaoIds: g.ids.split(",").map(Number),
  }));
}

export interface OutlierEstatistico {
  transacaoId: number;
  data: string;
  descricao: string;
  valor: number;
  planoContaCodigo: string;
  mediaCategoria: number;
  desvioPadraoCategoria: number;
  zScore: number;
}

const AMOSTRA_MINIMA_OUTLIER = 5;
const Z_SCORE_LIMITE = 3;

/** Para cada categoria do plano de contas com volume suficiente, sinaliza lançamentos
 * cujo valor absoluto foge mais de 3 desvios-padrão da média da própria categoria —
 * o mesmo princípio que motores de conciliação tipo IDEA/ACL usam para achar
 * lançamento fora do padrão dentro de centenas de linhas. */
export function detectarOutliers(db: Database, dataInicio: string, dataFim: string): OutlierEstatistico[] {
  const linhas = consultar<{ id: number; data: string; descricao_original: string; valor: number; plano_conta_codigo: string }>(
    db,
    `SELECT id, data, descricao_original, valor, plano_conta_codigo
     FROM transacoes
     WHERE plano_conta_codigo IS NOT NULL AND data BETWEEN ? AND ?`,
    [dataInicio, dataFim],
  );

  const porCategoria = new Map<string, typeof linhas>();
  for (const linha of linhas) {
    const lista = porCategoria.get(linha.plano_conta_codigo) ?? [];
    lista.push(linha);
    porCategoria.set(linha.plano_conta_codigo, lista);
  }

  const outliers: OutlierEstatistico[] = [];
  for (const [codigo, itens] of porCategoria) {
    if (itens.length < AMOSTRA_MINIMA_OUTLIER) continue;

    const valoresAbsolutos = itens.map((i) => Math.abs(i.valor));
    const media = valoresAbsolutos.reduce((a, b) => a + b, 0) / valoresAbsolutos.length;
    const variancia = valoresAbsolutos.reduce((acc, v) => acc + (v - media) ** 2, 0) / valoresAbsolutos.length;
    const desvioPadrao = Math.sqrt(variancia);
    if (desvioPadrao === 0) continue;

    for (const item of itens) {
      const zScore = (Math.abs(item.valor) - media) / desvioPadrao;
      if (Math.abs(zScore) > Z_SCORE_LIMITE) {
        outliers.push({
          transacaoId: item.id,
          data: item.data,
          descricao: item.descricao_original,
          valor: item.valor,
          planoContaCodigo: codigo,
          mediaCategoria: media,
          desvioPadraoCategoria: desvioPadrao,
          zScore,
        });
      }
    }
  }
  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export interface LacunaMensal {
  imovelApelido: string;
  planoContaCodigo: string;
  mesesFaltantes: string[];
}

/** Para despesas recorrentes por imóvel (condomínio, financiamento), lista meses
 * dentro da janela de dados em que não existe nenhum lançamento — um "buraco" no
 * histórico que precisa ser investigado (documento perdido ou pagamento por fora). */
export function detectarLacunasMensais(db: Database, planosRecorrentes: string[], dataInicio: string, dataFim: string): LacunaMensal[] {
  const imoveis = consultar<{ id: number; apelido: string }>(db, "SELECT id, apelido FROM imoveis");
  const resultado: LacunaMensal[] = [];

  for (const imovel of imoveis) {
    for (const codigo of planosRecorrentes) {
      const meses = consultar<{ mes: string }>(
        db,
        `SELECT DISTINCT substr(data, 1, 7) AS mes FROM transacoes
         WHERE imovel_id = ? AND plano_conta_codigo = ? AND data BETWEEN ? AND ?`,
        [imovel.id, codigo, dataInicio, dataFim],
      );
      if (meses.length === 0) continue; // nunca teve lançamento nessa categoria — não é lacuna, é ausência total

      const mesesPresentes = new Set(meses.map((m) => m.mes));
      const mesesFaltantes: string[] = [];
      let cursor = new Date(dataInicio + "T00:00:00");
      const fim = new Date(dataFim + "T00:00:00");
      while (cursor <= fim) {
        const chave = cursor.toISOString().slice(0, 7);
        if (!mesesPresentes.has(chave)) mesesFaltantes.push(chave);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (mesesFaltantes.length > 0) resultado.push({ imovelApelido: imovel.apelido, planoContaCodigo: codigo, mesesFaltantes });
    }
  }
  return resultado;
}

export interface ResultadoBenford {
  digito: number;
  frequenciaObservada: number;
  frequenciaEsperada: number;
}

/** Lei de Benford: em conjuntos naturais de valores que variam livremente, o primeiro
 * dígito segue log10(1+1/d), não é uniforme. Só faz sentido aplicar a categorias com
 * valor variável (manutenção, prestadores, obras) — NÃO a aluguel/financiamento, cujo
 * valor é fixado em contrato e não tem motivo nenhum para seguir a distribuição. */
export function testeBenford(valores: number[]): ResultadoBenford[] {
  const contagem = new Array(10).fill(0);
  let total = 0;
  for (const valor of valores) {
    const absoluto = Math.abs(valor);
    if (absoluto < 1) continue;
    const primeiroDigito = parseInt(absoluto.toString().replace(".", "").replace(/^0+/, "")[0], 10);
    if (primeiroDigito >= 1 && primeiroDigito <= 9) {
      contagem[primeiroDigito]++;
      total++;
    }
  }
  if (total === 0) return [];

  return Array.from({ length: 9 }, (_, indice) => {
    const digito = indice + 1;
    return {
      digito,
      frequenciaObservada: contagem[digito] / total,
      frequenciaEsperada: Math.log10(1 + 1 / digito),
    };
  });
}
