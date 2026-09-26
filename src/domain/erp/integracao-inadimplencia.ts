/**
 * Integração: Ciclo de Inadimplência com Juros e Multa Contábil
 * Contrato com atraso → Juros/Multa calculados → Provisão Contábil
 *
 * Os números de conta citados no cabeçalho original (17/18) nunca existiram no plano de
 * contas real do ERP — ver os comentários "ACHADO" abaixo em cada função, que documentam
 * o que foi corrigido (contabilizarJurosMora/contabilizarMultaPorAtraso, remapeadas para
 * contas reais) e o que ficou como defeito conhecido, não corrigido por exigir decisão de
 * política contábil (provisarJurosInadimplencia).
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import { CONTA_CAIXA_ERP } from "./mapeamentoPlanoApp";

// ACHADO (gravidade CRÍTICA, corrigido em contabilizarJurosMora/contabilizarMultaPorAtraso):
// as contas abaixo eram números mágicos (2, 29, 30) que não correspondem a NENHUMA conta
// de `contas_plano_contas` — o plano real do ERP (PLANO_DE_CONTAS_ERP, em
// planoDeContasErp.ts) é a "fonte única" desde que o próprio arquivo documenta este exato
// padrão de defeito ("antes existiam três versões divergentes do mesmo plano... os ids
// fixos embutidos nos módulos"). Como `ledger_entries.conta_id` tem
// `REFERENCES contas_plano_contas(id)` com FK ativa, todo lançamento gravado com esses ids
// inexistentes quebrava com "FOREIGN KEY constraint failed" contra o schema real. Corrigido
// remapeando para contas que já existem no plano: Caixa → CONTA_CAIXA_ERP (1101, a mesma
// constante que contasAPagar.ts usa) e Receita de Juros → 4201 ("Juros recebidos", já no
// plano). Não existe hoje uma conta dedicada a "Receita de Multa Contratual"; usa-se 4301
// ("Outras receitas") como a mais próxima já existente — criar uma conta específica é
// decisão de plano de contas fora do escopo deste achado.
const CONTA_RECEITA_JUROS_ERP = 4201;
const CONTA_RECEITA_OUTRAS_ERP = 4301;

export interface InadimplenciaCalculada {
  contrato_id: number;
  imovel_id: number;
  locatario: string;
  dias_atraso: number;
  valor_aluguel_vencido: number;
  multa_valor: number;
  juros_valor: number;
  juros_acumulado: number;
  valor_total_devido: number;
  status: "normal" | "com_atraso" | "em_cobranca" | "litigioso";
}

/** Calcular dias de atraso para um contrato, em relação a uma data de referência
 * explícita.
 *
 * ACHADO (gravidade ALTA, corrigido): antes esta função ignorava por completo a data de
 * referência de quem chamava e usava sempre `new Date()` (o relógio real) para "hoje" —
 * `apurarInadimplenciaContrato(db, id, data_referencia)` recebia `data_referencia` e a
 * usava só para escolher MÊS/ANO do vencimento, mas a contagem de dias de atraso em si
 * comparava esse vencimento contra a data real do sistema, não contra `data_referencia`.
 * Ou seja: pedir a inadimplência "como estava em 2020-01-15" na prática calculava os dias
 * de atraso até HOJE (2026), um número absurdamente maior — a função não tinha como ser
 * testada de forma determinística nem usada para reconstituir uma posição histórica.
 * Corrigido para receber e usar a mesma referência em toda a função. */
function calcularDiasAtraso(data_vencimento: string, hoje_referencia: Date): number {
  const vencimento = new Date(data_vencimento);
  const hoje = new Date(hoje_referencia);
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);

  const diferenca = hoje.getTime() - vencimento.getTime();
  return Math.max(0, Math.floor(diferenca / (1000 * 60 * 60 * 24)));
}

/** Calcular multa por inadimplência (estrutura em duas faixas) */
function calcularMulta(
  dias_atraso: number,
  valor_aluguel: number,
  multa_percentual: number,
  multa_ate_dias: number,
  multa_percentual_substitutiva: number,
): number {
  if (dias_atraso === 0) return 0;

  if (dias_atraso <= multa_ate_dias) {
    // Primeira faixa: multa_percentual até multa_ate_dias
    return (valor_aluguel * multa_percentual) / 100;
  } else {
    // Segunda faixa: multa_percentual_substitutiva substitui a anterior
    return (valor_aluguel * multa_percentual_substitutiva) / 100;
  }
}

/** Calcular juros de mora (pro-rata) */
function calcularJurosMora(
  dias_atraso: number,
  valor_aluguel: number,
  juros_mensal_percentual: number,
): number {
  if (dias_atraso === 0) return 0;

  // Juros pro-rata: (dias_atraso / 30) * (valor * taxa_mensal)
  const taxa_diaria = juros_mensal_percentual / 30 / 100;
  return valor_aluguel * taxa_diaria * dias_atraso;
}

