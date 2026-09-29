/**
 * Hub de Consolidação Financeira: camada de EVIDÊNCIA/rastreabilidade ACIMA do razão de
 * partida dobrada (`ledger_entries`, ver ledger.ts) — NUNCA um substituto dele. Este módulo
 * não grava nenhum lançamento contábil; ele só REGISTRA, de forma idempotente, um "fato"
 * canônico vindo de cada fonte operacional (transação bancária, competência de aluguel,
 * conta a pagar, despesa de ordem de serviço) e permite LIGAR dois fatos que representam o
 * mesmo evento econômico visto de ângulos diferentes — ex: a competência de aluguel do mês X
 * e o recebimento bancário que a quitou.
 *
 * Ver o comentário completo do bloco "HUB DE CONSOLIDAÇÃO FINANCEIRA" em schema.sql (tabelas
 * `fatos_financeiros` e `fatos_financeiros_links`) para a motivação e a auditoria comparativa
 * com ERP de referência que originou este desenho.
 *
 * IDEMPOTÊNCIA: cada `registrarFatoDe*` usa uma `chave_idempotencia` determinística
 * (`'<tipo>:<id_de_origem>'`) — chamar de novo para a MESMA linha de origem nunca duplica o
 * fato, apenas devolve o já existente. `ligarFatos` é idempotente pelo PAR de fatos (nas duas
 * ordens) + `tipo_relacao`.
 *
 * REGRA DE OURO: nenhuma sugestão automática (`sugerirLigacoesCompetenciaRecebimento`) confirma
 * um link sozinha — todo link nasce `status = 'pendente'` e só um humano confirma ou rejeita
 * (mesmo princípio já aplicado a `documento_transacoes.status` e a `rateios.base_incompleta`
 * em todo o resto do sistema: nunca fabricar certeza que não existe).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export type TipoOrigemFato =
  | "banco"
  | "competencia"
  | "contas_a_pagar"
  | "ordem_servico"
  | "vistoria"
  | "historico";

export type EstadoRevisaoFato = "pendente" | "revisado" | "rejeitado";

export type StatusLigacaoFatos = "pendente" | "confirmado" | "rejeitado";

export interface FatoFinanceiro {
  id: number;
  entidade_id: number;
  tipo_origem: TipoOrigemFato;
  origem_id: number;
  data_fato: string;
  valor: number;
  chave_idempotencia: string;
  estado_revisao: EstadoRevisaoFato;
  criado_em: string;
}

export interface LigacaoFatos {
  id: number;
  fato_a_id: number;
  fato_b_id: number;
  tipo_relacao: string;
  status: StatusLigacaoFatos;
  criado_em: string;
}

function buscarFatoPorChave(db: Database, chave_idempotencia: string): FatoFinanceiro | null {
  return (
    consultar<FatoFinanceiro>(
      db,
      "SELECT * FROM fatos_financeiros WHERE chave_idempotencia = ?",
      [chave_idempotencia],
    )[0] ?? null
  );
}

interface DadosNovoFato {
  entidade_id: number;
  tipo_origem: TipoOrigemFato;
  origem_id: number;
  data_fato: string;
  valor: number;
  chave_idempotencia: string;
}

/** Registro genérico e idempotente de um fato — usado por todos os `registrarFatoDe*`
 * públicos abaixo. Se a `chave_idempotencia` já existir, devolve o fato já existente sem
 * inserir de novo (e sem lançar erro): é isso que torna chamar duas vezes seguro. */
