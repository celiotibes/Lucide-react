/**
 * Módulo de Apontamento do Prestador
 * Gerencia urgências, Airbnb, combustível, horas, empréstimos e reajustes IPCA
 */

export interface ConfiguraCombustivel {
  valor_litro: number;
  km_litro: number;
}

export interface CombustivelApontamento {
  id?: number;
  apontamento_id: number;
  km_percorrido: number;
  valor_total: number;
  valor_litro: number;
  km_litro: number;
  criado_em?: string;
}

export interface RegistroHora {
  data: string;
  tipo: "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida";
  horario: string; // HH:MM
  descricao?: string;
}

export interface HorasApontamento {
  registros: RegistroHora[];
  horas_efetivas: number;
  percentual_diaria: number;
  tipo_cobranca: "integral" | "proporcional";
}

export interface ParcelaEmprestimo {
  numero: number;
  data_vencimento: string;
  valor_parcela: number;
  juros: number;
  principal: number;
  saldo_devedor: number;
}

export interface EmprestimoApontamento {
  id?: number;
  beneficiario_nome: string;
  valor_contratado: number;
  data_contratacao: string;
  numero_parcelas: number;
  taxa_juros_mensal: number;
  tipo_juros: "simples" | "composto";
  parcelas: ParcelaEmprestimo[];
  data_criacao?: string;
  memoria_calculo?: string;
}

export interface MemoriaReajuste {
  valor_anterior: number;
  percentual_ipca: number;
  valor_novo: number;
  tipo_item: string;
  data_reajuste: string;
}

export interface ApontamentoUrgencia {
  id?: number;
  prestador_id: number;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  minutos_trabalhados: number;
  eh_dia_util: boolean;
  eh_sabado: boolean;
  eh_domingo: boolean;
  eh_feriado: boolean;
  valor_base: number;
  adicional_domingo: number;
  adicional_deslocamento: number;
  valor_total: number;
  tem_deslocamento: boolean;
  requer_analise: boolean;
  criado_em?: string;
  memoria_calculo?: string;
}

export interface AirbnbApontamento {
  id?: number;
  prestador_id: number;
  data: string;
  tipo_servico: "limpeza" | "manutencao" | "revisao";
  numero_quartos: 1 | 2 | 3;
  dentro_horario_normal: boolean;
  dentro_dias_uteis: boolean;
  valor_base: number;
  adicional_sab_dom_feriado: number;
  adicional_fora_expediente: number;
  valor_total: number;
  tem_falha: boolean;
  requer_analise: boolean;
  criado_em?: string;
  memoria_calculo?: string;
}

export interface ApontamentoDetalhado {
  id?: number;
  prestador_id: number;
  data: string;
  tipo_apontamento: "urgencia" | "airbnb" | "combustivel" | "emprestimo";
  urgencia?: ApontamentoUrgencia;
  airbnb?: AirbnbApontamento;
  combustivel?: CombustivelApontamento;
  horas?: HorasApontamento;
  emprestimo?: EmprestimoApontamento;
  requer_aprovacao_gestor?: boolean;
  criado_em?: string;
}

/**
 * Calcula o valor de uma urgência baseado na data, horário e duração
 */
