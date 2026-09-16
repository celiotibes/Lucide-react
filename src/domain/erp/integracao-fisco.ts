/**
 * MÓDULO 4b: Tax Compliance Module
 * Cálculos de impostos federais, estaduais e municipais
 * Suporte para 27 UFs e geração de relatórios de conformidade fiscal
 */

export interface TaxCalculationParams {
  receita_bruta: number;
  lucro_bruto: number;
  lucro_operacional: number;
  base_inss?: number;
  base_icms?: number;
  base_iss?: number;
  uf?: string;
  regimeimposto?: 'lucro_real' | 'lucro_presumido' | 'simples_nacional';
}

export interface ImpostoCalculado {
  tipo_imposto: string;
  aliquota: number;
  base_calculo: number;
  valor_imposto: number;
  data_vencimento: string;
  status_pagamento: 'pendente' | 'pago' | 'em_atraso';
}

export interface DREComImpactoTaxes {
  periodo: string;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  cpm: number; // Custo do Pessoal e Materiais
  lucro_bruto: number;
  despesas_operacionais: number;
  lucro_operacional: number;
  impostos_federais: number;
  impostos_estaduais: number;
  impostos_municipais: number;
  total_impostos: number;
  lucro_antes_impostos: number;
  lucro_liquido: number;
  aliquota_efetiva_imposto: number;
}

export interface ObrigacaoFiscal {
  id?: number;
  descricao: string;
  tipo_obrigacao: string;
  periodicidade: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  data_vencimento: string;
  data_entrega?: string;
  status: 'pendente' | 'cumprida' | 'em_atraso';
  multa_juros?: number;
  valor_estimado?: number;
}

export interface RelatorioObrigacoesFiscais {
  periodo_inicio: string;
  periodo_fim: string;
  obrigacoes_mensais: ObrigacaoFiscal[];
  obrigacoes_trimestrais: ObrigacaoFiscal[];
  obrigacoes_anuais: ObrigacaoFiscal[];
  total_obrigacoes: number;
  obrigacoes_cumpridas: number;
  obrigacoes_em_atraso: number;
  cronograma_pagamentos: ImpostoCalculado[];
}

// Taxa de imposto por UF e tipo de regime
const ALIQUOTAS_POR_UF: Record<string, Record<string, number>> = {
  'SP': { 'ICMS': 0.18, 'ISS': 0.05 },
  'RJ': { 'ICMS': 0.20, 'ISS': 0.05 },
  'MG': { 'ICMS': 0.18, 'ISS': 0.05 },
  'RS': { 'ICMS': 0.17, 'ISS': 0.05 },
  'BA': { 'ICMS': 0.17, 'ISS': 0.05 },
  'PR': { 'ICMS': 0.18, 'ISS': 0.05 },
  'SC': { 'ICMS': 0.17, 'ISS': 0.05 },
  'GO': { 'ICMS': 0.14, 'ISS': 0.05 },
  'PB': { 'ICMS': 0.17, 'ISS': 0.05 },
  'MA': { 'ICMS': 0.18, 'ISS': 0.05 },
  'CE': { 'ICMS': 0.17, 'ISS': 0.05 },
  'PE': { 'ICMS': 0.17, 'ISS': 0.05 },
  'PA': { 'ICMS': 0.17, 'ISS': 0.05 },
  'DF': { 'ICMS': 0.18, 'ISS': 0.05 },
  'ES': { 'ICMS': 0.18, 'ISS': 0.05 },
  'MT': { 'ICMS': 0.14, 'ISS': 0.05 },
  'MS': { 'ICMS': 0.14, 'ISS': 0.05 },
  'AC': { 'ICMS': 0.17, 'ISS': 0.05 },
  'AM': { 'ICMS': 0.18, 'ISS': 0.05 },
  'AP': { 'ICMS': 0.18, 'ISS': 0.05 },
  'AL': { 'ICMS': 0.17, 'ISS': 0.05 },
  'PI': { 'ICMS': 0.17, 'ISS': 0.05 },
  'RN': { 'ICMS': 0.17, 'ISS': 0.05 },
  'RO': { 'ICMS': 0.17, 'ISS': 0.05 },
  'RR': { 'ICMS': 0.18, 'ISS': 0.05 },
  'SE': { 'ICMS': 0.17, 'ISS': 0.05 },
  'TO': { 'ICMS': 0.14, 'ISS': 0.05 },
};

/**
 * Calcula IRPJ (Imposto de Renda Pessoa Jurídica)
 * Lucro Real: 15% + 10% adicional (acima de R$ 20k)
 * Lucro Presumido: 8% a 32% sobre receita
 */
export function calcularIRPJ(
  lucro_operacional: number,
  regime: 'lucro_real' | 'lucro_presumido',
  receita_bruta?: number
): ImpostoCalculado {
  let aliquota = 0;
  let base_calculo = 0;

  if (regime === 'lucro_real') {
    aliquota = 0.15;
    base_calculo = lucro_operacional;

    // Adicional de 10% se lucro > 20000
    if (lucro_operacional > 20000) {
      aliquota = 0.25; // 15% + 10%
    }
  } else if (regime === 'lucro_presumido') {
    base_calculo = receita_bruta || 0;
    // Aliquota varia por setor, usando 8% como default para comércio
    aliquota = 0.08;
  }

  const valor_imposto = base_calculo * aliquota;

  return {
    tipo_imposto: 'IRPJ',
    aliquota,
    base_calculo,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 10),
    status_pagamento: 'pendente',
  };
}

