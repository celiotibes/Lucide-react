// Regra de faturamento de energia (docs/04-roadmap-fases.md, Módulo 7):
// franquia mínima de 30 kWh (contratos antigos) ou 50 kWh (contratos a
// partir de jan/2026), taxa administrativa de 25% sobre o valor de energia
// — sempre discriminada como custeio de infraestrutura compartilhada
// (auditoria item 1: a ausência dessa descrição no PDF é risco de passivo
// em Juizado Especial), nunca embutida sem detalhamento.
//
// Esta função NÃO decide se uma leitura está confiável o suficiente para
// faturar — isso é responsabilidade da camada de aplicação, que só chama
// esta função depois que `leituras_energia.status = 'confirmada'` (schema),
// nunca a partir de uma leitura `pendente_confirmacao` (auditoria item 7).

export interface CalculoFaturaEnergiaInput {
  leituraAnteriorKwh: number;
  leituraAtualKwh: number;
  franquiaKwh: number;
  tarifaTePorKwh: number;
  tarifaTusdPorKwh: number;
  taxaAdministrativaPct?: number;
}

export interface ItemFaturaEnergia {
  descricao: string;
  valor: number;
}

export interface ResultadoFaturaEnergia {
  consumoKwh: number;
  consumoFaturavelKwh: number;
  valorEnergia: number;
  valorTaxaAdministrativa: number;
  valorTotal: number;
  itens: ItemFaturaEnergia[];
}

const TAXA_ADMINISTRATIVA_PADRAO = 0.25;

export function calcularFaturaEnergia(input: CalculoFaturaEnergiaInput): ResultadoFaturaEnergia {
  const consumoKwh = input.leituraAtualKwh - input.leituraAnteriorKwh;

  if (consumoKwh < 0) {
    throw new Error(
      'Leitura atual menor que a anterior — medidor provavelmente resetado ou erro de leitura. ' +
        'Não fature automaticamente; exija correção manual antes de prosseguir.',
    );
  }
  if (input.franquiaKwh <= 0) {
    throw new Error('franquiaKwh deve ser positiva (30 ou 50 conforme a data do contrato)');
  }

  const tarifaPorKwh = input.tarifaTePorKwh + input.tarifaTusdPorKwh;
  const consumoFaturavelKwh = Math.max(consumoKwh, input.franquiaKwh);
  const taxaAdministrativaPct = input.taxaAdministrativaPct ?? TAXA_ADMINISTRATIVA_PADRAO;

  const valorEnergia = arredondar(consumoFaturavelKwh * tarifaPorKwh);
  const valorTaxaAdministrativa = arredondar(valorEnergia * taxaAdministrativaPct);
  const valorTotal = arredondar(valorEnergia + valorTaxaAdministrativa);

  const itens: ItemFaturaEnergia[] = [
    {
      descricao:
        consumoKwh < input.franquiaKwh
          ? `Energia (franquia mínima de ${input.franquiaKwh} kWh, consumo real ${consumoKwh} kWh)`
          : `Energia (consumo de ${consumoKwh} kWh)`,
      valor: valorEnergia,
    },
    {
      descricao: `Taxa administrativa (${(taxaAdministrativaPct * 100).toFixed(0)}% — custeio de infraestrutura compartilhada: áreas comuns, internet, segurança)`,
      valor: valorTaxaAdministrativa,
    },
  ];

  return { consumoKwh, consumoFaturavelKwh, valorEnergia, valorTaxaAdministrativa, valorTotal, itens };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
