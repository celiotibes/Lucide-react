import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/** Plano de contas do razão contábil do ERP (tabela `contas_plano_contas`).
 *
 * Fonte única. Antes existiam três versões divergentes do mesmo plano: os ids fixos
 * embutidos nos módulos (MAPEAMENTO_*_LEDGER, CONTA_CAIXA e afins), uma cópia à mão no
 * fixture de teste e nada no banco real — `contas_plano_contas` nunca era semeada em
 * produção. Daí vinham as duas colisões conhecidas: a faixa 5 valia como despesa nos
 * módulos e como receita no fixture, e 4.1.01 era Receita de Aluguel num lugar e
 * Capital Social no outro. Um lançamento em conta inexistente não falha: obterSaldoConta
 * assume natureza "debito" por omissão, e o saldo sai com o sinal trocado sem nada
 * acusar. Por isso o plano mora aqui e os dois lados leem daqui.
 *
 * A convenção é a que o código de produção já usa:
 *   1 = ativo · 2 = patrimônio líquido · 3 = passivo · 4 = receita · 5 e 6 = despesa
 * O id é derivado do código (5.2.10 → 5210) porque os módulos referenciam a conta pelo
 * número; ao acrescentar uma conta, mantenha essa correspondência.
 *
 * NÃO confundir com PLANO_DE_CONTAS (src/domain/planoDeContas.ts), que classifica o
 * fluxo de caixa do app (1=receita, 2=despesa, 9=transferência) e não tem contas
 * patrimoniais. Os dois coexistem hoje; unificá-los é trabalho de modelagem em aberto.
 */