/**
 * Calcula PIS (Programa de Integração Social)
 * Aliquota: 1.65% sobre receita bruta (regra geral)
 */
export function calcularPIS(receita_bruta: number): ImpostoCalculado {
  const aliquota = 0.0165;
  const valor_imposto = receita_bruta * aliquota;

  return {
    tipo_imposto: 'PIS',
    aliquota,
    base_calculo: receita_bruta,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 25),
    status_pagamento: 'pendente',
  };
}

/**
 * Calcula COFINS (Contribuição para Financiamento da Seguridade Social)
 * Aliquota: 7.6% sobre receita bruta (regra geral)
 */
export function calcularCOFINS(receita_bruta: number): ImpostoCalculado {
  const aliquota = 0.076;
  const valor_imposto = receita_bruta * aliquota;

  return {
    tipo_imposto: 'COFINS',
    aliquota,
    base_calculo: receita_bruta,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 25),
    status_pagamento: 'pendente',
  };
}

/**
 * Calcula INSS (Contribuição Previdenciária)
 * Patrão: 28.8% sobre folha de pagamento
 * Empregado: 8% a 14% (descontado do salário)
 */
export function calcularINSS(base_inss: number, tipo: 'patrao' | 'empregado' = 'patrao'): ImpostoCalculado {
  const aliquota = tipo === 'patrao' ? 0.288 : 0.11; // 28.8% patrão, 11% média empregado
  const valor_imposto = base_inss * aliquota;

  return {
    tipo_imposto: 'INSS',
    aliquota,
    base_calculo: base_inss,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 10),
    status_pagamento: 'pendente',
  };
}

/**
 * Calcula ICMS (Imposto Circulação Mercadorias e Serviços)
 * Varia por UF e tipo de operação
 */
export function calcularICMS(
  base_icms: number,
  uf: string = 'SP'
): ImpostoCalculado {
  const aliquota = ALIQUOTAS_POR_UF[uf]?.['ICMS'] || 0.18;
  const valor_imposto = base_icms * aliquota;

  return {
    tipo_imposto: 'ICMS',
    aliquota,
    base_calculo: base_icms,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 20),
    status_pagamento: 'pendente',
  };
}

/**
 * Calcula ISS (Imposto Sobre Serviços)
 * Varia por município
 */
export function calcularISS(
  base_iss: number,
  uf: string = 'SP'
): ImpostoCalculado {
  const aliquota = ALIQUOTAS_POR_UF[uf]?.['ISS'] || 0.05;
  const valor_imposto = base_iss * aliquota;

  return {
    tipo_imposto: 'ISS',
    aliquota,
    base_calculo: base_iss,
    valor_imposto,
    data_vencimento: getProximoVencimento('mensal', 15),
    status_pagamento: 'pendente',
  };
}

/**
 * Valida conformidade com regras EFD-Reinf
 */
