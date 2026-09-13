// Patrimônio líquido por imóvel (valor de avaliação − saldo devedor dos
// financiamentos ativos) e a despesa fixa mensal recorrente que os
// financiamentos representam (soma das parcelas ativas) — pedido direto
// do cliente ao revisar a cobertura do portfólio de Curitiba (docs/33):
// "deve constar de cada imóvel e serve para apurar patrimônio líquido
// mensal e também deve ser considerado nas despesas fixas recorrentes do
// negócio como um todo".
//
// Sem `valorAvaliacao`, patrimônio líquido não existe — nunca estima a
// partir do valor financiado ou de qualquer outro proxy (mesmo princípio
// de "dado insuficiente é pulado, não vira número inventado" já aplicado
// em faturarEnergia.ts e calcularAuditoriaEnergiaSolar.ts).

export interface FinanciamentoAtivo {
  valorParcela: number;
  saldoDevedor: number | null;
}

export interface EntradaPatrimonioImovel {
  imovelId: string;
  valorAvaliacao: number | null;
  financiamentosAtivos: FinanciamentoAtivo[];
}

export interface ResultadoPatrimonioImovel {
  imovelId: string;
  saldoDevedorTotal: number;
  despesaFixaMensal: number;
  /** null quando o imóvel não tem valor de avaliação cadastrado — não há como calcular. */
  patrimonioLiquido: number | null;
}

export function calcularPatrimonioLiquidoImovel(entrada: EntradaPatrimonioImovel): ResultadoPatrimonioImovel {
  const saldoDevedorTotal = entrada.financiamentosAtivos.reduce((soma, f) => soma + (f.saldoDevedor ?? 0), 0);
  const despesaFixaMensal = entrada.financiamentosAtivos.reduce((soma, f) => soma + f.valorParcela, 0);

  return {
    imovelId: entrada.imovelId,
    saldoDevedorTotal,
    despesaFixaMensal,
    patrimonioLiquido: entrada.valorAvaliacao === null ? null : entrada.valorAvaliacao - saldoDevedorTotal,
  };
}

export interface ResultadoPatrimonioConsolidado {
  imoveis: ResultadoPatrimonioImovel[];
  /** Soma só dos imóveis com valor de avaliação cadastrado — imóveis sem avaliação não entram nem a favor nem contra. */
  patrimonioLiquidoConsolidado: number;
  /** Quantos imóveis do portfólio ainda não têm valor de avaliação — para sinalizar que o consolidado está incompleto. */
  imoveisSemAvaliacao: number;
  despesaFixaMensalTotal: number;
}

export function calcularPatrimonioLiquidoConsolidado(entradas: EntradaPatrimonioImovel[]): ResultadoPatrimonioConsolidado {
  const imoveis = entradas.map(calcularPatrimonioLiquidoImovel);

  return {
    imoveis,
    patrimonioLiquidoConsolidado: imoveis.reduce((soma, r) => soma + (r.patrimonioLiquido ?? 0), 0),
    imoveisSemAvaliacao: imoveis.filter((r) => r.patrimonioLiquido === null).length,
    despesaFixaMensalTotal: imoveis.reduce((soma, r) => soma + r.despesaFixaMensal, 0),
  };
}
