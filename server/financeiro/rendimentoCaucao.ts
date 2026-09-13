// Atualização do depósito caução pela poupança (Módulo 1). A regra oficial
// de remuneração da poupança no Brasil (TR + 0,5% a.m., ou 70% da Selic
// quando a Selic está a 8,5% a.a. ou menos, com data de aniversário mensal
// própria de cada depósito) é uma questão de dado externo/regulatória, não
// algo que deveria ser hardcoded aqui como se fosse uma verdade fixa — o
// próprio material de origem já apontava a necessidade de consumir a API
// do Banco Central para isso. Esta função é deliberadamente mais simples:
// recebe a taxa mensal já resolvida (por quem chama, a partir da SGS do
// Bacen) e faz o cálculo de rendimento pro rata die de forma linear.
// Composição (juros sobre juros) não é aplicada aqui porque a poupança
// remunera por aniversário mensal, não continuamente — se a integração
// real precisar de capitalização mensal discreta, isso deve ser resolvido
// na camada que orquestra múltiplos períodos, chamando esta função uma
// vez por mês e realimentando `valorBase`, não mudando a fórmula abaixo.

export interface CalculoRendimentoCaucaoInput {
  valorBase: number;
  /** Taxa mensal da poupança já resolvida externamente (ex.: 0.005 = 0,5% a.m.), como fração. */
  taxaMensal: number;
  diasDecorridos: number;
}

export interface ResultadoRendimentoCaucao {
  valorBase: number;
  rendimento: number;
  valorAtualizado: number;
}

const DIAS_BASE_MES = 30;

export function calcularRendimentoCaucao(input: CalculoRendimentoCaucaoInput): ResultadoRendimentoCaucao {
  if (input.valorBase <= 0) {
    throw new Error('valorBase deve ser positivo');
  }
  if (input.taxaMensal < 0) {
    throw new Error('taxaMensal não pode ser negativa');
  }
  if (input.diasDecorridos < 0) {
    throw new Error('diasDecorridos não pode ser negativo');
  }

  const taxaDiaria = input.taxaMensal / DIAS_BASE_MES;
  const rendimento = arredondar(input.valorBase * taxaDiaria * input.diasDecorridos);

  return {
    valorBase: arredondar(input.valorBase),
    rendimento,
    valorAtualizado: arredondar(input.valorBase + rendimento),
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
