// Fechamento financeiro do contrato a partir da vistoria de saída
// (docs/plano-desenvolvimento-vistorias.md §2.7, celiotibes/app-bruxel).
//
// Igual ao resto de server/financeiro/*, esta função é pura: recebe os
// valores já apurados (reparos valorados por cláusula de contrato/
// orçamento/estimativa, encargos em aberto, multas, adiantamentos) e só
// consolida débitos x créditos em `saldo_final` — positivo é valor a
// devolver ao inquilino, negativo é valor que o inquilino deve. A
// resolução de CADA valor (qual reparo é "uso normal" x "dano", qual é o
// saldo de encargos em aberto) é responsabilidade de quem chama, não
// desta função.
//
// A caução é tratada à parte dos demais créditos porque tem duas fontes
// possíveis (decidido no plano, v2.1): 'indice_bacen' reaproveita
// `calcularRendimentoCaucao` (mesmo princípio de rendimentoCaucao.ts —
// taxa mensal já resolvida externamente a partir da série SGS do Bacen,
// sem hardcode de índice aqui) ou 'extrato_manual', quando existe conta
// poupança vinculada e o saldo real do extrato prevalece.
//
// A união discriminada de origem por tipo (débito x crédito) espelha
// exatamente a constraint `itens_fechamento_tipo_origem_check` da
// migração (database/migration-modulo-vistorias.sql) — um item montado
// aqui sempre é uma linha válida para persistir.

import { calcularRendimentoCaucao } from '../financeiro/rendimentoCaucao';

export type OrigemDebito =
  | 'previsto_em_contrato'
  | 'orcamento'
  | 'estimativa'
  | 'encargo_aberto'
  | 'multa';

export type OrigemCreditoManual = 'adiantamento' | 'saldo_a_favor';

export interface ItemDebitoInput {
  descricao: string;
  valor: number;
  origem: OrigemDebito;
  itemVistoriaId?: string;
  ordemServicoId?: string;
  anexoUrl?: string;
}

export interface ItemCreditoInput {
  descricao: string;
  valor: number;
  origem: OrigemCreditoManual;
}

export type CaucaoInput =
  | { fonte: 'extrato_manual'; valorAtualizado: number }
  | {
      fonte: 'indice_bacen';
      valorBase: number;
      /** Taxa mensal (ou média do período) já resolvida a partir da série SGS do Bacen. */
      taxaMensal: number;
      diasDecorridos: number;
      indicePeriodo?: string;
    }
  | null;

export interface ItemFechamentoResultado {
  tipo: 'debito' | 'credito';
  origem: OrigemDebito | OrigemCreditoManual | 'caucao';
  descricao: string;
  valor: number;
  itemVistoriaId?: string;
  ordemServicoId?: string;
  anexoUrl?: string;
}

export interface CalculoFechamentoInput {
  debitos: ItemDebitoInput[];
  creditos: ItemCreditoInput[];
  caucao: CaucaoInput;
}

export interface ResultadoFechamentoContrato {
  itens: ItemFechamentoResultado[];
  totalDebitos: number;
  totalCreditos: number;
  /** Positivo = a devolver ao inquilino. Negativo = inquilino deve. */
  saldoFinal: number;
  caucaoValorAtualizado: number | null;
  caucaoFonte: 'indice_bacen' | 'extrato_manual' | null;
  caucaoIndicePeriodo: string | null;
}

export function calcularFechamentoContrato(
  input: CalculoFechamentoInput,
): ResultadoFechamentoContrato {
  for (const debito of input.debitos) {
    if (debito.valor <= 0) {
      throw new Error(`valor do débito "${debito.descricao}" deve ser positivo`);
    }
  }
  for (const credito of input.creditos) {
    if (credito.valor <= 0) {
      throw new Error(`valor do crédito "${credito.descricao}" deve ser positivo`);
    }
  }

  const itens: ItemFechamentoResultado[] = [
    ...input.debitos.map((debito) => ({
      tipo: 'debito' as const,
      origem: debito.origem,
      descricao: debito.descricao,
      valor: arredondar(debito.valor),
      itemVistoriaId: debito.itemVistoriaId,
      ordemServicoId: debito.ordemServicoId,
      anexoUrl: debito.anexoUrl,
    })),
    ...input.creditos.map((credito) => ({
      tipo: 'credito' as const,
      origem: credito.origem,
      descricao: credito.descricao,
      valor: arredondar(credito.valor),
    })),
  ];

  let caucaoValorAtualizado: number | null = null;
  let caucaoFonte: 'indice_bacen' | 'extrato_manual' | null = null;
  let caucaoIndicePeriodo: string | null = null;

  if (input.caucao) {
    caucaoFonte = input.caucao.fonte;
    caucaoValorAtualizado =
      input.caucao.fonte === 'extrato_manual'
        ? arredondar(input.caucao.valorAtualizado)
        : calcularRendimentoCaucao({
            valorBase: input.caucao.valorBase,
            taxaMensal: input.caucao.taxaMensal,
            diasDecorridos: input.caucao.diasDecorridos,
          }).valorAtualizado;
    caucaoIndicePeriodo = input.caucao.fonte === 'indice_bacen' ? (input.caucao.indicePeriodo ?? null) : null;

    itens.push({
      tipo: 'credito',
      origem: 'caucao',
      descricao:
        caucaoFonte === 'indice_bacen'
          ? 'Devolução do depósito caução, atualizado pelo índice da poupança (SGS/Bacen)'
          : 'Devolução do depósito caução, conforme extrato bancário informado',
      valor: caucaoValorAtualizado,
    });
  }

  const totalDebitos = arredondar(
    itens.filter((item) => item.tipo === 'debito').reduce((acumulado, item) => acumulado + item.valor, 0),
  );
  const totalCreditos = arredondar(
    itens.filter((item) => item.tipo === 'credito').reduce((acumulado, item) => acumulado + item.valor, 0),
  );

  return {
    itens,
    totalDebitos,
    totalCreditos,
    saldoFinal: arredondar(totalCreditos - totalDebitos),
    caucaoValorAtualizado,
    caucaoFonte,
    caucaoIndicePeriodo,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
