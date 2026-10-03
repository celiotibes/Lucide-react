/** Contas Pessoais: segregação patrimonial PF x sociedade de fato
 * (docs/dominios-a-reconstruir.md, seção 2).
 *
 * Reconstrução do zero: os módulos antigos (`contas-pessoais.ts`,
 * `contas-pessoais-ledger-integration.ts`, `relatorios-contas-pessoais.ts`) escreviam em
 * tabelas que nunca existiram no schema real. Este módulo escreve contra
 * `contabilidade-reconstituicao/schema.sql` de verdade: `pessoas`, `contas_pessoais` e
 * `movimentos_pessoais` (ver comentário completo de cada tabela lá).
 *
 * O PONTO CENTRAL deste domínio — o que dá a ele valor pericial de verdade — é que
 * dinheiro NUNCA pode "aparecer" de um lado só ao cruzar a fronteira pessoa física ↔
 * entidade. Hoje `contas_bancarias` são todas da entidade; nada distinguia conta pessoal
 * de conta da atividade, e é exatamente essa confusão patrimonial que perícia contábil
 * de sociedade de fato precisa provar ou afastar (skill accounting-finance, seção 3:
 * "teste de rastreabilidade — cada lançamento relevante deve ser conectado a um
 * documento-fonte").
 *
 * DESENHO DA CONTRAPARTIDA (a pergunta que a tarefa fez para não chutar uma conta
 * "parecida"): uma transferência entre pessoa física e entidade pode ser, na prática
 * contábil, duas coisas de natureza bem diferente:
 *   - APORTE/RETIRADA DE CAPITAL: dinheiro que passa a integrar (ou deixa de integrar) o
 *     patrimônio líquido da entidade, sem obrigação de devolução programada. Contrapartida:
 *     conta 2.1.01 "Capital social" (id 2101), que JÁ EXISTIA em planoDeContasErp.ts —
 *     nenhuma conta nova precisou ser criada para este caso.
 *   - EMPRÉSTIMO DE SÓCIO / MÚTUO (e sua devolução): dinheiro que a entidade DEVE de volta
 *     à pessoa física — um passivo exigível, não patrimônio líquido. O plano JÁ TINHA uma
 *     conta de empréstimo (3.2.01 "Empréstimos de longo prazo"), mas essa conta já está
 *     em uso para financiamento bancário/imobiliário (ver mapeamentoPlanoApp.ts, código
 *     "2.1.06") — reaproveitá-la misturaria, no mesmo saldo de balancete, uma dívida com
 *     BANCO e uma dívida com SÓCIO, o oposto do que segregação patrimonial pede. Por isso
 *     esta tarefa ACRESCENTOU a conta 3.2.02 "Empréstimos de sócios (mútuo com pessoa
 *     física)" em planoDeContasErp.ts — documentado ali, não escondido aqui.
 *
 * A escolha entre as duas (capital x empréstimo) é do CHAMADOR, via `categoria` do
 * movimento — ver `CategoriaTransferenciaEntidade` abaixo. Este módulo não adivinha a
 * intenção de quem lança.
 *
 * A escrita no razão da entidade é SEMPRE via `ledger.ts:registrarLancamentoContabil()` —
 * nunca um `core.ts` (já depreciado) e nunca um INSERT direto em `ledger_entries` — mesma
 * regra que os demais clusters do documento de reconstrução exigem.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "../erp/ledger";
import { CONTA_CAIXA_ERP } from "../erp/mapeamentoPlanoApp";

export type TipoRelacaoPessoa = "titular" | "socio" | "familiar" | "outro";
export type TipoContaPessoal = "corrente" | "poupanca" | "investimento";

/** Conta de contrapartida para aporte/retirada de capital — já existia no plano
 * (planoDeContasErp.ts, "Capital social"). */
export const CONTA_CAPITAL_SOCIAL_ERP = 2101;

/** Conta de contrapartida para empréstimo de sócio/devolução — NOVA conta, acrescentada
 * ao plano nesta tarefa (planoDeContasErp.ts, "Empréstimos de sócios"), deliberadamente
 * separada de 3.2.01 (empréstimo bancário) — ver justificativa no cabeçalho do arquivo. */
