// Valor mensal total de um contrato de locação, a partir do aluguel-base
// (`contratos.valor_aluguel`) e dos componentes extras confirmados nos
// contratos reais de Curitiba (`contrato_componentes_mensais`,
// docs/11-auditoria-contratos-curitiba.md). Três naturezas, três regras
// distintas de composição do total:
//
//   - `valor_fixo`: SOMADO ao aluguel-base (ex.: comodato de móveis fixo
//     R$350 do Apto 503 Central Station — total R$1.300 + R$350 = R$1.650,
//     confirmado batendo o subtotal do contrato real).
//   - `percentual_do_aluguel`: NÃO é somado — já está embutido no
//     aluguel-base. É só um detalhamento/decomposição do mesmo total para
//     fins de discriminação no boleto (ex.: Life Space Estação 509B, "15%
//     do aluguel, já incluído"; Sala Comercial 923B, "o valor locatício
//     mensal é composto em seu valor em 10% [vaga] e 90% [aluguel]" — as
//     duas parcelas somam o total contratual, não o excedem). Um primeiro
//     rascunho desta função tratou isso como aditivo — corrigido antes de
//     qualquer fatura real ser gerada, para não cobrar em dobro.
//   - `repassado_variavel`: SOMADO ao aluguel-base quando o valor do mês é
//     informado (IPTU, condomínio, taxa de lixo/bombeiros — valor real só
//     existe mês a mês, vindo de fonte externa). Sem o valor do mês, o
//     componente é reportado em `faltantes` e a função NÃO estima nem
//     ignora silenciosamente — quem chama decide se fatura sem esse item
//     ou pula o contrato inteiro (mesmo princípio de `faturarEnergia.ts`:
//     dado insuficiente nunca vira fatura errada).

export type NaturezaComponente = 'valor_fixo' | 'percentual_do_aluguel' | 'repassado_variavel';

export interface ComponenteMensal {
  tipo: string;
  descricao?: string | null;
  natureza: NaturezaComponente;
  valorFixo?: number | null;
  percentual?: number | null;
  /** Obrigatório (e só usado) quando `natureza === 'repassado_variavel'`. */
  valorRepassadoMes?: number | null;
}

export interface ItemFaturaCalculado {
  descricao: string;
  valor: number;
}

export interface ComponenteFaltante {
  tipo: string;
  motivo: 'repassado_sem_valor_do_mes';
}

export interface ResultadoValorMensalContrato {
  valorTotal: number;
  itens: ItemFaturaCalculado[];
  faltantes: ComponenteFaltante[];
}

export function calcularValorMensalContrato(
  valorAluguel: number,
  componentes: ComponenteMensal[],
): ResultadoValorMensalContrato {
  if (valorAluguel <= 0) {
    throw new Error('valorAluguel deve ser positivo');
  }

  const itens: ItemFaturaCalculado[] = [];
  const faltantes: ComponenteFaltante[] = [];

  // percentual_do_aluguel decompõe o aluguel-base (não soma) — calculado
  // primeiro para que a linha "Aluguel" já saia líquida da parte embutida.
  let valorAluguelLiquido = valorAluguel;
  const decomposicoes: ItemFaturaCalculado[] = [];
  for (const c of componentes) {
    if (c.natureza !== 'percentual_do_aluguel') continue;
    const valor = arredondar(valorAluguel * (c.percentual ?? 0));
    decomposicoes.push({ descricao: c.descricao ?? c.tipo, valor });
    valorAluguelLiquido = arredondar(valorAluguelLiquido - valor);
  }

  itens.push({ descricao: 'Aluguel', valor: valorAluguelLiquido }, ...decomposicoes);

  let valorTotal = valorAluguel;

  for (const c of componentes) {
    if (c.natureza === 'valor_fixo') {
      const valor = c.valorFixo ?? 0;
      itens.push({ descricao: c.descricao ?? c.tipo, valor });
      valorTotal = arredondar(valorTotal + valor);
    } else if (c.natureza === 'repassado_variavel') {
      if (c.valorRepassadoMes == null) {
        faltantes.push({ tipo: c.tipo, motivo: 'repassado_sem_valor_do_mes' });
        continue;
      }
      itens.push({ descricao: c.descricao ?? c.tipo, valor: c.valorRepassadoMes });
      valorTotal = arredondar(valorTotal + c.valorRepassadoMes);
    }
  }

  return { valorTotal, itens, faltantes };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