/** Apurar inadimplência de um contrato com cálculos completos.
 *
 * ACHADO 1 (gravidade CRÍTICA, corrigido): a query selecionava uma coluna `status` de
 * `contratos_locacao` — a tabela real (contabilidade-reconstituicao/schema.sql) NÃO TEM
 * essa coluna (a vigência do contrato é `data_fim IS NULL`, nunca um campo `status`; ver o
 * mesmo achado, já documentado e corrigido, em
 * src/domain/erp/__auditoria__/sincronizacao-integridade.test.ts para
 * sincronizacao-integridade.ts). Contra o schema real, TODA chamada a esta função lançava
 * "no such column: status" — o módulo inteiro (apurarInadimplenciaContrato,
 * relatorioInadimplenciaDetalhado, resumoInadimplenciaTotal, provisarJurosInadimplencia)
 * quebrava incondicionalmente, mesmo com um contrato válido. O campo nunca era lido no
 * corpo da função (só figurava no tipo), então a correção é apenas removê-lo da consulta.
 *
 * ACHADO 2 (gravidade ALTA, corrigido): a função nunca verificava se o aluguel do mês já
 * tinha sido efetivamente recebido — calculava dias_atraso comparando só a data de
 * vencimento do mês corrente contra hoje, sem olhar `transacoes` (onde um recebimento
 * PIX/boleto do inquilino, já vinculado ao contrato via `transacoes.contrato_id`, fica
 * registrado). Resultado: TODO contrato ativo com dia_vencimento anterior ao dia de hoje
 * era classificado como inadimplente, mesmo que o locatário tivesse pago em dia — um
 * falso-positivo permanente e universal, o oposto do que um módulo de "contas a receber"
 * existe para fazer. Corrigido: quando há atraso aparente, soma-se os recebimentos já
 * lançados para este contrato dentro da janela do vencimento até a data de referência;
 * se cobrirem o valor do aluguel (com tolerância de 1 centavo por arredondamento), o
 * contrato é tratado como em dia, sem multa/juros. Deliberadamente mais simples que o
 * motor de conciliação de src/domain/reconcile/contratos.ts (que casa competência a
 * competência com tolerância de valor/data e desduplica transações entre meses vizinhos —
 * ver `conciliar()`); usar aquele motor aqui, ou decidir a tolerância de valor para
 * pagamento PARCIAL, é decisão de produto fora do escopo deste achado. */
export function apurarInadimplenciaContrato(
  db: Database,
  contrato_id: number,
  data_referencia?: string,
): InadimplenciaCalculada | null {
  const [contrato] = consultar<{
    imovel_id: number;
    locatario: string;
    dia_vencimento: number;
    valor_referencia: number;
    multa_percentual: number;
    multa_ate_dias: number;
    multa_percentual_substitutiva: number;
    juros_mensal_percentual: number;
  }>(
    db,
    `SELECT
      imovel_id, locatario, dia_vencimento, valor_referencia,
      multa_percentual, multa_ate_dias, multa_percentual_substitutiva,
      juros_mensal_percentual
     FROM contratos_locacao WHERE id = ?`,
    [contrato_id],
  );

  if (!contrato) return null;

  // Construir data de vencimento do mês, sempre em relação à MESMA data de referência
  // usada depois para contar dias de atraso (ver ACHADO 1 acima).
  const hoje = new Date(`${data_referencia || new Date().toISOString().split("T")[0]}T00:00:00`);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const data_vencimento_str = `${ano}-${String(mes).padStart(2, "0")}-${String(contrato.dia_vencimento).padStart(2, "0")}`;
  const data_vencimento = new Date(`${data_vencimento_str}T00:00:00`).toISOString();

  let dias_atraso = calcularDiasAtraso(data_vencimento, hoje);

  // ACHADO 2: só vale a pena checar recebimento quando há atraso aparente — evita uma
  // consulta desnecessária quando o vencimento ainda nem chegou.
  if (dias_atraso > 0) {
    const inicio_mes = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const hoje_str = hoje.toISOString().slice(0, 10);
    const [{ total_recebido }] = consultar<{ total_recebido: number | null }>(
      db,
      `SELECT SUM(valor) AS total_recebido FROM transacoes
       WHERE contrato_id = ? AND valor > 0 AND data BETWEEN ? AND ?`,
      [contrato_id, inicio_mes, hoje_str],
    );

    if ((total_recebido ?? 0) >= contrato.valor_referencia - 0.01) {
      dias_atraso = 0;
    }
  }

  // Calcular componentes
  const multa = calcularMulta(
    dias_atraso,
    contrato.valor_referencia,
    contrato.multa_percentual,
    contrato.multa_ate_dias,
    contrato.multa_percentual_substitutiva,
  );

  const juros = calcularJurosMora(
    dias_atraso,
    contrato.valor_referencia,
    contrato.juros_mensal_percentual,
  );

  // Determinar status
  let status: InadimplenciaCalculada["status"] = "normal";
  if (dias_atraso > 0 && dias_atraso <= 30) status = "com_atraso";
  else if (dias_atraso > 30 && dias_atraso <= 90) status = "em_cobranca";
  else if (dias_atraso > 90) status = "litigioso";

  return {
    contrato_id,
    imovel_id: contrato.imovel_id,
    locatario: contrato.locatario,
    dias_atraso,
    valor_aluguel_vencido: contrato.valor_referencia,
    multa_valor: multa,
    juros_valor: juros,
    juros_acumulado: juros, // Simplificado; em produção seria acumulativo mensal
    valor_total_devido: dias_atraso > 0 ? contrato.valor_referencia + multa + juros : 0,
    status,
  };
}

