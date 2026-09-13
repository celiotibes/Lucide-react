/**
 * Detecção de anomalias em apontamentos via análise estatística
 * Task #48
 */

export interface AnomaliaApontamento {
  apontamento_id: string;
  data: string;
  prestador_id: string;
  horas_trabalhadas: number;
  motivo_anomalia: 'horas_extremas' | 'pico_inusitado' | 'desvio_padrao' | 'padrão_quebrado';
  score_anomalia: number; // 0-100
  descricao: string;
  recomendacao: string;
}

interface EstatisticasPrestador {
  media_horas: number;
  desvio_padrao: number;
  minimo: number;
  maximo: number;
  mediana: number;
  q25: number;
  q75: number;
  frequencia_dias: number;
  dias_ativos: number;
}

/**
 * Calcular estatísticas de apontamentos para um prestador
 */
export function calcularEstatisticas(apontamentos: { horas_trabalhadas: number }[]): EstatisticasPrestador {
  if (apontamentos.length === 0) {
    return {
      media_horas: 0,
      desvio_padrao: 0,
      minimo: 0,
      maximo: 0,
      mediana: 0,
      q25: 0,
      q75: 0,
      frequencia_dias: 0,
      dias_ativos: 0,
    };
  }

  const horas = apontamentos.map((a) => a.horas_trabalhadas).sort((a, b) => a - b);
  const media = horas.reduce((sum, h) => sum + h, 0) / horas.length;

  // Desvio padrão
  const variancia =
    horas.reduce((sum, h) => sum + Math.pow(h - media, 2), 0) / horas.length;
  const desvio_padrao = Math.sqrt(variancia);

  // Percentis
  const q25_idx = Math.floor(horas.length * 0.25);
  const q50_idx = Math.floor(horas.length * 0.5);
  const q75_idx = Math.floor(horas.length * 0.75);

  return {
    media_horas: parseFloat(media.toFixed(2)),
    desvio_padrao: parseFloat(desvio_padrao.toFixed(2)),
    minimo: horas[0],
    maximo: horas[horas.length - 1],
    mediana: horas[q50_idx],
    q25: horas[q25_idx],
    q75: horas[q75_idx],
    frequencia_dias: Math.round(horas.length),
    dias_ativos: apontamentos.length,
  };
}

/**
 * Detectar anomalias em um apontamento baseado em histórico
 */
export function detectarAnomalia(
  apontamento: {
    id: string;
    data: string;
    horas_trabalhadas: number;
    prestador_id: string;
  },
  historico: { horas_trabalhadas: number; data: string }[],
  estadisticas: EstatisticasPrestador
): AnomaliaApontamento | null {
  const horas = apontamento.horas_trabalhadas;
  const { media_horas, desvio_padrao, q25, q75 } = estadisticas;

  // Limites absolutos (muito baixo ou muito alto)
  if (horas < 0.5 || horas > 12) {
    return {
      apontamento_id: apontamento.id,
      data: apontamento.data,
      prestador_id: apontamento.prestador_id,
      horas_trabalhadas: horas,
      motivo_anomalia: 'horas_extremas',
      score_anomalia: horas > 12 ? 85 : 60,
      descricao:
        horas > 12
          ? `Apontamento com ${horas}h é muito elevado (limite normal: 8-10h)`
          : `Apontamento com ${horas}h é muito baixo (mínimo recomendado: 4h)`,
      recomendacao:
        horas > 12
          ? 'Verificar se não houve erro de lançamento ou se há horas extras acumuladas'
          : 'Considerar se foi um dia parcial ou verificar com prestador',
    };
  }

  // Desvio padrão (Z-score)
  if (desvio_padrao > 0) {
    const z_score = Math.abs(horas - media_horas) / desvio_padrao;

    if (z_score > 3) {
      return {
        apontamento_id: apontamento.id,
        data: apontamento.data,
        prestador_id: apontamento.prestador_id,
        horas_trabalhadas: horas,
        motivo_anomalia: 'desvio_padrao',
        score_anomalia: Math.min(95, 50 + z_score * 15),
        descricao: `Apontamento de ${horas}h desvia ${z_score.toFixed(1)}σ do padrão (média: ${media_horas}h)`,
        recomendacao: 'Esta é uma situação muito incomum para este prestador. Revisar motivação.',
      };
    } else if (z_score > 2) {
      return {
        apontamento_id: apontamento.id,
        data: apontamento.data,
        prestador_id: apontamento.prestador_id,
        horas_trabalhadas: horas,
        motivo_anomalia: 'desvio_padrao',
        score_anomalia: 65,
        descricao: `Apontamento de ${horas}h desvia ${z_score.toFixed(1)}σ do padrão (média: ${media_horas}h)`,
        recomendacao: 'Revisar se há justificativa para esta variação.',
      };
    }
  }

  // Análise de IQR (Interquartile Range)
  const iqr = q75 - q25;
  const limite_inferior = q25 - 1.5 * iqr;
  const limite_superior = q75 + 1.5 * iqr;

  if (horas < limite_inferior || horas > limite_superior) {
    const eh_pico = horas > limite_superior;
    return {
      apontamento_id: apontamento.id,
      data: apontamento.data,
      prestador_id: apontamento.prestador_id,
      horas_trabalhadas: horas,
      motivo_anomalia: 'pico_inusitado',
      score_anomalia: 70,
      descricao: eh_pico
        ? `Pico inusitado de ${horas}h (normal: ${q25}-${q75}h)`
        : `Valor muito baixo de ${horas}h (normal: ${q25}-${q75}h)`,
      recomendacao: eh_pico
        ? 'Verificar se há projeto especial ou carga extra neste dia'
        : 'Confirmar se foi um dia parcial',
    };
  }

  // Detecção de mudança de padrão (últimas 30 dias)
  if (historico.length > 10) {
    const diasRecentes = historico.slice(-30);
    const mediasRecente =
      diasRecentes.reduce((sum, a) => sum + a.horas_trabalhadas, 0) / diasRecentes.length;

    const mudanca_percentual = Math.abs(horas - mediasRecente) / mediasRecente;
    if (mudanca_percentual > 0.4) {
      return {
        apontamento_id: apontamento.id,
        data: apontamento.data,
        prestador_id: apontamento.prestador_id,
        horas_trabalhadas: horas,
        motivo_anomalia: 'padrão_quebrado',
        score_anomalia: 55,
        descricao: `Mudança de ${(mudanca_percentual * 100).toFixed(0)}% no padrão recente (${mediasRecente.toFixed(1)}h → ${horas}h)`,
        recomendacao: 'Investigar mudança de projeto, cliente ou escala de trabalho',
      };
    }
  }

  return null;
}

