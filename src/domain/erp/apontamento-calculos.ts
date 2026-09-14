/**
 * Módulo de Cálculos para Apontamento do Prestador
 * Implementa todas as regras de negócio complexas para cálculo de:
 * - Atendimentos com urgência
 * - Limpeza e manutenção Airbnb
 * - Reembolso de combustível
 * - Horas efetivas e diárias
 * - Empréstimos com juros
 * - Propostas de reajuste por IPCA
 *
 * Cada função inclui memória de cálculo auditável para rastreabilidade completa
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

/** Resultado auditável de cálculo de urgência */
export interface ResultadoUrgencia {
  valor_base: number;
  adicional_deslocamento: number;
  adicional_percentual: number;
  valor_final: number;
  requer_analise_manual: boolean;
  memoria_calculo: MemoriaCalculoUrgencia;
}

export interface MemoriaCalculoUrgencia {
  data_calculo: string;
  data_atendimento: string;
  minutos_atendimento: number;
  dia_semana: number; // 0-6, domingo é 0
  nome_dia_semana: string;
  houve_deslocamento: boolean;
  tipo_deslocamento?: string;
  eh_dia_util: boolean;
  eh_domingo_feriado: boolean;
  minutos_excedentes: number;
  taxa_excedente: number;
  passos_calculo: string[];
}

/** Resultado auditável de cálculo Airbnb */
export interface ResultadoAirbnb {
  rubrica: string;
  valor_base: number;
  valor_final: number;
  proporcional: boolean;
  requer_analise: boolean;
  motivo_analise?: string;
  memoria_calculo: MemoriaCalculoAirbnb;
}

export interface MemoriaCalculoAirbnb {
  data_calculo: string;
  tipo_unidade: "1q" | "2q";
  tipo_atividade: "limpeza" | "manutencao" | "revisao" | "urgencia";
  dia_semana: number;
  nome_dia_semana: string;
  horario_inicio: string;
  horario_fim: string;
  estava_em_jornada: boolean;
  es_sabado: boolean;
  es_domingo_feriado: boolean;
  eh_dentro_comercial: boolean;
  valor_base_aplicado: number;
  percentual_adicional: number;
  passos_calculo: string[];
}

/** Resultado auditável de cálculo de combustível */
export interface ResultadoCombustivel {
  litros: number;
  valor_reembolso: number;
  memoria_calculo: MemoriaCalculoCombustivel;
}

export interface MemoriaCalculoCombustivel {
  data_calculo: string;
  quilometros: number;
  valor_litro: number;
  km_por_litro: number;
  passos_calculo: string[];
}

/** Resultado auditável de cálculo de horas */
export interface ResultadoHoras {
  horas_efetivas: number;
  intervalo_desconto: number;
  horas_trabalhadas: number;
  diaria_integral: boolean;
  percentual_diaria: number;
  memoria_calculo: MemoriaCalculoHoras;
}

export interface MemoriaCalculoHoras {
  data_calculo: string;
  entrada: string;
  saida_intervalo: string;
  retorno_intervalo: string;
  saida_final: string;
  minutos_trabalhados: number;
  minutos_intervalo: number;
  passos_calculo: string[];
}

/** Resultado auditável de cálculo de empréstimo */
export interface ResultadoEmprestimo {
  valor_original: number;
  taxa_juros_mensal: number;
  prazo_meses: number;
  valor_total_com_juros: number;
  valor_parcela: number;
  parcelas_array: ParcelaEmprestimo[];
  memoria_calculo: MemoriaCalculoEmprestimo;
}

export interface ParcelaEmprestimo {
  numero: number;
  valor_parcela: number;
  juros: number;
  principal: number;
  saldo_devedor: number;
  data_vencimento: string;
}

export interface MemoriaCalculoEmprestimo {
  data_calculo: string;
  metodo: string;
  taxa_juros_mensal_percentual: number;
  taxa_juros_decimal: number;
  fator_juros: number;
  passos_calculo: string[];
}

/** Proposta de reajuste com IPCA */
export interface TabelaAtualizacao {
  rubrica: string;
  valor_atual: number;
  percentual_ipca: number;
  valor_novo: number;
  diferenca: number;
}

export interface ResultadoPropostaReajusteIPCA {
  data_vigencia: string;
  percentual_ipca: number;
  tabelas_propostas: TabelaAtualizacao[];
  memoria_calculo: MemoriaCalculoPropostaIPCA;
}

