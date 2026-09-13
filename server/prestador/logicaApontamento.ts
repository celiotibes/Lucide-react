// ============================================================================
// Lógica Pura: Cálculo de Apontamentos e Fechamentos de Prestadores
// ============================================================================

export interface RegrasApontamento {
  diaria: number;
  valor_hora?: number;
  combustivel_diario_litros?: number;
  combustivel_valor_litro?: number;
  combustivel_base_mensal?: number;
  // Cristiano específico:
  kit_pos_hospedagem_dentro_8h?: number;
  kit_extraordinario_dia_semana?: number;
  kit_extraordinario_fim_semana?: number;
  emergencia_percentual_extra?: number;
  emergencia_deslocamento?: number;
  emergencia_minimo?: number;
  intervalo_almoco_minutos?: number;
  // Paulo específico:
  adicional_comunicacao?: number;
  gatilho_combustivel_crise?: number;
  percentual_crise?: number;
}

export interface ApontamentoDado {
  data: Date;
  hora_inicio?: string; // HH:mm
  hora_saida?: string;
  intervalo_almoco_minutos: number;
  descricao_atividades?: string;
  quilometragem_extra?: number;
  tipo_deslocamento?: 'corrego_grande' | 'suprimentos_ate5km' | 'quilometragem' | 'interno';
  quantidade_kits_pos_hospedagem?: number;
  quantidade_kits_dentro_horario?: number;
  eh_emergencia?: boolean;
  residenciais_ids?: string[]; // UUIDs dos residenciais visitados
  residencial_horas?: Record<string, number>; // { residencial_id: horas } para rateio manual
}

/**
 * Calcula horas trabalhadas a partir de horário de início e saída
 * Deduz intervalo de almoço automaticamente
 */
export function calcularHoras(
  horaInicio: string | undefined,
  horaSaida: string | undefined,
  intervaloAlmocoMinutos: number
): number {
  if (!horaInicio || !horaSaida) return 0;

  const [hI, mI] = horaInicio.split(':').map(Number);
  const [hS, mS] = horaSaida.split(':').map(Number);

  const minutosTrabalhados = hS * 60 + mS - (hI * 60 + mI);
  const horasTrabalhadas = (minutosTrabalhados - intervaloAlmocoMinutos) / 60;

  return Math.max(0, horasTrabalhadas);
}

/**
 * Calcula valor de combustível baseado em quilometragem e tipo de deslocamento
 */
export function calcularCombustivel(
  quilometragemExtra: number | undefined,
  tipoDeslocamento: string | undefined,
  regras: RegrasApontamento
): number {
  if (!quilometragemExtra && !tipoDeslocamento) return 0;

  // Deslocamentos fixos
  if (tipoDeslocamento === 'corrego_grande' || tipoDeslocamento === 'suprimentos_ate5km') {
    return 20.0; // Fixo R$ 20,00
  }

  // Quilometragem extra (em litros, aprox 12 km/L)
  if (quilometragemExtra && tipoDeslocamento === 'quilometragem') {
    const litros = quilometragemExtra / 12; // aprox 12 km/L
    return litros * (regras.combustivel_valor_litro || 7.2);
  }

  return 0;
}

/**
 * Calcula valor de kits Airbnb (Cristiano)
 */
export function calcularKits(
  dia: Date,
  quantidade_dentro_8h: number | undefined,
  quantidade_extraordinario: number | undefined,
  regras: RegrasApontamento
): number {
  let total = 0;

  // Kits dentro do horário padrão (8h)
  if (quantidade_dentro_8h && quantidade_dentro_8h > 0) {
    total += quantidade_dentro_8h * (regras.kit_pos_hospedagem_dentro_8h || 30.0);
  }

  // Kits extraordinário (fora do horário)
  if (quantidade_extraordinario && quantidade_extraordinario > 0) {
    const ehFimDeSemana = dia.getDay() === 0 || dia.getDay() === 6;

    if (ehFimDeSemana) {
      // Fim de semana: R$ 60,00 por kit (ou R$ 80,00 se emergência)
      total += quantidade_extraordinario * (regras.kit_extraordinario_fim_semana || 60.0);
    } else {
      // Dia de semana extraordinário: R$ 40,00
      total += quantidade_extraordinario * (regras.kit_extraordinario_dia_semana || 40.0);
    }
  }

  return total;
}

/**
 * Calcula valor de emergência (20% extra + deslocamento + mínimo garantido)
 */
