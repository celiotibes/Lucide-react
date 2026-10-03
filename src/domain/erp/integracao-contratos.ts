/**
 * Integração: Ciclo de Contratos de Locação
 *
 * Reconstrução PARCIAL do módulo apagado em "Remove 23 módulos órfãos do balde B" (ver
 * docs/dominios-a-reconstruir.md, seção 5) — a LEITURA (contratos_locacao, caucoes) já era
 * contra tabelas reais; a ESCRITA ia para `core.ts`/`registrarTransacaoIntegrada`
 * (depreciado, tabela `transacoes_integradas` fictícia, ids de conta 1-5 que nunca
 * existiram em `contas_plano_contas`). O original tinha 5 funções. Só UMA foi reconstruída
 * aqui — `contabilizarDevolucaoCaucao` — porque é a única com um GAP DE VERDADE no razão
 * hoje. As outras 4 foram investigadas e deliberadamente deixadas de fora:
 *
 * 1. `contabilizarCriacaoContrato` (receita esperada ao criar contrato) — NÃO reconstruída.
 *    Coberta por `aluguel-competencias.ts::gerarCompetenciasPendentes`, com desenho
 *    melhor: o original fazia UMA ÚNICA chamada a `registrarTransacaoIntegrada` (só
 *    crédito, sem débito nenhum) — um lançamento CONTABILMENTE DESBALANCEADO por
 *    construção, o mesmo tipo de defeito documentado em `ledger.ts` para os módulos que
 *    nunca conseguiam fechar período. `gerarCompetenciasPendentes` evita o problema por
 *    completo: não lança nada no razão na criação do contrato, só cria a linha de
 *    competência (mês devido); o lançamento balanceado só acontece de fato no recebimento
 *    (ver função 2).
 *
 * 2. `contabilizarRecebimentoAluguel` (débito Caixa / crédito Receita ao receber aluguel) —
 *    NÃO reconstruída. Coberta INTEGRALMENTE por `aluguel-competencias.ts::baixarCompetencia`:
 *    mesmo par balanceado (débito Caixa 1101 / crédito Receita de Aluguel 4101), reconciliado
 *    com uma linha própria em `transacoes` (em vez de exigir uma transação já existente para
 *    casar, como o original fazia).
 *
 * 3. `contabilizarReajusteContrato` (lançar a diferença de valor ao reajustar) — NÃO
 *    reconstruída. Mesma classe de defeito da função 1: UMA chamada só (crédito ou débito
 *    "Receita de Reajuste", conta_id 3 fictícia), sem nenhuma perna de contrapartida — não
 *    era, e não pode voltar a ser, um lançamento contábil válido. Um reajuste de contrato
 *    não é em si um evento de caixa nem de competência (nenhum dinheiro muda de mão só por
 *    assinar o aditivo); o histórico do reajuste já é registrado de forma correta e viva em
 *    `contrato_reajustes` via `src/domain/contratos/reajustes.ts::registrarReajuste`. O
 *    efeito econômico do reajuste deveria aparecer nas COMPETÊNCIAS futuras (valor_devido
 *    maior a partir do mês vigente) — mas isso depende de
 *    `aluguel-competencias.ts::gerarCompetenciasPendentes` passar a usar
 *    `reajustes.ts::valorVigente()` em vez do `contrato.valor_referencia` fixo, que é uma
 *    mudança num módulo VIVO e já testado, fora do escopo de "trocar a função de escrita"
 *    desta tarefa (que é só sobre os 3 arquivos apagados). Sinalizado aqui para decisão
 *    futura, não corrigido nesta tarefa — mesmo padrão de outros achados fora de escopo já
 *    documentados neste ERP (ex.: `provisarJurosInadimplencia`, integracao-inadimplencia.ts).
 *
 * 4. `contabilizarAjustesCaucaoVistoria` (provisionar dano de vistoria contra a caução) —
 *    NÃO reconstruída: DUPLICATA TOTAL de `integracao-vistorias.ts::provisarDanosVistoria`
 *    (já vivo, cluster C), que já lança exatamente o mesmo par (débito 5502 "Inadimplência e
 *    perdas com locatário" / crédito 3301 "Depósitos caução recebidos") a partir dos itens
 *    de dano de uma vistoria concluída/aprovada.
 *
 * 5. `contabilizarDevolucaoCaucao` (devolver caução ao locatário) — RECONSTRUÍDA abaixo.
 *    GAP DE VERDADE: nenhum módulo vivo grava `caucoes.data_devolucao`/`valor_devolvido`
 *    nem lança a devolução no razão (confirmado por busca: as únicas leituras de
 *    `data_devolucao` são em relatórios/patrimônio, nunca uma escrita — ver
 *    `src/domain/patrimonio/balancoPatrimonial.ts`). `calculoCaucao.ts` (vivo) já calcula
 *    o valor corrigido a devolver — reaproveitado aqui em vez de duplicar a correção
 *    monetária mês a mês. Segue o MESMO padrão de `aluguel-competencias.ts::baixarCompetencia`:
 *    insere a própria linha em `transacoes` (para o fluxo de caixa refletir a saída e para
 *    `migrarTransacoesParaLedger` reconhecer como já migrada, via
 *    `origem_modulo: 'transacoes'`) e lança as duas pernas com `registrarLancamentoContabil`
 *    usando a MESMA tradução de conta que uma transação bancária classificada "9.0.02"
 *    (Depósito caução) receberia de `mapeamentoPlanoApp.ts::contaContrapartida` — não um
 *    id hardcoded à parte, para nunca divergir do que a migração faria para o mesmo evento.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";
import { CONTA_CAIXA_ERP, contaContrapartida } from "./mapeamentoPlanoApp";
import { calcularCaucao } from "../caucao/calculoCaucao";

/** Código do plano do app para depósito/devolução de caução — ver mapeamentoPlanoApp.ts
 * ("9.0.02" → 3301, Depósitos caução recebidos). Mesma tradução que uma transação bancária
 * de devolução de caução receberia se importada via OFX e classificada manualmente. */
