// Multa por rescisão antecipada — Florianópolis (Kitnet 16, Residencial
// João Pottker, docs/10-auditoria-contrato-real.md). Duas peças de
// evidência real, combinadas:
//
//   - Cláusula 11.2 do contrato: multa proporcional aos meses restantes
//     do prazo contratual, com teto de 3 (três) meses do valor mensal
//     vigente. Segue o mesmo padrão da Lei 8.245/91, art. 4º, parágrafo
//     único (multa cheia reduzida na proporção do tempo já cumprido do
//     contrato) — não uma constante inventada.
//   - Anexo I, item 6: bonificação decrescente EXCLUSIVA para saídas
//     programadas em dezembro do ano civil corrente. Desconto fixo de
//     85% sobre a multa proporcional se a notificação por e-mail ocorrer
//     até 22/11 E a entrega das chaves até 22/12; desconto de 80% se a
//     notificação ocorrer até 27/11 E a entrega até 28/12. Fora dessas
//     duas janelas (ou fora de dezembro), nenhuma bonificação — vale o
//     valor cheio da cláusula 11.2.
//
// Contagem de meses usa a mesma base de 30 dias fixos ("mês comercial")
// já confirmada por 4 contratos reais independentes em
// `server/financeiro/prorata.ts` — não dias corridos de calendário.
//
// Datas em UTC meia-noite, ex.: `new Date(Date.UTC(2026, 11, 22))`.

const DIAS_BASE_MES_COMERCIAL = 30;
const TETO_MESES_MULTA = 3;

export interface EntradaMultaRescisoria {
  valorMensal: number;
  dataInicioContrato: Date;
  dataFimContrato: Date;
  /** Data em que a desocupação efetiva ocorre (entrega das chaves). */
  dataRescisao: Date;
  /** Data da notificação formal por e-mail — necessária só para avaliar a bonificação de dezembro (Anexo I). */
  dataNotificacao?: Date | null;
}

export type FaixaBonificacaoDezembro = 'ate_22_novembro' | 'ate_27_novembro' | 'fora_da_janela' | 'nao_aplicavel';

export interface ResultadoMultaRescisoria {
  /** Multa cheia da cláusula 11.2, antes de qualquer bonificação. */
  multaProporcional: number;
  faixaBonificacao: FaixaBonificacaoDezembro;
  descontoBonificacaoPct: number;
  /** Valor final a cobrar, já com a bonificação de dezembro aplicada. */
  multaFinal: number;
}

export function calcularMultaRescisoria(entrada: EntradaMultaRescisoria): ResultadoMultaRescisoria {
  if (entrada.valorMensal <= 0) {
    throw new Error('valorMensal deve ser positivo');
  }
  if (entrada.dataFimContrato <= entrada.dataInicioContrato) {
    throw new Error('dataFimContrato deve ser posterior a dataInicioContrato');
  }
  if (entrada.dataRescisao < entrada.dataInicioContrato) {
    throw new Error('dataRescisao não pode ser anterior ao início do contrato');
  }

  const duracaoTotalDias = diferencaEmDias(entrada.dataInicioContrato, entrada.dataFimContrato);
  const diasRestantes = Math.max(0, diferencaEmDias(entrada.dataRescisao, entrada.dataFimContrato));
  const proporcao = Math.min(1, diasRestantes / duracaoTotalDias);

  const multaCheia = arredondar(entrada.valorMensal * TETO_MESES_MULTA);
  const multaProporcional = arredondar(multaCheia * proporcao);

  const { faixa, desconto } = avaliarBonificacaoDezembro(entrada.dataRescisao, entrada.dataNotificacao ?? null);
  const multaFinal = arredondar(multaProporcional * (1 - desconto));

  return {
    multaProporcional,
    faixaBonificacao: faixa,
    descontoBonificacaoPct: desconto,
    multaFinal,
  };
}

function avaliarBonificacaoDezembro(
  dataEntregaChaves: Date,
  dataNotificacao: Date | null,
): { faixa: FaixaBonificacaoDezembro; desconto: number } {
  if (dataEntregaChaves.getUTCMonth() !== 11 /* dezembro, 0-indexado */) {
    return { faixa: 'nao_aplicavel', desconto: 0 };
  }
  if (!dataNotificacao) {
    return { faixa: 'fora_da_janela', desconto: 0 };
  }

  const ano = dataEntregaChaves.getUTCFullYear();
  const limite22Nov = new Date(Date.UTC(ano, 10, 22));
  const limite27Nov = new Date(Date.UTC(ano, 10, 27));
  const limite22Dez = new Date(Date.UTC(ano, 11, 22));
  const limite28Dez = new Date(Date.UTC(ano, 11, 28));

  if (dataNotificacao <= limite22Nov && dataEntregaChaves <= limite22Dez) {
    return { faixa: 'ate_22_novembro', desconto: 0.85 };
  }
  if (dataNotificacao <= limite27Nov && dataEntregaChaves <= limite28Dez) {
    return { faixa: 'ate_27_novembro', desconto: 0.8 };
  }
  return { faixa: 'fora_da_janela', desconto: 0 };
}

function diferencaEmDias(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