export function calcularEmergencia(
  horasTrabalhadas: number,
  regras: RegrasApontamento
): number {
  if (!horasTrabalhadas || horasTrabalhadas === 0) return 0;

  const valorHora = (regras.diaria / 8) * (1 + (regras.emergencia_percentual_extra || 20) / 100);
  const valorHoras = horasTrabalhadas * valorHora;
  const deslocamento = regras.emergencia_deslocamento || 20.0;
  const minimo = regras.emergencia_minimo || 50.0;

  // Se até 2 horas, aplica mínimo
  if (horasTrabalhadas <= 2) {
    return minimo + deslocamento;
  }

  return valorHoras + deslocamento;
}

/**
 * Rateio automático: divide horas por número de residenciais se não preenchido manualmente
 */
export function rateiarAutomatico(
  horasTrabalhadas: number,
  residencialIds: string[] | undefined,
  residencialHoras: Record<string, number> | undefined
): Record<string, number> {
  // Se preenchimento manual, retorna como está
  if (residencialHoras && Object.keys(residencialHoras).length > 0) {
    return residencialHoras;
  }

  // Se não há residencial informado, não rateia
  if (!residencialIds || residencialIds.length === 0) {
    return {};
  }

  // Rateio proporcional
  const horasPorResidencial = horasTrabalhadas / residencialIds.length;
  const resultado: Record<string, number> = {};

  residencialIds.forEach((id) => {
    resultado[id] = parseFloat(horasPorResidencial.toFixed(2));
  });

  return resultado;
}

/**
 * Calcula valor total de um apontamento (sem descontos)
 */
export function calcularApontamentoTotal(
  apontamento: ApontamentoDado,
  regras: RegrasApontamento,
  ehDiaTrabalho: boolean = true
): {
  horas_trabalhadas: number;
  valor_diaria: number;
  valor_horas_adicionais: number;
  valor_combustivel: number;
  valor_kits: number;
  valor_emergencia: number;
  valor_deslocamento: number;
  total: number;
} {
  const horas = calcularHoras(apontamento.hora_inicio, apontamento.hora_saida, apontamento.intervalo_almoco_minutos);
  const diaria = regras.diaria || 0;
  const valorHora = regras.valor_hora || diaria / 8;

  // Diária (0-8h é 1 diária, acima disso é hora extra)
  const horasAte8 = Math.min(horas, 8);
  const horasExtras = Math.max(0, horas - 8);
  const valorDiaria = ehDiaTrabalho ? diaria : 0;
  const valorExtras = horasExtras * valorHora;

  // Combustível
  const valorCombustivel = calcularCombustivel(
    apontamento.quilometragem_extra,
    apontamento.tipo_deslocamento,
    regras
  );

  // Kits (Cristiano)
  const valorKits = calcularKits(
    apontamento.data,
    apontamento.quantidade_kits_dentro_horario,
    apontamento.quantidade_kits_pos_hospedagem,
    regras
  );

  // Emergência
  const valorEmergencia = apontamento.eh_emergencia ? calcularEmergencia(horas, regras) : 0;

  const total = valorDiaria + valorExtras + valorCombustivel + valorKits + valorEmergencia;

  return {
    horas_trabalhadas: parseFloat(horas.toFixed(2)),
    valor_diaria: parseFloat(valorDiaria.toFixed(2)),
    valor_horas_adicionais: parseFloat(valorExtras.toFixed(2)),
    valor_combustivel: parseFloat(valorCombustivel.toFixed(2)),
    valor_kits: parseFloat(valorKits.toFixed(2)),
    valor_emergencia: parseFloat(valorEmergencia.toFixed(2)),
    valor_deslocamento: 0, // Calculado separadamente se necessário
    total: parseFloat(total.toFixed(2)),
  };
}

/**
 * Calcula fechamento mensal/semanal a partir de apontamentos
 */
export function calcularFechamento(
  apontamentos: Array<ApontamentoDado & { valor_total: number }>,
  adiantamentosDescontados: number = 0,
  parcelasDescontadas: number = 0
): {
  total_proventos: number;
  total_deducoes: number;
  valor_liquido: number;
} {
  const total_proventos = apontamentos.reduce((sum, a) => sum + (a.valor_total || 0), 0);
  const total_deducoes = adiantamentosDescontados + parcelasDescontadas;
  const valor_liquido = total_proventos - total_deducoes;

  return {
    total_proventos: parseFloat(total_proventos.toFixed(2)),
    total_deducoes: parseFloat(total_deducoes.toFixed(2)),
    valor_liquido: parseFloat(valor_liquido.toFixed(2)),
  };
}
