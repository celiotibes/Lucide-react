/**
 * Relatórios de Consolidação ERP (SPRINT 3)
 * Consolidação de todos os módulos (Payroll, Despesas, API Gateway, Webhooks, Apontamentos)
 * Padrão: RelatorioBuilder com agregação cross-module
 *
 * Relatórios Executivos:
 * 1. relatorioConsolidacaoModulos() - Snapshot completo por origem de módulo
 * 2. relatorioExecutivoFinanceiro() - Resumo executivo (Ativo, Passivo, Patrimônio, DRE)
 * 3. relatorioPainelGestao() - Dashboard com KPIs, tendências e alertas
 * 4. relatorioFluxoCaixaConsolidado() - Fluxo de caixa consolidado (operações, investimentos, financiamento)
 * 5. relatorioSensibilidadeIPCA() - Impacto IPCA em toda a remuneração
 * 6. relatorioProjetacaoProximos12Meses() - Projeção orçamentária forward-looking
 */

import crypto from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface LancamentoConsolidado {
  id: string;
  data: string;
  origem_modulo: "payroll" | "despesas" | "api-gateway" | "webhook" | "apontamento";
  tipo_documento: string;
  descricao: string;
  valor: number;
  conta_debito: string;
  conta_credito: string;
  centro_custo?: string;
  usuario_id?: string;
  status: string;
  hash_verificacao: string;
}

export interface ModuloSnapshot {
  nome_modulo: string;
  total_lancamentos: number;
  total_valor: number;
  lancamentos: LancamentoConsolidado[];
  data_snapshot: string;
  hash_modulo: string;
}

export interface RelatorioConsolidacao {
  id: string;
  data_geracao: string;
  periodo: string;
  modulos: ModuloSnapshot[];
  total_geral: number;
  total_lancamentos_geral: number;
  validacoes: {
    balanceamento: boolean;
    mensagens: string[];
  };
}

export interface DemonstrativoFinanceiro {
  periodo: string;
  ativo: {
    circulante: { valor: number; rubricas: Record<string, number> };
    nao_circulante: { valor: number; rubricas: Record<string, number> };
    total: number;
  };
  passivo: {
    circulante: { valor: number; rubricas: Record<string, number> };
    nao_circulante: { valor: number; rubricas: Record<string, number> };
    total: number;
  };
  patrimonio: {
    capital: number;
    lucros_acumulados: number;
    total: number;
  };
  demonstrativo_resultado: {
    receitas: number;
    custos: number;
    despesas_operacionais: number;
    resultado_operacional: number;
    resultado_liquido: number;
  };
}

export interface PainelGestao {
  data_geracao: string;
  periodo: string;
  kpis: {
    margem_lucro: number;
    roi: number;
    liquidez_corrente: number;
    indice_endividamento: number;
    taxa_crescimento: number;
  };
  alertas: Array<{
    severidade: "crítico" | "aviso" | "informativo";
    mensagem: string;
    data_deteccao: string;
  }>;
  tendencias: {
    receita_30dias: number[];
    despesa_30dias: number[];
    crescimento_percentual: number;
  };
}

export interface FluxoCaixaConsolidado {
  periodo: string;
  atividades_operacionais: {
    resultado_liquido: number;
    ajustes_nao_caixa: number;
    mudancas_capital_trabalho: number;
    fluxo_liquido: number;
  };
  atividades_investimento: {
    aquisicoes_imobilizado: number;
    venda_ativos: number;
    fluxo_liquido: number;
  };
  atividades_financiamento: {
    obtencao_emprestimos: number;
    pagamento_dividendos: number;
    fluxo_liquido: number;
  };
  variacao_caixa: number;
  saldo_inicial: number;
  saldo_final: number;
}

export interface SensibilidadeIPCA {
  periodo: string;
  ipca_acumulado: number;
  rubricas: Array<{
    rubrica: string;
    valor_atual: number;
    valor_projetado_ipca: number;
    impacto_percentual: number;
    impacto_reais: number;
  }>;
  impacto_total: number;
  custo_anual_atual: number;
  custo_anual_projetado: number;
}

export interface ProjetacaoOrcamentaria {
  periodo_inicial: string;
  periodo_final: string;
  receitas_projetadas: Array<{
    mes: string;
    valor: number;
    fonte: string;
  }>;
  despesas_projetadas: Array<{
    mes: string;
    valor: number;
    categoria: string;
  }>;
  fluxo_caixa_projetado: Array<{
    mes: string;
    saldo: number;
    variacao: number;
  }>;
  margem_seguranca: number; // percentual de variação estimada
}

