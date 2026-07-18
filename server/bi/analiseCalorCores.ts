/**
 * Tipos e funções puras do heatmap de análise de custos — sem dependência de
 * Supabase/next-headers, para poder ser importado com segurança tanto por
 * Server Actions quanto por Client Components (ex: a página do heatmap usa
 * `mapearValorParaCor` diretamente no navegador para colorir as células).
 */

export interface CelulaPorCalor {
  periodo: string; // mês/ano
  categoria: string;
  valor: number;
  percentual: number; // percentual do total
}

export interface DadosAnaliseCalor {
  celulas: CelulaPorCalor[];
  periodos: string[];
  categorias: string[];
  minimo: number;
  maximo: number;
  media: number;
}

/**
 * Mapear valor para cor em escala de intensidade
 * Usa escala de cores: verde (baixo) → amarelo → vermelho (alto)
 */
export function mapearValorParaCor(valor: number, minimo: number, maximo: number): string {
  if (maximo === minimo) return '#90EE90'; // Verde claro

  const proporcao = (valor - minimo) / (maximo - minimo);

  if (proporcao < 0.33) {
    // Verde
    return '#90EE90';
  } else if (proporcao < 0.66) {
    // Amarelo
    return '#FFD700';
  } else {
    // Vermelho
    return '#FF6B6B';
  }
}
