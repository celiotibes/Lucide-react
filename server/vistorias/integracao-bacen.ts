import NodeCache from 'node-cache';

interface IndiceResposta {
  serie: {
    código: string;
    nome: string;
    frequência: string;
  };
  conteúdo: Array<{
    data: string;
    valor: string;
  }>;
}

interface IndiceData {
  data: string;
  valor: number;
  taxa?: number;
}

// Cache indices for 1 hour
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const BACEN_BASE_URL = 'https://www.bcb.gov.br/api/v3';

// Série do IPCA (Índice de Preços ao Consumidor Amplo)
// Usado como referência para atualizar caução
const SERIE_POUPANCA = '12'; // Taxa média da poupança
const SERIE_IPCA = '433'; // IPCA acumulado

export interface HistoricoIndice {
  dataInicio: string;
  dataFim: string;
  valorInicio: number;
  valorFim: number;
  percentualVariacao: number;
}

async function buscarSeriesAPI(codigoSerie: string, dataInicio?: string): Promise<IndiceResposta> {
  const cacheKey = `bacen-${codigoSerie}-${dataInicio || 'latest'}`;

  // Try cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached as IndiceResposta;
  }

  try {
    let url = `${BACEN_BASE_URL}/series/${codigoSerie}/dados`;

    if (dataInicio) {
      // Format: YYYY-MM-DD
      url += `?inicio=${dataInicio}`;
    } else {
      // Get last 90 days
      const dataAtual = new Date();
      const data90DiasAtras = new Date(dataAtual);
      data90DiasAtras.setDate(data90DiasAtras.getDate() - 90);
      const inicio = data90DiasAtras.toISOString().split('T')[0];
      url += `?inicio=${inicio}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`BACEN API returned ${response.status}`);
    }

    const dados: IndiceResposta = await response.json();

    // Cache the result
    cache.set(cacheKey, dados);

    return dados;
  } catch (error) {
    console.error('Erro ao buscar série BACEN:', error);
    throw new Error('Falha ao buscar dados do Banco Central');
  }
}

export async function obterTaxaPoupanca(data?: string): Promise<IndiceData | null> {
  try {
    const resposta = await buscarSeriesAPI(SERIE_POUPANCA, data);

    if (!resposta.conteúdo || resposta.conteúdo.length === 0) {
      return null;
    }

    // Get latest entry
    const ultimoValor = resposta.conteúdo[resposta.conteúdo.length - 1];

    return {
      data: ultimoValor.data,
      valor: parseFloat(ultimoValor.valor),
      taxa: parseFloat(ultimoValor.valor), // Taxa em % a.m.
    };
  } catch (error) {
    console.error('Erro ao obter taxa poupança:', error);
    return null;
  }
}

export async function obterIPCA(dataInicio?: string): Promise<IndiceData | null> {
  try {
    const resposta = await buscarSeriesAPI(SERIE_IPCA, dataInicio);

    if (!resposta.conteúdo || resposta.conteúdo.length === 0) {
      return null;
    }

    const ultimoValor = resposta.conteúdo[resposta.conteúdo.length - 1];

    return {
      data: ultimoValor.data,
      valor: parseFloat(ultimoValor.valor),
    };
  } catch (error) {
    console.error('Erro ao obter IPCA:', error);
    return null;
  }
}

export async function calcularCaucaoAtualizada(
  caucaoOriginal: number,
  dataInicio: string, // Data em que a caução foi depositada (YYYY-MM-DD)
  dataFim: string = new Date().toISOString().split('T')[0] // Data atual
): Promise<{ valor: number; taxa: number; periodo: HistoricoIndice } | null> {
  try {
    // Buscar IPCA do período
    const resposta = await buscarSeriesAPI(SERIE_IPCA, dataInicio);

    if (!resposta.conteúdo || resposta.conteúdo.length < 2) {
      return null;
    }

    // Encontrar valores para as datas específicas
    const conteudo = resposta.conteúdo;

    // Value at start
    const valorInicio = conteudo.find((c) => c.data === dataInicio) ||
      conteudo[0] || { valor: '0' };

    // Value at end (find closest date)
    let valorFim = conteudo[conteudo.length - 1];
    for (const item of conteudo) {
      if (item.data <= dataFim) {
        valorFim = item;
      }
    }

    const valorInicialNumerico = parseFloat(valorInicio.valor);
    const valorFinalNumerico = parseFloat(valorFim.valor);

    if (valorInicialNumerico === 0) {
      return null;
    }

    // Calcular percentual de variação
    const percentualVariacao =
      ((valorFinalNumerico - valorInicialNumerico) / valorInicialNumerico) * 100;

    // Calcular caução atualizada
    const caucaoAtualizada = caucaoOriginal * (1 + percentualVariacao / 100);

    return {
      valor: caucaoAtualizada,
      taxa: percentualVariacao,
      periodo: {
        dataInicio: valorInicio.data,
        dataFim: valorFim.data,
        valorInicio: valorInicialNumerico,
        valorFim: valorFinalNumerico,
        percentualVariacao,
      },
    };
  } catch (error) {
    console.error('Erro ao calcular caução atualizada:', error);
    return null;
  }
}

export async function obterUltimoIPCA(): Promise<IndiceData | null> {
  try {
    const resposta = await buscarSeriesAPI(SERIE_IPCA);

    if (!resposta.conteúdo || resposta.conteúdo.length === 0) {
      return null;
    }

    const ultimoValor = resposta.conteúdo[resposta.conteúdo.length - 1];

    return {
      data: ultimoValor.data,
      valor: parseFloat(ultimoValor.valor),
    };
  } catch (error) {
    console.error('Erro ao obter último IPCA:', error);
    return null;
  }
}

export function limparCache(codigoSerie?: string) {
  if (codigoSerie) {
    const keys = cache.keys();
    keys.forEach((key) => {
      if (key.includes(codigoSerie)) {
        cache.del(key);
      }
    });
  } else {
    cache.flushAll();
  }
}