function registrarFato(db: Database, dados: DadosNovoFato): FatoFinanceiro {
  const existente = buscarFatoPorChave(db, dados.chave_idempotencia);
  if (existente) return existente;

  executar(
    db,
    `INSERT INTO fatos_financeiros (entidade_id, tipo_origem, origem_id, data_fato, valor, chave_idempotencia)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.entidade_id, dados.tipo_origem, dados.origem_id, dados.data_fato, dados.valor, dados.chave_idempotencia],
  );

  const criado = buscarFatoPorChave(db, dados.chave_idempotencia);
  if (!criado) {
    throw new Error(`Fato '${dados.chave_idempotencia}' foi inserido mas não pôde ser lido de volta.`);
  }
  return criado;
}

/** Registra (de forma idempotente) o fato canônico de uma transação bancária já classificada.
 * `data_fato` é a data do EXTRATO (`transacoes.data`, quando o dinheiro de fato se moveu) —
 * não `data_competencia`, que é opcional e pode nem existir.
 *
 * AUDITORIA DE CORREÇÃO (esta rodada) — transação estornada/reclassificada vs. excluída:
 * `transacoes` (schema.sql) NÃO tem coluna de status. Uma reclassificação
 * (`reclassificacao/reclassificarTransacao.ts`) faz estorno+relançamento no RAZÃO
 * (`ledger_entries`) mas SEMPRE preserva a linha de `transacoes` intacta (mesmo `id`, `data`,
 * `valor` — só `plano_conta_codigo` muda); o fato aqui registrado continua válido porque
 * `data_fato`/`valor` não mudam. Confirmado, não é um achado.
 *
 * O que de fato pode fazer um `transacoes.id` deixar de existir é `excluirTransacao`/
 * `dividirTransacao` (transacoes/transacaoManual.ts — fora do escopo de arquivos desta
 * tarefa) — um DELETE físico da linha, sem cascata para `fatos_financeiros.origem_id` (que
 * não é FOREIGN KEY, só um INTEGER). Chamar `registrarFatoDoBanco` DEPOIS da exclusão é
 * seguro (lança "não encontrada", não grava nada — ver teste "origem inexistente..." abaixo).
 * O risco real é o INVERSO, fora do alcance desta função: um fato JÁ registrado ANTES da
 * exclusão fica ÓRFÃO (`origem_id` aponta para uma `transacoes` que não existe mais),
 * inclusive qualquer `fatos_financeiros_links` que o referencie — sem nenhuma limpeza
 * automática. LIMITAÇÃO CONHECIDA, documentada aqui em vez de corrigida nesta rodada: uma
 * correção completa exigiria tocar `transacaoManual.ts::excluirTransacao` (fora da lista de
 * arquivos permitidos desta auditoria) para invalidar/reconciliar o fato correspondente (ex:
 * marcar `estado_revisao = 'rejeitado'`) no mesmo DELETE. Qualquer leitor de
 * `fatos_financeiros` que precise de garantia de existência da origem deve fazer o JOIN de
 * volta em `transacoes` explicitamente (como `sugerirLigacoesCompetenciaRecebimento` já faz
 * implicitamente, porque só compara fatos já registrados entre si, nunca revalida a origem). */
export function registrarFatoDoBanco(db: Database, entidadeId: number, transacaoId: number): FatoFinanceiro {
  const transacao = consultar<{ id: number; data: string; valor: number }>(
    db,
    "SELECT id, data, valor FROM transacoes WHERE id = ?",
    [transacaoId],
  )[0];
  if (!transacao) {
    throw new Error(`Transação bancária ${transacaoId} não encontrada.`);
  }

  return registrarFato(db, {
    entidade_id: entidadeId,
    tipo_origem: "banco",
    origem_id: transacao.id,
    data_fato: transacao.data,
    valor: transacao.valor,
    chave_idempotencia: `banco:${transacaoId}`,
  });
}

/** Registra (de forma idempotente) o fato canônico de uma competência de aluguel —
 * `data_fato` = vencimento real da competência (`aluguel_competencias.data_vencimento`),
 * `valor` = `valor_devido`. */
export function registrarFatoDeCompetencia(db: Database, entidadeId: number, competenciaId: number): FatoFinanceiro {
  const competencia = consultar<{ id: number; data_vencimento: string; valor_devido: number }>(
    db,
    "SELECT id, data_vencimento, valor_devido FROM aluguel_competencias WHERE id = ?",
    [competenciaId],
  )[0];
  if (!competencia) {
    throw new Error(`Competência de aluguel ${competenciaId} não encontrada.`);
  }

  return registrarFato(db, {
    entidade_id: entidadeId,
    tipo_origem: "competencia",
    origem_id: competencia.id,
    data_fato: competencia.data_vencimento,
    valor: competencia.valor_devido,
    chave_idempotencia: `competencia:${competenciaId}`,
  });
}

/** Registra (de forma idempotente) o fato canônico de uma conta a pagar — `data_fato` =
 * vencimento (`contas_a_pagar.data_vencimento`), `valor` = `valor`. */
export function registrarFatoDeContaAPagar(db: Database, entidadeId: number, contaAPagarId: number): FatoFinanceiro {
  const contaAPagar = consultar<{ id: number; data_vencimento: string; valor: number }>(
    db,
    "SELECT id, data_vencimento, valor FROM contas_a_pagar WHERE id = ?",
    [contaAPagarId],
  )[0];
  if (!contaAPagar) {
    throw new Error(`Conta a pagar ${contaAPagarId} não encontrada.`);
  }

  return registrarFato(db, {
    entidade_id: entidadeId,
    tipo_origem: "contas_a_pagar",
    origem_id: contaAPagar.id,
    data_fato: contaAPagar.data_vencimento,
    valor: contaAPagar.valor,
    chave_idempotencia: `contas_a_pagar:${contaAPagarId}`,
  });
}

/** Registra (de forma idempotente) o fato canônico de uma despesa de ordem de serviço.
 * `ordens_servico_despesas` ainda não tem módulo de domínio próprio (tabela recém-criada em
 * schema.sql) — leitura por SQL direto, como orientado.
 *
 * `valor` = valor aprovado quando já decidido, senão o valor solicitado (a despesa é um fato
 * financeiro desde a solicitação, mesmo antes da aprovação por alçada).
 * `data_fato` = data da decisão (`decidido_em`) quando existir, senão a data de criação da
 * solicitação (`criado_em`) — ambas colunas DATETIME; usamos só a parte de data. */
export function registrarFatoDeOrdemServico(
  db: Database,
  entidadeId: number,
  ordemServicoDespesaId: number,
): FatoFinanceiro {
  const despesa = consultar<{
    id: number;
    valor_solicitado: number;
    valor_aprovado: number | null;
    criado_em: string;
    decidido_em: string | null;
  }>(
    db,
    "SELECT id, valor_solicitado, valor_aprovado, criado_em, decidido_em FROM ordens_servico_despesas WHERE id = ?",
    [ordemServicoDespesaId],
  )[0];
  if (!despesa) {
    throw new Error(`Despesa de ordem de serviço ${ordemServicoDespesaId} não encontrada.`);
  }

  const valor = despesa.valor_aprovado ?? despesa.valor_solicitado;
  const dataReferencia = despesa.decidido_em ?? despesa.criado_em;

  return registrarFato(db, {
    entidade_id: entidadeId,
    tipo_origem: "ordem_servico",
    origem_id: despesa.id,
    data_fato: dataReferencia.slice(0, 10),
    valor,
    chave_idempotencia: `ordem_servico:${ordemServicoDespesaId}`,
  });
}

function buscarLigacaoExistente(
  db: Database,
  fatoAId: number,
  fatoBId: number,
  tipoRelacao: string,
): LigacaoFatos | null {
  return (
    consultar<LigacaoFatos>(
      db,
      `SELECT * FROM fatos_financeiros_links
       WHERE tipo_relacao = ?
         AND ((fato_a_id = ? AND fato_b_id = ?) OR (fato_a_id = ? AND fato_b_id = ?))`,
      [tipoRelacao, fatoAId, fatoBId, fatoBId, fatoAId],
    )[0] ?? null
  );
}

/** Liga dois fatos que representam o mesmo evento econômico visto por ângulos diferentes.
 * Sempre nasce `status = 'pendente'` — nunca confirma sozinho.
 *
 * Rejeita fato ligado a si mesmo com uma mensagem legível ANTES de tentar o INSERT — o CHECK
 * do banco (`fato_a_id <> fato_b_id`) já pegaria isso, mas com um erro de SQLite genérico,
 * não uma mensagem que faça sentido para quem chama esta função.
 *
 * Idempotente pelo PAR (nas duas ordens, A-B ou B-A) + `tipo_relacao`: religar o mesmo par com
 * o mesmo tipo de relação nunca duplica, só devolve a ligação já existente (qualquer que seja
 * seu status atual — inclusive já confirmada ou rejeitada). */
export function ligarFatos(
  db: Database,
  fatoAId: number,
  fatoBId: number,
  tipoRelacao: string,
): LigacaoFatos {
  if (fatoAId === fatoBId) {
    throw new Error("Não é possível ligar um fato financeiro a si mesmo.");
  }

  const existente = buscarLigacaoExistente(db, fatoAId, fatoBId, tipoRelacao);
  if (existente) return existente;

  executar(
    db,
    `INSERT INTO fatos_financeiros_links (fato_a_id, fato_b_id, tipo_relacao, status)
     VALUES (?, ?, ?, 'pendente')`,
    [fatoAId, fatoBId, tipoRelacao],
  );

  const [criado] = consultar<LigacaoFatos>(db, "SELECT * FROM fatos_financeiros_links WHERE id = last_insert_rowid()");
  if (!criado) {
    throw new Error("Ligação foi inserida mas não pôde ser lida de volta.");
  }
  return criado;
}

function atualizarStatusLigacao(db: Database, linkId: number, status: "confirmado" | "rejeitado"): LigacaoFatos {
  const existente = consultar<LigacaoFatos>(db, "SELECT * FROM fatos_financeiros_links WHERE id = ?", [linkId])[0];
  if (!existente) {
    throw new Error(`Ligação ${linkId} não encontrada.`);
  }

  executar(db, "UPDATE fatos_financeiros_links SET status = ? WHERE id = ?", [status, linkId]);

  const [atualizado] = consultar<LigacaoFatos>(db, "SELECT * FROM fatos_financeiros_links WHERE id = ?", [linkId]);
  return atualizado;
}

/** Confirma uma ligação sugerida/pendente — ação exclusivamente humana. */
export function confirmarLigacao(db: Database, linkId: number): LigacaoFatos {
  return atualizarStatusLigacao(db, linkId, "confirmado");
}

/** Rejeita uma ligação sugerida/pendente — ação exclusivamente humana. */
export function rejeitarLigacao(db: Database, linkId: number): LigacaoFatos {
  return atualizarStatusLigacao(db, linkId, "rejeitado");
}

export interface OpcoesSugestaoCompetenciaRecebimento {
  /** Janela de dias entre o vencimento da competência e a data do fato bancário. Padrão: 10. */
  toleranciaDias?: number;
  /** Diferença máxima aceita entre o valor devido da competência e o valor do fato bancário.
   * Padrão: 0 (exato — respeitada uma folga de meio centavo para arredondamento de ponto
   * flutuante, nunca para casar valores realmente diferentes). */
  toleranciaValor?: number;
}

const TOLERANCIA_DIAS_PADRAO = 10;
const TOLERANCIA_VALOR_PADRAO = 0;
/** Folga técnica contra erro de arredondamento de ponto flutuante em REAL — não amplia a
 * tolerância de negócio (`toleranciaValor`), só evita que 1234.56 - 1234.56 apareça como
 * 0.0000000001 e falhe uma comparação "exata". */
const EPSILON_VALOR = 0.005;

/** Heurística de sugestão: para cada fato de competência ainda pendente de revisão e sem
 * nenhum link CONFIRMADO, procura fatos bancários com valor e data compatíveis (dentro da
 * tolerância) e cria o link `tipo_relacao = 'competencia_recebimento'` — sempre `status =
 * 'pendente'`, nunca confirmado automaticamente (regra de ouro do sistema: correspondência
 * automática sempre exige confirmação humana, mesmo padrão de `documento_transacoes`).
 *
 * Idempotente: se o par (competência, fato bancário) já tiver uma ligação deste tipo (em
 * qualquer status — pendente, confirmada ou já rejeitada por um humano), não sugere de novo;
 * só entram no retorno as ligações efetivamente criadas nesta chamada.
 *
 * AUDITORIA DE CORREÇÃO (esta rodada) — AMBIGUIDADE "recebido em dobro": um fato bancário
 * dentro da tolerância de valor/data de DUAS competências diferentes (ex: dois aluguéis de
 * mesmo valor com vencimentos próximos) não pode ficar disponível para ser sugerido — e
 * depois confirmado por um humano — para as duas ao mesmo tempo; isso criaria a ILUSÃO de
 * dois recebimentos quando só um dinheiro entrou. O filtro abaixo (`NOT EXISTS` sobre
 * `fatos_financeiros_links` com status 'pendente' OU 'confirmado') exclui da busca por
 * candidato bancário qualquer fato que já esteja "reservado" por outra sugestão ainda viva —
 * uma vez que um humano REJEITE esse link, o fato bancário volta a ficar disponível para ser
 * sugerido a outra competência (status 'rejeitado' não conta como reserva). Isso NÃO cobre o
 * caso simétrico de uma mesma competência já ter uma sugestão PENDENTE (não confirmada) para
 * um banco e ganhar uma segunda sugestão pendente para um banco diferente na mesma chamada —
 * mostrar duas candidatas pendentes para uma pessoa escolher entre elas é o comportamento
 * pretendido da heurística (ela nunca confirma sozinha); o risco real está em confirmar as
 * duas, que é uma decisão humana fora do alcance desta função. */
export function sugerirLigacoesCompetenciaRecebimento(
  db: Database,
  entidadeId: number,
  opcoes: OpcoesSugestaoCompetenciaRecebimento = {},
): LigacaoFatos[] {
  const toleranciaDias = opcoes.toleranciaDias ?? TOLERANCIA_DIAS_PADRAO;
  const toleranciaValor = (opcoes.toleranciaValor ?? TOLERANCIA_VALOR_PADRAO) + EPSILON_VALOR;

  const competenciasPendentes = consultar<{
    fato_id: number;
    data_vencimento: string;
    valor_devido: number;
  }>(
    db,
    `SELECT f.id AS fato_id, ac.data_vencimento AS data_vencimento, ac.valor_devido AS valor_devido
     FROM fatos_financeiros f
     JOIN aluguel_competencias ac ON ac.id = f.origem_id
     WHERE f.entidade_id = ?
       AND f.tipo_origem = 'competencia'
       AND f.estado_revisao = 'pendente'
       AND NOT EXISTS (
         SELECT 1 FROM fatos_financeiros_links l
         WHERE l.status = 'confirmado' AND (l.fato_a_id = f.id OR l.fato_b_id = f.id)
       )`,
    [entidadeId],
  );

  const sugestoesCriadas: LigacaoFatos[] = [];

  for (const competencia of competenciasPendentes) {
    const candidatosBanco = consultar<{ id: number }>(
      db,
      `SELECT id FROM fatos_financeiros f
       WHERE f.entidade_id = ?
         AND f.tipo_origem = 'banco'
         AND ABS(f.valor - ?) <= ?
         AND ABS(julianday(f.data_fato) - julianday(?)) <= ?
         AND NOT EXISTS (
           SELECT 1 FROM fatos_financeiros_links l
           WHERE l.tipo_relacao = 'competencia_recebimento'
             AND l.status IN ('pendente', 'confirmado')
             AND (l.fato_a_id = f.id OR l.fato_b_id = f.id)
         )`,
      [entidadeId, competencia.valor_devido, toleranciaValor, competencia.data_vencimento, toleranciaDias],
    );

    for (const candidato of candidatosBanco) {
      const jaExiste = buscarLigacaoExistente(db, competencia.fato_id, candidato.id, "competencia_recebimento");
      if (jaExiste) continue;

      const novaLigacao = ligarFatos(db, competencia.fato_id, candidato.id, "competencia_recebimento");
      sugestoesCriadas.push(novaLigacao);
    }
  }

  return sugestoesCriadas;
}

export interface RelatorioCoberturaFatos {
  total_fatos: number;
  por_tipo_origem: Record<string, number>;
  por_estado_revisao: Record<string, number>;
  /** Quantos fatos de cada tipo (competência, contas a pagar) ainda não têm NENHUM link
   * confirmado — o "achado" de cobertura: um valor a receber/pagar reconstituído que ainda
   * não foi cruzado com nenhum outro ângulo do mesmo evento econômico. */
  sem_cobertura_confirmada: {
    competencia: number;
    contas_a_pagar: number;
  };
}

/** Relatório de cobertura do hub: quantos fatos existem por origem e por estado de revisão,
 * e quantos fatos de competência/contas a pagar ainda não têm nenhuma ligação confirmada —
 * mesmo espírito do painel de pendências (`painelPendencias.ts`): agrega o que já está
 * gravado, sem introduzir nenhuma regra de detecção nova. */
export function relatorioCoberturaFatos(db: Database, entidadeId: number): RelatorioCoberturaFatos {
  const porTipo = consultar<{ tipo_origem: string; total: number }>(
    db,
    "SELECT tipo_origem, COUNT(*) AS total FROM fatos_financeiros WHERE entidade_id = ? GROUP BY tipo_origem",
    [entidadeId],
  );
  const porEstado = consultar<{ estado_revisao: string; total: number }>(
    db,
    "SELECT estado_revisao, COUNT(*) AS total FROM fatos_financeiros WHERE entidade_id = ? GROUP BY estado_revisao",
    [entidadeId],
  );

  const por_tipo_origem: Record<string, number> = {};
  for (const linha of porTipo) por_tipo_origem[linha.tipo_origem] = linha.total;

  const por_estado_revisao: Record<string, number> = {};
  for (const linha of porEstado) por_estado_revisao[linha.estado_revisao] = linha.total;

  const total_fatos = Object.values(por_tipo_origem).reduce((acc, n) => acc + n, 0);

  const semCoberturaPara = (tipoOrigem: "competencia" | "contas_a_pagar"): number =>
    consultar<{ total: number }>(
      db,
      `SELECT COUNT(*) AS total
       FROM fatos_financeiros f
       WHERE f.entidade_id = ?
         AND f.tipo_origem = ?
         AND NOT EXISTS (
           SELECT 1 FROM fatos_financeiros_links l
           WHERE l.status = 'confirmado' AND (l.fato_a_id = f.id OR l.fato_b_id = f.id)
         )`,
      [entidadeId, tipoOrigem],
    )[0]?.total ?? 0;

  return {
    total_fatos,
    por_tipo_origem,
    por_estado_revisao,
    sem_cobertura_confirmada: {
      competencia: semCoberturaPara("competencia"),
      contas_a_pagar: semCoberturaPara("contas_a_pagar"),
    },
  };
}