const PLANO_CONTA_CAUCAO = "9.0.02";

export interface ResultadoDevolucaoCaucao {
  sucesso: boolean;
  mensagem: string;
  transacao_id?: number;
  valor_devolvido?: number;
}

/** Período contábil (entidade, ano/mês da data informada), criando-o aberto se ainda não
 * existir — mesmo padrão de `contasAPagar.ts::resolverPeriodoParaData` e
 * `aluguel-competencias.ts::resolverPeriodoParaData` (duplicado aqui pela mesma razão que
 * lá: um utilitário pequeno o bastante para não valer a pena extrair uma dependência nova
 * entre módulos de escrita do razão). */
function resolverPeriodoParaData(db: Database, entidade_id: number, data: string): { id: number } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!partes) throw new Error(`Data de devolução inválida: "${data}".`);
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

/**
 * Devolve o depósito caução ao locatário: calcula o valor corrigido a devolver
 * (reaproveitando `calcularCaucao`, sem reimplementar a correção monetária), gera a saída
 * de caixa correspondente e lança as duas pernas no razão — débito na conta de caução
 * (reduz o passivo "Depósitos caução recebidos"), crédito em Caixa.
 *
 * Recusa (sem lançar nada):
 *   - caução ou conta bancária inexistente;
 *   - caução já devolvida (`data_devolucao` preenchida) — idempotente por construção, não
 *     por checagem de índice (ver `ledger_entries` abaixo, que não tem chave única própria
 *     para este evento — a proteção é a própria coluna `caucoes.data_devolucao`);
 *   - mês sem taxa de índice cadastrada em `indices_economicos` (mesma recusa que
 *     `calcularCaucao` já sinaliza via `mesesSemIndiceDisponivel` — nunca corrige às
 *     cegas, mesmo princípio de "nunca fabricar dado" já aplicado a valor venal, saldo
 *     devedor manual etc. no schema real);
 *   - deduções maiores que o saldo corrigido (valor a devolver negativo) — erro de dado
 *     (deduções cadastradas errado), nunca convertido silenciosamente num valor a receber
 *     do locatário (que esta função não modela).
 *
 * Caução com valor a devolver EXATAMENTE ZERO (dedução total) fecha o registro
 * (`data_devolucao`/`valor_devolvido = 0`) sem gerar transação nem lançamento — não há
 * saída de caixa nem perna de contrapartida quando não há valor. */
