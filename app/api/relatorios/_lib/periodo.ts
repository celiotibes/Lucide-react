// Parsing compartilhado do período (?inicio=YYYY-MM-DD&fim=YYYY-MM-DD) pelas
// três rotas de relatório. Sem os dois parâmetros, usa o mês corrente.

export interface Periodo {
  inicio: Date;
  fim: Date;
}

export function resolverPeriodo(params: URLSearchParams): Periodo {
  const inicioParam = params.get('inicio');
  const fimParam = params.get('fim');

  if (!inicioParam && !fimParam) {
    const agora = new Date();
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0));
    return { inicio, fim };
  }

  if (!inicioParam || !fimParam) {
    throw new Error('Informe os dois parâmetros juntos, "inicio" e "fim" (YYYY-MM-DD), ou nenhum para usar o mês corrente.');
  }

  const inicio = parseDataISO(inicioParam, 'inicio');
  const fim = parseDataISO(fimParam, 'fim');
  if (inicio > fim) {
    throw new Error('"inicio" não pode ser depois de "fim".');
  }
  return { inicio, fim };
}

export function formatarNomeArquivo(periodo: Periodo): string {
  return `${formatarDataISO(periodo.inicio)}_a_${formatarDataISO(periodo.fim)}`;
}

function parseDataISO(valor: string, nomeParametro: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!match) {
    throw new Error(`Parâmetro "${nomeParametro}" inválido: "${valor}" (formato esperado YYYY-MM-DD)`);
  }
  const [, ano, mes, dia] = match;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
