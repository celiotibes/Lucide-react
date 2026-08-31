// Proposta de novo valor de aluguel na renovação, a partir do índice do
// contrato (ou do padrão de `configuracoes_sistema` na ausência) e do
// percentual acumulado em 12 meses cadastrado em `indices_economicos`.
// SEMPRE uma proposta (status='proposto' em reajustes_contrato) — nunca
// aplica o valor sozinho. Se não houver percentual cadastrado para o
// índice, devolve `disponivel: false` em vez de inventar um número.

export type IndiceReajuste = 'IGPM' | 'IPCA' | 'INPC';

export interface ResultadoCalculoReajuste {
  disponivel: boolean;
  indice: IndiceReajuste;
  percentual?: number;
  valorNovo?: number;
  motivoIndisponivel?: string;
}

export function resolverIndiceContrato(
  indiceContrato: IndiceReajuste | null,
  indicePadraoSistema: IndiceReajuste,
): IndiceReajuste {
  return indiceContrato ?? indicePadraoSistema;
}

export function calcularReajuste(params: {
  valorAtual: number;
  indice: IndiceReajuste;
  percentualAcumulado12m: number | null;
}): ResultadoCalculoReajuste {
  if (params.valorAtual <= 0) {
    throw new Error('valorAtual deve ser positivo');
  }

  if (params.percentualAcumulado12m == null) {
    return {
      disponivel: false,
      indice: params.indice,
      motivoIndisponivel: `Sem percentual de ${params.indice} cadastrado em indices_economicos para o período mais recente.`,
    };
  }

  const valorNovo = arredondar(params.valorAtual * (1 + params.percentualAcumulado12m));

  return {
    disponivel: true,
    indice: params.indice,
    percentual: params.percentualAcumulado12m,
    valorNovo,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