export function contabilizarDevolucaoCaucao(
  db: Database,
  caucao_id: number,
  conta_bancaria_id: number,
  data_devolucao: string,
  entidade_id: number,
  usuario_id?: number,
): ResultadoDevolucaoCaucao {
  const [caucao] = consultar<{
    id: number;
    contrato_id: number;
    data_devolucao: string | null;
  }>(db, "SELECT id, contrato_id, data_devolucao FROM caucoes WHERE id = ?", [caucao_id]);

  if (!caucao) {
    return { sucesso: false, mensagem: `Caução ${caucao_id} não encontrada.` };
  }
  if (caucao.data_devolucao) {
    return { sucesso: false, mensagem: "Caução já foi devolvida — devolução duplicada recusada." };
  }

  const [bancaria] = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [
    conta_bancaria_id,
  ]);
  if (!bancaria) {
    return { sucesso: false, mensagem: `Conta bancária ${conta_bancaria_id} não encontrada.` };
  }

  const [contrato] = consultar<{ locatario: string }>(
    db,
    "SELECT locatario FROM contratos_locacao WHERE id = ?",
    [caucao.contrato_id],
  );

  const calculo = calcularCaucao(db, caucao_id, data_devolucao);
  if (calculo.mesesSemIndiceDisponivel.length > 0) {
    return {
      sucesso: false,
      mensagem: `Série de índice incompleta para: ${calculo.mesesSemIndiceDisponivel.join(", ")} — complete antes de devolver.`,
    };
  }
  if (calculo.valorADevolver < 0) {
    return {
      sucesso: false,
      mensagem: "Deduções excedem o saldo corrigido da caução — ajuste as deduções antes de devolver.",
    };
  }

  const valor_devolvido = calculo.valorADevolver;
  const descricao = `Devolução de caução — ${contrato?.locatario ?? `Contrato ${caucao.contrato_id}`} (Caução ${caucao_id})`;

  if (valor_devolvido === 0) {
    // Totalmente deduzida: nada a pagar, nenhuma perna de caixa/razão — só fecha o registro.
    executar(db, "UPDATE caucoes SET data_devolucao = ?, valor_devolvido = 0 WHERE id = ?", [
      data_devolucao,
      caucao_id,
    ]);
    return { sucesso: true, mensagem: "Caução totalmente deduzida — nenhum valor a devolver.", valor_devolvido: 0 };
  }

  db.run("BEGIN");
  try {
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original, contrato_id, plano_conta_codigo, categorizado_por, revisado)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 1)`,
      [conta_bancaria_id, data_devolucao, -valor_devolvido, descricao, caucao.contrato_id, PLANO_CONTA_CAUCAO],
    );
    const [{ id: transacao_id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

    const periodo = resolverPeriodoParaData(db, entidade_id, data_devolucao);
    const contrapartida = contaContrapartida(PLANO_CONTA_CAUCAO); // Depósitos caução recebidos (3301)
    const referencia_documento = `TXN-${transacao_id}`;

    // Saída de caixa (valor negativo) → débito na contrapartida (reduz o passivo de
    // caução), crédito em Caixa — mesma regra de migracao-ledger.ts para valor < 0.
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id: periodo.id,
      conta_id: contrapartida.conta_id,
      data_lancamento: data_devolucao,
      valor_debito: valor_devolvido,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id: periodo.id,
      conta_id: CONTA_CAIXA_ERP,
      data_lancamento: data_devolucao,
      valor_credito: valor_devolvido,
      descricao,
      origem_modulo: "transacoes",
      origem_id: transacao_id,
      referencia_documento,
      criado_por: usuario_id,
    });

    executar(db, "UPDATE caucoes SET data_devolucao = ?, valor_devolvido = ? WHERE id = ?", [
      data_devolucao,
      valor_devolvido,
      caucao_id,
    ]);

    db.run("COMMIT");
    return {
      sucesso: true,
      mensagem: `Caução #${caucao_id} devolvida — transação #${transacao_id} lançada no razão.`,
      transacao_id,
      valor_devolvido,
    };
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    return {
      sucesso: false,
      mensagem: `Não foi possível devolver a caução: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}