export const CONTA_EMPRESTIMO_SOCIO_ERP = 3202;

/** As quatro categorias que MARCAM um movimento pessoal como transferência com a
 * entidade — qualquer outro valor de `categoria` (ou `null`) é só uma etiqueta de
 * relatório (ex.: 'salario', 'alimentacao') sem efeito contábil do lado da entidade. */
export type CategoriaTransferenciaEntidade =
  | "aporte_capital" // pessoa → entidade, incrementa Capital Social (não devolutivo)
  | "retirada_capital" // entidade → pessoa, reduz Capital Social
  | "emprestimo_socio" // pessoa → entidade, incrementa Empréstimo de Sócio (passivo exigível)
  | "devolucao_emprestimo"; // entidade → pessoa, reduz Empréstimo de Sócio

export const CATEGORIAS_TRANSFERENCIA_ENTIDADE: ReadonlySet<CategoriaTransferenciaEntidade> = new Set([
  "aporte_capital",
  "retirada_capital",
  "emprestimo_socio",
  "devolucao_emprestimo",
]);

function ehCategoriaTransferencia(
  categoria: string | null | undefined,
): categoria is CategoriaTransferenciaEntidade {
  return !!categoria && (CATEGORIAS_TRANSFERENCIA_ENTIDADE as ReadonlySet<string>).has(categoria);
}

/** Dinheiro saindo da conta pessoal RUMO à entidade (aporte ou empréstimo concedido). */
function ehSaidaParaEntidade(categoria: CategoriaTransferenciaEntidade): boolean {
  return categoria === "aporte_capital" || categoria === "emprestimo_socio";
}

/** Conta de contrapartida no razão da entidade para a categoria de transferência dada. */
function contaContrapartidaTransferencia(categoria: CategoriaTransferenciaEntidade): number {
  return categoria === "aporte_capital" || categoria === "retirada_capital"
    ? CONTA_CAPITAL_SOCIAL_ERP
    : CONTA_EMPRESTIMO_SOCIO_ERP;
}