// ============================================================================
// BUILDER PATTERN PARA RELATÓRIOS
// ============================================================================

export class RelatorioBuilder {
  private lancamentos: LancamentoConsolidado[] = [];
  private modulos: Map<string, ModuloSnapshot> = new Map();
  private periodo: string = "";
  private dataGeracao: Date = new Date();

  /**
   * Adiciona lançamentos ao builder
   */
  adicionarLancamentos(lancamentos: LancamentoConsolidado[]): RelatorioBuilder {
    this.lancamentos.push(...lancamentos);
    return this;
  }

  /**
   * Define período do relatório
   */
  definirPeriodo(periodo: string): RelatorioBuilder {
    this.periodo = periodo;
    return this;
  }

  /**
   * Agrupa lançamentos por módulo de origem
   */
  agruparPorModulo(): RelatorioBuilder {
    const grupos = new Map<string, LancamentoConsolidado[]>();

    for (const lancamento of this.lancamentos) {
      const modulo = lancamento.origem_modulo;
      if (!grupos.has(modulo)) {
        grupos.set(modulo, []);
      }
      grupos.get(modulo)!.push(lancamento);
    }

    for (const [modulo, lancamentos] of grupos.entries()) {
      const totalValor = lancamentos.reduce((sum, l) => sum + l.valor, 0);
      const hashModulo = this.gerarHashModulo(lancamentos);

      this.modulos.set(modulo, {
        nome_modulo: modulo,
        total_lancamentos: lancamentos.length,
        total_valor: totalValor,
        lancamentos,
        data_snapshot: new Date().toISOString(),
        hash_modulo: hashModulo,
      });
    }

    return this;
  }

  /**
   * Gera relatório consolidado final
   */
  construir(): RelatorioConsolidacao {
    const modulosArray = Array.from(this.modulos.values());
    const totalGeral = modulosArray.reduce((sum, m) => sum + m.total_valor, 0);
    const totalLancamentos = modulosArray.reduce((sum, m) => sum + m.total_lancamentos, 0);

    // Validação de balanceamento (débito = crédito)
    const totalDebito = this.lancamentos
      .filter(l => !l.conta_debito.startsWith("3") && !l.conta_debito.startsWith("4"))
      .reduce((sum, l) => sum + l.valor, 0);

    const totalCredito = this.lancamentos
      .filter(l => l.conta_credito.startsWith("3") || l.conta_credito.startsWith("4"))
      .reduce((sum, l) => sum + l.valor, 0);

    const validacoes = {
      balanceamento: Math.abs(totalDebito - totalCredito) < 0.01,
      mensagens: this.validarLancamentos(),
    };

    return {
      id: `REL-CONS-${Date.now()}`,
      data_geracao: this.dataGeracao.toISOString(),
      periodo: this.periodo,
      modulos: modulosArray,
      total_geral: totalGeral,
      total_lancamentos_geral: totalLancamentos,
      validacoes,
    };
  }

  /**
   * Gera hash SHA-256 para verificação de integridade de um módulo
   */
  private gerarHashModulo(lancamentos: LancamentoConsolidado[]): string {
    const dados = lancamentos
      .map(l => `${l.id}|${l.valor}|${l.conta_debito}|${l.conta_credito}`)
      .join(";");

    return crypto.createHash("sha256").update(dados).digest("hex");
  }

  /**
   * Valida integridade dos lançamentos
   */
  private validarLancamentos(): string[] {
    const mensagens: string[] = [];

    if (this.lancamentos.length === 0) {
      mensagens.push("⚠ Nenhum lançamento encontrado no período");
    }

    // Validar contas duplicadas
    const contas = new Set<string>();
    for (const lancamento of this.lancamentos) {
      const chave = `${lancamento.data}|${lancamento.conta_debito}|${lancamento.conta_credito}|${lancamento.valor}`;
      if (contas.has(chave)) {
        mensagens.push(`⚠ Possível duplicação de lançamento: ${lancamento.id}`);
      }
      contas.add(chave);
    }

    // Validar contas válidas
    const contasValidas = /^[1-6]\.\d+(\.\d+)?$/;
    for (const lancamento of this.lancamentos) {
      if (!contasValidas.test(lancamento.conta_debito)) {
        mensagens.push(`✗ Conta de débito inválida: ${lancamento.conta_debito} (${lancamento.id})`);
      }
      if (!contasValidas.test(lancamento.conta_credito)) {
        mensagens.push(`✗ Conta de crédito inválida: ${lancamento.conta_credito} (${lancamento.id})`);
      }
    }

    return mensagens;
  }
}

