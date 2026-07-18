// Comparador entrada x saída (docs/plano-desenvolvimento-vistorias.md
// §2.5): dado o registro de cada item na vistoria de entrada e na de
// saída (já com o histórico de periódicas resolvido por quem chama — ver
// nota abaixo), aponta o que mudou. A classificação final `uso_normal` x
// `dano` é decisão do gestor (com sugestão de IA na Fase 3); esta função
// só calcula ONDE houve divergência, não julga a causa.
//
// Vistorias intermediárias: o plano prevê que um dano já tratado numa
// periódica não deve ser cobrado de novo na saída. Esta função recebe
// `estadoEntrada` já resolvido por quem chama como "o estado mais recente
// conhecido antes da saída" (normalmente o da entrada, mas substituído
// pelo de uma periódica quando ela existe e é mais recente) — a
// resolução de qual vistoria é a mais recente é responsabilidade de quem
// monta o input, não desta função de comparação em si.

export interface ItemParaComparar {
  itemChecklistId: string;
  estado: string | null;
  observacao: string | null;
}

export interface ItemDivergente {
  itemChecklistId: string;
  estadoAnterior: string | null;
  estadoAtual: string | null;
  observacaoAnterior: string | null;
  observacaoAtual: string | null;
}

export interface ResultadoComparacao {
  itensComparados: number;
  divergencias: ItemDivergente[];
}

export function compararVistorias(
  itensAnteriores: ItemParaComparar[],
  itensAtuais: ItemParaComparar[],
): ResultadoComparacao {
  const anterioresPorItem = new Map(itensAnteriores.map((item) => [item.itemChecklistId, item]));
  const atuaisPorItem = new Map(itensAtuais.map((item) => [item.itemChecklistId, item]));
  const todosOsIds = new Set([...anterioresPorItem.keys(), ...atuaisPorItem.keys()]);

  const divergencias: ItemDivergente[] = [];

  for (const itemChecklistId of todosOsIds) {
    const anterior = anterioresPorItem.get(itemChecklistId) ?? null;
    const atual = atuaisPorItem.get(itemChecklistId) ?? null;

    const estadoMudou = (anterior?.estado ?? null) !== (atual?.estado ?? null);
    if (estadoMudou) {
      divergencias.push({
        itemChecklistId,
        estadoAnterior: anterior?.estado ?? null,
        estadoAtual: atual?.estado ?? null,
        observacaoAnterior: anterior?.observacao ?? null,
        observacaoAtual: atual?.observacao ?? null,
      });
    }
  }

  return { itensComparados: todosOsIds.size, divergencias };
}
