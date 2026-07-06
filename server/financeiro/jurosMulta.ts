// Régua de juros/multa (docs/04-roadmap-fases.md, docs/09... parâmetros
// operacionais): multa moratória de 10% (evento único) + juros de 2% a.m.
// pro rata die, com honorários extrajudiciais de 20% quando o atraso
// ultrapassa 30 dias. `permiteAcordo` suspende juros/multa/honorários —
// é o mesmo flag do schema (`faturas.permite_acordo`).
//
// Contrato de datas: `dataVencimento` e `dataReferencia` devem representar
// dias de calendário à meia-noite UTC (ex.: `new Date(Date.UTC(2026,6,10))`).
// Passar datas com componente de hora/fuso local pode enviesar `diasAtraso`
// em ±1 dia perto de meia-noite — responsabilidade de quem chama a função.

export interface CalculoJurosMultaInput {
  valorOriginal: number;
  dataVencimento: Date;
  dataReferencia: Date;
  /** Suspende juros/multa/honorários — acordo de renegociação em andamento. */
  permiteAcordo?: boolean;
}

export interface ResultadoJurosMulta {
  valorOriginal: number;
  diasAtraso: number;
  multa: number;
  juros: number;
  honorarios: number;
  valorAtualizado: number;
}

export const MULTA_PCT = 0.1;
export const JUROS_PCT_AM = 0.02;
export const HONORARIOS_PCT = 0.2;
export const DIAS_GATILHO_HONORARIOS = 30;
const DIAS_BASE_MES_COMERCIAL = 30;

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
      honorarios: 0,
      valorAtualizado: arredondar(input.valorOriginal),
    };
  }

  const multa = input.valorOriginal * MULTA_PCT;
  const juros = input.valorOriginal * JUROS_PCT_AM * (diasAtraso / DIAS_BASE_MES_COMERCIAL);
  const honorarios =
    diasAtraso >= DIAS_GATILHO_HONORARIOS ? (input.valorOriginal + multa + juros) * HONORARIOS_PCT : 0;

  const valorAtualizado = input.valorOriginal + multa + juros + honorarios;

  return {
    valorOriginal: arredondar(input.valorOriginal),
    diasAtraso,
    multa: arredondar(multa),
    juros: arredondar(juros),
    honorarios: arredondar(honorarios),
    valorAtualizado: arredondar(valorAtualizado),
  };
}

function diffEmDiasCorridos(depois: Date, antes: Date): number {
  const MS_POR_DIA = 1000 * 60 * 60 * 24;
  return Math.round((depois.getTime() - antes.getTime()) / MS_POR_DIA);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
