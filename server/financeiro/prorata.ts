// Regra de pró-rata do primeiro mês de contrato.
//
// CORRIGIDO A PARTIR DE UM CONTRATO REAL ASSINADO (Kitnet 16, Residencial
// João Pottker, início 08/07/2026, R$2.490,00/mês, vencimento dia 10): a
// cláusula 6.4 desse contrato mostra o cálculo por extenso — "proporcional
// aos 24 dias de ocupação efetiva no mês de julho de 2026 (com base em um
// mês comercial de 30 dias)" — resultando em R$1.992,00. Isso resolve, com
// evidência real, a pergunta que ficara em aberto em docs/01-auditoria-critica.md
// (item 1): 2490/30*24 = 1992,00 exato. A versão anterior desta função usava
// dias corridos do mês de calendário (2490/31*24 = 1928,06 para julho, que
// tem 31 dias) — errado frente ao contrato real. A base é sempre 30 dias
// fixos ("mês comercial"), não o número real de dias do mês.
//
// Isso também derruba a regra anterior de "dia ≤15 vence dia 1, dia ≥16
// vence dia 10" (que era uma suposição nunca confirmada): o contrato real
// mostra que o dia de vencimento é simplesmente um termo do contrato
// (`dia_vencimento`, já existente no schema), e a primeira fatura pró-rata
// sempre vence na primeira ocorrência desse dia no mês SEGUINTE ao mês de
// início — mesmo quando esse dia ainda não tinha passado no mês de início
// (aqui, início dia 8 e vencimento dia 10 do mês seguinte, não dia 10 do
// próprio mês de início, que estaria a só 2 dias da mudança).
//
// Contrato de datas: `dataInicio` deve ser meia-noite UTC, ex.:
// `new Date(Date.UTC(2026, 6, 10))` (mês 0-indexado, como no Date nativo).

const DIAS_BASE_MES_COMERCIAL = 30;

export interface CalculoProrataInput {
  dataInicio: Date;
  valorAluguelMensal: number;
  /** Dia de vencimento fixo do contrato (1-31) — vem de `contratos.dia_vencimento`. */
  diaVencimento: number;
}

export interface ResultadoProrata {
  valorProrata: number;
  dataVencimentoPrimeiraFatura: Date;
  diasCobertos: number;
}

export function calcularProrata(input: CalculoProrataInput): ResultadoProrata {
  if (input.valorAluguelMensal <= 0) {
    throw new Error('valorAluguelMensal deve ser positivo');
  }
  if (!Number.isInteger(input.diaVencimento) || input.diaVencimento < 1 || input.diaVencimento > 31) {
    throw new Error('diaVencimento deve ser um número inteiro entre 1 e 31');
  }

  const dia = input.dataInicio.getUTCDate();
  const ano = input.dataInicio.getUTCFullYear();
  const mes = input.dataInicio.getUTCMonth();

  const diasNoMesCalendario = diasNoMesUTC(ano, mes);
  const diasCobertos = diasNoMesCalendario - dia + 1;
  const valorProrata = arredondar((input.valorAluguelMensal / DIAS_BASE_MES_COMERCIAL) * diasCobertos);

  return {
    valorProrata,
    dataVencimentoPrimeiraFatura: new Date(Date.UTC(ano, mes + 1, input.diaVencimento)),
    diasCobertos,
  };
}

function diasNoMesUTC(ano: number, mesZeroIndexado: number): number {
  // Dia 0 do mês seguinte = último dia do mês corrente. Usado só para saber
  // quantos dias faltam até o fim do mês de início, não como denominador.
  return new Date(Date.UTC(ano, mesZeroIndexado + 1, 0)).getUTCDate();
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
