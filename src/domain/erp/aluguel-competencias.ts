/**
 * Competência de aluguel: uma linha por MÊS DEVIDO de cada contrato de locação — o espelho,
 * do lado da RECEITA, do que `contasAPagar.ts` já resolveu para o lado da despesa (ver o
 * comentário do arquivo lá, e o da tabela `aluguel_competencias` em schema.sql).
 *
 * POR QUE ESTE ARQUIVO EXISTE: `apurarInadimplenciaContrato` (integracao-inadimplencia.ts)
 * reconstrói o vencimento a partir do MÊS DA PRÓPRIA data de referência a cada chamada —
 * nunca fica preso ao mês em que a inadimplência de fato começou. Resultado: `dias_atraso`
 * nunca ultrapassa ~30 dias, e os estados `em_cobranca`/`litigioso` são hoje IMPOSSÍVEIS de
 * produzir, para qualquer entrada (ver o comentário completo e o `it.fails` correspondente
 * em `__tests__/integracao-inadimplencia.test.ts`). A correção de verdade não é uma
 * heurística para "achar o vencimento mais antigo em aberto" — é gerar uma linha própria
 * por competência, com vencimento e status de recebimento independentes, exatamente como
 * este arquivo faz.
 *
 * DECISÃO: `apurarInadimplenciaContrato` foi MANTIDA como está, não removida nem
 * reescrita — ver o comentário `@deprecated` nela. É chamada hoje por
 * `relatorioInadimplenciaDetalhado`/`resumoInadimplenciaTotal`/`provisarJurosInadimplencia`
 * (mesmo arquivo), que não geram nem conhecem competências; reescrevê-la por baixo mudaria
 * o comportamento desses três chamadores sem que eles tenham sido adaptados ou testados
 * contra o modelo novo — risco desnecessário para uma tarefa que pode, em vez disso,
 * acrescentar `apurarInadimplenciaContratoPorCompetencia` como a função correta a partir de
 * agora, funcionalmente independente. Quem gera competências via
 * `gerarCompetenciasPendentes` deve apurar inadimplência com a função nova daqui; a antiga
 * continua servindo só quem ainda não migrou (ou nunca gerou competência nenhuma).
 *
 * BAIXA (recebimento) nunca é uma tabela paralela desconectada do razão — mesma garantia de
 * `contasAPagar.ts`: insere uma linha em `transacoes` (entrada de caixa, valor positivo) e
 * lança as duas pernas no razão com `registrarLancamentoContabil` (débito em Caixa, crédito
 * em Receita de Aluguel), com `origem_modulo='transacoes'` — o MESMO formato que uma
 * transação bancária importada geraria, só que invertido em relação a `baixarContaAPagar`
 * (lá: crédito em Caixa/débito na despesa; aqui: débito em Caixa/crédito na receita).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import { CONTA_CAIXA_ERP, contaContrapartida } from "./mapeamentoPlanoApp";

/** Código do plano do app para receita de aluguel — ver PLANO_DE_CONTAS
 * (src/domain/planoDeContas.ts) e MAPA_APP_PARA_ERP (mapeamentoPlanoApp.ts: "1.1.01" → 4101,
 * "Aluguéis recebidos"). Simplificação deliberada: a baixa de uma competência lança o valor
 * INTEIRO como Aluguel Efetivo, sem aplicar `percentual_aluguel_efetivo` do contrato (a
 * decomposição entre aluguel efetivo e reembolso de rateio de custeio, "1.1.02") — decisão
 * de produto fora do escopo deste módulo, mesmo tipo de simplificação que
 * `apurarInadimplenciaContrato` já assume hoje (não separa os dois valores). */
const PLANO_CONTA_RECEITA_ALUGUEL = "1.1.01";

export type StatusCompetencia = "pendente" | "recebido" | "cancelado";

export interface Competencia {
  id: number;
  contrato_id: number;
  imovel_id: number;
  ano: number;
  mes: number;
  data_vencimento: string;
  valor_devido: number;
  data_recebimento: string | null;
  status: StatusCompetencia;
  ledger_entry_id_baixa: number | null;
  criado_em: string;
}

