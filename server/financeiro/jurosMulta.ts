// Régua de juros/multa por atraso.
//
// REVISADO A PARTIR DE UM CONTRATO REAL ASSINADO (Kitnet 16, Residencial
// João Pottker, cláusula 5.1): os parâmetros fixos que este módulo usava
// antes (multa 10% + juros 2% a.m. + honorários automáticos aos 30 dias)
// vieram da descrição genérica original do projeto, não de um contrato de
// verdade — e o contrato real difere em TRÊS pontos:
//   1. Multa é EM DEGRAUS, não fixa: 2% até o 5º dia de atraso; a partir do
//      6º dia essa multa de 2% é INTEIRAMENTE SUBSTITUÍDA (não somada) por
//      10% sobre o "montante consolidado" (principal + juros + correção).
//   2. Juros de mora são de 1% a.m., não 2%.
//   3. Honorários de 20% só incidem "em caso de necessidade de propositura
//      de qualquer medida judicial" — não automaticamente aos 30 dias.
//   4. Existe um componente de correção monetária (IPCA pro rata die) que
//      este módulo nunca modelou.
//
// Isso prova que esses parâmetros são termo de CADA contrato, não uma
// constante do sistema — contratos diferentes (Curitiba, outros
// residenciais) podem ter números diferentes. Por isso `calcularJurosMulta`
// agora EXIGE uma `PoliticaCobranca` explícita como parâmetro — não há
// mais uma constante global "certa" para chutar. `POLITICA_COBRANCA_GENERICA`
// é exportada só como valor de referência para contratos que ainda não
// tiverem uma política própria cadastrada (`contrato_politica_cobranca` no
// schema) — e está marcada como não confirmada contra nenhum contrato
// real, ao contrário dos valores do contrato acima.
//
// Correção monetária: assim como em rendimentoCaucao.ts, a taxa acumulada
// do índice (IPCA/IGPM) no período é resolvida por quem chama esta função
// (a partir da API do Bacen), não hardcoded aqui — passar 0 quando não
// disponível é o default seguro (subcobra em vez de chutar um índice
// errado).
//
// Contrato de datas: `dataVencimento` e `dataReferencia` devem representar
// dias de calendário à meia-noite UTC.

export type GatilhoHonorarios =
  | { tipo: 'automatico_apos_dias'; dias: number }
  | { tipo: 'somente_se_necessario_judicial' };

export interface PoliticaCobranca {
  /** Multa aplicada enquanto diasAtraso <= diasLimiteMultaInicial. */
  multaInicialPct: number;
  diasLimiteMultaInicial: number;
  /** Substitui multaInicialPct (não soma) a partir de diasLimiteMultaInicial+1; incide sobre principal+juros+correção. */
  multaAposLimitePct: number;
  jurosPctAoMes: number;
  honorariosPct: number;
  gatilhoHonorarios: GatilhoHonorarios;
}

/**
 * Valores de referência para contratos sem política própria cadastrada.
 * NÃO CONFIRMADOS contra nenhum contrato real — ao contrário da política
 * abaixo (POLITICA_COBRANCA_KITNET16_JOAO_POTTKER), que reproduz um
 * contrato assinado. Use apenas como fallback temporário, nunca como
 * verdade definitiva — cadastre a política real de cada contrato assim
 * que disponível.
 */
export const POLITICA_COBRANCA_GENERICA: PoliticaCobranca = {
  multaInicialPct: 0.1,
  diasLimiteMultaInicial: 0,
  multaAposLimitePct: 0.1,
  jurosPctAoMes: 0.02,
  honorariosPct: 0.2,
  gatilhoHonorarios: { tipo: 'automatico_apos_dias', dias: 30 },
};

export interface CalculoJurosMultaInput {
  valorOriginal: number;
  dataVencimento: Date;
  dataReferencia: Date;
  politica: PoliticaCobranca;
  /** Suspende juros/multa/honorários/correção — acordo de renegociação em andamento. */
  permiteAcordo?: boolean;
  /** Taxa acumulada do índice de correção no período (fração, ex.: 0.004 = 0,4%). Default 0. */
  taxaCorrecaoAcumulada?: number;
  /** Só relevante quando `politica.gatilhoHonorarios.tipo === 'somente_se_necessario_judicial'`. */
  necessitaAcaoJudicial?: boolean;
}

export interface ResultadoJurosMulta {
  valorOriginal: number;
  diasAtraso: number;
  multa: number;
  juros: number;
  correcaoMonetaria: number;
  honorarios: number;
  valorAtualizado: number;
}

export function calcularJurosMulta(input: CalculoJurosMultaInput): ResultadoJurosMulta {
  if (input.valorOriginal <= 0) {
    throw new Error('valorOriginal deve ser positivo');
  }

  const diasAtrasoBruto = diffEmDiasCorridos(input.dataReferencia, input.dataVencimento);
  const diasAtraso = Math.max(diasAtrasoBruto, 0);

  if (diasAtraso === 0 || input.permiteAcordo) {
    return {
      valorOriginal: arredondar(input.valorOriginal),
      diasAtraso,
      multa: 0,
      juros: 0,
      correcaoMonetaria: 0,
      honorarios: 0,
      valorAtualizado: arredondar(input.valorOriginal),
    };
  }

  const { politica } = input;
  const juros = input.valorOriginal * politica.jurosPctAoMes * (diasAtraso / 30);
  const correcaoMonetaria = input.valorOriginal * (input.taxaCorrecaoAcumulada ?? 0);

  const multa =
    diasAtraso <= politica.diasLimiteMultaInicial
      ? input.valorOriginal * politica.multaInicialPct
      : (input.valorOriginal + juros + correcaoMonetaria) * politica.multaAposLimitePct;

  const necessitaHonorarios =
    politica.gatilhoHonorarios.tipo === 'automatico_apos_dias'
      ? diasAtraso >= politica.gatilhoHonorarios.dias
      : input.necessitaAcaoJudicial === true;

  const honorarios = necessitaHonorarios
    ? (input.valorOriginal + juros + correcaoMonetaria + multa) * politica.honorariosPct
    : 0;

  const valorAtualizado = input.valorOriginal + juros + correcaoMonetaria + multa + honorarios;

  return {
    valorOriginal: arredondar(input.valorOriginal),
    diasAtraso,
    multa: arredondar(multa),
    juros: arredondar(juros),
    correcaoMonetaria: arredondar(correcaoMonetaria),
    honorarios: arredondar(honorarios),
    valorAtualizado: arredondar(valorAtualizado),
  };
}

function diffEmDiasCorridos(depois: Date, antes: Date): number {
  const MS_POR_DIA = 1000 * 60 * 60 * 24;
  const depoisDiaUTC = Date.UTC(depois.getUTCFullYear(), depois.getUTCMonth(), depois.getUTCDate());
  const antesDiaUTC = Date.UTC(antes.getUTCFullYear(), antes.getUTCMonth(), antes.getUTCDate());
  return Math.round((depoisDiaUTC - antesDiaUTC) / MS_POR_DIA);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
