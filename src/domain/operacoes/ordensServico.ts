/** Ordens de serviço: fluxo de manutenção/reparo com trilha de eventos append-only e
 * aprovação de despesa por alçada (quórum) — ver bloco "ORDENS DE SERVIÇO" em
 * `contabilidade-reconstituicao/schema.sql` para o desenho das 4 tabelas usadas aqui
 * (`ordens_servico`, `ordens_servico_eventos`, `ordens_servico_despesas`,
 * `avaliacoes_prestador`). Este módulo só opera sobre elas — nenhuma tabela nova, nenhuma
 * mudança de schema.
 *
 * DECISÕES DE DESIGN tomadas por conta própria (documentadas aqui porque o schema não as
 * força sozinho):
 *
 * 1) `criarOrdemServico` NUNCA atribui prestador na criação — `prestador_id` só é
 *    preenchido por `atribuirPrestador`, exatamente como o comentário da coluna em
 *    schema.sql diz ("NULL até atribuir"). Por isso nenhum evento inicial é gravado ao
 *    criar (nasce sempre 'aberta', sem trilha de eventos): a ORDEM nasce, o EVENTO só
 *    existe a partir da primeira transição de estado real (atribuição, início, etc.). Uma
 *    OS criada e nunca atribuída não tem por que ter um evento "fantasma".
 *
 * 2) `atribuirPrestador` é a ÚNICA rota para o evento `tipo_evento = 'atribuida'` — ela
 *    faz o UPDATE de `prestador_id`/`status` E insere o evento atomicamente, porque
 *    atribuir é inseparável de "a quem". `registrarEventoOS` (a máquina de estados
 *    genérica) por isso RECUSA explicitamente `tipo_evento = 'atribuida'`, apontando para
 *    `atribuirPrestador` — evita a inconsistência de um evento "atribuida" na trilha sem
 *    `prestador_id` correspondente ter sido de fato gravado.
 *
 * 3) Máquina de estados de `registrarEventoOS` (única fonte de verdade sobre transição
 *    válida, ver `PROXIMO_STATUS` abaixo):
 *      aberta       --(atribuir, via atribuirPrestador)--> atribuida
 *      atribuida    --aceita----> atribuida (só confirma aceite, não muda status)
 *      atribuida    --iniciada--> em_andamento
 *      em_andamento --progresso-> em_andamento (só registra andamento, não muda status)
 *      em_andamento --concluida-> concluida   (encerrado_em preenchido)
 *      em_andamento --impedida--> impedida
 *      {aberta, atribuida, em_andamento, impedida} --cancelada--> cancelada (encerrado_em preenchido)
 *      impedida     --reaberta--> em_andamento (retoma o trabalho em curso; sempre tem prestador)
 *      cancelada    --reaberta--> atribuida (se já tinha prestador) ou aberta (se não tinha);
 *                                  limpa encerrado_em (a ordem deixa de estar encerrada)
 *    Qualquer combinação fora desta tabela é rejeitada com mensagem explicando o status
 *    atual e o que seria necessário.
 *
 * 4) `solicitarDespesaOS` já preenche `aprovador_1` com o solicitante (quem pede a despesa
 *    também conta como o primeiro papel de aprovação — mesmo espírito do quórum duplo do
 *    ERP de referência citado no schema: exige uma SEGUNDA pessoa distinta, não uma
 *    aprovação do zero por dois desconhecidos). Isso é o que faz
 *    `aprovarDespesaOS` abaixo do limite bastar com UMA chamada (o solicitante já ocupa
 *    aprovador_1; a chamada de aprovação apenas confirma) e, no limite duplo, a primeira
 *    chamada REAL de `aprovarDespesaOS` já ser a que precisa vir de alguém diferente do
 *    solicitante.
 *
 * 5) `LIMITE_APROVACAO_DUPLA` é um valor de EXEMPLO (R$ 1.000,00), configurável — nenhuma
 *    tabela de configuração existe ainda para isso; quando existir, troque esta constante
 *    por uma leitura de lá.
 *
 * 6) `rejeitarDespesaOS` recebe `motivo`, mas `ordens_servico_despesas` não tem coluna de
 *    texto para guardá-lo (só `status`/`decidido_em`). Para não perder o motivo (mesmo
 *    espírito de nunca descartar dado do domínio), ele é gravado como um evento
 *    `tipo_evento = 'progresso'` em `ordens_servico_eventos` da ordem dona da despesa, com
 *    `detalhes` explicando a rejeição — a trilha de eventos da OS é o lugar natural para
 *    isso, já que é append-only e serve exatamente para registrar o que aconteceu.
 *
 * 7) `contas_a_pagar.plano_conta_codigo` usa `'2.1.04'` ("Prestadores de serviço" — ver
 *    `src/domain/planoDeContas.ts`), `data_vencimento` = hoje (a despesa já foi aprovada,
 *    não há prazo de carência conhecido) e `fornecedor_nome` = nome do prestador vinculado
 *    à ordem de serviço quando houver, senão um texto genérico
 *    ("Prestador de serviço não identificado (OS #<id>)"). A geração reusa
 *    `registrarContaAPagar` (contasAPagar.ts) em vez de fazer INSERT direto, para herdar
 *    as mesmas validações e não duplicar lógica.
 *
 * 8) Toda operação inválida é rejeitada via `throw new Error(mensagem)` — nunca por um
 *    retorno `{ sucesso: false, ... }` a ser checado pelo chamador. Segue o mesmo padrão de
 *    `radAvaliacao.ts` (módulo irmão criado na mesma rodada): quem chama uma função deste
 *    domínio pode assumir que, se ela retornou normalmente, a operação foi bem-sucedida — o
 *    caminho de sucesso devolve diretamente o valor útil (o id criado, o status resultante,
 *    ou nada, quando o chamador já sabe tudo que precisa saber).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarContaAPagar } from "../contasAPagar/contasAPagar";

export type PrioridadeOS = "baixa" | "normal" | "alta" | "urgente";
export type StatusOS = "aberta" | "atribuida" | "em_andamento" | "concluida" | "impedida" | "cancelada";
export type TipoEventoOS =
  | "atribuida"
  | "aceita"
  | "iniciada"
  | "progresso"
  | "concluida"
  | "impedida"
  | "cancelada"
  | "reaberta";
export type StatusDespesaOS = "pendente" | "aprovada" | "rejeitada";

export interface OrdemServico {
  id: number;
  imovel_id: number;
  prestador_id: number | null;
  origem_vistoria_id: number | null;
  titulo: string;
  descricao: string | null;
  prioridade: PrioridadeOS;
  status: StatusOS;
  sla_data_limite: string | null;
  criado_em: string;
  encerrado_em: string | null;
}

export interface EventoOS {
  id: number;
  ordem_servico_id: number;
  tipo_evento: TipoEventoOS;
  ator: string;
  detalhes: string | null;
  criado_em: string;
}

export interface DespesaOS {
  id: number;
  ordem_servico_id: number;
  valor_solicitado: number;
  valor_aprovado: number | null;
  status: StatusDespesaOS;
  aprovador_1: string | null;
  aprovador_2: string | null;
  contas_a_pagar_id: number | null;
  criado_em: string;
  decidido_em: string | null;
}

export interface AvaliacaoPrestador {
  id: number;
  prestador_id: number;
  ordem_servico_id: number;
  nota: number;
  comentario: string | null;
  criado_em: string;
}

/** Valor de exemplo (R$ 1.000,00) acima do qual uma despesa de OS exige DOIS aprovadores
 * distintos — configurável (ver decisão de design nº 5 no cabeçalho do arquivo). */