export interface ResultadoOperacaoPessoal {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

// ============================================================================
// PESSOAS
// ============================================================================

export interface Pessoa {
  id: number;
  nome: string;
  cpf: string | null;
  tipo_relacao: TipoRelacaoPessoa;
  observacoes: string | null;
  criado_em: string;
}

export interface NovaPessoa {
  nome: string;
  cpf?: string;
  tipo_relacao: TipoRelacaoPessoa;
  observacoes?: string;
}

export interface EdicaoPessoa {
  nome?: string;
  /** `null` explícito apaga o CPF cadastrado; `undefined` mantém o que já estava. */
  cpf?: string | null;
  tipo_relacao?: TipoRelacaoPessoa;
  observacoes?: string | null;
}

function obterPessoaBruta(db: Database, id: number): Pessoa | null {
  return consultar<Pessoa>(db, "SELECT * FROM pessoas WHERE id = ?", [id])[0] ?? null;
}

function pessoaExiste(db: Database, id: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM pessoas WHERE id = ?", [id]).length > 0;
}

/** Cadastra uma pessoa (titular, sócio de fato, familiar ou outro) para a qual poderão
 * existir contas pessoais. Não recusa nome duplicado — a mesma pessoa pode aparecer mais
 * de uma vez com papéis diferentes ao longo do tempo não é o caso comum, mas nada aqui
 * impede (o CPF, quando informado, também não é UNIQUE — duas linhas com o mesmo CPF só
 * indicam cadastro redundante, uma limpeza de dados, não um erro estrutural). */
export function cadastrarPessoa(db: Database, dados: NovaPessoa): ResultadoOperacaoPessoal {
  if (!dados.nome || !dados.nome.trim()) {
    return { sucesso: false, mensagem: "Informe o nome da pessoa." };
  }
  executar(
    db,
    `INSERT INTO pessoas (nome, cpf, tipo_relacao, observacoes) VALUES (?, ?, ?, ?)`,
    [dados.nome.trim(), dados.cpf?.trim() || null, dados.tipo_relacao, dados.observacoes?.trim() || null],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Pessoa cadastrada.", id };
}

/** Lista todas as pessoas cadastradas, em ordem alfabética. */
export function listarPessoas(db: Database): Pessoa[] {
  return consultar<Pessoa>(db, "SELECT * FROM pessoas ORDER BY nome ASC, id ASC");
}

/** Atualiza dados cadastrais da pessoa. Cada campo omitido mantém o valor atual. */
export function editarPessoa(db: Database, id: number, dados: EdicaoPessoa): ResultadoOperacaoPessoal {
  const pessoa = obterPessoaBruta(db, id);
  if (!pessoa) return { sucesso: false, mensagem: `Pessoa ${id} não encontrada.` };

  const nome = dados.nome !== undefined ? dados.nome.trim() : pessoa.nome;
  if (!nome) return { sucesso: false, mensagem: "Nome não pode ficar vazio." };

  const cpf = dados.cpf !== undefined ? dados.cpf?.trim() || null : pessoa.cpf;
  const tipo_relacao = dados.tipo_relacao ?? pessoa.tipo_relacao;
  const observacoes = dados.observacoes !== undefined ? dados.observacoes?.trim() || null : pessoa.observacoes;

  executar(db, `UPDATE pessoas SET nome = ?, cpf = ?, tipo_relacao = ?, observacoes = ? WHERE id = ?`, [
    nome,
    cpf,
    tipo_relacao,
    observacoes,
    id,
  ]);
  return { sucesso: true, mensagem: "Pessoa atualizada.", id };
}

/** Remove o cadastro de uma pessoa — recusa se ela ainda tiver conta pessoal cadastrada
 * (remova as contas primeiro; evita apagar uma pessoa e deixar `contas_pessoais.pessoa_id`
 * órfão, mesmo a FK não sendo `ON DELETE CASCADE`). */
export function removerPessoa(db: Database, id: number): ResultadoOperacaoPessoal {
  const pessoa = obterPessoaBruta(db, id);
  if (!pessoa) return { sucesso: false, mensagem: `Pessoa ${id} não encontrada.` };

  const [{ total }] = consultar<{ total: number }>(
    db,
    "SELECT COUNT(*) as total FROM contas_pessoais WHERE pessoa_id = ?",
    [id],
  );
  if (total > 0) {
    return {
      sucesso: false,
      mensagem: `Pessoa tem ${total} conta(s) pessoal(is) cadastrada(s) — remova-as antes de remover a pessoa.`,
    };
  }

  executar(db, "DELETE FROM pessoas WHERE id = ?", [id]);
  return { sucesso: true, mensagem: "Pessoa removida.", id };
}

// ============================================================================
// CONTAS PESSOAIS
// ============================================================================

export interface ContaPessoal {
  id: number;
  pessoa_id: number;
  banco: string;
  agencia: string | null;
  numero: string;
  tipo: TipoContaPessoal;
  observacoes: string | null;
  criado_em: string;
}

export interface NovaContaPessoal {
  pessoa_id: number;
  banco: string;
  agencia?: string;
  numero: string;
  tipo: TipoContaPessoal;
  observacoes?: string;
}

function obterContaPessoalBruta(db: Database, id: number): ContaPessoal | null {
  return consultar<ContaPessoal>(db, "SELECT * FROM contas_pessoais WHERE id = ?", [id])[0] ?? null;
}

/** Cadastra uma conta bancária da PESSOA FÍSICA — nunca confundir com `contas_bancarias`
 * (essa é sempre da entidade). */
export function cadastrarContaPessoal(db: Database, dados: NovaContaPessoal): ResultadoOperacaoPessoal {
  if (!pessoaExiste(db, dados.pessoa_id)) {
    return { sucesso: false, mensagem: `Pessoa ${dados.pessoa_id} não encontrada.` };
  }
  if (!dados.banco || !dados.banco.trim()) return { sucesso: false, mensagem: "Informe o banco." };
  if (!dados.numero || !dados.numero.trim()) return { sucesso: false, mensagem: "Informe o número da conta." };

  executar(
    db,
    `INSERT INTO contas_pessoais (pessoa_id, banco, agencia, numero, tipo, observacoes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      dados.pessoa_id,
      dados.banco.trim(),
      dados.agencia?.trim() || null,
      dados.numero.trim(),
      dados.tipo,
      dados.observacoes?.trim() || null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Conta pessoal cadastrada.", id };
}

/** Lista as contas pessoais de uma pessoa. */
export function listarContasPessoais(db: Database, pessoa_id: number): ContaPessoal[] {
  return consultar<ContaPessoal>(db, "SELECT * FROM contas_pessoais WHERE pessoa_id = ? ORDER BY id ASC", [
    pessoa_id,
  ]);
}

/** Remove uma conta pessoal — recusa se já tiver movimento registrado (histórico
 * financeiro não se apaga; se a conta foi encerrada de fato, deixe de lançar novos
 * movimentos nela, não apague o que já aconteceu). */
export function removerContaPessoal(db: Database, id: number): ResultadoOperacaoPessoal {
  const conta = obterContaPessoalBruta(db, id);
  if (!conta) return { sucesso: false, mensagem: `Conta pessoal ${id} não encontrada.` };

  const [{ total }] = consultar<{ total: number }>(
    db,
    "SELECT COUNT(*) as total FROM movimentos_pessoais WHERE conta_pessoal_id = ?",
    [id],
  );
  if (total > 0) {
    return {
      sucesso: false,
      mensagem: `Conta tem ${total} movimento(s) registrado(s) — não pode ser removida.`,
    };
  }

  executar(db, "DELETE FROM contas_pessoais WHERE id = ?", [id]);
  return { sucesso: true, mensagem: "Conta pessoal removida.", id };
}

// ============================================================================
// MOVIMENTOS
// ============================================================================

export interface MovimentoPessoal {
  id: number;
  conta_pessoal_id: number;
  data: string;
  valor: number;
  descricao: string;
  categoria: string | null;
  transferencia_entidade_id: number | null;
  criado_em: string;
}

export interface DadosTransferenciaEntidade {
  entidade_id: number;
  periodo_id: number;
  criado_por?: number;
}

export interface NovoMovimentoPessoal {
  conta_pessoal_id: number;
  data: string;
  /** Assinado: positivo = dinheiro ENTRANDO na conta pessoal, negativo = SAINDO dela. */
  valor: number;
  descricao: string;
  /** Categoria livre para movimento comum (ex.: 'salario', 'alimentacao'); uma das quatro
   * `CategoriaTransferenciaEntidade` marca o movimento como transferência com a
   * entidade — nesse caso `transferencia` é obrigatório. */
  categoria?: string;
  /** Obrigatório quando `categoria` é uma transferência com a entidade; rejeitado quando
   * não é (evita gravar dados de transferência que ninguém vai auditar). */
  transferencia?: DadosTransferenciaEntidade;
}

/** Registra um movimento de conta pessoal.
 *
 * Se `categoria` for uma das quatro transferências com a entidade
 * (`CategoriaTransferenciaEntidade`), o movimento NUNCA fica só do lado pessoal: esta
 * função também lança as duas pernas correspondentes no razão da entidade via
 * `registrarLancamentoContabil` (nunca um INSERT direto em `ledger_entries`, nunca
 * `core.ts`) —
 *   - Débito/crédito em Caixa (1101), conforme o dinheiro entra ou sai da entidade;
 *   - O lado oposto na conta de contrapartida (`contaContrapartidaTransferencia`):
 *     Capital Social (2101) para aporte/retirada, Empréstimo de Sócio (3202) para
 *     empréstimo/devolução —
 * e grava o id do lançamento de Caixa em `transferencia_entidade_id`: é esse campo que
 * `relatorioSegregacaoPatrimonial` audita para achar transferência órfã (marcada como
 * transferência mas sem o espelho).
 *
 * Lança (não retorna `{ sucesso: false }`) em validação malformada — mesmo estilo de
 * `registrarLancamentoContabil`, que esta função chama por baixo e cujos erros (ex.:
 * período fechado, `entidade_id`/`conta_id` inexistente) propagam sem tratamento
 * especial. */
export function registrarMovimentoPessoal(db: Database, dados: NovoMovimentoPessoal): number {
  const conta = obterContaPessoalBruta(db, dados.conta_pessoal_id);
  if (!conta) throw new Error(`Conta pessoal ${dados.conta_pessoal_id} não encontrada.`);
  if (!dados.descricao || !dados.descricao.trim()) throw new Error("Informe a descrição do movimento.");
  if (!dados.valor) throw new Error("Valor do movimento não pode ser zero.");
  if (!dados.data) throw new Error("Informe a data do movimento.");

  const categoria = dados.categoria?.trim() || null;
  const ehTransferencia = ehCategoriaTransferencia(categoria);

  if (ehTransferencia && !dados.transferencia) {
    throw new Error(
      `Movimento com categoria '${categoria}' é uma transferência com a entidade e exige os dados dela (entidade_id, periodo_id).`,
    );
  }
  if (!ehTransferencia && dados.transferencia) {
    throw new Error(
      `Dados de transferência informados, mas categoria '${categoria ?? "(nenhuma)"}' não é uma das reconhecidas ` +
        `(${[...CATEGORIAS_TRANSFERENCIA_ENTIDADE].join(", ")}).`,
    );
  }
  if (ehTransferencia) {
    const entradaNaPessoa = categoria === "retirada_capital" || categoria === "devolucao_emprestimo";
    if (entradaNaPessoa && dados.valor <= 0) {
      throw new Error(
        `Categoria '${categoria}' representa dinheiro entrando na conta pessoal (vindo da entidade): valor deve ser positivo.`,
      );
    }
    if (!entradaNaPessoa && dados.valor >= 0) {
      throw new Error(
        `Categoria '${categoria}' representa dinheiro saindo da conta pessoal (para a entidade): valor deve ser negativo.`,
      );
    }
  }

  executar(
    db,
    `INSERT INTO movimentos_pessoais (conta_pessoal_id, data, valor, descricao, categoria)
     VALUES (?, ?, ?, ?, ?)`,
    [dados.conta_pessoal_id, dados.data, dados.valor, dados.descricao.trim(), categoria],
  );
  const [{ id: movimentoId }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

  if (ehTransferencia && dados.transferencia) {
    const valorAbs = Math.abs(dados.valor);
    const contaContrapartida = contaContrapartidaTransferencia(categoria);
    const entraNaEntidade = ehSaidaParaEntidade(categoria);
    const referencia = `PESSOAL-${movimentoId}`;
    const descricao = `${dados.descricao.trim()} (espelho de movimento pessoal #${movimentoId}, conta pessoal ${dados.conta_pessoal_id})`;

    // Perna 1: Caixa da entidade — débito quando o dinheiro ENTRA (aporte/empréstimo),
    // crédito quando SAI (retirada/devolução). O id deste lançamento é o que
    // `transferencia_entidade_id` guarda — a metade "dinheiro de fato mudou de mão" do
    // espelho, mais fácil de auditar de relance que a conta de contrapartida.
    const ledgerCaixaId = registrarLancamentoContabil(db, {
      entidade_id: dados.transferencia.entidade_id,
      periodo_id: dados.transferencia.periodo_id,
      conta_id: CONTA_CAIXA_ERP,
      data_lancamento: dados.data,
      valor_debito: entraNaEntidade ? valorAbs : undefined,
      valor_credito: entraNaEntidade ? undefined : valorAbs,
      descricao,
      origem_modulo: "contas-pessoais",
      origem_id: movimentoId,
      referencia_documento: referencia,
      criado_por: dados.transferencia.criado_por,
    });

    // Perna 2: contrapartida (Capital Social ou Empréstimo de Sócio) — lado oposto da
    // perna 1, sempre balanceado por construção (mesmo valor, lado invertido).
    registrarLancamentoContabil(db, {
      entidade_id: dados.transferencia.entidade_id,
      periodo_id: dados.transferencia.periodo_id,
      conta_id: contaContrapartida,
      data_lancamento: dados.data,
      valor_debito: entraNaEntidade ? undefined : valorAbs,
      valor_credito: entraNaEntidade ? valorAbs : undefined,
      descricao,
      origem_modulo: "contas-pessoais",
      origem_id: movimentoId,
      referencia_documento: referencia,
      criado_por: dados.transferencia.criado_por,
    });

    executar(db, "UPDATE movimentos_pessoais SET transferencia_entidade_id = ? WHERE id = ?", [
      ledgerCaixaId,
      movimentoId,
    ]);
  }

  return movimentoId;
}

// ============================================================================
// RELATÓRIOS
// ============================================================================

export interface PeriodoData {
  inicio: string;
  fim: string;
}

export interface ExtratoPessoal {
  pessoa_id: number;
  periodo: PeriodoData;
  total_depositos: number;
  total_saques: number;
  /** Soma (valor absoluto) das transferências pessoa→entidade (aporte + empréstimo)
   * confirmadas no período — "confirmada" aqui só quer dizer "tem categoria de
   * transferência"; a checagem de espelho é feita em `relatorioSegregacaoPatrimonial`,
   * escopada por entidade/período contábil, não aqui (o extrato pessoal é escopado por
   * data corrida, sem `periodo_id`). */
  total_transferencias_para_entidade: number;
  /** Soma das transferências entidade→pessoa (retirada + devolução) no período. */
  total_transferencias_da_entidade: number;
  /** Soma de todos os valores (assinados) do período — o efeito líquido no saldo. */
  saldo_periodo: number;
  /** Soma de todos os valores (assinados) de TODAS as contas da pessoa, sem filtro de
   * data — o saldo corrente, não só o do período pedido. */
  saldo_atual: number;
  movimentos: MovimentoPessoal[];
}

/** Extrato da pessoa no período: depósitos, saques, transferências de/para a entidade e
 * saldo — consolidado de todas as contas pessoais da pessoa (uma pessoa pode ter mais de
 * uma conta bancária). */
export function relatorioMovimentosPessoais(
  db: Database,
  pessoa_id: number,
  periodo: PeriodoData,
): ExtratoPessoal {
  const movimentos = consultar<MovimentoPessoal>(
    db,
    `SELECT mp.id, mp.conta_pessoal_id, mp.data, mp.valor, mp.descricao, mp.categoria,
            mp.transferencia_entidade_id, mp.criado_em
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp ON cp.id = mp.conta_pessoal_id
     WHERE cp.pessoa_id = ? AND mp.data BETWEEN ? AND ?
     ORDER BY mp.data ASC, mp.id ASC`,
    [pessoa_id, periodo.inicio, periodo.fim],
  );

  let total_depositos = 0;
  let total_saques = 0;
  let total_transferencias_para_entidade = 0;
  let total_transferencias_da_entidade = 0;

  for (const m of movimentos) {
    if (ehCategoriaTransferencia(m.categoria)) {
      if (ehSaidaParaEntidade(m.categoria)) {
        total_transferencias_para_entidade += Math.abs(m.valor);
      } else {
        total_transferencias_da_entidade += m.valor;
      }
    } else if (m.valor > 0) {
      total_depositos += m.valor;
    } else {
      total_saques += Math.abs(m.valor);
    }
  }

  const [{ saldo_atual }] = consultar<{ saldo_atual: number }>(
    db,
    `SELECT COALESCE(SUM(mp.valor), 0) as saldo_atual
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp ON cp.id = mp.conta_pessoal_id
     WHERE cp.pessoa_id = ?`,
    [pessoa_id],
  );

  return {
    pessoa_id,
    periodo,
    total_depositos,
    total_saques,
    total_transferencias_para_entidade,
    total_transferencias_da_entidade,
    saldo_periodo: movimentos.reduce((soma, m) => soma + m.valor, 0),
    saldo_atual,
    movimentos,
  };
}

export interface TransferenciaOrfa {
  movimento_id: number;
  conta_pessoal_id: number;
  pessoa_id: number;
  pessoa_nome: string;
  data: string;
  valor: number;
  categoria: string;
  descricao: string;
}

export interface RelatorioSegregacaoPatrimonial {
  entidade_id: number;
  periodo_id: number;
  /** Total CONFIRMADO (com espelho no razão desta entidade/período) transferido de
   * pessoa física para a entidade — aporte de capital + empréstimo de sócio. */
  total_pessoa_para_entidade: number;
  /** Total CONFIRMADO transferido da entidade para pessoa física — retirada de capital +
   * devolução de empréstimo. */
  total_entidade_para_pessoa: number;
  /** total_pessoa_para_entidade − total_entidade_para_pessoa: positivo quando a pessoa
   * injetou mais do que retirou no período (líquido a favor da entidade). */
  saldo_liquido: number;
  /** A checagem de integridade que dá valor pericial a este relatório: movimentos com
   * categoria de transferência mas SEM `transferencia_entidade_id` — dinheiro que
   * "aparece" de um lado só, sem contrapartida contábil rastreável. Nunca deveria
   * acontecer passando por `registrarMovimentoPessoal`; só ocorre se alguém inserir
   * direto em `movimentos_pessoais` por fora da função (ex.: importação manual,
   * migração malfeita) — exatamente o cenário que perícia de confusão patrimonial
   * precisa poder flagrar. */
  transferencias_orfas: TransferenciaOrfa[];
  /** `true` quando não há nenhuma transferência órfã. */
  integro: boolean;
}

/** Visão consolidada de segregação patrimonial PF x entidade num período contábil: total
 * transferido em cada sentido (só o CONFIRMADO, com espelho no razão desta
 * entidade/período) e a lista de transferências órfãs.
 *
 * LIMITAÇÃO DELIBERADA (mesmo espírito do que `rls.postgres.sql` documenta para
 * `contas_pessoais_erp()`): a busca por órfãs não filtra por `entidade_id`/`periodo_id`
 * porque um movimento órfão, por definição, não tem `transferencia_entidade_id`
 * preenchido — não há como saber a qual entidade ele PRETENDIA se referir sem o
 * espelho. Isso é inofensivo hoje porque o app é monoentidade (mesma suposição de
 * `CONTA_CAIXA_ERP = 1101` fixo em mapeamentoPlanoApp.ts); com mais de uma
 * `entidade_legal`, a lista de órfãs precisaria de outro critério (ex.: perguntar ao
 * usuário a qual entidade o movimento se referia) para não misturar órfãs de entidades
 * diferentes numa única lista. */
export function relatorioSegregacaoPatrimonial(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): RelatorioSegregacaoPatrimonial {
  const confirmadas = consultar<{ categoria: CategoriaTransferenciaEntidade; valor: number }>(
    db,
    `SELECT mp.categoria, mp.valor
     FROM movimentos_pessoais mp
     INNER JOIN ledger_entries le ON le.id = mp.transferencia_entidade_id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND mp.categoria IN ('aporte_capital', 'retirada_capital', 'emprestimo_socio', 'devolucao_emprestimo')`,
    [entidade_id, periodo_id],
  );

  let total_pessoa_para_entidade = 0;
  let total_entidade_para_pessoa = 0;
  for (const m of confirmadas) {
    if (ehSaidaParaEntidade(m.categoria)) {
      total_pessoa_para_entidade += Math.abs(m.valor);
    } else {
      total_entidade_para_pessoa += m.valor;
    }
  }

  const orfas = consultar<TransferenciaOrfa>(
    db,
    `SELECT mp.id as movimento_id, mp.conta_pessoal_id, cp.pessoa_id, p.nome as pessoa_nome,
            mp.data, mp.valor, mp.categoria, mp.descricao
     FROM movimentos_pessoais mp
     INNER JOIN contas_pessoais cp ON cp.id = mp.conta_pessoal_id
     INNER JOIN pessoas p ON p.id = cp.pessoa_id
     WHERE mp.transferencia_entidade_id IS NULL
       AND mp.categoria IN ('aporte_capital', 'retirada_capital', 'emprestimo_socio', 'devolucao_emprestimo')
     ORDER BY mp.data ASC, mp.id ASC`,
  );

  return {
    entidade_id,
    periodo_id,
    total_pessoa_para_entidade,
    total_entidade_para_pessoa,
    saldo_liquido: total_pessoa_para_entidade - total_entidade_para_pessoa,
    transferencias_orfas: orfas,
    integro: orfas.length === 0,
  };
}