export function validarEFD(
  db: any,
  entidade_id: number,
  periodo_id: number
): {
  valido: boolean;
  erros: string[];
  avisos: string[];
} {
  const erros: string[] = [];
  const avisos: string[] = [];

  // Verificar se há lançamentos sem origem_modulo
  const result = db.exec(
    `SELECT COUNT(*) FROM ledger_entries
     WHERE entidade_id = ? AND periodo_id = ? AND origem_modulo IS NULL`,
    [entidade_id, periodo_id]
  );

  if (result[0]?.values[0]?.[0] > 0) {
    avisos.push('Existem lançamentos sem módulo de origem');
  }

  // Verificar integridade de valores
  const saldoResult = db.exec(
    `SELECT
      SUM(valor_debito) as total_debito,
      SUM(valor_credito) as total_credito
     FROM ledger_entries
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const [total_debito, total_credito] = saldoResult[0]?.values[0] || [0, 0];

  if (Math.abs(total_debito - total_credito) > 0.01) {
    erros.push(`Desbalanceamento: Débitos (${total_debito}) != Créditos (${total_credito})`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

/**
 * Gera DRE com impacto de impostos
 */
export function gerarDREComImpactoTaxes(
  db: any,
  periodo_id: number,
  params: TaxCalculationParams
): DREComImpactoTaxes {
  const irpj = calcularIRPJ(params.lucro_operacional, params.regimeimposto || 'lucro_real', params.receita_bruta);
  const pis = calcularPIS(params.receita_bruta);
  const cofins = calcularCOFINS(params.receita_bruta);
  const inss = calcularINSS(params.base_inss || 0);

  const total_impostos = irpj.valor_imposto + pis.valor_imposto + cofins.valor_imposto + inss.valor_imposto;
  const lucro_liquido = params.lucro_operacional - total_impostos;
  const aliquota_efetiva = params.lucro_operacional > 0 ? total_impostos / params.receita_bruta : 0;

  return {
    periodo: new Date().toISOString().substring(0, 7),
    receita_bruta: params.receita_bruta,
    deducoes: 0,
    receita_liquida: params.receita_bruta,
    cpm: 0,
    lucro_bruto: params.lucro_bruto,
    despesas_operacionais: 0,
    lucro_operacional: params.lucro_operacional,
    impostos_federais: irpj.valor_imposto + pis.valor_imposto + cofins.valor_imposto,
    impostos_estaduais: 0,
    impostos_municipais: 0,
    total_impostos,
    lucro_antes_impostos: params.lucro_operacional,
    lucro_liquido,
    aliquota_efetiva_imposto: aliquota_efetiva,
  };
}

/**
 * Gera relatório de obrigações fiscais com cronograma
 */
export function gerarRelatorioObrigacoesFiscais(
  db: any,
  periodo_inicio: string,
  periodo_fim: string
): RelatorioObrigacoesFiscais {
  const obrigacoes_mensais: ObrigacaoFiscal[] = [
    {
      descricao: 'DARF - IRPJ',
      tipo_obrigacao: 'federal',
      periodicidade: 'mensal',
      data_vencimento: getProximoVencimento('mensal', 10),
      status: 'pendente',
    },
    {
      descricao: 'GPS - INSS',
      tipo_obrigacao: 'federal',
      periodicidade: 'mensal',
      data_vencimento: getProximoVencimento('mensal', 15),
      status: 'pendente',
    },
    {
      descricao: 'DARF - PIS/COFINS',
      tipo_obrigacao: 'federal',
      periodicidade: 'mensal',
      data_vencimento: getProximoVencimento('mensal', 25),
      status: 'pendente',
    },
  ];

  const obrigacoes_trimestrais: ObrigacaoFiscal[] = [
    {
      descricao: 'DCTF - Declaração de Créditos Tributários',
      tipo_obrigacao: 'federal',
      periodicidade: 'trimestral',
      data_vencimento: getProximoVencimento('trimestral', 1),
      status: 'pendente',
    },
  ];

  const obrigacoes_anuais: ObrigacaoFiscal[] = [
    {
      descricao: 'DIPJ - Declaração de Imposto de Renda',
      tipo_obrigacao: 'federal',
      periodicidade: 'anual',
      data_vencimento: '2026-04-30',
      status: 'pendente',
    },
    {
      descricao: 'ECF - Escrituração Contábil Fiscal',
      tipo_obrigacao: 'federal',
      periodicidade: 'anual',
      data_vencimento: '2026-05-31',
      status: 'pendente',
    },
    {
      descricao: 'DIMOB - Declaração de Informações de Imóvel',
      tipo_obrigacao: 'federal',
      periodicidade: 'anual',
      data_vencimento: '2026-06-30',
      status: 'pendente',
    },
  ];

  const cronograma_pagamentos: ImpostoCalculado[] = [];

  return {
    periodo_inicio,
    periodo_fim,
    obrigacoes_mensais,
    obrigacoes_trimestrais,
    obrigacoes_anuais,
    total_obrigacoes: obrigacoes_mensais.length + obrigacoes_trimestrais.length + obrigacoes_anuais.length,
    obrigacoes_cumpridas: 0,
    obrigacoes_em_atraso: 0,
    cronograma_pagamentos,
  };
}

/**
 * Calcula próximo vencimento baseado em periodicidade
 */
function getProximoVencimento(periodicidade: string, dia_vencimento: number): string {
  const hoje = new Date();
  let dataVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), dia_vencimento);

  if (periodicidade === 'mensal') {
    if (dataVencimento <= hoje) {
      dataVencimento.setMonth(dataVencimento.getMonth() + 1);
    }
  } else if (periodicidade === 'trimestral') {
    dataVencimento.setMonth(dataVencimento.getMonth() + 3);
  } else if (periodicidade === 'anual') {
    if (dataVencimento <= hoje) {
      dataVencimento.setFullYear(dataVencimento.getFullYear() + 1);
    }
  }

  return dataVencimento.toISOString().substring(0, 10);
}

/**
 * Registra imposto calculado no ledger
 */
export function registrarImpostoNoLedger(
  db: any,
  entidade_id: number,
  periodo_id: number,
  imposto: ImpostoCalculado,
  conta_imposto_id: number,
  conta_caixa_id: number
): number {
  try {
    // Lançamento: Débito em Despesa com Imposto, Crédito em Caixa
    db.run(
      `INSERT INTO ledger_entries
       (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao, origem_modulo, referencia_documento)
       VALUES (?, ?, ?, ?, ?, ?, 'fisco', ?)`,
      [
        entidade_id,
        periodo_id,
        conta_imposto_id,
        new Date().toISOString().substring(0, 10),
        imposto.valor_imposto,
        `Provisão: ${imposto.tipo_imposto}`,
        `IMPOSTO_${imposto.tipo_imposto}`,
      ]
    );

    return 1;
  } catch (erro) {
    console.error('Erro ao registrar imposto no ledger:', erro);
    return 0;
  }
}
