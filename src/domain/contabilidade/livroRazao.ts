import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface LancamentoContabil {
  transacaoId: number;
  data: string;
  historico: string;
  contaDebito: string;
  contaCredito: string;
  valor: number;
}

/** Deriva o livro diário em partida dobrada diretamente de `transacoes`, sem tabela
 * nova nem migração: toda transação já carrega tudo que precisa para virar duas
 * pernas — entrada debita a conta bancária e credita a conta do plano de contas;
 * saída debita a conta do plano de contas e credita a conta bancária. Puramente
 * aditivo — nada no restante do app muda ou depende disto. */
export function gerarLancamentos(db: Database, dataInicio: string, dataFim: string): LancamentoContabil[] {
  const transacoes = consultar<{
    id: number;
    data: string;
    valor: number;
    descricao_original: string;
    plano_conta_codigo: string | null;
    banco: string;
    numero: string;
    plano_descricao: string | null;
  }>(
    db,
    `SELECT t.id, t.data, t.valor, t.descricao_original, t.plano_conta_codigo,
            cb.banco, cb.numero, p.descricao AS plano_descricao
     FROM transacoes t
     JOIN contas_bancarias cb ON cb.id = t.conta_id
     LEFT JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     WHERE t.data BETWEEN ? AND ?
     ORDER BY t.data, t.id`,
    [dataInicio, dataFim],
  );

  return transacoes.map((t): LancamentoContabil => {
    const contaBanco = `Banco ${t.banco} · ${t.numero}`;
    const contaContrapartida = t.plano_conta_codigo && t.plano_descricao ? `${t.plano_conta_codigo} · ${t.plano_descricao}` : "Sem categoria (pendente)";
    const entrada = t.valor >= 0;
    return {
      transacaoId: t.id,
      data: t.data,
      historico: t.descricao_original,
      contaDebito: entrada ? contaBanco : contaContrapartida,
      contaCredito: entrada ? contaContrapartida : contaBanco,
      valor: Math.abs(t.valor),
    };
  });
}

export interface LinhaBalancete {
  conta: string;
  totalDebito: number;
  totalCredito: number;
  saldo: number; // débito - crédito. Positivo em conta de banco = saldo aumentou; positivo em despesa = total gasto; negativo em receita = total ganho (convenção padrão de balancete).
}

/** Balancete de verificação: soma débitos e créditos por conta — o documento que um
 * contador usa como ponto de partida para fechar um balanço formal. */
export function gerarBalancete(lancamentos: LancamentoContabil[]): LinhaBalancete[] {
  const porConta = new Map<string, LinhaBalancete>();

  const acumular = (conta: string, debito: number, credito: number) => {
    const atual = porConta.get(conta) ?? { conta, totalDebito: 0, totalCredito: 0, saldo: 0 };
    atual.totalDebito += debito;
    atual.totalCredito += credito;
    atual.saldo = atual.totalDebito - atual.totalCredito;
    porConta.set(conta, atual);
  };

  for (const l of lancamentos) {
    acumular(l.contaDebito, l.valor, 0);
    acumular(l.contaCredito, 0, l.valor);
  }

  return Array.from(porConta.values()).sort((a, b) => a.conta.localeCompare(b.conta));
}

/** Razão de uma conta específica: todos os lançamentos que a tocam (como débito ou
 * crédito), em ordem cronológica, com saldo acumulado. */
export function gerarRazaoDaConta(lancamentos: LancamentoContabil[], conta: string) {
  let saldoAcumulado = 0;
  return lancamentos
    .filter((l) => l.contaDebito === conta || l.contaCredito === conta)
    .map((l) => {
      const debito = l.contaDebito === conta ? l.valor : 0;
      const credito = l.contaCredito === conta ? l.valor : 0;
      saldoAcumulado += debito - credito;
      return { ...l, debito, credito, saldoAcumulado };
    });
}
