/**
 * Tipos TypeScript para Relatório Executivo
 */

export interface AlertaExecutivo {
  tipo: "crítico" | "aviso" | "info";
  titulo: string;
  descricao: string;
  valor?: number;
  recomendacao?: string;
}

export interface ContasAReceber {
  total: number;
  vencido: number;
  proximo30dias: number;
  percentualVencido: number;
  topDevedores: Array<{
    nome: string;
    valor: number;
    diasVencido: number;
  }>;
}

export interface ContasAPagar {
  total: number;
  vencido: number;
  proximo30dias: number;
  percentualVencido: number;
}

export interface ContasResumo {
  aReceber: ContasAReceber;
  aPagar: ContasAPagar;
}

export interface DREResumo {
  receitaTotal: number;
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  despesaTotal: number;
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaImpostos: number;
  despesaJuros: number;
  lucroLiquido: number;
  lucroBruto: number;
  variacao: {
    mesAnterior: number;
    ytd: number;
  };
  historico: Array<{
    mes: number;
    ano: number;
    receita: number;
    despesa: number;
  }>;
}

export interface FluxoResumo {
  saldoAtual: number;
  projecao30dias: number;
  projecao60dias: number;
  projecao90dias: number;
  diasComSaldoNegativo: number;
  diasAteSaldoNegativo: number | null;
  historico12meses: Array<{
    mes: number;
    ano: number;
    saldo: number;
  }>;
}

export interface MargemPropriedade {
  imovelId: number;
  nomePropriedade: string;
  margem: number;
  status: "OK" | "ATENÇÃO" | "CRÍTICO";
}

export interface MargensPorPropriedadeResumo {
  total: number;
  mediaGeral: number;
  top5: MargemPropriedade[];
  bottom5: MargemPropriedade[];
}

export interface SumarioExecutivo {
  taxaOcupacao: number;
  inadimplencia: number;
  diasDeCaixaDisponivel: number;
  statusGeral: "OK" | "ATENÇÃO" | "CRÍTICO";
  alertasTopCinco: AlertaExecutivo[];
}

export interface RelatorioExecutivo {
  periodo: string;
  mes: number;
  ano: number;
  dre: DREResumo;
  fluxo: FluxoResumo;
  margens: MargensPorPropriedadeResumo;
  alertas: AlertaExecutivo[];
  contas: ContasResumo;
  sumario: SumarioExecutivo;
  criadoEm: string;
}