export function calcularUrgencia(
  data: string,
  horario_inicio: string,
  horario_fim: string,
  tem_deslocamento: boolean,
  feriados: string[] = []
): ApontamentoUrgencia {
  const dataObj = new Date(data);
  const diaSemana = dataObj.getDay(); // 0=domingo, 6=sábado
  const eh_domingo = diaSemana === 0;
  const eh_sabado = diaSemana === 6;
  const eh_dia_util = !eh_domingo && !eh_sabado;
  const eh_feriado = feriados.includes(data);

  // Se feriado cair em dia útil, trata como domingo
  const trataComoSabadoDomingo = eh_feriado && eh_dia_util;

  // Calcular minutos trabalhados
  const [horaIni, minIni] = horario_inicio.split(":").map(Number);
  const [horaFim, minFim] = horario_fim.split(":").map(Number);
  const minutosTrabalhados =
    horaFim * 60 + minFim - (horaIni * 60 + minIni);

  let valor_base = 0;
  let adicional_domingo = 0;
  let requer_analise = false;

  // Até 60 minutos
  if (minutosTrabalhados <= 60) {
    if (eh_domingo || trataComoSabadoDomingo) {
      valor_base = 62.5;
    } else if (eh_sabado) {
      valor_base = 50; // Sábado (dia normal) sem adicional
    } else {
      valor_base = 50; // Dia útil
    }
  } else {
    // Acima de 60 minutos
    if (eh_dia_util && !eh_feriado) {
      // Dia útil acima de 60 min requer análise
      requer_analise = true;
      valor_base = 50;
      const minutosAdicionais = minutosTrabalhados - 60;
      adicional_domingo = minutosAdicionais * 0.546875;
    } else if (eh_domingo || trataComoSabadoDomingo) {
      valor_base = 62.5;
      const minutosAdicionais = minutosTrabalhados - 60;
      adicional_domingo = minutosAdicionais * 0.546875;
    } else if (eh_sabado) {
      valor_base = 50;
      const minutosAdicionais = minutosTrabalhados - 60;
      adicional_domingo = minutosAdicionais * 0.546875;
    }
  }

  const adicional_deslocamento = tem_deslocamento ? 21 : 0;
  const valor_total =
    valor_base + adicional_domingo + adicional_deslocamento;

  return {
    prestador_id: 0,
    data,
    horario_inicio,
    horario_fim,
    minutos_trabalhados: minutosTrabalhados,
    eh_dia_util,
    eh_sabado,
    eh_domingo,
    eh_feriado,
    valor_base: parseFloat(valor_base.toFixed(2)),
    adicional_domingo: parseFloat(adicional_domingo.toFixed(2)),
    adicional_deslocamento,
    valor_total: parseFloat(valor_total.toFixed(2)),
    tem_deslocamento,
    requer_analise,
    memoria_calculo: `Base: R$${valor_base.toFixed(2)} + Adicional: R$${adicional_domingo.toFixed(2)} + Deslocamento: R$${adicional_deslocamento.toFixed(2)} = Total: R$${valor_total.toFixed(2)}`,
  };
}

/**
 * Calcula o valor de limpeza/manutenção Airbnb
 */
export function calcularAirbnb(
  data: string,
  tipo_servico: "limpeza" | "manutencao" | "revisao",
  numero_quartos: 1 | 2 | 3,
  dentro_horario_normal: boolean,
  feriados: string[] = [],
  tem_falha_revisao: boolean = false
): AirbnbApontamento {
  const dataObj = new Date(data);
  const diaSemana = dataObj.getDay();
  const eh_domingo = diaSemana === 0;
  const eh_sabado = diaSemana === 6;
  const eh_dia_util = !eh_domingo && !eh_sabado;
  const eh_feriado = feriados.includes(data);
  const eh_sab_dom_feriado = eh_sabado || eh_domingo || eh_feriado;

  // Para revisão, sempre marca como requer_analise
  const requer_analise_revisao = tipo_servico === "revisao";

  let valor_base = 0;

  // Tabela base por número de quartos e dentro de horário normal
  if (eh_sab_dom_feriado) {
    // Sábado, domingo ou feriado (com 25% de adicional)
    if (numero_quartos === 1) valor_base = 63.0;
    else if (numero_quartos === 2) valor_base = 75.6;
    else valor_base = 90.72;
  } else if (dentro_horario_normal && eh_dia_util) {
    // Dentro de expediente em dias úteis
    if (numero_quartos === 1) valor_base = 31.5;
    else if (numero_quartos === 2) valor_base = 37.8;
    else valor_base = 45.36;
  } else if (!dentro_horario_normal && eh_dia_util) {
    // Fora de expediente em dias úteis
    if (numero_quartos === 1) valor_base = 42.0;
    else if (numero_quartos === 2) valor_base = 50.4;
    else valor_base = 60.48;
  }

  const valor_total = valor_base;

  return {
    prestador_id: 0,
    data,
    tipo_servico,
    numero_quartos,
    dentro_horario_normal,
    dentro_dias_uteis: eh_dia_util,
    valor_base: parseFloat(valor_base.toFixed(2)),
    adicional_sab_dom_feriado: 0,
    adicional_fora_expediente: 0,
    valor_total: parseFloat(valor_total.toFixed(2)),
    tem_falha: tem_falha_revisao,
    requer_analise: requer_analise_revisao,
    memoria_calculo: `${numero_quartos} quarto(s) - Base: R$${valor_base.toFixed(2)} = Total: R$${valor_total.toFixed(2)}`,
  };
}

