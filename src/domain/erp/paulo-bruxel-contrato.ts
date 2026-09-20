/**
 * Módulo de Contrato de Paulo Bruxel
 * Gerencia prestação de serviço com diárias, deslocamento, combustível e reajustes IPCA
 *
 * Características do Contrato:
 * - Base mensal: 8 diárias obrigatórias (R$ 948,56/mês em 07/2026 com IPCA 4.64%)
 * - Diária individual: R$ 121,63 (07/2026 com IPCA 4.64%)
 * - Hora adicional: R$ 14,53/hora (+10% acima de 8h/dia)
 * - Deslocamento: R$ 7,50/km
 * - Combustível: R$ 7,00/litro (referência 07/2025 com +20% ajuste mercado)
 * - Comunicação: R$ 244,10/mês (2 dias equivalentes)
 * - Sábados/feriados: +15% de adicional
 * - Reembolso de cartão e PIX
 * - Reajuste mensal por IPCA
 */

export interface ContratoPaulo {
  id?: number;
  prestador_id: number;
  nome: string;
  cpf: string;
  data_vigencia: string; // Data de início do contrato
  mes_referencia: string; // Ano-mês (ex: "2026-08")
}

export interface ParametrosContrato {
  mes_referencia: string; // Ano-mês para qual os parâmetros se aplicam
  diaria_base: number; // R$ 121,63 em julho 2026
  hora_adicional: number; // R$ 14,53
  deslocamento_km: number; // R$ 7,50
  combustivel_litro: number; // R$ 7,00 (referência julho 2025)
  combustivel_ajuste_mercado: number; // +20% em relação à referência
  comunicacao_mensal: number; // R$ 244,10
  base_obrigatoria_dias: number; // 8 dias
  base_obrigatoria_valor: number; // R$ 948,56 (8 x 121,63)
  ipca_percentual: number; // IPCA do mês (ex: 4.64 em julho 2026)
  taxa_hora_extra: number; // +10% para horas além de 8h/dia
  taxa_fim_semana_feriado: number; // +15% para sáb/dom/feriado
}

export interface RegistroAcesso {
  data: string; // YYYY-MM-DD
  tipo_dia: "dia_util" | "sabado" | "domingo" | "feriado";
  horas_trabalhadas: number; // Total de horas do dia
  km_percorridos: number;
  descricao?: string;
}

export interface ComponentesPagamento {
  diarias_normais: number;
  diarias_fim_semana: number;
  horas_extras_normais: number;
  horas_extras_fim_semana: number;
  deslocamento: number;
  combustivel: number;
  reembolso_cartao: number;
  reembolso_pix: number;
  comunicacao: number;
  ajuste_ipca: number;
  total: number;
  data_calculo: string;
  memoria_calculo: string;
}

export interface HistoricoIpca {
  mes_referencia: string;
  percentual_ipca: number;
  diaria_base_anterior: number;
  diaria_base_nova: number;
  hora_adicional_anterior: number;
  hora_adicional_nova: number;
  data_ajuste: string;
}

/**
 * Inicializa os parâmetros do contrato para um mês específico
 * ⚠️ VERSÃO NOVO: Deve ser chamada com dados do banco de dados
 *
 * Esta função constróit um ParametrosContrato a partir de dados estruturados,
 * permitindo auditoria completa de mudanças de valores.
 *
 * Se dadosDb não for fornecido, usa valores hardcoded (fallback para testes).
 */