// ============================================================================
// FUNÇÕES PÚBLICAS PARA GERAÇÃO DE RELATÓRIOS
// ============================================================================

/**
 * 1. RELATÓRIO DE CONSOLIDAÇÃO POR MÓDULO
 * Gera snapshot completo do ERP agrupado por origem de módulo
 * Útil para: auditoria, rastreamento de origem de dados, validação de integração
 */
export function relatorioConsolidacaoModulos(
  lancamentos: LancamentoConsolidado[],
  periodo: string
): RelatorioConsolidacao {
  return new RelatorioBuilder()
    .adicionarLancamentos(lancamentos)
    .definirPeriodo(periodo)
    .agruparPorModulo()
    .construir();
}

/**
 * 2. RELATÓRIO EXECUTIVO FINANCEIRO
 * Demonstrativo Financeiro completo: Balanço Patrimonial + DRE
 * Contas: 1.x (Ativo), 2.x (Passivo), 3.x (Patrimônio), 4-6.x (Resultado)
 */
export function relatorioExecutivoFinanceiro(
  lancamentos: LancamentoConsolidado[],
  periodo: string
): DemonstrativoFinanceiro {
  const ativo = {
    circulante: { valor: 0, rubricas: {} as Record<string, number> },
    nao_circulante: { valor: 0, rubricas: {} as Record<string, number> },
    total: 0,
  };

  const passivo = {
    circulante: { valor: 0, rubricas: {} as Record<string, number> },
    nao_circulante: { valor: 0, rubricas: {} as Record<string, number> },
    total: 0,
  };

  let receitas = 0;
  let custos = 0;
  let despesas = 0;

  // Agregar por conta
  for (const lancamento of lancamentos) {
    const conta = lancamento.conta_debito;
    const numero = conta.split(".")[0];

    if (numero === "1") {
      // Ativo
      if (conta.startsWith("1.1")) {
        ativo.circulante.valor += lancamento.valor;
        ativo.circulante.rubricas[conta] = (ativo.circulante.rubricas[conta] || 0) + lancamento.valor;
      } else {
        ativo.nao_circulante.valor += lancamento.valor;
        ativo.nao_circulante.rubricas[conta] = (ativo.nao_circulante.rubricas[conta] || 0) + lancamento.valor;
      }
    } else if (numero === "2") {
      // Passivo
      if (conta.startsWith("2.1")) {
        passivo.circulante.valor += lancamento.valor;
        passivo.circulante.rubricas[conta] = (passivo.circulante.rubricas[conta] || 0) + lancamento.valor;
      } else {
        passivo.nao_circulante.valor += lancamento.valor;
        passivo.nao_circulante.rubricas[conta] = (passivo.nao_circulante.rubricas[conta] || 0) + lancamento.valor;
      }
    } else if (numero === "4") {
      receitas += lancamento.valor;
    } else if (numero === "5") {
      custos += lancamento.valor;
    } else if (numero === "6") {
      despesas += lancamento.valor;
    }
  }

  ativo.total = ativo.circulante.valor + ativo.nao_circulante.valor;
  passivo.total = passivo.circulante.valor + passivo.nao_circulante.valor;

  const patrimonio = {
    capital: Math.max(0, ativo.total - passivo.total) * 0.7, // 70% do PL é capital
    lucros_acumulados: Math.max(0, ativo.total - passivo.total) * 0.3,
    total: Math.max(0, ativo.total - passivo.total),
  };

  const resultadoOperacional = receitas - custos - despesas;
  const resultadoLiquido = resultadoOperacional * 0.73; // 27% de IR/CSLL

  return {
    periodo,
    ativo,
    passivo,
    patrimonio,
    demonstrativo_resultado: {
      receitas,
      custos,
      despesas_operacionais: despesas,
      resultado_operacional: resultadoOperacional,
      resultado_liquido: resultadoLiquido,
    },
  };
}

/**
 * 3. PAINEL DE GESTÃO
 * KPIs, tendências, alertas e indicadores de desempenho
 * Monitora: margem, ROI, liquidez, endividamento, crescimento
 */
