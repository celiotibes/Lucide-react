/** Advocacia: processos judiciais, partes e despesa jurídica.
 *
 * Reconstrução do domínio apagado (ver docs/dominios-a-reconstruir.md, seção 1) — o
 * módulo antigo escrevia em `despesas_legais`, que nunca existiu de verdade no schema
 * (rls.postgres.sql linha ~318 já registrava esse achado). Este módulo desenha contra o
 * schema real: `processos_legais` e `partes_processo` (schema.sql/.postgres.sql).
 *
 * DECISÃO DE DESENHO — por que NÃO existe `despesas_legais` própria: despesa jurídica é,
 * antes de mais nada, uma obrigação de pagar um fornecedor (escritório, cartório, perito)
 * com vencimento — exatamente o que `contas_a_pagar` (src/domain/contasAPagar) já
 * resolve por completo (aging, baixa real no razão via `registrarLancamentoContabil`,
 * status calculado nunca congelado). Criar uma tabela paralela duplicaria esse controle
 * de vencimento/baixa inteiro só para trocar o nome. Em vez disso, `registrarDespesaProcesso`
 * abaixo é uma fina camada sobre `registrarContaAPagar`, passando `processo_id` — a
 * despesa jurídica é uma linha comum de `contas_a_pagar`, e ganha de graça: aging,
 * parcelamento (várias linhas com o mesmo `processo_id`), e a baixa real no razão contábil
 * (`baixarContaAPagar`, já testado em contasAPagar.test.ts). O plano de contas do app já
 * tem o código '2.1.11' (Advocacia — honorários e despesas jurídicas), que
 * `mapeamentoPlanoApp.ts` já mapeia para 6.3.01 (Honorários advocatícios) no razão do ERP
 * — por isso é o default de `plano_conta_codigo` aqui, sem precisar de conta nova.
 *
 * REGRA DE NEGÓCIO — processo encerrado/arquivado NÃO aceita nova despesa: uma vez que o
 * processo terminou (com ou sem êxito), lançar uma despesa nova contra ele é o tipo de
 * erro que perícia contábil justamente aponta (custo de um processo já morto inflando o
 * período errado). Reabrir o processo (suspenso→ativo é permitido) é o caminho correto se
 * uma despesa remanescente aparecer depois — não relançar cegamente. `registrarDespesaProcesso`
 * recusa explicitamente para 'encerrado' e 'arquivado'; 'ativo' e 'suspenso' aceitam
 * (mesmo suspenso pode ter honorário fixo mensal apesar do processo estar parado).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarContaAPagar, type ContaAPagarComStatusCalculado, obterContaAPagar } from "../contasAPagar/contasAPagar";

export type TipoProcesso = "civel" | "trabalhista" | "tributario" | "outro";
export type StatusProcesso = "ativo" | "suspenso" | "encerrado" | "arquivado";
export type PapelParte = "autor" | "reu" | "terceiro_interessado";

/** Código padrão do plano de contas do app para despesa jurídica — ver comentário do
 * arquivo (mapeia para 6.3.01 Honorários advocatícios no razão). */
export const PLANO_CONTA_DESPESA_JURIDICA_PADRAO = "2.1.11";

/** Status que recusam nova despesa (ver REGRA DE NEGÓCIO no comentário do arquivo). */
const STATUS_SEM_NOVA_DESPESA: ReadonlySet<StatusProcesso> = new Set(["encerrado", "arquivado"]);
/** Status que recusam novo encerramento — já encerrado/arquivado não se encerra de novo
 * (evita sobrescrever `resultado`/`data_encerramento` já gravados como histórico). */
const STATUS_JA_FINALIZADO: ReadonlySet<StatusProcesso> = new Set(["encerrado", "arquivado"]);

export interface ProcessoLegal {
  id: number;
  entidade_id: number;
  numero_processo: string | null;
  tipo: TipoProcesso;
  vara_comarca: string | null;
  status: StatusProcesso;
  valor_causa: number | null;
  data_distribuicao: string | null;
  data_encerramento: string | null;
  resultado: string | null;
  observacoes: string | null;
  criado_em: string;
}

export interface ParteProcesso {
  id: number;
  processo_id: number;
  papel: PapelParte;
  nome: string;
  cpf_cnpj: string | null;
  representado_por_nos: boolean;
  criado_em: string;
}

export interface NovoProcesso {
  entidade_id: number;
  numero_processo?: string;
  tipo: TipoProcesso;
  vara_comarca?: string;
  valor_causa?: number;
  data_distribuicao?: string;
  observacoes?: string;
}

export interface NovaParteProcesso {
  processo_id: number;
  papel: PapelParte;
  nome: string;
  cpf_cnpj?: string;
  /** Default false (parte contrária) — precisa ser passado explicitamente `true` para o
   * nosso cliente, nunca assumido. */
  representado_por_nos?: boolean;
}

