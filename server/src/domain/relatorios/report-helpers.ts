/**
 * Helpers compartilhados para geração de relatórios
 *
 * Centraliza código duplicado entre relatorio-executivo.ts, relatorios-routes.ts
 * e outros módulos de geração de relatórios.
 *
 * Inclua:
 * - Cálculo de períodos de data
 * - Formatação de moeda/valores
 * - Cálculos agregados (SUM, AVG, etc)
 * - Paginação
 */



/**
 * Período de datas
 */
export interface Periodo {
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
}

/**
 * Calcula o período completo de um mês
 *
 * @param mes Mês (1-12)
 * @param ano Ano (ex: 2024)
 * @returns Objeto com data de início e fim do mês
 */
export function obterPeriodoMes(mes: number, ano: number): Periodo {
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDiaDoMes).padStart(2, "0")}`;

  return { inicio: dataInicio, fim: dataFim };
}

/**
 * Calcula o mês anterior ao fornecido
 *
 * @param mes Mês atual (1-12)
 * @param ano Ano atual
 * @returns { mes, ano } do mês anterior
 */
export function obterMesAnterior(
  mes: number,
  ano: number,
): { mes: number; ano: number } {
  if (mes === 1) {
    return { mes: 12, ano: ano - 1 };
  }
  return { mes: mes - 1, ano };
}

/**
 * Calcula N meses atrás
 *
 * @param mes Mês atual (1-12)
 * @param ano Ano atual
 * @param quantosMeses Quantos meses retroceder
 * @returns Array com { mes, ano } de cada período
 */
export function obterUltimosNMeses(
  mes: number,
  ano: number,
  quantosMeses: number = 6,
): Array<{ mes: number; ano: number }> {
  const meses = [];
  let mesAtual = mes;
  let anoAtual = ano;

  for (let i = 0; i < quantosMeses; i++) {
    meses.unshift({ mes: mesAtual, ano: anoAtual });

    // Retrocede um mês
    if (mesAtual === 1) {
      mesAtual = 12;
      anoAtual--;
    } else {
      mesAtual--;
    }
  }

  return meses;
}

/**
 * Formata um valor numérico como moeda (reais)
 *
 * @param valor Valor a formatar
 * @param casasDecimais Número de casas decimais (padrão: 2)
 * @returns String formatada (ex: "1.234,56")
 */
export function formatarMoeda(valor: number, casasDecimais: number = 2): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}

/**
 * Formata um percentual
 *
 * @param valor Valor entre 0 e 100 (ou 0 e 1)
 * @param casasDecimais Número de casas decimais (padrão: 2)
 * @returns String formatada (ex: "12,34%")
 */
export function formatarPercentual(valor: number, casasDecimais: number = 2): string {
  // Se valor está entre 0 e 1, multiplica por 100
  const percentual = valor <= 1 ? valor * 100 : valor;
  return `${percentual.toFixed(casasDecimais)}%`;
}

/**
 * Calcula a variação percentual entre dois valores
 *
 * @param valorAtual Valor atual
 * @param valorAnterior Valor anterior
 * @returns Variação percentual (ex: 15.5 para +15,5%)
 */
export function calcularVariacaoPercentual(valorAtual: number, valorAnterior: number): number {
  if (valorAnterior === 0) {
    return valorAtual > 0 ? 100 : 0;
  }
  return ((valorAtual - valorAnterior) / valorAnterior) * 100;
}

/**
 * Agrupa um array por uma chave e soma valores
 *
 * @param items Array de itens
 * @param chaveAgrupamento Campo que define o agrupamento
 * @param chaveValor Campo numérico a somar
 * @returns Objeto com somas por grupo
 */
export function agruparESomar<T extends Record<string, unknown>>(
  items: T[],
  chaveAgrupamento: keyof T,
  chaveValor: keyof T,
): Record<string, number> {
  const resultado: Record<string, number> = {};

  for (const item of items) {
    const chave = String(item[chaveAgrupamento]);
    const valor = Number(item[chaveValor]) || 0;

    if (!resultado[chave]) {
      resultado[chave] = 0;
    }

    resultado[chave] += valor;
  }

  return resultado;
}

/**
 * Calcula estatísticas básicas para um array de números
 *
 * @param valores Array de números
 * @returns Objeto com min, max, média e soma
 */
export function calcularEstatisticas(
  valores: number[],
): {
  minimo: number;
  maximo: number;
  media: number;
  soma: number;
  quantidade: number;
} {
  if (valores.length === 0) {
    return { minimo: 0, maximo: 0, media: 0, soma: 0, quantidade: 0 };
  }

  const soma = valores.reduce((a, b) => a + b, 0);
  const media = soma / valores.length;
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);

  return {
    minimo,
    maximo,
    media,
    soma,
    quantidade: valores.length,
  };
}

/**
 * Ordena um array e retorna os top N itens
 *
 * @param items Array de itens
 * @param chave Campo a usar para ordenação
 * @param quantidade Quantidade de itens a retornar
 * @param descendente Se deve ordenar em ordem descendente (padrão: true)
 * @returns Array com os top N itens
 */
export function obterTopN<T extends Record<string, unknown>>(
  items: T[],
  chave: keyof T,
  quantidade: number = 5,
  descendente: boolean = true,
): T[] {
  const copia = [...items];

  copia.sort((a, b) => {
    const valorA = Number(a[chave]) || 0;
    const valorB = Number(b[chave]) || 0;
    return descendente ? valorB - valorA : valorA - valorB;
  });

  return copia.slice(0, quantidade);
}

/**
 * Interface para paginação
 */
export interface ParametrosPaginacao {
  limit: number;
  offset: number;
}

/**
 * Interface para resultado paginado
 */
export interface ResultadoPaginado<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Pagina um array
 *
 * @param items Array completo de itens
 * @param limit Quantidade de itens por página
 * @param offset Número de itens a pular
 * @returns Resultado paginado
 */
export function paginarArray<T>(
  items: T[],
  limit: number = 50,
  offset: number = 0,
): ResultadoPaginado<T> {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length,
  };
}

/**
 * Formata data para padrão brasileiro (DD/MM/YYYY)
 *
 * @param data String no formato ISO (YYYY-MM-DD) ou Date
 * @returns String formatada (ex: "25/12/2024")
 */
export function formatarData(data: string | Date): string {
  const d = typeof data === "string" ? new Date(data) : data;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata data e hora para padrão brasileiro (DD/MM/YYYY HH:mm)
 *
 * @param data String no formato ISO ou Date
 * @returns String formatada (ex: "25/12/2024 14:30")
 */
export function formatarDataHora(data: string | Date): string {
  const d = typeof data === "string" ? new Date(data) : data;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

/**
 * Valida se uma data é válida
 *
 * @param data String no formato ISO (YYYY-MM-DD)
 * @returns true se data é válida
 */
export function validarData(data: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) return false;

  const d = new Date(data);
  return d instanceof Date && !isNaN(d.getTime());
}