export interface ResultadoGeracaoCompetencias {
  sucesso: boolean;
  mensagem: string;
  /** ids das competências efetivamente inseridas nesta chamada — vazio quando não havia
   * nada novo a gerar (idempotente: já geradas não entram aqui de novo). */
  competencias_criadas_ids: number[];
}

export interface ResultadoBaixaCompetencia {
  sucesso: boolean;
  mensagem: string;
  transacao_id?: number;
  ledger_entry_id_baixa?: number;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function anoMesDe(data: string): { ano: number; mes: number } {
  const [ano, mes] = data.slice(0, 7).split("-").map(Number);
  return { ano, mes };
}

function proximoMes(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

/** Compara dois pares (ano, mês): negativo se `a` vem antes de `b`, positivo se depois, 0 se
 * o mesmo mês. */
function compararAnoMes(a: { ano: number; mes: number }, b: { ano: number; mes: number }): number {
  return a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes;
}

/** Último dia de um mês (1-based) — usado para não estourar fevereiro/meses de 30 dias
 * quando `dia_vencimento` do contrato é 29/30/31. `new Date(ano, mes, 0)` explora o
 * comportamento padrão do JS: mês 0-based `mes` (isto é, o mês SEGUINTE ao `mes` 1-based que
 * queremos) com dia 0 é o último dia do mês anterior — exatamente o `mes` 1-based pedido. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** Vencimento real de uma competência: `dia_vencimento` do contrato, clampado ao último dia
 * do mês quando o mês não tem esse dia (ex.: dia_vencimento=31 em abril → 30/04). */
function dataVencimentoDoMes(ano: number, mes: number, dia_vencimento: number): string {
  const dia = Math.min(dia_vencimento, ultimoDiaDoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Gera as competências (linhas de mês devido) de um contrato que ainda não existem, entre
 * `data_inicio` do contrato (ou a última competência já gerada, o que for mais recente) e
 * `ate_data` — uma linha por mês, com `data_vencimento` fixado no `dia_vencimento` daquele
 * mês específico (nunca recalculado depois). Idempotente: verifica a existência ANTES de
 * inserir (não duplica), e ainda protege contra corrida (duas chamadas concorrentes) com um
 * try/catch em volta do INSERT — a UNIQUE(contrato_id, ano, mes) garante a integridade, mas
 * a violação nunca escapa como exceção não tratada.
 *
 * Contratos sem `dia_vencimento` fixo (airbnb/temporada, coluna nula no schema) não têm
 * modelo de competência mensal aplicável — retorna falha explicativa, sem gerar nada. Não
 * gera além de `data_fim` do contrato, quando presente (mês de encerramento é o teto,
 * mesmo que `ate_data` seja posterior). */
export function gerarCompetenciasPendentes(
  db: Database,
  contrato_id: number,
  ate_data: string,
): ResultadoGeracaoCompetencias {
  const [contrato] = consultar<{
    imovel_id: number;
    dia_vencimento: number | null;
    valor_referencia: number;
    data_inicio: string;
    data_fim: string | null;
  }>(
    db,
    "SELECT imovel_id, dia_vencimento, valor_referencia, data_inicio, data_fim FROM contratos_locacao WHERE id = ?",
    [contrato_id],
  );

  if (!contrato) {
    return { sucesso: false, mensagem: `Contrato ${contrato_id} não encontrado.`, competencias_criadas_ids: [] };
  }
  if (contrato.dia_vencimento == null) {
    return {
      sucesso: false,
      mensagem: "Contrato sem dia_vencimento fixo (ex.: airbnb/temporada) — modelo de competência mensal não se aplica.",
      competencias_criadas_ids: [],
    };
  }

  const [ultimaGerada] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM aluguel_competencias WHERE contrato_id = ? ORDER BY ano DESC, mes DESC LIMIT 1",
    [contrato_id],
  );

  let atual = ultimaGerada ? proximoMes(ultimaGerada.ano, ultimaGerada.mes) : anoMesDe(contrato.data_inicio);

  let fim = anoMesDe(ate_data);
  if (contrato.data_fim) {
    const fimContrato = anoMesDe(contrato.data_fim);
    if (compararAnoMes(fimContrato, fim) < 0) fim = fimContrato;
  }

  const criadas: number[] = [];

  while (compararAnoMes(atual, fim) <= 0) {
    const jaExiste = consultar<{ id: number }>(
      db,
      "SELECT id FROM aluguel_competencias WHERE contrato_id = ? AND ano = ? AND mes = ?",
      [contrato_id, atual.ano, atual.mes],
    )[0];

    if (!jaExiste) {
      const data_vencimento = dataVencimentoDoMes(atual.ano, atual.mes, contrato.dia_vencimento);
      try {
        executar(
          db,
          `INSERT INTO aluguel_competencias
            (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`,
          [contrato_id, contrato.imovel_id, atual.ano, atual.mes, data_vencimento, contrato.valor_referencia, hoje()],
        );
        const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
        criadas.push(id);
      } catch {
        // UNIQUE(contrato_id, ano, mes): corrida rara entre a checagem acima e o INSERT
        // (outra chamada concorrente já gerou esta competência nesse intervalo).
        // Idempotência por construção — não propaga como exceção.
      }
    }

    atual = proximoMes(atual.ano, atual.mes);
  }

  return {
    sucesso: true,
    mensagem: criadas.length > 0 ? `${criadas.length} competência(s) gerada(s).` : "Nenhuma competência nova a gerar.",
    competencias_criadas_ids: criadas,
  };
}

function obterCompetenciaBruta(db: Database, id: number): Competencia | null {
  return consultar<Competencia>(db, "SELECT * FROM aluguel_competencias WHERE id = ?", [id])[0] ?? null;
}

/** Período contábil (entidade, ano/mês da data informada), criando-o aberto se ainda não
 * existir — mesmo padrão de `contasAPagar.ts::resolverPeriodoParaData`. */
function resolverPeriodoParaData(db: Database, entidade_id: number, data: string): { id: number } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!partes) throw new Error(`Data de recebimento inválida: "${data}".`);
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);