export function inicializarParametros(
  mesReferencia: string,
  dadosDb?: {
    diaria_base: number;
    hora_adicional: number;
    deslocamento_km: number;
    combustivel_litro: number;
    combustivel_ajuste_mercado: number;
    comunicacao_mensal: number;
    ipca_percentual: number;
    taxa_hora_extra?: number;
    taxa_fim_semana_feriado?: number;
  }
): ParametrosContrato {
  // Se dados não fornecidos, usar fallback
  const dadosValidados = dadosDb || obterParametrosFallback(mesReferencia);

  // Validar entrada
  validarParametros(dadosValidados);

  return {
    mes_referencia: mesReferencia,
    diaria_base: dadosValidados.diaria_base,
    hora_adicional: dadosValidados.hora_adicional,
    deslocamento_km: dadosValidados.deslocamento_km,
    combustivel_litro: dadosValidados.combustivel_litro,
    combustivel_ajuste_mercado: dadosValidados.combustivel_ajuste_mercado,
    comunicacao_mensal: dadosValidados.comunicacao_mensal,
    base_obrigatoria_dias: 8,
    base_obrigatoria_valor: Math.round(dadosValidados.diaria_base * 8 * 100) / 100,
    ipca_percentual: dadosValidados.ipca_percentual,
    taxa_hora_extra: dadosValidados.taxa_hora_extra ?? 0.1,
    taxa_fim_semana_feriado: dadosValidados.taxa_fim_semana_feriado ?? 0.15,
  };
}

/**
 * Validar valores dos parâmetros para evitar valores inválidos
 */
function validarParametros(dados: any): void {
  const erros: string[] = [];

  if (typeof dados.diaria_base !== 'number' || dados.diaria_base <= 0) {
    erros.push('diaria_base deve ser número positivo');
  }
  if (typeof dados.hora_adicional !== 'number' || dados.hora_adicional <= 0) {
    erros.push('hora_adicional deve ser número positivo');
  }
  if (typeof dados.deslocamento_km !== 'number' || dados.deslocamento_km <= 0) {
    erros.push('deslocamento_km deve ser número positivo');
  }
  if (typeof dados.combustivel_litro !== 'number' || dados.combustivel_litro <= 0) {
    erros.push('combustivel_litro deve ser número positivo');
  }
  if (typeof dados.combustivel_ajuste_mercado !== 'number' || dados.combustivel_ajuste_mercado <= 0) {
    erros.push('combustivel_ajuste_mercado deve ser número positivo');
  }
  if (typeof dados.comunicacao_mensal !== 'number' || dados.comunicacao_mensal < 0) {
    erros.push('comunicacao_mensal deve ser número não-negativo');
  }
  if (typeof dados.ipca_percentual !== 'number' || dados.ipca_percentual < 0) {
    erros.push('ipca_percentual não pode ser negativo');
  }
  if (dados.taxa_hora_extra && (typeof dados.taxa_hora_extra !== 'number' || dados.taxa_hora_extra < 0)) {
    erros.push('taxa_hora_extra deve ser número não-negativo');
  }
  if (dados.taxa_fim_semana_feriado && (typeof dados.taxa_fim_semana_feriado !== 'number' || dados.taxa_fim_semana_feriado < 0)) {
    erros.push('taxa_fim_semana_feriado deve ser número não-negativo');
  }

  // Verificar se valores são absurdamente altos (proteção contra erro de digitação)
  if (dados.diaria_base > 10000) {
    erros.push('diaria_base parece muito alta (> R$ 10.000)');
  }
  if (dados.combustivel_litro > 500) {
    erros.push('combustivel_litro parece muito alto (> R$ 500)');
  }

  if (erros.length > 0) {
    throw new Error(`Parâmetros inválidos:\n- ${erros.join('\n- ')}`);
  }
}

/**
 * Retorna parâmetros hardcoded para um mês específico
 * Usado como fallback quando dados não estão disponíveis no banco de dados
 */