export interface MemoriaCalculoPropostaIPCA {
  data_calculo: string;
  data_vigencia: string;
  percentual_ipca_aplicado: number;
  rubricas_atualizadas: string[];
  rubricas_nao_atualizadas: string[];
  total_impacto_mensal: number;
  passos_calculo: string[];
}

/** Interface para tabelas de valores vigentes */
export interface TabelasAtuais {
  urgencia: {
    dia_util_ate_60min: number;
    domingo_feriado_ate_60min: number;
    taxa_minuto_excedente_dom_fer: number;
  };
  airbnb_1q: {
    dentro_comercial: number;
    fora_uteis: number;
    sabado_domingo_feriado: number;
  };
  airbnb_2q: {
    dentro_comercial: number;
    fora_uteis: number;
    sabado_domingo_feriado: number;
  };
  deslocamentos: {
    carvoeira_corrego: number;
  };
  busca_materiais?: {
    diaria: number;
  };
  diaria_ajudante?: {
    valor: number;
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Determina se um dia é útil (segunda a sexta)
 * @param diaSemana 0-6, onde domingo=0, segunda=1, ..., sábado=6
 */
function ehDiaUtil(diaSemana: number): boolean {
  return diaSemana >= 1 && diaSemana <= 5;
}

/**
 * Determina se um dia é domingo ou feriado
 * Nota: Feriados devem ser passados como domingo_feriado=true
 */
function ehDomingoOuFeriado(diaSemana: number, domingo_feriado: boolean = false): boolean {
  return diaSemana === 0 || domingo_feriado;
}

/**
 * Determina se horário está dentro do comercial (09:00 às 18:00)
 */
function ehDentroComercial(horario_inicio: string, horario_fim: string): boolean {
  const [h_ini, m_ini] = horario_inicio.split(":").map(Number);
  const [h_fim, m_fim] = horario_fim.split(":").map(Number);

  const inicio_minutos = h_ini * 60 + m_ini;
  const fim_minutos = h_fim * 60 + m_fim;

  const comercial_inicio = 9 * 60; // 09:00
  const comercial_fim = 18 * 60; // 18:00

  return inicio_minutos >= comercial_inicio && fim_minutos <= comercial_fim;
}

/**
 * Calcula diferença em minutos entre dois horários
 */
function calcularMinutos(horario_inicio: string, horario_fim: string): number {
  const [h_ini, m_ini] = horario_inicio.split(":").map(Number);
  const [h_fim, m_fim] = horario_fim.split(":").map(Number);

  const inicio_minutos = h_ini * 60 + m_ini;
  const fim_minutos = h_fim * 60 + m_fim;

  let diferenca = fim_minutos - inicio_minutos;
  if (diferenca < 0) {
    diferenca += 24 * 60; // Cruzou meia-noite
  }

  return diferenca;
}

/**
 * Obtém nome do dia da semana em português
 */
function getNomeDia(diaSemana: number): string {
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return dias[diaSemana] || "Desconhecido";
}

/**
 * Arredonda para 2 casas decimais (centavos)
 */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// ============================================================================
// FUNÇÃO 1: CALCULAR URGÊNCIA
// ============================================================================

/**
 * Calcula valor para atendimento de urgência com regras complexas
 *
 * Regras:
 * - Dia útil até 60 min: R$50
 * - Domingo/feriado até 60 min: R$62,50
 * - Acima de 60 min dia útil: requer análise manual
 * - Acima de 60 min dom/fer: R$62,50 + (minutos_excedentes × 0.546875)
 * - Deslocamento Carvoeira↔Córrego: +R$21 (somente se houve)
 */
export function calcularUrgencia(
  dataAtendimento: string,
  minutosAtendimento: number,
  houveDeslocation: boolean,
  diaSemana: number,
  deslocamento_tipo?: string,
): ResultadoUrgencia {
  const memoria: MemoriaCalculoUrgencia = {
    data_calculo: new Date().toISOString(),
    data_atendimento: dataAtendimento,
    minutos_atendimento: minutosAtendimento,
    dia_semana: diaSemana,
    nome_dia_semana: getNomeDia(diaSemana),
    houve_deslocamento: houveDeslocation,
    tipo_deslocamento: deslocamento_tipo,
    eh_dia_util: ehDiaUtil(diaSemana),
    eh_domingo_feriado: ehDomingoOuFeriado(diaSemana),
    minutos_excedentes: 0,
    taxa_excedente: 0.546875,
    passos_calculo: [],
  };

  let valor_base = 0;
  let adicional_deslocamento = 0;
  let adicional_percentual = 0;
  let requer_analise_manual = false;

  // Passo 1: Calcular valor base conforme dia e duração
  if (minutosAtendimento <= 60) {
    if (ehDiaUtil(diaSemana)) {
      valor_base = 50;
      memoria.passos_calculo.push(`Dia útil, até 60 min: R$ ${valor_base}`);
    } else {
      valor_base = 62.5;
      memoria.passos_calculo.push(`Domingo/feriado, até 60 min: R$ ${valor_base}`);
    }
  } else {
    // Acima de 60 minutos
    if (ehDiaUtil(diaSemana)) {
      // Dia útil acima de 60 min: requer análise manual
      requer_analise_manual = true;
      valor_base = 50; // Base mesmo assim
      memoria.passos_calculo.push(
        `Dia útil, acima de 60 min: REQUER ANÁLISE MANUAL (${minutosAtendimento} min)`,
      );
    } else {
      // Domingo/feriado acima de 60 min: valor fixo + proporcional
      valor_base = 62.5;
      const minutos_excedentes = minutosAtendimento - 60;
      adicional_percentual = arredondarCentavos(minutos_excedentes * memoria.taxa_excedente);
      memoria.minutos_excedentes = minutos_excedentes;
      memoria.passos_calculo.push(
        `Domingo/feriado, acima de 60 min: R$ ${valor_base} + (${minutos_excedentes} min × R$ ${memoria.taxa_excedente}) = R$ ${adicional_percentual}`,
      );
    }
  }

  // Passo 2: Adicionar deslocamento se houver
  if (houveDeslocation) {
    if (!deslocamento_tipo || deslocamento_tipo === "Carvoeira-Corrego" || deslocamento_tipo === "Corrego-Carvoeira") {
      adicional_deslocamento = 21;
      memoria.passos_calculo.push(
        `Deslocamento Carvoeira ↔ Córrego: +R$ ${adicional_deslocamento}`,
      );
    }
  }

  // Passo 3: Calcular valor final
  const valor_final = arredondarCentavos(valor_base + adicional_percentual + adicional_deslocamento);

  memoria.passos_calculo.push(
    `Valor final: R$ ${valor_base} + R$ ${adicional_percentual} + R$ ${adicional_deslocamento} = R$ ${valor_final}`,
  );

  return {
    valor_base: arredondarCentavos(valor_base),
    adicional_deslocamento: arredondarCentavos(adicional_deslocamento),
    adicional_percentual: arredondarCentavos(adicional_percentual),
    valor_final,
    requer_analise_manual,
    memoria_calculo: memoria,
  };
}

// ============================================================================
// FUNÇÃO 2: CALCULAR AIRBNB
// ============================================================================

/**
 * Calcula valor para limpeza/manutenção de Airbnb
 *
 * Regras:
 * - 1 quarto: R$31,50 (dentro), R$42,00 (fora úteis), R$63,00 (sab/dom/feriado)
 * - 2 quartos: +20% em todas
 * - Sábado = dia normal (usa valor de dia útil)
 * - Manutenção dentro = hora normal
 * - Manutenção fora = hora normal + urgência (20% úteis / 25% fim de semana)
 * - Revisão/urgência/manutenção estadia: marca para análise gestor
 */
export function calcularAirbnb(
  tipo_unidade: "1q" | "2q",
  tipo_atividade: "limpeza" | "manutencao" | "revisao" | "urgencia",
  horario_inicio: string,
  horario_fim: string,
  dia_semana: number,
  estava_em_jornada: boolean,
  domingo_feriado: boolean = false,
): ResultadoAirbnb {
  const memoria: MemoriaCalculoAirbnb = {
    data_calculo: new Date().toISOString(),
    tipo_unidade,
    tipo_atividade,
    dia_semana,
    nome_dia_semana: getNomeDia(dia_semana),
    horario_inicio,
    horario_fim,
    estava_em_jornada,
    es_sabado: dia_semana === 6,
    es_domingo_feriado: dia_semana === 0 || domingo_feriado,
    eh_dentro_comercial: ehDentroComercial(horario_inicio, horario_fim),
    valor_base_aplicado: 0,
    percentual_adicional: 0,
    passos_calculo: [],
  };

  let valor_base = 0;
  let percentual_adicional = 0;
  let requer_analise = false;
  let motivo_analise = "";
  let rubrica = "";
  let proporcional = false;

  // Passo 1: Determinar se está dentro do comercial
  const dentro_comercial = ehDentroComercial(horario_inicio, horario_fim);

  // Passo 2: Mapear valores base conforme tipo de atividade e período
  if (tipo_atividade === "limpeza") {
    if (dentro_comercial) {
      valor_base = tipo_unidade === "1q" ? 31.5 : 31.5 * 1.2;
      rubrica = `Limpeza Airbnb ${tipo_unidade} (dentro comercial)`;
      memoria.passos_calculo.push(
        `Limpeza dentro do comercial (${dentro_comercial}): valor base = R$ ${valor_base}`,
      );
    } else {
      // Fora do comercial
      if (memoria.es_sabado) {
        // Sábado = dia normal = valor de fora úteis
        valor_base = tipo_unidade === "1q" ? 42 : 42 * 1.2;
        rubrica = `Limpeza Airbnb ${tipo_unidade} (fora comercial - sábado)`;
      } else if (ehDiaUtil(dia_semana)) {
        // Dia útil fora do comercial
        valor_base = tipo_unidade === "1q" ? 42 : 42 * 1.2;
        rubrica = `Limpeza Airbnb ${tipo_unidade} (fora comercial - útil)`;
      } else {
        // Domingo/feriado
        valor_base = tipo_unidade === "1q" ? 63 : 63 * 1.2;
        rubrica = `Limpeza Airbnb ${tipo_unidade} (dom/feriado)`;
      }
      memoria.passos_calculo.push(`Limpeza fora do comercial: valor base = R$ ${valor_base}`);
    }
  } else if (tipo_atividade === "manutencao") {
    if (dentro_comercial) {
      // Manutenção dentro = hora normal
      valor_base = tipo_unidade === "1q" ? 31.5 : 31.5 * 1.2;
      rubrica = `Manutenção Airbnb ${tipo_unidade} (dentro)`;
      memoria.passos_calculo.push(`Manutenção dentro: hora normal = R$ ${valor_base}`);
    } else {
      // Manutenção fora = hora normal + urgência
      valor_base = tipo_unidade === "1q" ? 42 : 42 * 1.2;

      if (ehDiaUtil(dia_semana)) {
        percentual_adicional = valor_base * 0.2; // 20% adição úteis
        memoria.percentual_adicional = 20;
      } else {
        percentual_adicional = valor_base * 0.25; // 25% adição fim de semana
        memoria.percentual_adicional = 25;
      }

      rubrica = `Manutenção Airbnb ${tipo_unidade} (fora)`;
      memoria.passos_calculo.push(
        `Manutenção fora: R$ ${valor_base} + ${memoria.percentual_adicional}% = R$ ${percentual_adicional}`,
      );
    }
  } else if (tipo_atividade === "revisao") {
    requer_analise = true;
    motivo_analise = "Revisão: requer análise do gestor para definição de rubrica e valor";
    rubrica = `Revisão Airbnb ${tipo_unidade}`;
    memoria.passos_calculo.push(`Revisão: REQUER ANÁLISE DO GESTOR`);
  } else if (tipo_atividade === "urgencia") {
    requer_analise = true;
    motivo_analise = "Urgência: requer análise do gestor para definição de rubrica e valor";
    rubrica = `Urgência Airbnb ${tipo_unidade}`;
    memoria.passos_calculo.push(`Urgência: REQUER ANÁLISE DO GESTOR`);
  }

  // Passo 3: Aplicar multiplicador 20% para 2 quartos (já aplicado acima)

  // Passo 4: Calcular valor final
  const valor_final = arredondarCentavos(valor_base + percentual_adicional);

  memoria.valor_base_aplicado = arredondarCentavos(valor_base);
  memoria.passos_calculo.push(`Valor final: R$ ${valor_final}`);

  return {
    rubrica,
    valor_base: arredondarCentavos(valor_base),
    valor_final,
    proporcional,
    requer_analise,
    motivo_analise: motivo_analise || undefined,
    memoria_calculo: memoria,
  };
}

// ============================================================================
// FUNÇÃO 3: CALCULAR COMBUSTÍVEL
// ============================================================================

/**
 * Calcula reembolso de combustível
 *
 * Fórmula: litros = km / km_por_litro; valor = litros × valor_litro
 *
 * Permite atualização manual de valor_litro e km_por_litro
 */
export function calcularCombustivel(
  quilometros: number,
  valor_litro: number = 6.5,
  km_por_litro: number = 10,
): ResultadoCombustivel {
  const memoria: MemoriaCalculoCombustivel = {
    data_calculo: new Date().toISOString(),
    quilometros,
    valor_litro,
    km_por_litro,
    passos_calculo: [],
  };

  memoria.passos_calculo.push(`Quilometros percorridos: ${quilometros} km`);
  memoria.passos_calculo.push(`Consumo do veículo: ${km_por_litro} km/litro`);
  memoria.passos_calculo.push(`Valor do litro: R$ ${valor_litro.toFixed(2)}`);

  // Passo 1: Calcular litros consumidos
  const litros = quilometros / km_por_litro;
  memoria.passos_calculo.push(`Litros consumidos: ${quilometros} ÷ ${km_por_litro} = ${litros.toFixed(4)} litros`);

  // Passo 2: Calcular valor do reembolso
  const valor_reembolso = arredondarCentavos(litros * valor_litro);
  memoria.passos_calculo.push(
    `Valor do reembolso: ${litros.toFixed(4)} × R$ ${valor_litro.toFixed(2)} = R$ ${valor_reembolso.toFixed(2)}`,
  );

  return {
    litros: arredondarCentavos(litros),
    valor_reembolso,
    memoria_calculo: memoria,
  };
}

// ============================================================================
// FUNÇÃO 4: CALCULAR HORAS
// ============================================================================

/**
 * Calcula horas efetivas de trabalho
 *
 * Regras:
 * - Diária integral: ≥8 horas efetivas = 100%
 * - Abaixo: cálculo proporcional
 * - Intervalo desconto: sempre o efetivamente registrado
 *
 * @param entrada HH:MM
 * @param saida_intervalo HH:MM
 * @param retorno_intervalo HH:MM
 * @param saida_final HH:MM
 */
export function calcularHoras(
  entrada: string,
  saida_intervalo: string,
  retorno_intervalo: string,
  saida_final: string,
): ResultadoHoras {
  const memoria: MemoriaCalculoHoras = {
    data_calculo: new Date().toISOString(),
    entrada,
    saida_intervalo,
    retorno_intervalo,
    saida_final,
    minutos_trabalhados: 0,
    minutos_intervalo: 0,
    passos_calculo: [],
  };

  // Passo 1: Calcular tempo antes do intervalo
  const minutos_antes_intervalo = calcularMinutos(entrada, saida_intervalo);
  memoria.passos_calculo.push(`Entrada: ${entrada} → Saída intervalo: ${saida_intervalo} = ${minutos_antes_intervalo} min`);

  // Passo 2: Calcular tempo de intervalo
  const minutos_intervalo = calcularMinutos(saida_intervalo, retorno_intervalo);
  memoria.minutos_intervalo = minutos_intervalo;
  memoria.passos_calculo.push(`Intervalo: ${saida_intervalo} → ${retorno_intervalo} = ${minutos_intervalo} min`);

  // Passo 3: Calcular tempo após intervalo
  const minutos_depois_intervalo = calcularMinutos(retorno_intervalo, saida_final);
  memoria.passos_calculo.push(`Retorno: ${retorno_intervalo} → Saída: ${saida_final} = ${minutos_depois_intervalo} min`);

  // Passo 4: Calcular total de minutos trabalhados (sem intervalo)
  const minutos_trabalhados = minutos_antes_intervalo + minutos_depois_intervalo;
  memoria.minutos_trabalhados = minutos_trabalhados;
  memoria.passos_calculo.push(`Total trabalhado: ${minutos_antes_intervalo} + ${minutos_depois_intervalo} = ${minutos_trabalhados} min`);

  // Passo 5: Converter para horas
  const horas_efetivas = arredondarCentavos(minutos_trabalhados / 60);
  memoria.passos_calculo.push(`Horas efetivas: ${minutos_trabalhados} ÷ 60 = ${horas_efetivas.toFixed(2)} h`);

  // Passo 6: Determinar se é diária integral
  const diaria_integral = horas_efetivas >= 8;
  const percentual_diaria = diaria_integral ? 100 : arredondarCentavos((horas_efetivas / 8) * 100);

  memoria.passos_calculo.push(
    diaria_integral
      ? `Diária integral (${horas_efetivas} h ≥ 8 h): 100%`
      : `Diária proporcional (${horas_efetivas} h ÷ 8 h): ${percentual_diaria}%`,
  );

  return {
    horas_efetivas,
    intervalo_desconto: arredondarCentavos(minutos_intervalo / 60),
    horas_trabalhadas: horas_efetivas,
    diaria_integral,
    percentual_diaria,
    memoria_calculo: memoria,
  };
}

// ============================================================================
// FUNÇÃO 5: CALCULAR EMPRÉSTIMO
// ============================================================================

/**
 * Calcula empréstimo com juros compostos
 *
 * Utiliza fórmula padrão de amortização (sistema Price)
 * @param valor_original Valor inicial do empréstimo
 * @param taxa_juros_mensal Taxa mensal em % (ex: 2.5 para 2.5%)
 * @param prazo_meses Número de parcelas
 */
export function calcularEmprestimo(
  valor_original: number,
  taxa_juros_mensal: number,
  prazo_meses: number,
): ResultadoEmprestimo {
  const taxa_decimal = taxa_juros_mensal / 100;
  const fator = Math.pow(1 + taxa_decimal, prazo_meses);

  const memoria: MemoriaCalculoEmprestimo = {
    data_calculo: new Date().toISOString(),
    metodo: "Sistema Price (Amortização Constante)",
    taxa_juros_mensal_percentual: taxa_juros_mensal,
    taxa_juros_decimal: taxa_decimal,
    fator_juros: fator,
    passos_calculo: [],
  };

  memoria.passos_calculo.push(
    `Valor original: R$ ${valor_original.toFixed(2)}`,
  );
  memoria.passos_calculo.push(
    `Taxa mensal: ${taxa_juros_mensal}% (decimal: ${taxa_decimal.toFixed(6)})`,
  );
  memoria.passos_calculo.push(
    `Prazo: ${prazo_meses} meses`,
  );

  // Passo 1: Calcular parcela fixa (Sistema Price)
  const valor_parcela = arredondarCentavos(
    (valor_original * taxa_decimal * fator) / (fator - 1),
  );

  memoria.passos_calculo.push(
    `Fator de juros: (1 + ${taxa_decimal.toFixed(6)})^${prazo_meses} = ${fator.toFixed(6)}`,
  );
  memoria.passos_calculo.push(
    `Parcela fixa: R$ ${valor_original.toFixed(2)} × (${taxa_decimal.toFixed(6)} × ${fator.toFixed(6)}) ÷ (${fator.toFixed(6)} - 1) = R$ ${valor_parcela.toFixed(2)}`,
  );

  // Passo 2: Gerar parcelas com detalhamento
  const parcelas_array: ParcelaEmprestimo[] = [];
  let saldo_devedor = valor_original;

  for (let i = 1; i <= prazo_meses; i++) {
    const juros = arredondarCentavos(saldo_devedor * taxa_decimal);
    const principal = arredondarCentavos(valor_parcela - juros);
    saldo_devedor = arredondarCentavos(saldo_devedor - principal);

    const data_vencimento = new Date();
    data_vencimento.setMonth(data_vencimento.getMonth() + i);
    const data_vencimento_str = data_vencimento.toISOString().split("T")[0];

    parcelas_array.push({
      numero: i,
      valor_parcela,
      juros,
      principal,
      saldo_devedor: Math.max(0, saldo_devedor), // Evitar valores negativos por arredondamento
      data_vencimento: data_vencimento_str,
    });
  }

  const valor_total_com_juros = arredondarCentavos(valor_parcela * prazo_meses);

  memoria.passos_calculo.push(
    `Valor total com juros: R$ ${valor_parcela.toFixed(2)} × ${prazo_meses} = R$ ${valor_total_com_juros.toFixed(2)}`,
  );
  memoria.passos_calculo.push(
    `Total de juros: R$ ${(valor_total_com_juros - valor_original).toFixed(2)}`,
  );

  return {
    valor_original,
    taxa_juros_mensal,
    prazo_meses,
    valor_total_com_juros,
    valor_parcela,
    parcelas_array,
    memoria_calculo: memoria,
  };
}

// ============================================================================
// FUNÇÃO 6: GERAR PROPOSTA DE REAJUSTE IPCA
// ============================================================================

/**
 * Gera proposta de reajuste de tabelas conforme percentual IPCA
 *
 * Rubricas atualizadas:
 * - Urgência (até 60 min e taxa excedente)
 * - Airbnb (1q e 2q)
 * - Deslocamentos
 * - Busca de materiais
 * - Diária ajudante
 *
 * Rubricas NÃO atualizadas:
 * - Combustível (atualização manual)
 */
export function gerarPropostaReajusteIPCA(
  percentual_ipca: number,
  tabelas_atuais: TabelasAtuais,
): ResultadoPropostaReajusteIPCA {
  const memoria: MemoriaCalculoPropostaIPCA = {
    data_calculo: new Date().toISOString(),
    data_vigencia: new Date().toISOString().split("T")[0],
    percentual_ipca_aplicado: percentual_ipca,
    rubricas_atualizadas: [],
    rubricas_nao_atualizadas: [],
    total_impacto_mensal: 0,
    passos_calculo: [],
  };

  const tabelas_propostas: TabelaAtualizacao[] = [];
  let impacto_mensal = 0;

  const taxa_reajuste = 1 + percentual_ipca / 100;

  memoria.passos_calculo.push(`Percentual IPCA: ${percentual_ipca}%`);
  memoria.passos_calculo.push(`Taxa de reajuste: ${taxa_reajuste.toFixed(6)}`);

  // --------- URGÊNCIA ---------
  if (tabelas_atuais.urgencia) {
    // Dia útil até 60 min
    const novo_dia_util = arredondarCentavos(
      tabelas_atuais.urgencia.dia_util_ate_60min * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Urgência - Dia útil até 60 min",
      valor_atual: tabelas_atuais.urgencia.dia_util_ate_60min,
      percentual_ipca,
      valor_novo: novo_dia_util,
      diferenca: arredondarCentavos(novo_dia_util - tabelas_atuais.urgencia.dia_util_ate_60min),
    });
    memoria.rubricas_atualizadas.push("Urgência - Dia útil até 60 min");

    // Domingo/feriado até 60 min
    const novo_dom_fer = arredondarCentavos(
      tabelas_atuais.urgencia.domingo_feriado_ate_60min * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Urgência - Domingo/feriado até 60 min",
      valor_atual: tabelas_atuais.urgencia.domingo_feriado_ate_60min,
      percentual_ipca,
      valor_novo: novo_dom_fer,
      diferenca: arredondarCentavos(novo_dom_fer - tabelas_atuais.urgencia.domingo_feriado_ate_60min),
    });
    memoria.rubricas_atualizadas.push("Urgência - Domingo/feriado até 60 min");

    // Taxa minuto excedente
    const nova_taxa_excedente = arredondarCentavos(
      tabelas_atuais.urgencia.taxa_minuto_excedente_dom_fer * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Urgência - Taxa por minuto excedente (dom/fer)",
      valor_atual: tabelas_atuais.urgencia.taxa_minuto_excedente_dom_fer,
      percentual_ipca,
      valor_novo: nova_taxa_excedente,
      diferenca: arredondarCentavos(nova_taxa_excedente - tabelas_atuais.urgencia.taxa_minuto_excedente_dom_fer),
    });
    memoria.rubricas_atualizadas.push("Urgência - Taxa por minuto excedente");
  }

  // --------- AIRBNB 1 QUARTO ---------
  if (tabelas_atuais.airbnb_1q) {
    // Dentro comercial
    const novo_1q_dentro = arredondarCentavos(
      tabelas_atuais.airbnb_1q.dentro_comercial * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 1Q - Dentro comercial",
      valor_atual: tabelas_atuais.airbnb_1q.dentro_comercial,
      percentual_ipca,
      valor_novo: novo_1q_dentro,
      diferenca: arredondarCentavos(novo_1q_dentro - tabelas_atuais.airbnb_1q.dentro_comercial),
    });
    memoria.rubricas_atualizadas.push("Airbnb 1Q - Dentro comercial");

    // Fora úteis
    const novo_1q_fora = arredondarCentavos(
      tabelas_atuais.airbnb_1q.fora_uteis * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 1Q - Fora horário útil",
      valor_atual: tabelas_atuais.airbnb_1q.fora_uteis,
      percentual_ipca,
      valor_novo: novo_1q_fora,
      diferenca: arredondarCentavos(novo_1q_fora - tabelas_atuais.airbnb_1q.fora_uteis),
    });
    memoria.rubricas_atualizadas.push("Airbnb 1Q - Fora horário útil");

    // Sábado/domingo/feriado
    const novo_1q_fim_semana = arredondarCentavos(
      tabelas_atuais.airbnb_1q.sabado_domingo_feriado * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 1Q - Sábado/domingo/feriado",
      valor_atual: tabelas_atuais.airbnb_1q.sabado_domingo_feriado,
      percentual_ipca,
      valor_novo: novo_1q_fim_semana,
      diferenca: arredondarCentavos(novo_1q_fim_semana - tabelas_atuais.airbnb_1q.sabado_domingo_feriado),
    });
    memoria.rubricas_atualizadas.push("Airbnb 1Q - Sábado/domingo/feriado");
  }

  // --------- AIRBNB 2 QUARTOS ---------
  if (tabelas_atuais.airbnb_2q) {
    // Dentro comercial
    const novo_2q_dentro = arredondarCentavos(
      tabelas_atuais.airbnb_2q.dentro_comercial * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 2Q - Dentro comercial",
      valor_atual: tabelas_atuais.airbnb_2q.dentro_comercial,
      percentual_ipca,
      valor_novo: novo_2q_dentro,
      diferenca: arredondarCentavos(novo_2q_dentro - tabelas_atuais.airbnb_2q.dentro_comercial),
    });
    memoria.rubricas_atualizadas.push("Airbnb 2Q - Dentro comercial");

    // Fora úteis
    const novo_2q_fora = arredondarCentavos(
      tabelas_atuais.airbnb_2q.fora_uteis * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 2Q - Fora horário útil",
      valor_atual: tabelas_atuais.airbnb_2q.fora_uteis,
      percentual_ipca,
      valor_novo: novo_2q_fora,
      diferenca: arredondarCentavos(novo_2q_fora - tabelas_atuais.airbnb_2q.fora_uteis),
    });
    memoria.rubricas_atualizadas.push("Airbnb 2Q - Fora horário útil");

    // Sábado/domingo/feriado
    const novo_2q_fim_semana = arredondarCentavos(
      tabelas_atuais.airbnb_2q.sabado_domingo_feriado * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Airbnb 2Q - Sábado/domingo/feriado",
      valor_atual: tabelas_atuais.airbnb_2q.sabado_domingo_feriado,
      percentual_ipca,
      valor_novo: novo_2q_fim_semana,
      diferenca: arredondarCentavos(novo_2q_fim_semana - tabelas_atuais.airbnb_2q.sabado_domingo_feriado),
    });
    memoria.rubricas_atualizadas.push("Airbnb 2Q - Sábado/domingo/feriado");
  }

  // --------- DESLOCAMENTOS ---------
  if (tabelas_atuais.deslocamentos?.carvoeira_corrego) {
    const novo_deslocamento = arredondarCentavos(
      tabelas_atuais.deslocamentos.carvoeira_corrego * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Deslocamento Carvoeira ↔ Córrego",
      valor_atual: tabelas_atuais.deslocamentos.carvoeira_corrego,
      percentual_ipca,
      valor_novo: novo_deslocamento,
      diferenca: arredondarCentavos(novo_deslocamento - tabelas_atuais.deslocamentos.carvoeira_corrego),
    });
    memoria.rubricas_atualizadas.push("Deslocamento Carvoeira ↔ Córrego");
  }

  // --------- BUSCA DE MATERIAIS ---------
  if (tabelas_atuais.busca_materiais?.diaria) {
    const novo_busca = arredondarCentavos(
      tabelas_atuais.busca_materiais.diaria * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Busca de Materiais - Diária",
      valor_atual: tabelas_atuais.busca_materiais.diaria,
      percentual_ipca,
      valor_novo: novo_busca,
      diferenca: arredondarCentavos(novo_busca - tabelas_atuais.busca_materiais.diaria),
    });
    memoria.rubricas_atualizadas.push("Busca de Materiais - Diária");
  }

  // --------- DIÁRIA AJUDANTE ---------
  if (tabelas_atuais.diaria_ajudante?.valor) {
    const novo_ajudante = arredondarCentavos(
      tabelas_atuais.diaria_ajudante.valor * taxa_reajuste,
    );
    tabelas_propostas.push({
      rubrica: "Diária Ajudante",
      valor_atual: tabelas_atuais.diaria_ajudante.valor,
      percentual_ipca,
      valor_novo: novo_ajudante,
      diferenca: arredondarCentavos(novo_ajudante - tabelas_atuais.diaria_ajudante.valor),
    });
    memoria.rubricas_atualizadas.push("Diária Ajudante");
  }

  // --------- COMBUSTÍVEL (NÃO ATUALIZADO) ---------
  memoria.rubricas_nao_atualizadas.push("Combustível (atualização manual necessária)");

  // Calcular impacto mensal
  impacto_mensal = arredondarCentavos(
    tabelas_propostas.reduce((sum, t) => sum + t.diferenca, 0),
  );

  memoria.total_impacto_mensal = impacto_mensal;
  memoria.passos_calculo.push(
    `Rubricas atualizadas: ${memoria.rubricas_atualizadas.length}`,
  );
  memoria.passos_calculo.push(
    `Rubricas não atualizadas: ${memoria.rubricas_nao_atualizadas.length}`,
  );
  memoria.passos_calculo.push(
    `Impacto mensal total: R$ ${impacto_mensal.toFixed(2)}`,
  );

  return {
    data_vigencia: memoria.data_vigencia,
    percentual_ipca,
    tabelas_propostas,
    memoria_calculo: memoria,
  };
}