/**
 * Calcula o valor de combustível baseado em km percorrido
 */
export function calcularCombustivel(
  apontamento_id: number,
  km_percorrido: number,
  config: ConfiguraCombustivel = { valor_litro: 6.5, km_litro: 10 }
): CombustivelApontamento {
  const litros_consumidos = km_percorrido / config.km_litro;
  const valor_total = litros_consumidos * config.valor_litro;

  return {
    apontamento_id,
    km_percorrido,
    valor_total: parseFloat(valor_total.toFixed(2)),
    valor_litro: config.valor_litro,
    km_litro: config.km_litro,
  };
}

/**
 * Calcula horas efetivas trabalhadas
 */
export function calcularHoras(
  registros: RegistroHora[]
): HorasApontamento {
  // Ordenar cronologicamente
  const registrosOrdenados = registros
    .map((r, idx) => ({
      ...r,
      timestamp: new Date(`${r.data}T${r.horario}`).getTime(),
      originalIdx: idx,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  let totalMinutos = 0;
  let i = 0;

  // Lógica: entrada → (saida_intervalo → retorno_intervalo)* → saida
  while (i < registrosOrdenados.length) {
    const registro = registrosOrdenados[i];

    if (registro.tipo === "entrada") {
      // Procurar próxima saída (saida_intervalo ou saida)
      let proximaSaidaIdx = -1;
      for (let j = i + 1; j < registrosOrdenados.length; j++) {
        if (["saida_intervalo", "saida"].includes(registrosOrdenados[j].tipo)) {
          proximaSaidaIdx = j;
          break;
        }
      }

      if (proximaSaidaIdx > -1) {
        const proximaSaida = registrosOrdenados[proximaSaidaIdx];
        const minutosTrabalhados =
          (proximaSaida.timestamp - registro.timestamp) / (1000 * 60);
        totalMinutos += minutosTrabalhados;
        i = proximaSaidaIdx;
      } else {
        i++;
      }
    } else if (registro.tipo === "retorno_intervalo") {
      // Após retorno de intervalo, procurar próxima saída
      let proximaSaidaIdx = -1;
      for (let j = i + 1; j < registrosOrdenados.length; j++) {
        if (["saida_intervalo", "saida"].includes(registrosOrdenados[j].tipo)) {
          proximaSaidaIdx = j;
          break;
        }
      }

      if (proximaSaidaIdx > -1) {
        const proximaSaida = registrosOrdenados[proximaSaidaIdx];
        const minutosTrabalhados =
          (proximaSaida.timestamp - registro.timestamp) / (1000 * 60);
        totalMinutos += minutosTrabalhados;
        i = proximaSaidaIdx;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  const horas_efetivas = totalMinutos / 60;
  const percentual_diaria =
    horas_efetivas >= 8 ? 100 : (horas_efetivas / 8) * 100;
  const tipo_cobranca = percentual_diaria >= 100 ? "integral" : "proporcional";

  return {
    registros,
    horas_efetivas: parseFloat(horas_efetivas.toFixed(2)),
    percentual_diaria: parseFloat(percentual_diaria.toFixed(2)),
    tipo_cobranca,
  };
}

/**
 * Calcula empréstimo com juros simples ou compostos
 */
export function calcularEmprestimo(
  beneficiario_nome: string,
  valor_contratado: number,
  numero_parcelas: number,
  taxa_juros_mensal: number,
  tipo_juros: "simples" | "composto" = "simples",
  data_contratacao: string = new Date().toISOString().split("T")[0]
): EmprestimoApontamento {
  const parcelas: ParcelaEmprestimo[] = [];
  let saldo_devedor = valor_contratado;
  const valor_principal = valor_contratado / numero_parcelas;

  for (let i = 1; i <= numero_parcelas; i++) {
    let juros = 0;

    if (tipo_juros === "simples") {
      juros = valor_contratado * (taxa_juros_mensal / 100) * (i / numero_parcelas);
    } else {
      // Compostos
      const parcela_anterior = valor_contratado * (1 - (i - 1) / numero_parcelas);
      juros = parcela_anterior * (taxa_juros_mensal / 100);
    }

    const valor_parcela = valor_principal + juros;
    saldo_devedor -= valor_principal;

    const data_vencimento = new Date(data_contratacao);
    data_vencimento.setMonth(data_vencimento.getMonth() + i);

    parcelas.push({
      numero: i,
      data_vencimento: data_vencimento.toISOString().split("T")[0],
      valor_parcela: parseFloat(valor_parcela.toFixed(2)),
      juros: parseFloat(juros.toFixed(2)),
      principal: parseFloat(valor_principal.toFixed(2)),
      saldo_devedor: parseFloat(Math.max(0, saldo_devedor).toFixed(2)),
    });
  }

  const total_juros = parcelas.reduce((sum, p) => sum + p.juros, 0);
  const memoria_calculo = `Valor: R$${valor_contratado.toFixed(2)} | Parcelas: ${numero_parcelas} | Taxa: ${taxa_juros_mensal}% a.m. | Total de juros: R$${total_juros.toFixed(2)} | Tipo: ${tipo_juros}`;

  return {
    beneficiario_nome,
    valor_contratado,
    data_contratacao,
    numero_parcelas,
    taxa_juros_mensal,
    tipo_juros,
    parcelas,
    memoria_calculo,
  };
}

/**
 * Aplica reajuste IPCA aos valores
 */
export function aplicarReajusteIpca(
  percentual_ipca: number,
  valores_atuais: {
    urgencia?: number;
    airbnb_1q?: number;
    airbnb_2q?: number;
    combustivel_litro?: number;
  },
  data_vigencia: string = new Date().toISOString().split("T")[0]
): {
  valores_novos: typeof valores_atuais;
  memorias: MemoriaReajuste[];
  observacoes: string;
} {
  const memorias: MemoriaReajuste[] = [];
  const valores_novos = { ...valores_atuais };

  // Reajustar urgência
  if (valores_atuais.urgencia !== undefined) {
    const valor_novo = parseFloat(
      (valores_atuais.urgencia * (1 + percentual_ipca / 100)).toFixed(2)
    );
    valores_novos.urgencia = valor_novo;
    memorias.push({
      valor_anterior: valores_atuais.urgencia,
      percentual_ipca,
      valor_novo,
      tipo_item: "urgencia",
      data_reajuste: data_vigencia,
    });
  }

  // Reajustar Airbnb (se fornecido)
  if (valores_atuais.airbnb_1q !== undefined) {
    const valor_novo = parseFloat(
      (valores_atuais.airbnb_1q * (1 + percentual_ipca / 100)).toFixed(2)
    );
    valores_novos.airbnb_1q = valor_novo;
    memorias.push({
      valor_anterior: valores_atuais.airbnb_1q,
      percentual_ipca,
      valor_novo,
      tipo_item: "airbnb_1q",
      data_reajuste: data_vigencia,
    });
  }

  if (valores_atuais.airbnb_2q !== undefined) {
    const valor_novo = parseFloat(
      (valores_atuais.airbnb_2q * (1 + percentual_ipca / 100)).toFixed(2)
    );
    valores_novos.airbnb_2q = valor_novo;
    memorias.push({
      valor_anterior: valores_atuais.airbnb_2q,
      percentual_ipca,
      valor_novo,
      tipo_item: "airbnb_2q",
      data_reajuste: data_vigencia,
    });
  }

  // COMBUSTÍVEL NÃO ENTRA NO REAJUSTE IPCA (permanece com valor anterior)

  return {
    valores_novos,
    memorias,
    observacoes: `Reajuste IPCA de ${percentual_ipca}% vigente a partir de ${data_vigencia}. Combustível não foi reajustado.`,
  };
}

/**
 * Valida sequência cronológica de eventos
 */
export function validarSequenciaHoras(
  registros: RegistroHora[]
): {
  valido: boolean;
  erros: string[];
  requer_retificacao_gestor: boolean;
} {
  const erros: string[] = [];
  const hoje = new Date().toISOString().split("T")[0];

  if (registros.length === 0) {
    erros.push("Nenhum registro de horas");
    return { valido: false, erros, requer_retificacao_gestor: false };
  }

  // Verificar se começa com entrada
  if (registros[0].tipo !== "entrada") {
    erros.push(`Primeiro evento deve ser 'entrada', não '${registros[0].tipo}'`);
  }

  // Ordenar registros cronologicamente para validação
  const registrosOrdenados = registros
    .map((r, idx) => ({
      ...r,
      timestamp: new Date(`${r.data}T${r.horario}`).getTime(),
      originalIdx: idx,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Validar ordem cronológica - todos devem estar em ordem
  for (let i = 1; i < registrosOrdenados.length; i++) {
    if (registrosOrdenados[i].timestamp <= registrosOrdenados[i - 1].timestamp) {
      erros.push(
        `Evento ${registrosOrdenados[i].originalIdx} ocorre antes ou no mesmo horário do evento ${registrosOrdenados[i - 1].originalIdx}`
      );
    }
  }

  // Validar sequência lógica
  for (let i = 1; i < registrosOrdenados.length; i++) {
    const anterior = registrosOrdenados[i - 1];
    const atual = registrosOrdenados[i];

    // Sequência válida: entrada → (saida_intervalo → retorno_intervalo)* → saida
    if (anterior.tipo === "entrada") {
      if (!["saida_intervalo", "saida"].includes(atual.tipo)) {
        erros.push(
          `Após 'entrada' deve vir 'saida_intervalo' ou 'saida', não '${atual.tipo}'`
        );
      }
    } else if (anterior.tipo === "saida_intervalo") {
      if (atual.tipo !== "retorno_intervalo") {
        erros.push(
          `Após 'saida_intervalo' deve vir 'retorno_intervalo', não '${atual.tipo}'`
        );
      }
    } else if (anterior.tipo === "retorno_intervalo") {
      if (!["saida_intervalo", "saida"].includes(atual.tipo)) {
        erros.push(
          `Após 'retorno_intervalo' deve vir 'saida_intervalo' ou 'saida', não '${atual.tipo}'`
        );
      }
    }
  }

  // Verificar se retificação é após 1 dia
  const dataRegistro = registros[0]?.data;
  const diasApos = dataRegistro
    ? Math.floor((new Date(hoje).getTime() - new Date(dataRegistro).getTime()) /
        (1000 * 60 * 60 * 24))
    : 0;

  const requer_retificacao_gestor = diasApos > 1;

  return {
    valido: erros.length === 0,
    erros,
    requer_retificacao_gestor,
  };
}

/**
 * Quitação antecipada de empréstimo
 */
export function quitarEmprestimoAntecipado(
  emprestimo: EmprestimoApontamento,
  numero_parcela_para_quitar: number
): {
  juros_economizados: number;
  valor_total_devido: number;
  memoria_calculo: string;
} {
  const parcela = emprestimo.parcelas.find(
    (p) => p.numero === numero_parcela_para_quitar
  );

  if (!parcela) {
    return {
      juros_economizados: 0,
      valor_total_devido: 0,
      memoria_calculo: "Parcela não encontrada",
    };
  }

  // Calcular juros restantes
  let juros_economizados = 0;
  for (let i = numero_parcela_para_quitar + 1; i <= emprestimo.numero_parcelas; i++) {
    const parcelaRestante = emprestimo.parcelas[i - 1];
    if (parcelaRestante) {
      juros_economizados += parcelaRestante.juros;
    }
  }

  const valor_total_devido = parcela.principal;

  return {
    juros_economizados: parseFloat(juros_economizados.toFixed(2)),
    valor_total_devido: parseFloat(valor_total_devido.toFixed(2)),
    memoria_calculo: `Quitação na parcela ${numero_parcela_para_quitar}: Principal R$${valor_total_devido.toFixed(2)} | Juros economizados: R$${juros_economizados.toFixed(2)}`,
  };
}