export interface ResultadoOperacaoAdvocacia {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

/** Registra um novo processo legal. `status` sempre nasce 'ativo' — mudar de status é
 * responsabilidade de `atualizarStatusProcesso`/`encerrarProcesso`. */
export function criarProcesso(db: Database, dados: NovoProcesso): ResultadoOperacaoAdvocacia {
  if (!dados.tipo) {
    return { sucesso: false, mensagem: "Informe o tipo do processo." };
  }
  if (dados.valor_causa !== undefined && dados.valor_causa < 0) {
    return { sucesso: false, mensagem: "Valor da causa não pode ser negativo." };
  }

  executar(
    db,
    `INSERT INTO processos_legais (
      entidade_id, numero_processo, tipo, vara_comarca, status, valor_causa,
      data_distribuicao, observacoes
    ) VALUES (?, ?, ?, ?, 'ativo', ?, ?, ?)`,
    [
      dados.entidade_id,
      dados.numero_processo ?? null,
      dados.tipo,
      dados.vara_comarca ?? null,
      dados.valor_causa ?? null,
      dados.data_distribuicao ?? null,
      dados.observacoes ?? null,
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Processo registrado.", id };
}

/** Adiciona uma parte a um processo existente (autor, réu ou terceiro interessado). */
export function adicionarParteProcesso(db: Database, dados: NovaParteProcesso): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, dados.processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${dados.processo_id} não encontrado.` };
  }
  if (!dados.nome || !dados.nome.trim()) {
    return { sucesso: false, mensagem: "Informe o nome da parte." };
  }

  executar(
    db,
    `INSERT INTO partes_processo (processo_id, papel, nome, cpf_cnpj, representado_por_nos)
     VALUES (?, ?, ?, ?, ?)`,
    [
      dados.processo_id,
      dados.papel,
      dados.nome.trim(),
      dados.cpf_cnpj ?? null,
      dados.representado_por_nos ? 1 : 0,
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Parte adicionada ao processo.", id };
}

function obterProcessoBruto(db: Database, processo_id: number): ProcessoLegal | null {
  return consultar<ProcessoLegal>(db, "SELECT * FROM processos_legais WHERE id = ?", [processo_id])[0] ?? null;
}

function listarPartes(db: Database, processo_id: number): ParteProcesso[] {
  return consultar<{
    id: number;
    processo_id: number;
    papel: PapelParte;
    nome: string;
    cpf_cnpj: string | null;
    representado_por_nos: number;
    criado_em: string;
  }>(db, "SELECT * FROM partes_processo WHERE processo_id = ? ORDER BY id ASC", [processo_id]).map((p) => ({
    ...p,
    representado_por_nos: p.representado_por_nos === 1,
  }));
}

/** Processo com suas partes — ou null se não existir. */
export function obterProcesso(db: Database, processo_id: number): (ProcessoLegal & { partes: ParteProcesso[] }) | null {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) return null;
  return { ...processo, partes: listarPartes(db, processo_id) };
}

export interface FiltrosProcessos {
  status?: StatusProcesso;
  tipo?: TipoProcesso;
}

/** Lista os processos de uma entidade, com filtro opcional de status/tipo. */
export function listarProcessos(db: Database, entidade_id: number, filtros: FiltrosProcessos = {}): ProcessoLegal[] {
  let sql = "SELECT * FROM processos_legais WHERE entidade_id = ?";
  const params: (string | number)[] = [entidade_id];
  if (filtros.status) {
    sql += " AND status = ?";
    params.push(filtros.status);
  }
  if (filtros.tipo) {
    sql += " AND tipo = ?";
    params.push(filtros.tipo);
  }
  sql += " ORDER BY id ASC";
  return consultar<ProcessoLegal>(db, sql, params);
}

/** Muda o status do processo — transição livre entre 'ativo'/'suspenso'/'arquivado', mas
 * ENCERRAR passa por `encerrarProcesso` (exige resultado e data). Recusa mudar status de
 * um processo já finalizado ('encerrado'/'arquivado') por aqui — use `reabrirProcesso`. */
export function atualizarStatusProcesso(
  db: Database,
  processo_id: number,
  novoStatus: "ativo" | "suspenso",
): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${processo_id} não encontrado.` };
  }
  if (STATUS_JA_FINALIZADO.has(processo.status)) {
    return {
      sucesso: false,
      mensagem: "Processo já finalizado (encerrado/arquivado) — use reabrirProcesso para reverter.",
    };
  }
  executar(db, "UPDATE processos_legais SET status = ? WHERE id = ?", [novoStatus, processo_id]);
  return { sucesso: true, mensagem: `Processo marcado como '${novoStatus}'.`, id: processo_id };
}