/** Contabilizar juros de mora quando já houve atraso e recebimento posterior */
export function contabilizarJurosMora(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_juros: number,
): boolean {
  if (valor_juros <= 0) return false;

  // Débito: Caixa
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_CAIXA_ERP, // Caixa (1101)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_juros,
    descricao: `Recebimento juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR`,
  });

  // Crédito: Receita de Juros
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RECEITA_JUROS_ERP, // Juros recebidos (4201)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_juros,
    descricao: `Receita de juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-REC`,
  });

  return true;
}

/** Contabilizar multa por atraso */
export function contabilizarMultaPorAtraso(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_multa: number,
): boolean {
  if (valor_multa <= 0) return false;

  // Débito: Caixa
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_CAIXA_ERP, // Caixa (1101)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_multa,
    descricao: `Recebimento multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT`,
  });

  // Crédito: Receita Diversa / Receita de Multa (sem conta dedicada no plano — ver ACHADO acima)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RECEITA_OUTRAS_ERP, // Outras receitas (4301)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_multa,
    descricao: `Receita de multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT-REC`,
  });

  return true;
}

/** Provisionar despesa de juros para inadimplência em aberto.
 *
 * ACHADO (gravidade CRÍTICA, NÃO corrigido — decisão de produto fora de escopo): assim como
 * em contabilizarJurosMora/contabilizarMultaPorAtraso, os ids de conta abaixo (17 e 31) não
 * existem em `contas_plano_contas` — todo lançamento quebra com "FOREIGN KEY constraint
 * failed" contra o schema real (ver teste `it.fails` correspondente). Mas aqui o problema
 * não é só o id: a PARTIDA DOBRADA em si é questionável. A função debita uma conta de
 * DESPESA ("Despesa de Juros") e credita uma conta que o comentário original chama de
 * "reduz receita" — só que CREDITAR uma conta de receita AUMENTA seu saldo (natureza
 * credora), nunca reduz; e não faz sentido contábil o locador reconhecer uma DESPESA
 * própria só porque o inquilino está atrasado (o locador não deve juros a si mesmo — na
 * pior das hipóteses teria uma perda estimada de recebimento, não uma despesa de juros).
 * O tratamento correto (não reconhecer a receita adicional até o recebimento efetivo,
 * versus lançar uma provisão para devedores duvidosos, versus outra convenção) é decisão de
 * política contábil que este achado não deveria tomar sozinho — por isso o teste
 * correspondente fica como `it.fails`, documentando o defeito sem inventar uma correção. */
export function provisarJurosInadimplencia(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
): boolean {
  const inadimplencia = apurarInadimplenciaContrato(db, contrato_id);

  if (!inadimplencia || inadimplencia.juros_valor <= 0) {
    return false;
  }

  // Débito: Despesa de Juros (Conta 17)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 17, // Despesa de Juros
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: inadimplencia.juros_valor,
    descricao: `Provisão juros sobre aluguel em atraso - Contrato ${contrato_id} (${inadimplencia.dias_atraso} dias)`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-PROV`,
  });

  // Crédito: Aluguel a Receber / Crédito sobre Aluguel (Conta 31 - novo)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 31, // Crédito sobre Aluguel em Atraso (reduz receita)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: inadimplencia.juros_valor,
    descricao: `Redução receita por provisão juros - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-RED`,
  });

  return true;
}

/** Relatório: Contratos em inadimplência com cálculos de juros/multa */
export function relatorioInadimplenciaDetalhado(
  db: Database,
): InadimplenciaCalculada[] {
  const contratos = consultar<{ id: number }>(
    db,
    `SELECT id FROM contratos_locacao
     -- contrato vigente: não há coluna status; data_fim nulo = em vigor
     WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
    [],
  );

  return contratos
    .map((c) => apurarInadimplenciaContrato(db, c.id))
    .filter((c) => c !== null && c.dias_atraso > 0) as InadimplenciaCalculada[];
}

/** Resumo executivo: Inadimplência total em risco */
export function resumoInadimplenciaTotal(
  db: Database,
): {
  contratos_inadimplentes: number;
  valor_aluguel_em_atraso: number;
  multa_acumulada: number;
  juros_acumulado: number;
  valor_total_em_risco: number;
} {
  const relatorio = relatorioInadimplenciaDetalhado(db);

  return {
    contratos_inadimplentes: relatorio.length,
    valor_aluguel_em_atraso: relatorio.reduce((sum, r) => sum + r.valor_aluguel_vencido, 0),
    multa_acumulada: relatorio.reduce((sum, r) => sum + r.multa_valor, 0),
    juros_acumulado: relatorio.reduce((sum, r) => sum + r.juros_acumulado, 0),
    valor_total_em_risco: relatorio.reduce((sum, r) => sum + r.valor_total_devido, 0),
  };
}