// Anotação explícita (em vez de inferida do objeto literal): sem `taxa_hora_extra` e
// `taxa_fim_semana_feriado` aqui — mesmo como opcionais — o tipo do retorno não batia
// estruturalmente com o parâmetro `dadosDb` de inicializarParametros() (que os declara
// opcionais), e o acesso a `dadosValidados.taxa_hora_extra` era rejeitado no ramo do
// fallback. Os valores continuam ausentes (undefined) e o `?? 0.1`/`?? 0.15` no chamador
// segue cobrindo o default — nenhum comportamento muda.
function obterParametrosFallback(mesReferencia: string): {
  diaria_base: number;
  hora_adicional: number;
  deslocamento_km: number;
  combustivel_litro: number;
  comunicacao_mensal: number;
  ipca_percentual: number;
  combustivel_ajuste_mercado: number;
  taxa_hora_extra?: number;
  taxa_fim_semana_feriado?: number;
} {
  const parametrosBase = {
    "2026-07": {
      diaria_base: 121.63,
      hora_adicional: 14.53,
      deslocamento_km: 7.5,
      combustivel_litro: 7.0,
      comunicacao_mensal: 244.1,
      ipca_percentual: 4.64,
      combustivel_ajuste_mercado: 1.2,
    },
    "2026-08": {
      diaria_base: 127.24,
      hora_adicional: 15.2,
      deslocamento_km: 7.84,
      combustivel_litro: 8.4,
      comunicacao_mensal: 255.42,
      ipca_percentual: 4.64,
      combustivel_ajuste_mercado: 1.2,
    },
  };

  const params = parametrosBase[mesReferencia as keyof typeof parametrosBase];
  if (!params) {
    throw new Error(`Parâmetros não definidos para ${mesReferencia}`);
  }

  return params;
}

/**
 * ⚠️ DESCONTINUADO: Manter apenas para testes
 * Versão fallback com parâmetros hardcoded
 * @deprecated Use inicializarParametros() sem o segundo parâmetro
 */
export function inicializarParametrosFallback(mesReferencia: string): ParametrosContrato {
  const params = obterParametrosFallback(mesReferencia);
  return inicializarParametros(mesReferencia, params);
}

/**
 * Calcula o valor da diária considerando tipo de dia (útil/fim de semana/feriado)
 */
export function calcularDiaria(
  parametros: ParametrosContrato,
  tipo_dia: "dia_util" | "sabado" | "domingo" | "feriado",
  horas_trabalhadas: number
): {
  diaria_pura: number;
  adicional_fim_semana: number;
  horas_extras: number;
  taxa_hora_extra: number;
  valor_total: number;
} {
  const diaria_pura = parametros.diaria_base;
  let adicional_fim_semana = 0;
  let horas_extras = 0;
  let taxa_hora_extra = 0;

  // Adicional de fim de semana/feriado
  if (tipo_dia === "sabado" || tipo_dia === "domingo" || tipo_dia === "feriado") {
    adicional_fim_semana = diaria_pura * parametros.taxa_fim_semana_feriado;
  }

  // Horas extras (além de 8 horas)
  if (horas_trabalhadas > 8) {
    const horasAdicionais = horas_trabalhadas - 8;
    taxa_hora_extra = parametros.hora_adicional * parametros.taxa_hora_extra;
    horas_extras = horasAdicionais * taxa_hora_extra;
  }

  const valor_total =
    diaria_pura + adicional_fim_semana + horas_extras;

  return {
    diaria_pura: parseFloat(diaria_pura.toFixed(2)),
    adicional_fim_semana: parseFloat(adicional_fim_semana.toFixed(2)),
    horas_extras: parseFloat(horas_extras.toFixed(2)),
    taxa_hora_extra: parseFloat(taxa_hora_extra.toFixed(2)),
    valor_total: parseFloat(valor_total.toFixed(2)),
  };
}

/**
 * Calcula reembolso de deslocamento
 */
export function calcularDeslocamento(
  parametros: ParametrosContrato,
  km_percorridos: number
): {
  km_total: number;
  valor_unitario: number;
  valor_total: number;
} {
  const valor_total = km_percorridos * parametros.deslocamento_km;

  return {
    km_total: km_percorridos,
    valor_unitario: parametros.deslocamento_km,
    valor_total: parseFloat(valor_total.toFixed(2)),
  };
}