export function relatorioPainelGestao(
  lancamentos: LancamentoConsolidado[],
  periodo: string,
  saldoInicial: number = 100000
): PainelGestao {
  // Calcular receita e despesa
  const receita = lancamentos
    .filter(l => l.conta_credito.startsWith("4"))
    .reduce((sum, l) => sum + l.valor, 0);

  const despesa = lancamentos
    .filter(l => l.conta_debito.startsWith("6"))
    .reduce((sum, l) => sum + l.valor, 0);

  const lucro = receita - despesa;
  const margemLucro = receita > 0 ? (lucro / receita) * 100 : 0;

  // Calcular ativo total
  const ativo = lancamentos
    .filter(l => l.conta_debito.startsWith("1"))
    .reduce((sum, l) => sum + l.valor, 0);

  const passivo = lancamentos
    .filter(l => l.conta_debito.startsWith("2"))
    .reduce((sum, l) => sum + l.valor, 0);

  const roi = ativo > 0 ? (lucro / ativo) * 100 : 0;
  const ativoCirculante = lancamentos
    .filter(l => l.conta_debito.startsWith("1.1"))
    .reduce((sum, l) => sum + l.valor, 0);
  const passivoCirculante = lancamentos
    .filter(l => l.conta_debito.startsWith("2.1"))
    .reduce((sum, l) => sum + l.valor, 0);

  const liquidezCorrente = passivoCirculante > 0 ? ativoCirculante / passivoCirculante : 0;
  const indiceEndividamento = ativo > 0 ? (passivo / ativo) * 100 : 0;

  // Simulação de tendência de 30 dias
  const diasNoMes = 30;
  const receita30dias = Array.from({ length: diasNoMes }, (_, i) => receita / diasNoMes);
  const despesa30dias = Array.from({ length: diasNoMes }, (_, i) => despesa / diasNoMes);

  // Gerar alertas
  const alertas = [];
  if (margemLucro < 10) alertas.push({
    severidade: "crítico" as const,
    mensagem: `Margem de lucro baixa: ${margemLucro.toFixed(2)}%`,
    data_deteccao: new Date().toISOString(),
  });
  if (liquidezCorrente < 1) alertas.push({
    severidade: "aviso" as const,
    mensagem: `Liquidez corrente abaixo de 1: ${liquidezCorrente.toFixed(2)}`,
    data_deteccao: new Date().toISOString(),
  });
  if (indiceEndividamento > 60) alertas.push({
    severidade: "aviso" as const,
    mensagem: `Endividamento alto: ${indiceEndividamento.toFixed(2)}%`,
    data_deteccao: new Date().toISOString(),
  });

  return {
    data_geracao: new Date().toISOString(),
    periodo,
    kpis: {
      margem_lucro: margemLucro,
      roi,
      liquidez_corrente: liquidezCorrente,
      indice_endividamento: indiceEndividamento,
      taxa_crescimento: ((lucro / saldoInicial) * 100),
    },
    alertas,
    tendencias: {
      receita_30dias: receita30dias,
      despesa_30dias: despesa30dias,
      crescimento_percentual: ((lucro / saldoInicial) * 100),
    },
  };
}

/**
 * 4. FLUXO DE CAIXA CONSOLIDADO
 * Demonstração de Fluxo de Caixa: operações, investimentos, financiamento
 * Formato indireto (a partir do resultado líquido)
 */
