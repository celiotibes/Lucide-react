// Regra de pró-rata do primeiro mês de contrato (docs/04-roadmap-fases.md):
// contrato iniciado até o dia 15 fatura proporcional até o fim do mês
// corrente, vencendo no dia 1 do mês seguinte; iniciado a partir do dia 16,
// o ciclo se fixa no dia 10 do mês seguinte (cobrindo, portanto, dias do
// mês de início mais os primeiros 9 dias do mês seguinte).
//
// DECISÃO DE DEFAULT PENDENTE DE CONFIRMAÇÃO CONTÁBIL: o rateio diário usa
// dias corridos de calendário (valor mensal / dias do mês daquele mês
// específico), não uma divisão fixa por 30. O material de origem nunca
// respondeu essa pergunta de forma conclusiva (ver docs/01-auditoria-critica.md,
// item 1) — dias corridos é a opção mais defensável tecnicamente, mas
// precisa de validação do contador antes de ir para produção (docs/05,
// "Recomendação de governança mínima").
//
// Contrato de datas: `dataInicio` deve ser meia-noite UTC, ex.:
// `new Date(Date.UTC(2026, 6, 10))` (mês 0-indexado, como no Date nativo).

export interface CalculoProrataInput {
  dataInicio: Date;
  valorAluguelMensal: number;
}

export interface ResultadoProrata {
  valorProrata: number;
  dataVencimentoPrimeiraFatura: Date;
  diasCobertos: number;
}

const DIA_LIMITE_CICLO_MES_ATUAL = 15;
const DIA_VENCIMENTO_CICLO_DESLOCADO = 10;
const DIAS_COBERTOS_MES_SEGUINTE_CICLO_DESLOCADO = DIA_VENCIMENTO_CICLO_DESLOCADO - 1;

export function calcularProrata(input: CalculoProrataInput): ResultadoProrata {
  if (input.valorAluguelMensal <= 0) {
    throw new Error('valorAluguelMensal deve ser positivo');
  }

  const dia = input.dataInicio.getUTCDate();
  const ano = input.dataInicio.getUTCFullYear();
  const mes = input.dataInicio.getUTCMonth();

  if (dia <= DIA_LIMITE_CICLO_MES_ATUAL) {
    const diasNoMes = diasNoMesUTC(ano, mes);
    const diasCobertos = diasNoMes - dia + 1;
    const valorProrata = arredondar((input.valorAluguelMensal / diasNoMes) * diasCobertos);
    return {
      valorProrata,
      dataVencimentoPrimeiraFatura: new Date(Date.UTC(ano, mes + 1, 1)),
      diasCobertos,
    };
  }

  const diasNoMesAtual = diasNoMesUTC(ano, mes);
  const diasNoMesAtualCobertos = diasNoMesAtual - dia + 1;
  const diasNoMesSeguinte = diasNoMesUTC(ano, mes + 1);
  const diasNoMesSeguinteCobertos = DIAS_COBERTOS_MES_SEGUINTE_CICLO_DESLOCADO;

  const valorMesAtual = (input.valorAluguelMensal / diasNoMesAtual) * diasNoMesAtualCobertos;
  const valorMesSeguinte = (input.valorAluguelMensal / diasNoMesSeguinte) * diasNoMesSeguinteCobertos;

  return {
    valorProrata: arredondar(valorMesAtual + valorMesSeguinte),
    dataVencimentoPrimeiraFatura: new Date(Date.UTC(ano, mes + 1, DIA_VENCIMENTO_CICLO_DESLOCADO)),
    diasCobertos: diasNoMesAtualCobertos + diasNoMesSeguinteCobertos,
  };
}

function diasNoMesUTC(ano: number, mesZeroIndexado: number): number {
  // Dia 0 do mês seguinte = último dia do mês corrente.
  return new Date(Date.UTC(ano, mesZeroIndexado + 1, 0)).getUTCDate();
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