/** Reabre um processo finalizado (encerrado/arquivado → ativo), limpando data de
 * encerramento e resultado — usado quando uma despesa remanescente aparece depois do
 * encerramento e o processo precisa ser formalmente reaberto antes de aceitar despesa
 * nova (ver REGRA DE NEGÓCIO no comentário do arquivo). */
export function reabrirProcesso(db: Database, processo_id: number): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${processo_id} não encontrado.` };
  }
  if (!STATUS_JA_FINALIZADO.has(processo.status)) {
    return { sucesso: false, mensagem: "Processo não está encerrado/arquivado — nada a reabrir." };
  }
  executar(
    db,
    "UPDATE processos_legais SET status = 'ativo', data_encerramento = NULL, resultado = NULL WHERE id = ?",
    [processo_id],
  );
  return { sucesso: true, mensagem: "Processo reaberto.", id: processo_id };
}

/** Encerra o processo — exige resultado e data de encerramento. Recusa encerrar um
 * processo já finalizado (idempotência: encerrar de novo pisaria no histórico gravado). */
export function encerrarProcesso(
  db: Database,
  processo_id: number,
  dados: { data_encerramento: string; resultado: string },
): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${processo_id} não encontrado.` };
  }
  if (STATUS_JA_FINALIZADO.has(processo.status)) {
    return { sucesso: false, mensagem: "Processo já está encerrado/arquivado." };
  }
  if (!dados.data_encerramento) {
    return { sucesso: false, mensagem: "Informe a data de encerramento." };
  }
  if (!dados.resultado || !dados.resultado.trim()) {
    return { sucesso: false, mensagem: "Informe o resultado do processo." };
  }

  executar(
    db,
    "UPDATE processos_legais SET status = 'encerrado', data_encerramento = ?, resultado = ? WHERE id = ?",
    [dados.data_encerramento, dados.resultado.trim(), processo_id],
  );
  return { sucesso: true, mensagem: "Processo encerrado.", id: processo_id };
}

/** Arquiva um processo já encerrado (passo posterior, tipicamente após o prazo recursal
 * ou baixa definitiva) — só a partir de 'encerrado', nunca direto de 'ativo'/'suspenso'. */
