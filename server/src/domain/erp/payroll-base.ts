/**
 * Payroll Base (2A.3)
 * Processamento de folha de pagamento híbrida (CLT básico)
 * Cálculos: Salário, INSS, IRRF
 */

export interface ContratoFolha {
  id: string;
  funcionario_id: string;
  funcionario_nome: string;
  cargo: string;
  salario_base: number;
  data_admissao: string; // ISO 8601
  tipo_contrato: "CLT" | "PJ";
  ativo: boolean;
}

export interface ProcessamentoFolha {
  id: string;
  mes: string; // YYYY-MM
  data_processamento: string;
  contrato_id: string;
  funcionario_nome: string;
  salario_bruto: number;
  desconto_inss: number;
  desconto_irrf: number;
  salario_liquido: number;
  status: "processando" | "finalizado" | "erro";
  erros?: string[];
}

export interface DescontoFolha {
  id: string;
  processamento_folha_id: string;
  tipo: "INSS" | "IRRF" | "OUTRO";
  valor: number;
  percentual: number;
  observacao?: string;
}

/**
 * Alíquota INSS brasileira (contribuinte empregado)
 * Tabela 2024: progressiva de 7.5% a 14%
 */
const ALIQUOTAS_INSS = [
  { limite: 1412.0, aliquota: 0.075 },   // 7.5%
  { limite: 2666.68, aliquota: 0.09 },   // 9%
  { limite: 4000.03, aliquota: 0.12 },   // 12%
  { limite: Infinity, aliquota: 0.14 },  // 14%
];

/**
 * Calcula desconto INSS (CLT)
 * Alíquota progressiva, sem teto (contribuinte empregado)
 */
export function calcularINSS(salario_bruto: number): number {
  let inss = 0;
  let base_anterior = 0;

  for (const { limite, aliquota } of ALIQUOTAS_INSS) {
    if (salario_bruto <= base_anterior) break;

    const base_tributavel = Math.min(salario_bruto, limite) - base_anterior;
    inss += base_tributavel * aliquota;
    base_anterior = limite;
  }

  return Math.round(inss * 100) / 100;
}

/**
 * Alíquota IRRF brasileira (Imposto de Renda Retido na Fonte)
 * Tabela 2024: progressiva
 */
const ALIQUOTAS_IRRF = [
  { limite: 2259.0, aliquota: 0 },
  { limite: 2826.65, aliquota: 0.075 },    // 7.5%
  { limite: 3751.05, aliquota: 0.15 },     // 15%
  { limite: 4664.68, aliquota: 0.225 },    // 22.5%
  { limite: Infinity, aliquota: 0.275 },   // 27.5%
];

const DEDUCAO_PESSOAL_IRRF = 189.59;

/**
 * Calcula IRRF (Imposto de Renda Retido na Fonte)
 * Alíquota progressiva com dedução pessoal
 */
export function calcularIRRF(salario_bruto: number, inss: number): number {
  const base_calculo = salario_bruto - inss - DEDUCAO_PESSOAL_IRRF;

  if (base_calculo <= 0) return 0;

  let irrf = 0;
  let base_anterior = 0;

  for (const { limite, aliquota } of ALIQUOTAS_IRRF) {
    if (base_calculo <= base_anterior) break;

    const base_tributavel = Math.min(base_calculo, limite) - base_anterior;
    irrf += base_tributavel * aliquota;
    base_anterior = limite;
  }

  return Math.round(irrf * 100) / 100;
}

/**
 * Registra novo contrato de trabalho
 */
export function registrarContrato(dados: Omit<ContratoFolha, "id">): ContratoFolha {
  return {
    id: `CTR-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...dados,
  };
}

/**
 * Processa folha de um mês para um contrato
 * Gera lançamento contábil automático (webhook)
 */
export function processarFolha(
  contrato: ContratoFolha,
  mes: string // YYYY-MM
): ProcessamentoFolha {
  const salario_bruto = contrato.salario_base;
  const desconto_inss = calcularINSS(salario_bruto);
  const desconto_irrf = calcularIRRF(salario_bruto, desconto_inss);
  const salario_liquido = salario_bruto - desconto_inss - desconto_irrf;

  return {
    id: `FLH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    mes,
    data_processamento: new Date().toISOString(),
    contrato_id: contrato.id,
    funcionario_nome: contrato.funcionario_nome,
    salario_bruto,
    desconto_inss,
    desconto_irrf,
    salario_liquido,
    status: "finalizado",
  };
}

/**
 * Extrai descontos de uma folha processada
 */
export function extrairDescontos(folha: ProcessamentoFolha): DescontoFolha[] {
  const descontos: DescontoFolha[] = [];

  if (folha.desconto_inss > 0) {
    descontos.push({
      id: `DSC-${Date.now()}-1`,
      processamento_folha_id: folha.id,
      tipo: "INSS",
      valor: folha.desconto_inss,
      percentual: (folha.desconto_inss / folha.salario_bruto) * 100,
      observacao: "Desconto INSS CLT",
    });
  }

  if (folha.desconto_irrf > 0) {
    descontos.push({
      id: `DSC-${Date.now()}-2`,
      processamento_folha_id: folha.id,
      tipo: "IRRF",
      valor: folha.desconto_irrf,
      percentual: (folha.desconto_irrf / folha.salario_bruto) * 100,
      observacao: "Imposto de Renda Retido na Fonte",
    });
  }

  return descontos;
}

/**
 * Gera lançamentos contábeis da folha para integração com ledger
 * Contas: 3.1.02 (Salários a Pagar), 6.2.01-6.2.03 (Encargos)
 */
export function gerarLancamentosFolha(folha: ProcessamentoFolha): Array<{
  descricao: string;
  conta_debito: string;
  conta_credito: string;
  valor: number;
}> {
  return [
    {
      descricao: `Folha ${folha.mes} - ${folha.funcionario_nome}`,
      conta_debito: "6.2.01", // Encargos com Pessoal - Salários
      conta_credito: "3.1.02", // Salários a Pagar
      valor: folha.salario_bruto,
    },
    {
      descricao: `INSS ${folha.mes} - ${folha.funcionario_nome}`,
      conta_debito: "6.2.02", // Encargos com Pessoal - INSS
      conta_credito: "3.1.03", // INSS a Recolher
      valor: folha.desconto_inss,
    },
    {
      descricao: `IRRF ${folha.mes} - ${folha.funcionario_nome}`,
      conta_debito: "6.2.03", // Encargos com Pessoal - IRRF
      conta_credito: "3.1.04", // IRRF a Recolher
      valor: folha.desconto_irrf,
    },
  ];
}

/**
 * Valida integridade de um contrato
 */
export function validarContrato(contrato: ContratoFolha): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!contrato.id) erros.push("ID do contrato é obrigatório");
  if (!contrato.funcionario_nome || contrato.funcionario_nome.trim().length === 0) {
    erros.push("Nome do funcionário é obrigatório");
  }
  if (contrato.salario_base <= 0) erros.push("Salário deve ser positivo");
  if (!/^\d{4}-\d{2}-\d{2}/.test(contrato.data_admissao)) {
    erros.push("Data de admissão deve estar em formato ISO 8601");
  }
  if (!contrato.ativo) erros.push("Contrato deve estar ativo para processamento");

  return { valido: erros.length === 0, erros };
}