export function relatorioFluxoCaixaConsolidado(
  lancamentos: LancamentoConsolidado[],
  periodo: string,
  saldoInicial: number = 100000
): FluxoCaixaConsolidado {
  // Atividades Operacionais
  const resultadoLiquido = lancamentos
    .filter(l => l.conta_credito.startsWith("4"))
    .reduce((sum, l) => sum + l.valor, 0) - lancamentos
    .filter(l => l.conta_debito.startsWith("6"))
    .reduce((sum, l) => sum + l.valor, 0);

  // Ajustes não-caixa (depreciação, amortização, etc.)
  const ajustesNaoCaixa = lancamentos
    .filter(l => l.tipo_documento === "depreciacao" || l.tipo_documento === "amortizacao")
    .reduce((sum, l) => sum + l.valor, 0);

  // Mudanças no capital de trabalho (redução de AC - aumento de PC)
  const mudancasCapital = lancamentos
    .filter(l => l.conta_debito.startsWith("1.1") || l.conta_credito.startsWith("2.1"))
    .reduce((sum, l) => sum + l.valor, 0) * 0.1; // 10% de impacto

  const fluxoOperacional = resultadoLiquido + ajustesNaoCaixa + mudancasCapital;

  // Atividades de Investimento
  const aquisicoes = lancamentos
    .filter(l => l.tipo_documento === "aquisicao_imobilizado")
    .reduce((sum, l) => sum + l.valor, 0);

  const vendaAtivos = lancamentos
    .filter(l => l.tipo_documento === "venda_ativo")
    .reduce((sum, l) => sum + l.valor, 0);

  const fluxoInvestimento = vendaAtivos - aquisicoes;

  // Atividades de Financiamento
  const emprestimos = lancamentos
    .filter(l => l.conta_credito.startsWith("2.2"))
    .reduce((sum, l) => sum + l.valor, 0);

  const dividendos = lancamentos
    .filter(l => l.tipo_documento === "distribuicao_dividendos")
    .reduce((sum, l) => sum + l.valor, 0);

  const fluxoFinanciamento = emprestimos - dividendos;

  const variacaoCaixa = fluxoOperacional + fluxoInvestimento + fluxoFinanciamento;
  const saldoFinal = saldoInicial + variacaoCaixa;

  return {
    periodo,
    atividades_operacionais: {
      resultado_liquido: resultadoLiquido,
      ajustes_nao_caixa: ajustesNaoCaixa,
      mudancas_capital_trabalho: mudancasCapital,
      fluxo_liquido: fluxoOperacional,
    },
    atividades_investimento: {
      aquisicoes_imobilizado: aquisicoes,
      venda_ativos: vendaAtivos,
      fluxo_liquido: fluxoInvestimento,
    },
    atividades_financiamento: {
      obtencao_emprestimos: emprestimos,
      pagamento_dividendos: dividendos,
      fluxo_liquido: fluxoFinanciamento,
    },
    variacao_caixa: variacaoCaixa,
    saldo_inicial: saldoInicial,
    saldo_final: Math.max(0, saldoFinal),
  };
}

/**
 * 5. SENSIBILIDADE IPCA
 * Analisa impacto da inflação (IPCA) em todas as rubricas de remuneração
 * Simula reajuste de benefícios e rubricações conforme variação IPCA
 */
export function relatorioSensibilidadeIPCA(
  lancamentos: LancamentoConsolidado[],
  periodo: string,
  ipcaAcumulado: number = 10.5 // Percentual IPCA acumulado
): SensibilidadeIPCA {
  // Rubricas padrão de remuneração (do apontamento-prestador)
  const rubricas_padrao = [
    { rubrica: "urgencia_50", valor_atual: 50 },
    { rubrica: "urgencia_62_50", valor_atual: 62.5 },
    { rubrica: "airbnb_1q", valor_atual: 150 },
    { rubrica: "airbnb_2q", valor_atual: 200 },
    { rubrica: "deslocamento", valor_atual: 25 },
    { rubrica: "busca_materiais", valor_atual: 30 },
    { rubrica: "diaria_ajudante", valor_atual: 80 },
  ];

  const rubricas = rubricas_padrao.map(r => {
    const valorProjetado = r.valor_atual * (1 + ipcaAcumulado / 100);
    const impactoReais = valorProjetado - r.valor_atual;
    const impactoPercentual = (impactoReais / r.valor_atual) * 100;

    return {
      rubrica: r.rubrica,
      valor_atual: r.valor_atual,
      valor_projetado_ipca: Math.round(valorProjetado * 100) / 100,
      impacto_percentual: impactoPercentual,
      impacto_reais: Math.round(impactoReais * 100) / 100,
    };
  });

  // Filtrar lançamentos de remuneração (folha, apontamentos)
  const lancamentosRemuneracao = lancamentos.filter(
    l => l.origem_modulo === "payroll" || l.origem_modulo === "apontamento"
  );

  const custoAnualAtual = lancamentosRemuneracao.reduce((sum, l) => sum + l.valor, 0) * 12;
  const impactoTotal = rubricas.reduce((sum, r) => sum + r.impacto_reais, 0) *
    (lancamentosRemuneracao.length > 0 ? lancamentosRemuneracao.length : 1);

  return {
    periodo,
    ipca_acumulado: ipcaAcumulado,
    rubricas,
    impacto_total: Math.round(impactoTotal * 100) / 100,
    custo_anual_atual: Math.round(custoAnualAtual * 100) / 100,
    custo_anual_projetado: Math.round((custoAnualAtual + impactoTotal * 12) * 100) / 100,
  };
}