export const LIMITE_APROVACAO_DUPLA = 1000;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function agora(): string {
  return new Date().toISOString();
}

function imovelExiste(db: Database, imovel_id: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [imovel_id]).length > 0;
}

function prestadorExiste(db: Database, prestador_id: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM prestadores WHERE id = ?", [prestador_id]).length > 0;
}

function obterOrdemBruta(db: Database, id: number): OrdemServico | null {
  return consultar<OrdemServico>(db, "SELECT * FROM ordens_servico WHERE id = ?", [id])[0] ?? null;
}

function obterDespesaBruta(db: Database, id: number): DespesaOS | null {
  return consultar<DespesaOS>(db, "SELECT * FROM ordens_servico_despesas WHERE id = ?", [id])[0] ?? null;
}

function inserirEvento(db: Database, ordem_servico_id: number, tipo_evento: TipoEventoOS, ator: string, detalhes?: string | null): void {
  executar(
    db,
    `INSERT INTO ordens_servico_eventos (ordem_servico_id, tipo_evento, ator, detalhes, criado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [ordem_servico_id, tipo_evento, ator, detalhes ?? null, agora()],
  );
}

// ============================================================================
// CRIAÇÃO
// ============================================================================

export interface NovaOrdemServico {
  imovelId: number;
  titulo: string;
  descricao?: string;
  prioridade?: PrioridadeOS;
  slaDataLimite?: string;
  origemVistoriaId?: number;
}

/** Cria uma ordem de serviço — nasce sempre 'aberta', sem prestador atribuído e sem
 * evento inicial (ver decisão de design nº 1 no cabeçalho do arquivo). Atribuir prestador
 * é sempre um passo separado, via `atribuirPrestador`. Retorna o id da ordem criada; lança
 * se os dados forem inválidos. */
export function criarOrdemServico(db: Database, dados: NovaOrdemServico): number {
  if (!imovelExiste(db, dados.imovelId)) {
    throw new Error(`Imóvel ${dados.imovelId} não encontrado.`);
  }
  if (!dados.titulo || !dados.titulo.trim()) {
    throw new Error("Informe o título da ordem de serviço.");
  }
  if (dados.origemVistoriaId !== undefined) {
    const [vistoria] = consultar<{ id: number }>(db, "SELECT id FROM vistorias WHERE id = ?", [dados.origemVistoriaId]);
    if (!vistoria) throw new Error(`Vistoria ${dados.origemVistoriaId} não encontrada.`);
  }

  executar(
    db,
    `INSERT INTO ordens_servico (imovel_id, origem_vistoria_id, titulo, descricao, prioridade, status, sla_data_limite, criado_em)
     VALUES (?, ?, ?, ?, ?, 'aberta', ?, ?)`,
    [
      dados.imovelId,
      dados.origemVistoriaId ?? null,
      dados.titulo.trim(),
      dados.descricao?.trim() || null,
      dados.prioridade ?? "normal",
      dados.slaDataLimite ?? null,
      agora(),
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

// ============================================================================
// ATRIBUIÇÃO
// ============================================================================

const STATUS_TERMINAIS: StatusOS[] = ["concluida", "cancelada"];

/** Atribui (ou reatribui) um prestador à ordem — UPDATE de `prestador_id` + `status =
 * 'atribuida'`, com o evento correspondente gravado atomicamente (ver decisão de design
 * nº 2). Recusa ordens já encerradas ('concluida'/'cancelada'): reatribuir uma ordem
 * encerrada não faz sentido — reabra primeiro (`registrarEventoOS` com `'reaberta'`). */
export function atribuirPrestador(db: Database, ordemServicoId: number, prestadorId: number, ator: string): void {
  const ordem = obterOrdemBruta(db, ordemServicoId);
  if (!ordem) throw new Error(`Ordem de serviço ${ordemServicoId} não encontrada.`);
  if (STATUS_TERMINAIS.includes(ordem.status)) {
    throw new Error(
      `Ordem de serviço já está '${ordem.status}' — não pode receber atribuição de prestador. Reabra a ordem primeiro, se for o caso.`,
    );
  }
  if (!prestadorExiste(db, prestadorId)) {
    throw new Error(`Prestador ${prestadorId} não encontrado.`);
  }
  if (!ator || !ator.trim()) {
    throw new Error("Informe o ator responsável pela atribuição.");
  }

  executar(db, "UPDATE ordens_servico SET prestador_id = ?, status = 'atribuida' WHERE id = ?", [
    prestadorId,
    ordemServicoId,
  ]);
  inserirEvento(db, ordemServicoId, "atribuida", ator.trim(), `Prestador #${prestadorId} atribuído.`);
}

// ============================================================================
// TRANSIÇÕES DE ESTADO (via eventos)
// ============================================================================

/** Resultado de uma transição válida: novo status e se a ordem passa a estar encerrada
 * (preenche `encerrado_em`) ou reaberta (limpa `encerrado_em`). `null` = combinação
 * inválida para o status atual. */
function calcularTransicao(
  tipoEvento: Exclude<TipoEventoOS, "atribuida">,
  statusAtual: StatusOS,
  temPrestador: boolean,
): { novoStatus: StatusOS; encerra: boolean; reabre: boolean } | null {
  switch (tipoEvento) {
    case "aceita":
      return statusAtual === "atribuida" ? { novoStatus: statusAtual, encerra: false, reabre: false } : null;
    case "iniciada":
      return statusAtual === "atribuida" ? { novoStatus: "em_andamento", encerra: false, reabre: false } : null;
    case "progresso":
      return statusAtual === "em_andamento" ? { novoStatus: statusAtual, encerra: false, reabre: false } : null;
    case "concluida":
      return statusAtual === "em_andamento" ? { novoStatus: "concluida", encerra: true, reabre: false } : null;
    case "impedida":
      return statusAtual === "em_andamento" ? { novoStatus: "impedida", encerra: false, reabre: false } : null;
    case "cancelada":
      return ["aberta", "atribuida", "em_andamento", "impedida"].includes(statusAtual)
        ? { novoStatus: "cancelada", encerra: true, reabre: false }
        : null;
    case "reaberta":
      if (statusAtual === "impedida") return { novoStatus: "em_andamento", encerra: false, reabre: true };
      if (statusAtual === "cancelada") {
        return { novoStatus: temPrestador ? "atribuida" : "aberta", encerra: false, reabre: true };
      }
      return null;
    default:
      return null;
  }
}

/** Registra um evento de trilha e atualiza `ordens_servico.status` conforme a máquina de
 * estados (ver decisão de design nº 3). Rejeita `tipo_evento = 'atribuida'` (use
 * `atribuirPrestador`) e qualquer transição fora da tabela permitida — nesses casos nada é
 * gravado (nem o evento, nem o status), a chamada é toda-ou-nada. Retorna o novo status da
 * ordem (única informação que o chamador não tinha de antemão — é calculada pela máquina
 * de estados, não escolhida por ele). */
export function registrarEventoOS(
  db: Database,
  ordemServicoId: number,
  tipoEvento: TipoEventoOS,
  ator: string,
  detalhes?: string,
): StatusOS {
  if (tipoEvento === "atribuida") {
    throw new Error("Use atribuirPrestador() para o evento 'atribuida' — ele também define o prestador.");
  }
  const ordem = obterOrdemBruta(db, ordemServicoId);
  if (!ordem) throw new Error(`Ordem de serviço ${ordemServicoId} não encontrada.`);
  if (!ator || !ator.trim()) throw new Error("Informe o ator responsável pelo evento.");

  const transicao = calcularTransicao(tipoEvento, ordem.status, ordem.prestador_id !== null);
  if (!transicao) {
    throw new Error(
      `Transição inválida: não é possível registrar o evento '${tipoEvento}' com a ordem no status '${ordem.status}'.`,
    );
  }

  if (transicao.novoStatus !== ordem.status || transicao.encerra || transicao.reabre) {
    executar(
      db,
      "UPDATE ordens_servico SET status = ?, encerrado_em = ? WHERE id = ?",
      [transicao.novoStatus, transicao.encerra ? agora() : null, ordemServicoId],
    );
  }
  inserirEvento(db, ordemServicoId, tipoEvento, ator.trim(), detalhes);
  return transicao.novoStatus;
}

// ============================================================================
// DESPESAS DA OS (aprovação por alçada / quórum)
// ============================================================================

/** Solicita uma despesa para a ordem — nasce 'pendente' com `aprovador_1` já preenchido
 * pelo solicitante (ver decisão de design nº 4). Retorna o id da despesa criada. */
export function solicitarDespesaOS(
  db: Database,
  ordemServicoId: number,
  valorSolicitado: number,
  aprovador1: string,
): number {
  const ordem = obterOrdemBruta(db, ordemServicoId);
  if (!ordem) throw new Error(`Ordem de serviço ${ordemServicoId} não encontrada.`);
  if (!(valorSolicitado > 0)) {
    throw new Error("Informe um valor solicitado positivo.");
  }
  if (!aprovador1 || !aprovador1.trim()) {
    throw new Error("Informe o solicitante/primeiro aprovador.");
  }

  executar(
    db,
    `INSERT INTO ordens_servico_despesas (ordem_servico_id, valor_solicitado, status, aprovador_1, criado_em)
     VALUES (?, ?, 'pendente', ?, ?)`,
    [ordemServicoId, valorSolicitado, aprovador1.trim(), agora()],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

/** Gera a `contas_a_pagar` correspondente a uma despesa de OS aprovada — idempotente: só
 * chame quando `despesa.contas_a_pagar_id` ainda for `null` (o chamador em
 * `aprovarDespesaOS` garante isso). Fornecedor = nome do prestador da ordem, se houver
 * (ver decisão de design nº 7). */
function gerarContaAPagarDaDespesa(db: Database, despesa: DespesaOS, ordem: OrdemServico, valorAprovado: number): number | null {
  let fornecedor_nome = `Prestador de serviço não identificado (OS #${ordem.id})`;
  if (ordem.prestador_id !== null) {
    const [prestador] = consultar<{ nome: string }>(db, "SELECT nome FROM prestadores WHERE id = ?", [ordem.prestador_id]);
    if (prestador?.nome) fornecedor_nome = prestador.nome;
  }

  const [entidade] = consultar<{ id: number }>(db, "SELECT id FROM entidades_legais ORDER BY id ASC LIMIT 1");
  if (!entidade) return null; // sem entidade titular cadastrada — não há como gerar título financeiro

  return registrarContaAPagar(db, {
    entidade_id: entidade.id,
    fornecedor_nome,
    descricao: `Despesa aprovada da OS #${ordem.id} (despesa #${despesa.id})`,
    valor: valorAprovado,
    data_vencimento: hoje(),
    plano_conta_codigo: "2.1.04", // "Prestadores de serviço" — ver planoDeContas.ts
    imovel_id: ordem.imovel_id,
  });
}

/** Resultado útil de uma chamada de `aprovarDespesaOS` — o status resultante da despesa
 * (`'pendente'` quando ainda aguarda um segundo aprovador no quórum duplo, `'aprovada'`
 * quando já foi finalizada) e o id da `contas_a_pagar` gerada, quando a despesa foi
 * finalizada (`null` enquanto pendente, ou se não houver entidade legal cadastrada para
 * gerar o título — ver `gerarContaAPagarDaDespesa`). */
export interface ResultadoAprovacaoDespesaOS {
  status: StatusDespesaOS;
  contasAPagarId: number | null;
}

/** Aprova uma despesa de OS — regra de quórum (ver decisão de design nº 4-5 e comentário
 * de `ordens_servico_despesas` em schema.sql):
 *   - valor < LIMITE_APROVACAO_DUPLA: um único aprovador libera (preenche `aprovador_1` se
 *     ainda vazio; senão apenas confirma) e já gera `contas_a_pagar`.
 *   - valor >= LIMITE_APROVACAO_DUPLA: exige dois aprovadores DIFERENTES. Primeira
 *     chamada preenche `aprovador_1` (segue 'pendente'). Segunda chamada, com um
 *     `aprovador` diferente de `aprovador_1`, preenche `aprovador_2`, aprova e gera
 *     `contas_a_pagar`. A mesma pessoa tentando ocupar os dois papéis é recusada
 *     (autoaprovação). */
export function aprovarDespesaOS(db: Database, despesaId: number, aprovador: string, valorAprovado?: number): ResultadoAprovacaoDespesaOS {
  const despesa = obterDespesaBruta(db, despesaId);
  if (!despesa) throw new Error(`Despesa ${despesaId} não encontrada.`);
  if (despesa.status !== "pendente") {
    throw new Error(`Despesa já está '${despesa.status}' — não pode ser aprovada novamente.`);
  }
  if (!aprovador || !aprovador.trim()) {
    throw new Error("Informe o aprovador.");
  }
  const ator = aprovador.trim();
  const valor = valorAprovado ?? despesa.valor_solicitado;
  if (!(valor > 0)) throw new Error("Valor aprovado deve ser positivo.");

  const ordem = obterOrdemBruta(db, despesa.ordem_servico_id);
  if (!ordem) throw new Error(`Ordem de serviço ${despesa.ordem_servico_id} não encontrada.`);

  const exigeQuorumDuplo = valor >= LIMITE_APROVACAO_DUPLA;

  if (!exigeQuorumDuplo) {
    // Abaixo do limite: uma única aprovação libera, preenchendo aprovador_1 quando ainda
    // vazio ou apenas confirmando quando já preenchido (ver decisão de design nº 4).
    const aprovador1Final = despesa.aprovador_1 ?? ator;
    const contasAPagarId = finalizarAprovacao(db, despesa, ordem, aprovador1Final, despesa.aprovador_2, valor);
    return { status: "aprovada", contasAPagarId };
  }

  // Quórum duplo (>= LIMITE_APROVACAO_DUPLA).
  if (despesa.aprovador_1 === null) {
    executar(db, "UPDATE ordens_servico_despesas SET aprovador_1 = ? WHERE id = ?", [ator, despesaId]);
    return { status: "pendente", contasAPagarId: null };
  }
  if (despesa.aprovador_1 === ator) {
    throw new Error("Autoaprovação não permitida: acima do limite de alçada, o segundo aprovador precisa ser diferente do primeiro.");
  }
  const contasAPagarId = finalizarAprovacao(db, despesa, ordem, despesa.aprovador_1, ator, valor);
  return { status: "aprovada", contasAPagarId };
}

/** Finaliza a aprovação de uma despesa (status -> 'aprovada', gera `contas_a_pagar` se
 * ainda não houver uma vinculada) e retorna o id da conta a pagar gerada (`null` se já
 * existia uma vinculada e permaneceu a mesma, ou se não foi possível gerar — ver
 * `gerarContaAPagarDaDespesa`). */
function finalizarAprovacao(
  db: Database,
  despesa: DespesaOS,
  ordem: OrdemServico,
  aprovador1: string,
  aprovador2: string | null,
  valorAprovado: number,
): number | null {
  let contasAPagarId = despesa.contas_a_pagar_id;
  if (contasAPagarId === null) {
    // Idempotência: só gera contas_a_pagar quando a despesa ainda não tinha uma vinculada
    // (ver decisão de design nº 7 e comentário de `contas_a_pagar_id` em schema.sql).
    contasAPagarId = gerarContaAPagarDaDespesa(db, despesa, ordem, valorAprovado);
  }

  executar(
    db,
    `UPDATE ordens_servico_despesas
     SET status = 'aprovada', valor_aprovado = ?, aprovador_1 = ?, aprovador_2 = ?, contas_a_pagar_id = ?, decidido_em = ?
     WHERE id = ?`,
    [valorAprovado, aprovador1, aprovador2, contasAPagarId, agora(), despesa.id],
  );
  return contasAPagarId;
}

/** Rejeita uma despesa pendente — nunca gera `contas_a_pagar`. O motivo é gravado como
 * evento na trilha da ordem dona da despesa (ver decisão de design nº 6, já que a tabela
 * não tem coluna de texto própria). */
export function rejeitarDespesaOS(db: Database, despesaId: number, motivo: string): void {
  const despesa = obterDespesaBruta(db, despesaId);
  if (!despesa) throw new Error(`Despesa ${despesaId} não encontrada.`);
  if (despesa.status !== "pendente") {
    throw new Error(`Despesa já está '${despesa.status}' — não pode ser rejeitada.`);
  }
  if (!motivo || !motivo.trim()) {
    throw new Error("Informe o motivo da rejeição.");
  }

  executar(db, "UPDATE ordens_servico_despesas SET status = 'rejeitada', decidido_em = ? WHERE id = ?", [
    agora(),
    despesaId,
  ]);
  inserirEvento(
    db,
    despesa.ordem_servico_id,
    "progresso",
    "sistema-despesa",
    `Despesa #${despesaId} (R$ ${despesa.valor_solicitado.toFixed(2)}) rejeitada: ${motivo.trim()}`,
  );
}

// ============================================================================
// AVALIAÇÃO DO PRESTADOR
// ============================================================================

/** Avalia o prestador de uma ordem já concluída — recusa se a ordem não estiver
 * 'concluida' e se o prestador informado não for o mesmo atribuído à ordem (não faz
 * sentido avaliar quem não executou o serviço). `UNIQUE(ordem_servico_id)` no schema
 * impede duplicar; aqui a duplicidade é verificada antes, para lançar uma mensagem clara
 * em vez de deixar o INSERT estourar a constraint. Retorna o id da avaliação criada. */
export function avaliarPrestador(
  db: Database,
  ordemServicoId: number,
  prestadorId: number,
  nota: number,
  comentario?: string,
): number {
  const ordem = obterOrdemBruta(db, ordemServicoId);
  if (!ordem) throw new Error(`Ordem de serviço ${ordemServicoId} não encontrada.`);
  if (ordem.status !== "concluida") {
    throw new Error(`Ordem de serviço ainda não está 'concluida' (está '${ordem.status}') — avaliação recusada.`);
  }
  if (ordem.prestador_id !== prestadorId) {
    throw new Error(
      `Prestador ${prestadorId} não é o prestador atribuído a esta ordem (é o #${ordem.prestador_id ?? "nenhum"}).`,
    );
  }
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    throw new Error("Nota deve ser um inteiro entre 1 e 5.");
  }
  const jaAvaliada = consultar<{ id: number }>(db, "SELECT id FROM avaliacoes_prestador WHERE ordem_servico_id = ?", [
    ordemServicoId,
  ]);
  if (jaAvaliada.length > 0) {
    throw new Error("Esta ordem de serviço já foi avaliada.");
  }

  executar(
    db,
    `INSERT INTO avaliacoes_prestador (prestador_id, ordem_servico_id, nota, comentario, criado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [prestadorId, ordemServicoId, nota, comentario?.trim() || null, agora()],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

// ============================================================================
// LEITURA
// ============================================================================

export interface FiltrosOrdemServico {
  imovelId?: number;
  status?: StatusOS;
  prestadorId?: number;
}

/** Lista ordens de serviço, mais recente primeiro, com filtros opcionais. */
export function listarOrdensServico(db: Database, filtros: FiltrosOrdemServico = {}): OrdemServico[] {
  let sql = "SELECT * FROM ordens_servico WHERE 1 = 1";
  const params: (string | number)[] = [];
  if (filtros.imovelId !== undefined) {
    sql += " AND imovel_id = ?";
    params.push(filtros.imovelId);
  }
  if (filtros.status !== undefined) {
    sql += " AND status = ?";
    params.push(filtros.status);
  }
  if (filtros.prestadorId !== undefined) {
    sql += " AND prestador_id = ?";
    params.push(filtros.prestadorId);
  }
  sql += " ORDER BY criado_em DESC, id DESC";
  return consultar<OrdemServico>(db, sql, params);
}

export interface OrdemServicoComHistorico {
  ordem: OrdemServico;
  eventos: EventoOS[];
  despesas: DespesaOS[];
  avaliacao: AvaliacaoPrestador | null;
}

/** Ordem de serviço + trilha de eventos + despesas + avaliação (quando houver) — leitura
 * agregada para uma futura tela de detalhe da OS. */
export function obterOrdemServicoComHistorico(db: Database, ordemServicoId: number): OrdemServicoComHistorico | null {
  const ordem = obterOrdemBruta(db, ordemServicoId);
  if (!ordem) return null;

  const eventos = consultar<EventoOS>(
    db,
    "SELECT * FROM ordens_servico_eventos WHERE ordem_servico_id = ? ORDER BY criado_em ASC, id ASC",
    [ordemServicoId],
  );
  const despesas = consultar<DespesaOS>(
    db,
    "SELECT * FROM ordens_servico_despesas WHERE ordem_servico_id = ? ORDER BY criado_em ASC, id ASC",
    [ordemServicoId],
  );
  const avaliacao =
    consultar<AvaliacaoPrestador>(db, "SELECT * FROM avaliacoes_prestador WHERE ordem_servico_id = ?", [ordemServicoId])[0] ??
    null;

  return { ordem, eventos, despesas, avaliacao };
}