/**
 * Calcula reembolso de combustível
 */
export function calcularCombustivel(
  parametros: ParametrosContrato,
  litros_consumidos: number
): {
  litros: number;
  valor_litro_base: number;
  ajuste_mercado: number;
  valor_litro_final: number;
  valor_total: number;
} {
  const valor_litro_final =
    parametros.combustivel_litro * parametros.combustivel_ajuste_mercado;
  const valor_total = litros_consumidos * valor_litro_final;

  return {
    litros: parseFloat(litros_consumidos.toFixed(2)),
    valor_litro_base: parseFloat(parametros.combustivel_litro.toFixed(2)),
    ajuste_mercado: parseFloat(
      (parametros.combustivel_ajuste_mercado * 100 - 100).toFixed(2)
    ),
    valor_litro_final: parseFloat(valor_litro_final.toFixed(2)),
    valor_total: parseFloat(valor_total.toFixed(2)),
  };
}

/**
 * Processa um mês de apontamentos e calcula composição de pagamento
 */
export function processarMes(
  parametros: ParametrosContrato,
  registros: RegistroAcesso[],
  reembolso_cartao: number = 0,
  reembolso_pix: number = 0
): ComponentesPagamento {
  let diarias_normais = 0;
  let diarias_fim_semana = 0;
  let horas_extras_normais = 0;
  let horas_extras_fim_semana = 0;
  let deslocamento = 0;
  let combustivel = 0;

  // Processar cada dia de apontamento
  for (const registro of registros) {
    const tipoUso =
      registro.tipo_dia === "dia_util" ? "dia_util" : "fim_semana";

    const diaria = calcularDiaria(
      parametros,
      registro.tipo_dia,
      registro.horas_trabalhadas
    );

    if (tipoUso === "dia_util") {
      diarias_normais += diaria.diaria_pura;
      horas_extras_normais += diaria.horas_extras;
    } else {
      diarias_fim_semana += diaria.adicional_fim_semana;
      horas_extras_fim_semana += diaria.horas_extras;
    }

    // Deslocamento
    if (registro.km_percorridos > 0) {
      const desl = calcularDeslocamento(parametros, registro.km_percorridos);
      deslocamento += desl.valor_total;
    }
  }

  // Combustível (estimado em 10km por litro se houver deslocamento)
  const km_total_registros = registros.reduce((sum, r) => sum + r.km_percorridos, 0);
  if (km_total_registros > 0) {
    const litros_estimados = km_total_registros / 10;
    const comb = calcularCombustivel(parametros, litros_estimados);
    combustivel = comb.valor_total;
  }

  // Comunicação
  const comunicacao = parametros.comunicacao_mensal;

  // Ajuste IPCA (opcional - já aplicado nos valores base)
  const ajuste_ipca = 0;

  const total =
    diarias_normais +
    diarias_fim_semana +
    horas_extras_normais +
    horas_extras_fim_semana +
    deslocamento +
    combustivel +
    reembolso_cartao +
    reembolso_pix +
    comunicacao +
    ajuste_ipca;

  const memoria_calculo = `
Diárias Normais: R$ ${diarias_normais.toFixed(2)}
Diárias Fim de Semana: R$ ${diarias_fim_semana.toFixed(2)}
Horas Extras Normais: R$ ${horas_extras_normais.toFixed(2)}
Horas Extras Fim de Semana: R$ ${horas_extras_fim_semana.toFixed(2)}
Deslocamento (${km_total_registros} km): R$ ${deslocamento.toFixed(2)}
Combustível: R$ ${combustivel.toFixed(2)}
Reembolso Cartão: R$ ${reembolso_cartao.toFixed(2)}
Reembolso PIX: R$ ${reembolso_pix.toFixed(2)}
Comunicação: R$ ${comunicacao.toFixed(2)}
---
TOTAL: R$ ${total.toFixed(2)}`;

  return {
    diarias_normais: parseFloat(diarias_normais.toFixed(2)),
    diarias_fim_semana: parseFloat(diarias_fim_semana.toFixed(2)),
    horas_extras_normais: parseFloat(horas_extras_normais.toFixed(2)),
    horas_extras_fim_semana: parseFloat(horas_extras_fim_semana.toFixed(2)),
    deslocamento: parseFloat(deslocamento.toFixed(2)),
    combustivel: parseFloat(combustivel.toFixed(2)),
    reembolso_cartao: parseFloat(reembolso_cartao.toFixed(2)),
    reembolso_pix: parseFloat(reembolso_pix.toFixed(2)),
    comunicacao: parseFloat(comunicacao.toFixed(2)),
    ajuste_ipca: 0,
    total: parseFloat(total.toFixed(2)),
    data_calculo: new Date().toISOString().split("T")[0],
    memoria_calculo,
  };
}