/**
 * Processar anomalias em batch
 */
export function detectarMultiplasAnomalias(
  apontamentos: Array<{
    id: string;
    data: string;
    horas_trabalhadas: number;
    prestador_id: string;
  }>,
  groupedByPrestador: { [prestador_id: string]: Array<{ horas_trabalhadas: number; data: string }> }
): Map<string, AnomaliaApontamento[]> {
  const anomalias = new Map<string, AnomaliaApontamento[]>();

  for (const apontamento of apontamentos) {
    const historico = groupedByPrestador[apontamento.prestador_id] || [];
    const stats = calcularEstatisticas(historico);

    const anomalia = detectarAnomalia(apontamento, historico, stats);
    if (anomalia) {
      if (!anomalias.has(apontamento.prestador_id)) {
        anomalias.set(apontamento.prestador_id, []);
      }
      anomalias.get(apontamento.prestador_id)!.push(anomalia);
    }
  }

  return anomalias;
}

/**
 * Gerar relatório de anomalias por severidade
 */
export interface RelatorioAnomalias {
  total_apontamentos: number;
  total_anomalias: number;
  criticas: AnomaliaApontamento[];
  alerta: AnomaliaApontamento[];
  info: AnomaliaApontamento[];
  taxa_anomalia: number;
}

export function gerarRelatorioAnomalias(
  apontamentos: Array<{
    id: string;
    data: string;
    horas_trabalhadas: number;
    prestador_id: string;
  }>,
  groupedByPrestador: { [prestador_id: string]: Array<{ horas_trabalhadas: number; data: string }> }
): RelatorioAnomalias {
  const anomalias = detectarMultiplasAnomalias(apontamentos, groupedByPrestador);
  const todasAnomalias: AnomaliaApontamento[] = [];

  anomalias.forEach((lista) => todasAnomalias.push(...lista));

  const criticas = todasAnomalias.filter((a) => a.score_anomalia >= 80);
  const alerta = todasAnomalias.filter((a) => a.score_anomalia >= 60 && a.score_anomalia < 80);
  const info = todasAnomalias.filter((a) => a.score_anomalia < 60);

  return {
    total_apontamentos: apontamentos.length,
    total_anomalias: todasAnomalias.length,
    criticas,
    alerta,
    info,
    taxa_anomalia: parseFloat(
      ((todasAnomalias.length / apontamentos.length) * 100).toFixed(2)
    ),
  };
}