export const PLANO_DE_CONTAS_ERP = [
  // Ativo
  { id: 1101, codigo: "1.1.01", descricao: "Caixa", grupo: "ativo", natureza: "debito" },
  { id: 1102, codigo: "1.1.02", descricao: "Conta bancária", grupo: "ativo", natureza: "debito" },
  { id: 1103, codigo: "1.1.03", descricao: "Aplicações financeiras", grupo: "ativo", natureza: "debito" },
  { id: 1105, codigo: "1.1.05", descricao: "Contas correntes pessoais", grupo: "ativo", natureza: "debito" },
  { id: 1109, codigo: "1.1.09", descricao: "Transferências em trânsito", grupo: "ativo", natureza: "debito" },
  { id: 1205, codigo: "1.2.05", descricao: "Imóveis (ativo imobilizado)", grupo: "ativo", natureza: "debito" },
  // Conta transitória de suspense. Uma transação bancária sem classificação não pode ser
  // descartada do razão: o caixa ficaria com saldo errado e o dinheiro sumiria da vista.
  // Vai para cá, onde aparece no balancete como pendência explícita até ser classificada.
  // Saldo devedor ou credor, conforme o que estiver pendente — é o comportamento esperado
  // de uma conta de suspense, não um erro de sinal.
  { id: 1999, codigo: "1.9.99", descricao: "Classificação pendente (conta transitória)", grupo: "ativo", natureza: "debito" },

  // Patrimônio líquido (a faixa 2 fica livre nesta convenção e é usada aqui)
  { id: 2101, codigo: "2.1.01", descricao: "Capital social", grupo: "patrimonio_liquido", natureza: "credito" },
  { id: 2102, codigo: "2.1.02", descricao: "Lucros acumulados", grupo: "patrimonio_liquido", natureza: "credito" },

  // Passivo
  { id: 3101, codigo: "3.1.01", descricao: "Provisão para riscos legais", grupo: "passivo", natureza: "credito" },
  { id: 3102, codigo: "3.1.02", descricao: "Contas a pagar", grupo: "passivo", natureza: "credito" },
  { id: 3105, codigo: "3.1.05", descricao: "Remuneração a pagar", grupo: "passivo", natureza: "credito" },
  { id: 3201, codigo: "3.2.01", descricao: "Empréstimos de longo prazo", grupo: "passivo", natureza: "credito" },
  // Passivo exigível de sócio/pessoa física — deliberadamente separada de 3.2.01
  // (empréstimo bancário/financiamento): são credores de natureza diferente para efeito de
  // perícia de segregação patrimonial (docs/dominios-a-reconstruir.md, seção 2). Ver
  // CONTA_EMPRESTIMO_SOCIO_ERP em src/domain/contasPessoais/contasPessoais.ts.
  { id: 3202, codigo: "3.2.02", descricao: "Empréstimos de sócios (mútuo com pessoa física)", grupo: "passivo", natureza: "credito" },
  { id: 3301, codigo: "3.3.01", descricao: "Depósitos caução recebidos", grupo: "passivo", natureza: "credito" },

  // Receita
  { id: 4101, codigo: "4.1.01", descricao: "Receita de aluguel", grupo: "receita", natureza: "credito" },
  { id: 4102, codigo: "4.1.02", descricao: "Reajustes", grupo: "receita", natureza: "credito" },
  { id: 4103, codigo: "4.1.03", descricao: "Rateios e reembolsos", grupo: "receita", natureza: "credito" },
  { id: 4201, codigo: "4.2.01", descricao: "Juros recebidos", grupo: "receita", natureza: "credito" },
  { id: 4202, codigo: "4.2.02", descricao: "Arrecadação de taxas condominiais", grupo: "receita", natureza: "credito" },
  { id: 4104, codigo: "4.1.04", descricao: "Airbnb e temporada", grupo: "receita", natureza: "credito" },
  { id: 4301, codigo: "4.3.01", descricao: "Outras receitas", grupo: "receita", natureza: "credito" },
  { id: 4401, codigo: "4.4.01", descricao: "Salário e rendimentos pessoais", grupo: "receita", natureza: "credito" },

  // Despesa — imóveis
  { id: 5105, codigo: "5.1.05", descricao: "Aluguel (despesa alocada)", grupo: "despesa", natureza: "debito" },
  { id: 5205, codigo: "5.2.05", descricao: "Manutenção", grupo: "despesa", natureza: "debito" },
  { id: 5206, codigo: "5.2.06", descricao: "Energia", grupo: "despesa", natureza: "debito" },
  { id: 5207, codigo: "5.2.07", descricao: "Água", grupo: "despesa", natureza: "debito" },
  { id: 5210, codigo: "5.2.10", descricao: "Condomínio", grupo: "despesa", natureza: "debito" },
  { id: 5212, codigo: "5.2.12", descricao: "Internet e telecomunicações", grupo: "despesa", natureza: "debito" },
  { id: 5213, codigo: "5.2.13", descricao: "Seguros", grupo: "despesa", natureza: "debito" },
  { id: 5211, codigo: "5.2.11", descricao: "Limpeza", grupo: "despesa", natureza: "debito" },
  { id: 5214, codigo: "5.2.14", descricao: "Outras despesas com imóveis", grupo: "despesa", natureza: "debito" },
  { id: 5301, codigo: "5.3.01", descricao: "Depreciação", grupo: "despesa", natureza: "debito" },
  { id: 5401, codigo: "5.4.01", descricao: "Impostos e contribuições", grupo: "despesa", natureza: "debito" },
  { id: 5501, codigo: "5.5.01", descricao: "Financiamento imobiliário — juros", grupo: "despesa", natureza: "debito" },
  { id: 5502, codigo: "5.5.02", descricao: "Inadimplência e perdas com locatário", grupo: "despesa", natureza: "debito" },

  // Despesa — operação, advocacia e provisões
  { id: 6101, codigo: "6.1.01", descricao: "Despesa com aluguel", grupo: "despesa", natureza: "debito" },
  { id: 6201, codigo: "6.2.01", descricao: "Despesas operacionais", grupo: "despesa", natureza: "debito" },
  { id: 6202, codigo: "6.2.02", descricao: "Utilidades (água, luz e afins)", grupo: "despesa", natureza: "debito" },
  { id: 6301, codigo: "6.3.01", descricao: "Honorários advocatícios", grupo: "despesa", natureza: "debito" },
  { id: 6302, codigo: "6.3.02", descricao: "Custas judiciais", grupo: "despesa", natureza: "debito" },
  { id: 6303, codigo: "6.3.03", descricao: "Perícia", grupo: "despesa", natureza: "debito" },
  { id: 6304, codigo: "6.3.04", descricao: "Outras despesas com processos legais", grupo: "despesa", natureza: "debito" },
  { id: 6401, codigo: "6.4.01", descricao: "Provisão para processos legais", grupo: "despesa", natureza: "debito" },
  { id: 6501, codigo: "6.5.01", descricao: "Despesas pessoais (fora da atividade)", grupo: "despesa", natureza: "debito" },
] as const;

/** Semeia o plano do ERP para a entidade, sem tocar no que já existe.
 *
 * Idempotente e chamada a cada abertura de banco, não só na criação: um banco salvo por
 * versão anterior do app precisa receber contas acrescentadas depois — mesma razão
 * documentada em garantirPlanoDeContasPadrao(). */
export function garantirPlanoDeContasErp(db: Database, entidade_id: number = 1): void {
  const existentes = new Set(
    consultar<{ id: number }>(db, "SELECT id FROM contas_plano_contas").map((c) => c.id),
  );
  for (const conta of PLANO_DE_CONTAS_ERP) {
    if (existentes.has(conta.id)) continue;
    executar(
      db,
      `INSERT INTO contas_plano_contas (id, entidade_id, codigo, descricao, grupo, natureza, analisavel, ativo)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      [conta.id, entidade_id, conta.codigo, conta.descricao, conta.grupo, conta.natureza],
    );
  }
}