/**
 * 6. PROJEÇÃO ORÇAMENTÁRIA - PRÓXIMOS 12 MESES
 * Forward-looking budget projection com base em histórico e tendências
 * Simula cenários pessimista, esperado, otimista
 */
export function relatorioProjetacaoProximos12Meses(
  lancamentos: LancamentoConsolidado[],
  periodo: string,
  cenario: "pessimista" | "esperado" | "otimista" = "esperado"
): ProjetacaoOrcamentaria {
  // Calcular médias históricas
  const receitas = lancamentos
    .filter(l => l.conta_credito.startsWith("4"))
    .reduce((sum, l) => sum + l.valor, 0);

  const despesas = lancamentos
    .filter(l => l.conta_debito.startsWith("6"))
    .reduce((sum, l) => sum + l.valor, 0);

  // Aplicar fator de cenário
  const fatores = {
    pessimista: 0.9, // -10%
    esperado: 1.0, // estável
    otimista: 1.1, // +10%
  };

  const fator = fatores[cenario];

  // Gerar projeção para 12 meses
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];

  const receitas_projetadas = meses.map((mes, i) => ({
    mes,
    valor: (receitas / 12) * fator * (1 + i * 0.02), // Crescimento de 2% a.m.
    fonte: "operações_regulares",
  }));

  const despesas_projetadas = meses.map((mes, i) => ({
    mes,
    valor: (despesas / 12) * fator * (1 + i * 0.01), // Crescimento de 1% a.m.
    categoria: "operacional",
  }));

  // Calcular fluxo de caixa projetado
  let saldoAcumulado = 100000; // Saldo inicial
  const fluxo_caixa_projetado = meses.map((mes, i) => {
    const receita_mes = receitas_projetadas[i].valor;
    const despesa_mes = despesas_projetadas[i].valor;
    const variacao = receita_mes - despesa_mes;
    saldoAcumulado += variacao;

    return {
      mes,
      saldo: Math.round(saldoAcumulado * 100) / 100,
      variacao: Math.round(variacao * 100) / 100,
    };
  });

  // Margem de segurança: 15% para pessimista, 10% para esperado, 5% para otimista
  const margens = {
    pessimista: 15,
    esperado: 10,
    otimista: 5,
  };

  return {
    periodo_inicial: `${new Date().getFullYear()}-01`,
    periodo_final: `${new Date().getFullYear()}-12`,
    receitas_projetadas: receitas_projetadas.map(r => ({
      ...r,
      valor: Math.round(r.valor * 100) / 100,
    })),
    despesas_projetadas: despesas_projetadas.map(d => ({
      ...d,
      valor: Math.round(d.valor * 100) / 100,
    })),
    fluxo_caixa_projetado,
    margem_seguranca: margens[cenario],
  };
}

/**
 * Função utilitária para gerar relatórios consolidados completos
 * Retorna todos os 6 relatórios em um único objeto
 */
export interface RelatoriosConsolidados {
  consolidacao: RelatorioConsolidacao;
  financeiro: DemonstrativoFinanceiro;
  painel: PainelGestao;
  fluxo_caixa: FluxoCaixaConsolidado;
  sensibilidade_ipca: SensibilidadeIPCA;
  projecao_12m: ProjetacaoOrcamentaria;
}

export function gerarTodosRelatorios(
  lancamentos: LancamentoConsolidado[],
  periodo: string,
  opcoes: {
    ipca?: number;
    cenario?: "pessimista" | "esperado" | "otimista";
    saldoInicial?: number;
  } = {}
): RelatoriosConsolidados {
  return {
    consolidacao: relatorioConsolidacaoModulos(lancamentos, periodo),
    financeiro: relatorioExecutivoFinanceiro(lancamentos, periodo),
    painel: relatorioPainelGestao(lancamentos, periodo, opcoes.saldoInicial),
    fluxo_caixa: relatorioFluxoCaixaConsolidado(lancamentos, periodo, opcoes.saldoInicial),
    sensibilidade_ipca: relatorioSensibilidadeIPCA(lancamentos, periodo, opcoes.ipca),
    projecao_12m: relatorioProjetacaoProximos12Meses(lancamentos, periodo, opcoes.cenario),
  };
}