/**
 * Aplica reajuste IPCA aos parâmetros
 */
export function aplicarReajusteIpca(
  parametroAtual: ParametrosContrato,
  novoIpca: number,
  mesNovoReferencia: string
): {
  parametrosNovos: ParametrosContrato;
  historico: HistoricoIpca;
} {
  const fatorAjuste = 1 + novoIpca / 100;

  const historico: HistoricoIpca = {
    mes_referencia: mesNovoReferencia,
    percentual_ipca: novoIpca,
    diaria_base_anterior: parametroAtual.diaria_base,
    diaria_base_nova: parseFloat(
      (parametroAtual.diaria_base * fatorAjuste).toFixed(2)
    ),
    hora_adicional_anterior: parametroAtual.hora_adicional,
    hora_adicional_nova: parseFloat(
      (parametroAtual.hora_adicional * fatorAjuste).toFixed(2)
    ),
    data_ajuste: new Date().toISOString().split("T")[0],
  };

  const parametrosNovos: ParametrosContrato = {
    ...parametroAtual,
    mes_referencia: mesNovoReferencia,
    diaria_base: historico.diaria_base_nova,
    hora_adicional: historico.hora_adicional_nova,
    deslocamento_km: parseFloat(
      (parametroAtual.deslocamento_km * fatorAjuste).toFixed(2)
    ),
    comunicacao_mensal: parseFloat(
      (parametroAtual.comunicacao_mensal * fatorAjuste).toFixed(2)
    ),
    base_obrigatoria_valor: parseFloat(
      (historico.diaria_base_nova * 8).toFixed(2)
    ),
    ipca_percentual: novoIpca,
  };

  return {
    parametrosNovos,
    historico,
  };
}

/**
 * Valida registros de apontamento
 */
export function validarApontamentos(
  registros: RegistroAcesso[]
): {
  valido: boolean;
  erros: string[];
  avisos: string[];
} {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (registros.length === 0) {
    erros.push("Nenhum registro de apontamento para o mês");
    return { valido: false, erros, avisos };
  }

  for (let i = 0; i < registros.length; i++) {
    const registro = registros[i];

    if (registro.horas_trabalhadas < 0) {
      erros.push(
        `Registro ${i}: horas trabalhadas não pode ser negativa (${registro.horas_trabalhadas})`
      );
    }

    if (registro.horas_trabalhadas > 12) {
      avisos.push(
        `Registro ${i} (${registro.data}): ${registro.horas_trabalhadas}h trabalhadas em um único dia, verificar`
      );
    }

    if (registro.km_percorridos < 0) {
      erros.push(
        `Registro ${i}: km percorridos não pode ser negativo (${registro.km_percorridos})`
      );
    }

    if (registro.km_percorridos > 500) {
      avisos.push(
        `Registro ${i} (${registro.data}): ${registro.km_percorridos}km percorridos, verificar se está correto`
      );
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}