  const buscar = () =>
    consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
      [entidade_id, ano, mes],
    )[0];

  let periodo = buscar();
  if (!periodo) {
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [
      entidade_id,
      ano,
      mes,
    ]);
    periodo = buscar();
  }
  if (!periodo) throw new Error(`Não foi possível abrir o período contábil ${mes}/${ano}.`);
  return periodo;
}

/** Marca a competência como recebida e gera o lançamento real no razão: uma entrada de
 * caixa na conta bancária escolhida (débito em Caixa, crédito em Receita de Aluguel), pela
 * mesma rota que uma transação bancária importada usaria — ver comentário do arquivo.
 * Recusa baixa dupla (já recebida) e baixa de competência cancelada. Atômico: se qualquer
 * passo falhar, nada é persistido.
 *
 * `entidade_id` é parâmetro explícito (não uma coluna de `aluguel_competencias` nem de
 * `contratos_locacao`, que não guardam entidade_id) — mesmo padrão já usado neste ERP para
 * qualquer lançamento originado de um contrato (ver `contabilizarJurosMora`/
 * `contabilizarMultaPorAtraso` em integracao-inadimplencia.ts, e `apontamento-ledger-
 * integration.ts`): quem chama já sabe em nome de qual entidade legal está lançando. */
export function baixarCompetencia(
  db: Database,
  competencia_id: number,
  conta_bancaria_id: number,
  data_recebimento: string,
  entidade_id: number,
  usuario_id?: number,
): ResultadoBaixaCompetencia {
  const competencia = obterCompetenciaBruta(db, competencia_id);
  if (!competencia) {
    return { sucesso: false, mensagem: `Competência ${competencia_id} não encontrada.` };
  }
  if (competencia.status === "cancelado") {
    return { sucesso: false, mensagem: "Competência cancelada — não pode ser baixada." };
  }
  if (competencia.status === "recebido" || competencia.data_recebimento) {
    return { sucesso: false, mensagem: "Competência já está recebida — baixa duplicada recusada." };
  }
  if (!data_recebimento) {
    return { sucesso: false, mensagem: "Informe a data de recebimento." };
  }
  const [bancaria] = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [
    conta_bancaria_id,
  ]);
  if (!bancaria) {
    return { sucesso: false, mensagem: `Conta bancária ${conta_bancaria_id} não encontrada.` };
  }

  const montante = competencia.valor_devido;
  const descricao = `Recebimento de aluguel — competência ${String(competencia.mes).padStart(2, "0")}/${competencia.ano}, contrato #${competencia.contrato_id}`;

  db.run("BEGIN");
  try {
    // 1) A entrada de caixa na conta bancária escolhida (valor POSITIVO — entrada, ao
    //    contrário da saída negativa de baixarContaAPagar).
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original, contrato_id, plano_conta_codigo, categorizado_por, revisado)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 1)`,
      [conta_bancaria_id, data_recebimento, montante, descricao, competencia.contrato_id, PLANO_CONTA_RECEITA_ALUGUEL],
    );
    const [{ id: transacao_id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

    const periodo = resolverPeriodoParaData(db, entidade_id, data_recebimento);
    const contrapartida = contaContrapartida(PLANO_CONTA_RECEITA_ALUGUEL); // Receita de aluguel (4101)
    const referencia_documento = `TXN-${transacao_id}`;

    // 2) As duas pernas no razão — invertido em relação a baixarContaAPagar: débito em
    //    Caixa (entra dinheiro), crédito em Receita de Aluguel (natureza credora).
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id: periodo.id,
      conta_id: CONTA_CAIXA_ERP,
      data_lancamento: data_recebimento,
      valor_debito: montante,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });
    const ledger_entry_id_baixa = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id: periodo.id,
      conta_id: contrapartida.conta_id,
      data_lancamento: data_recebimento,
      valor_credito: montante,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });

    executar(
      db,
      "UPDATE aluguel_competencias SET status = 'recebido', data_recebimento = ?, ledger_entry_id_baixa = ? WHERE id = ?",
      [data_recebimento, ledger_entry_id_baixa, competencia.id],
    );

    db.run("COMMIT");
    return {
      sucesso: true,
      mensagem: `Competência #${competencia.id} baixada — lançamento #${ledger_entry_id_baixa} no razão.`,
      transacao_id,
      ledger_entry_id_baixa,
    };
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    return {
      sucesso: false,
      mensagem: `Não foi possível baixar a competência: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/** Mesmo formato de retorno de `InadimplenciaCalculada` (integracao-inadimplencia.ts), com
 * um campo a mais: os ids das competências pendentes já vencidas que compõem o total —
 * transparência que a versão antiga não precisava (ela nunca somava mais de uma
 * competência). */
export interface InadimplenciaPorCompetencia {
  contrato_id: number;
  imovel_id: number;
  locatario: string;
  dias_atraso: number;
  valor_aluguel_vencido: number;
  multa_valor: number;
  juros_valor: number;
  valor_total_devido: number;
  status: "normal" | "com_atraso" | "em_cobranca" | "litigioso";
  competencias_pendentes_ids: number[];
}

/** Dias de atraso entre uma data de vencimento e uma data de referência — mesma lógica de
 * `integracao-inadimplencia.ts::calcularDiasAtraso` (duplicada aqui em vez de importada e
 * exportada de lá para não alterar a superfície pública daquele módulo por uma dependência
 * de um arquivo novo). */
function calcularDiasAtraso(data_vencimento: string, data_referencia: Date): number {
  const vencimento = new Date(data_vencimento);
  const referencia = new Date(data_referencia);
  referencia.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  const diferenca = referencia.getTime() - vencimento.getTime();
  return Math.max(0, Math.floor(diferenca / (1000 * 60 * 60 * 24)));
}

/** Multa por atraso (duas faixas) — mesma regra de `integracao-inadimplencia.ts`. */
function calcularMulta(
  dias_atraso: number,
  valor_base: number,
  multa_percentual: number,
  multa_ate_dias: number,
  multa_percentual_substitutiva: number,
): number {
  if (dias_atraso === 0) return 0;
  return dias_atraso <= multa_ate_dias
    ? (valor_base * multa_percentual) / 100
    : (valor_base * multa_percentual_substitutiva) / 100;
}

/** Juros de mora pro-rata die — mesma regra de `integracao-inadimplencia.ts`. */
function calcularJurosMora(dias_atraso: number, valor_base: number, juros_mensal_percentual: number): number {
  if (dias_atraso === 0) return 0;
  const taxa_diaria = juros_mensal_percentual / 30 / 100;
  return valor_base * taxa_diaria * dias_atraso;
}

/** Apurar inadimplência de um contrato a partir das COMPETÊNCIAS já geradas
 * (`gerarCompetenciasPendentes`) — a função que corrige a causa raiz documentada no
 * cabeçalho deste arquivo e em `integracao-inadimplencia.test.ts`.
 *
 * `dias_atraso` é contado a partir da COMPETÊNCIA PENDENTE MAIS ANTIGA já vencida (não do
 * mês corrente), e `valor_total_devido` soma TODAS as competências pendentes já vencidas
 * (não só a mais recente) — é isso que torna `em_cobranca`/`litigioso` alcançáveis de
 * verdade: um contrato com 3 meses de competência pendente tem `dias_atraso` contado desde
 * a mais antiga delas, e o valor em risco cresce com cada mês que se acumula.
 *
 * Multa e juros são aplicados UMA VEZ sobre o saldo total vencido, usando os dias de atraso
 * da competência mais antiga — simplificação deliberada (mesma already assumida por
 * `apurarInadimplenciaContrato`): não recalcula multa/juros individualmente por
 * competência, que exigiria decisão de produto sobre como consolidar encargos de meses com
 * idades de atraso diferentes.
 *
 * Não gera competências novas (função de leitura pura) — quem chama deve ter rodado
 * `gerarCompetenciasPendentes` antes. Só considera competências com `data_vencimento <=
 * data_referencia`: uma competência futura (mês que ainda não venceu) não é "devida" ainda,
 * mesmo que já exista como linha `pendente`. */
export function apurarInadimplenciaContratoPorCompetencia(
  db: Database,
  contrato_id: number,
  data_referencia?: string,
): InadimplenciaPorCompetencia | null {
  const [contrato] = consultar<{
    imovel_id: number;
    locatario: string;
    multa_percentual: number;
    multa_ate_dias: number;
    multa_percentual_substitutiva: number;
    juros_mensal_percentual: number;
  }>(
    db,
    `SELECT imovel_id, locatario, multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual
     FROM contratos_locacao WHERE id = ?`,
    [contrato_id],
  );
  if (!contrato) return null;

  const dataRef = data_referencia || hoje();
  const referencia = new Date(`${dataRef}T00:00:00`);

  const pendentes = consultar<{ id: number; data_vencimento: string; valor_devido: number }>(
    db,
    `SELECT id, data_vencimento, valor_devido FROM aluguel_competencias
     WHERE contrato_id = ? AND status = 'pendente' AND data_vencimento <= ?
     ORDER BY data_vencimento ASC`,
    [contrato_id, dataRef],
  );

  if (pendentes.length === 0) {
    return {
      contrato_id,
      imovel_id: contrato.imovel_id,
      locatario: contrato.locatario,
      dias_atraso: 0,
      valor_aluguel_vencido: 0,
      multa_valor: 0,
      juros_valor: 0,
      valor_total_devido: 0,
      status: "normal",
      competencias_pendentes_ids: [],
    };
  }

  const maisAntiga = pendentes[0];
  const dias_atraso = calcularDiasAtraso(maisAntiga.data_vencimento, referencia);
  const valor_aluguel_vencido = pendentes.reduce((soma, c) => soma + c.valor_devido, 0);

  const multa_valor = calcularMulta(
    dias_atraso,
    valor_aluguel_vencido,
    contrato.multa_percentual,
    contrato.multa_ate_dias,
    contrato.multa_percentual_substitutiva,
  );
  const juros_valor = calcularJurosMora(dias_atraso, valor_aluguel_vencido, contrato.juros_mensal_percentual);

  let status: InadimplenciaPorCompetencia["status"] = "normal";
  if (dias_atraso > 0 && dias_atraso <= 30) status = "com_atraso";
  else if (dias_atraso > 30 && dias_atraso <= 90) status = "em_cobranca";
  else if (dias_atraso > 90) status = "litigioso";

  return {
    contrato_id,
    imovel_id: contrato.imovel_id,
    locatario: contrato.locatario,
    dias_atraso,
    valor_aluguel_vencido,
    multa_valor,
    juros_valor,
    valor_total_devido: valor_aluguel_vencido + multa_valor + juros_valor,
    status,
    competencias_pendentes_ids: pendentes.map((c) => c.id),
  };
}