export function arquivarProcesso(db: Database, processo_id: number): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${processo_id} não encontrado.` };
  }
  if (processo.status !== "encerrado") {
    return { sucesso: false, mensagem: "Só é possível arquivar um processo já encerrado." };
  }
  executar(db, "UPDATE processos_legais SET status = 'arquivado' WHERE id = ?", [processo_id]);
  return { sucesso: true, mensagem: "Processo arquivado.", id: processo_id };
}

export interface NovaDespesaProcesso {
  processo_id: number;
  entidade_id: number;
  valor: number;
  data_vencimento: string;
  fornecedor_nome: string;
  fornecedor_cnpj_cpf?: string;
  descricao?: string;
  /** Default '2.1.11' (Advocacia — honorários e despesas jurídicas) — ver comentário do
   * arquivo. Só passe outro código se a despesa não for honorário/custas judiciais
   * clássicos. */
  plano_conta_codigo?: string;
  documento_id?: number;
}

/** Registra uma despesa jurídica vinculada a um processo — uma linha comum de
 * `contas_a_pagar` com `processo_id` preenchido (ver DECISÃO DE DESENHO no comentário do
 * arquivo). Recusa se o processo estiver encerrado/arquivado (ver REGRA DE NEGÓCIO). */
export function registrarDespesaProcesso(db: Database, dados: NovaDespesaProcesso): ResultadoOperacaoAdvocacia {
  const processo = obterProcessoBruto(db, dados.processo_id);
  if (!processo) {
    return { sucesso: false, mensagem: `Processo ${dados.processo_id} não encontrado.` };
  }
  if (STATUS_SEM_NOVA_DESPESA.has(processo.status)) {
    return {
      sucesso: false,
      mensagem: `Processo está '${processo.status}' — não aceita despesa nova (reabra o processo primeiro).`,
    };
  }

  const resultado = registrarContaAPagar(db, {
    entidade_id: dados.entidade_id,
    documento_id: dados.documento_id,
    fornecedor_nome: dados.fornecedor_nome,
    fornecedor_cnpj_cpf: dados.fornecedor_cnpj_cpf,
    descricao: dados.descricao,
    valor: dados.valor,
    data_vencimento: dados.data_vencimento,
    plano_conta_codigo: dados.plano_conta_codigo ?? PLANO_CONTA_DESPESA_JURIDICA_PADRAO,
    processo_id: dados.processo_id,
  });

  if (!resultado.sucesso) return { sucesso: false, mensagem: resultado.mensagem };
  return { sucesso: true, mensagem: "Despesa jurídica registrada.", id: resultado.id };
}

/** As despesas (linhas de `contas_a_pagar`) de um processo, com status calculado — nunca
 * lê a coluna `status` crua para 'atrasada' (mesma regra de contasAPagar.ts). */
export function listarDespesasProcesso(
  db: Database,
  processo_id: number,
  data_referencia?: string,
): ContaAPagarComStatusCalculado[] {
  const ids = consultar<{ id: number }>(db, "SELECT id FROM contas_a_pagar WHERE processo_id = ? ORDER BY id ASC", [
    processo_id,
  ]);
  return ids
    .map((row) => obterContaAPagar(db, row.id, data_referencia))
    .filter((c): c is ContaAPagarComStatusCalculado => c !== null);
}

export interface RelatorioProcesso {
  processo: ProcessoLegal;
  partes: ParteProcesso[];
  /** Soma de TODAS as despesas vinculadas, exceto as canceladas — inclui pagas e
   * pendentes/atrasadas. Zero (nunca erro) quando o processo não tem despesa nenhuma. */
  total_despesas: number;
  total_pago: number;
  /** Pendente + atrasada (nunca paga, nunca cancelada). */
  total_pendente: number;
  despesas: ContaAPagarComStatusCalculado[];
}

/** Relatório de um único processo: total gasto, total pago, total pendente e a lista de
 * despesas com status calculado. Processo sem despesa nenhuma retorna com todos os totais
 * em zero, nunca um erro. */
export function gerarRelatorioProcesso(db: Database, processo_id: number, data_referencia?: string): RelatorioProcesso | null {
  const processo = obterProcessoBruto(db, processo_id);
  if (!processo) return null;

  const despesas = listarDespesasProcesso(db, processo_id, data_referencia);
  let total_despesas = 0;
  let total_pago = 0;
  let total_pendente = 0;
  for (const d of despesas) {
    if (d.status_calculado === "cancelada") continue;
    total_despesas += d.valor;
    if (d.status_calculado === "paga") total_pago += d.valor;
    else total_pendente += d.valor; // 'pendente' ou 'atrasada'
  }

  return {
    processo,
    partes: listarPartes(db, processo_id),
    total_despesas,
    total_pago,
    total_pendente,
    despesas,
  };
}

export interface ResumoProcessoRelatorioGeral {
  processo_id: number;
  numero_processo: string | null;
  status: StatusProcesso;
  total_despesas: number;
  total_pago: number;
  total_pendente: number;
}

export interface RelatorioAdvocacia {
  /** 'ativo' + 'suspenso' — o processo ainda pode gerar movimento. */
  processos_ativos: number;
  /** 'encerrado' + 'arquivado' — processo finalizado, não deveria receber despesa nova. */
  processos_encerrados: number;
  total_geral_despesas: number;
  total_geral_pago: number;
  total_geral_pendente: number;
  por_processo: ResumoProcessoRelatorioGeral[];
}

/** Relatório consolidado de todos os processos de uma entidade: contagem
 * ativos/encerrados e total gasto/pago/pendente por processo (ver
 * gerarRelatorioProcesso para o detalhe de despesas de um processo só). */
export function gerarRelatorioAdvocacia(db: Database, entidade_id: number, data_referencia?: string): RelatorioAdvocacia {
  const processos = listarProcessos(db, entidade_id);

  let processos_ativos = 0;
  let processos_encerrados = 0;
  let total_geral_despesas = 0;
  let total_geral_pago = 0;
  let total_geral_pendente = 0;
  const por_processo: ResumoProcessoRelatorioGeral[] = [];

  for (const processo of processos) {
    if (processo.status === "ativo" || processo.status === "suspenso") processos_ativos++;
    else processos_encerrados++;

    const despesas = listarDespesasProcesso(db, processo.id, data_referencia);
    let total_despesas = 0;
    let total_pago = 0;
    let total_pendente = 0;
    for (const d of despesas) {
      if (d.status_calculado === "cancelada") continue;
      total_despesas += d.valor;
      if (d.status_calculado === "paga") total_pago += d.valor;
      else total_pendente += d.valor;
    }

    total_geral_despesas += total_despesas;
    total_geral_pago += total_pago;
    total_geral_pendente += total_pendente;

    por_processo.push({
      processo_id: processo.id,
      numero_processo: processo.numero_processo,
      status: processo.status,
      total_despesas,
      total_pago,
      total_pendente,
    });
  }

  return {
    processos_ativos,
    processos_encerrados,
    total_geral_despesas,
    total_geral_pago,
    total_geral_pendente,
    por_processo,
  };
}
