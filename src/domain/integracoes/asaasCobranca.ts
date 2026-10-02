/**
 * Emissão de boleto/PIX via Asaas para aluguel de inquilino (`aluguel_competencias`) e
 * honorário da advocacia (`honorarios_advocaticios`) — ver as tabelas `cobrancas_asaas` e
 * `asaas_clientes_externos` em contabilidade-reconstituicao/schema.sql para o desenho
 * completo e a justificativa de cada campo.
 *
 * Este módulo não faz nenhuma chamada de rede por conta própria — tudo que toca a Asaas
 * passa por `AsaasApiClient`, injetado por quem chama (produção: um cliente HTTP fino que
 * chama o PRÓPRIO servidor, com o Bearer token da sessão — ver `server/src/asaas.ts` e
 * `server/src/routes/asaas-routes.ts`; testes: um fake em memória). Isso é o que torna as
 * funções abaixo testáveis sem rede e, mais importante, é o que garante que
 * `ASAAS_API_KEY` nunca precisa existir no navegador — só o servidor a lê.
 *
 * MULTA/JUROS DE ATRASO: `multaPercentual`/`jurosPercentualMensal` passados aqui vão para
 * a Asaas na criação da cobrança (campos `fine`/`interest`) — é a PRÓPRIA Asaas quem
 * calcula e cobra o atraso automaticamente. O que fica gravado em
 * `cobrancas_asaas.multa_percentual`/`juros_percentual_mensal` é só um ESPELHO dessa
 * configuração, nunca a fonte de cálculo para outro módulo — a lógica de inadimplência já
 * existente neste sistema (`integracao-inadimplencia.ts`) continua inteiramente
 * independente disto.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { aplicarEventoReembolsoWebhook } from "./asaasReembolsos";

export type StatusCobrancaAsaas = "pendente" | "pago" | "atrasado" | "cancelado";
export type TipoCobranca = "boleto" | "pix";
export type OrigemCobranca = "aluguel_competencia" | "honorario_advocaticio";
type ReferenciaClienteAsaas = "contrato_locacao" | "entidade_legal";

export interface CobrancaAsaasLocal {
  id: number;
  origemTipo: OrigemCobranca;
  origemId: number;
  asaasCustomerId: string;
  asaasChargeId: string | null;
  tipoCobranca: TipoCobranca;
  valor: number;
  dataVencimento: string;
  status: StatusCobrancaAsaas;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixQrcode: string | null;
  multaPercentual: number | null;
  jurosPercentualMensal: number | null;
  dataPagamentoConfirmado: string | null;
  webhookUltimoEvento: string | null;
  webhookRecebidoEm: string | null;
  criadoEm: string;
}

/** Resultado de `criarCobranca`/`consultarCobranca` — o mesmo shape, exato, que
 * `server/src/routes/asaas-routes.ts` devolve (campos já normalizados, não o payload bruto
 * da Asaas). `status` aqui é o status BRUTO da Asaas (ex: "PENDING", "RECEIVED") — nunca
 * confundir com `StatusCobrancaAsaas` (o vocabulário local, derivado dos EVENTOS de
 * webhook em `aplicarEventosWebhookAsaas`, não da resposta de criação). */
export interface RespostaCobrancaAsaas {
  asaasChargeId: string;
  status: string;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixQrCode: string | null;
}

/** Porta que este módulo depende — a implementação real chama o PRÓPRIO servidor
 * (POST /api/asaas/clientes, /cobrancas, GET /cobrancas/:id) com o Bearer token da sessão
 * (ver `criarClienteAsaasHttp` em `src/components/integracoes/CobrancasAsaasView.tsx`). */
export interface AsaasApiClient {
  criarCliente(dados: { nome: string; cpfCnpj: string; email?: string; telefone?: string }): Promise<{ asaasCustomerId: string }>;
  criarCobranca(dados: {
    customer: string;
    billingType: "BOLETO" | "PIX";
    value: number;
    dueDate: string;
    description?: string;
    fine?: { value: number };
    interest?: { value: number };
  }): Promise<RespostaCobrancaAsaas>;
  consultarCobranca(asaasChargeId: string): Promise<RespostaCobrancaAsaas>;
}

export interface OpcoesEmissaoCobranca {
  tipoCobranca: TipoCobranca;
  /** Percentual de multa por atraso (ex: 2 = 2%) — repassado à Asaas como `fine.value`. */
  multaPercentual?: number;
  /** Percentual de juros de mora MENSAL (ex: 1 = 1%/mês) — repassado como `interest.value`. */
  jurosPercentualMensal?: number;
  descricao?: string;
  /** Sobrescreve/complementa o CPF/CNPJ do cliente Asaas quando o cadastro local não tem
   * um (ex: locatário sem CPF em `contrato_locatarios`) — a Asaas exige esse campo para
   * criar o cliente. Para honorário da advocacia nunca é necessário: `entidades_legais.
   * cpf_cnpj` é `NOT NULL`. */
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
}

interface LinhaCobranca {
  id: number;
  origem_tipo: OrigemCobranca;
  origem_id: number;
  asaas_customer_id: string;
  asaas_charge_id: string | null;
  tipo_cobranca: TipoCobranca;
  valor: number;
  data_vencimento: string;
  status: StatusCobrancaAsaas;
  boleto_url: string | null;
  linha_digitavel: string | null;
  pix_qrcode: string | null;
  multa_percentual: number | null;
  juros_percentual_mensal: number | null;
  data_pagamento_confirmado: string | null;
  webhook_ultimo_evento: string | null;
  webhook_recebido_em: string | null;
  criado_em: string;
}

function paraCobranca(linha: LinhaCobranca): CobrancaAsaasLocal {
  return {
    id: linha.id,
    origemTipo: linha.origem_tipo,
    origemId: linha.origem_id,
    asaasCustomerId: linha.asaas_customer_id,
    asaasChargeId: linha.asaas_charge_id,
    tipoCobranca: linha.tipo_cobranca,
    valor: linha.valor,
    dataVencimento: linha.data_vencimento,
    status: linha.status,
    boletoUrl: linha.boleto_url,
    linhaDigitavel: linha.linha_digitavel,
    pixQrcode: linha.pix_qrcode,
    multaPercentual: linha.multa_percentual,
    jurosPercentualMensal: linha.juros_percentual_mensal,
    dataPagamentoConfirmado: linha.data_pagamento_confirmado,
    webhookUltimoEvento: linha.webhook_ultimo_evento,
    webhookRecebidoEm: linha.webhook_recebido_em,
    criadoEm: linha.criado_em,
  };
}

function obterCobrancaPorId(db: Database, id: number): CobrancaAsaasLocal {
  const [linha] = consultar<LinhaCobranca>(db, "SELECT * FROM cobrancas_asaas WHERE id = ?", [id]);
  if (!linha) throw new Error(`Cobrança Asaas local ${id} não encontrada logo após ser criada — estado inconsistente.`);
  return paraCobranca(linha);
}

/** Resolve o `asaas_customer_id` para `(referenciaTipo, referenciaId)` — reaproveita o
 * mapeamento já salvo em `asaas_clientes_externos` quando existe (nunca cria um cliente
 * Asaas duplicado para o mesmo locatário/entidade), ou cria agora, via `apiClient`, e
 * grava o mapeamento antes de devolver. */
async function obterOuCriarClienteAsaas(
  db: Database,
  apiClient: AsaasApiClient,
  referenciaTipo: ReferenciaClienteAsaas,
  referenciaId: number,
  dados: { nome: string; cpfCnpj: string; email?: string; telefone?: string },
): Promise<string> {
  const [existente] = consultar<{ asaas_customer_id: string }>(
    db,
    "SELECT asaas_customer_id FROM asaas_clientes_externos WHERE referencia_tipo = ? AND referencia_id = ?",
    [referenciaTipo, referenciaId],
  );
  if (existente) return existente.asaas_customer_id;

  const { asaasCustomerId } = await apiClient.criarCliente(dados);

  executar(
    db,
    `INSERT INTO asaas_clientes_externos (referencia_tipo, referencia_id, asaas_customer_id, nome, cpf_cnpj, email, telefone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [referenciaTipo, referenciaId, asaasCustomerId, dados.nome, dados.cpfCnpj, dados.email ?? null, dados.telefone ?? null],
  );
  return asaasCustomerId;
}

function gravarCobrancaLocal(
  db: Database,
  origemTipo: OrigemCobranca,
  origemId: number,
  asaasCustomerId: string,
  opcoes: OpcoesEmissaoCobranca,
  valor: number,
  dataVencimento: string,
  resultado: RespostaCobrancaAsaas,
): CobrancaAsaasLocal {
  executar(
    db,
    `INSERT INTO cobrancas_asaas
      (origem_tipo, origem_id, asaas_customer_id, asaas_charge_id, tipo_cobranca, valor, data_vencimento, status,
       boleto_url, linha_digitavel, pix_qrcode, multa_percentual, juros_percentual_mensal)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`,
    [
      origemTipo,
      origemId,
      asaasCustomerId,
      resultado.asaasChargeId,
      opcoes.tipoCobranca,
      valor,
      dataVencimento,
      resultado.boletoUrl,
      resultado.linhaDigitavel,
      resultado.pixQrCode,
      opcoes.multaPercentual ?? null,
      opcoes.jurosPercentualMensal ?? null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return obterCobrancaPorId(db, id);
}

/** Emite uma cobrança (boleto ou PIX) para uma competência de aluguel pendente. Recusa
 * competência já recebida/cancelada — reemitir é uma decisão explícita (gere uma nova
 * chamada só depois de cancelar/entender o estado atual), não um efeito colateral automático
 * de chamar esta função de novo.
 *
 * Exige CPF do locatário (`contrato_locatarios.cpf`, papel='locatario') ou `opcoes.cpfCnpj`
 * — nunca inventa um documento: sem ele, a Asaas não aceita criar o cliente. */
export async function emitirCobrancaAluguel(
  db: Database,
  apiClient: AsaasApiClient,
  competenciaId: number,
  opcoes: OpcoesEmissaoCobranca,
): Promise<CobrancaAsaasLocal> {
  const [competencia] = consultar<{
    id: number;
    contrato_id: number;
    valor_devido: number;
    data_vencimento: string;
    status: string;
  }>(db, "SELECT id, contrato_id, valor_devido, data_vencimento, status FROM aluguel_competencias WHERE id = ?", [
    competenciaId,
  ]);
  if (!competencia) throw new Error(`Competência de aluguel ${competenciaId} não encontrada.`);
  if (competencia.status !== "pendente") {
    throw new Error(
      `Competência ${competenciaId} está '${competencia.status}' — só é possível emitir cobrança para uma competência pendente.`,
    );
  }

  const [contrato] = consultar<{ locatario: string }>(db, "SELECT locatario FROM contratos_locacao WHERE id = ?", [
    competencia.contrato_id,
  ]);
  if (!contrato) throw new Error(`Contrato de locação ${competencia.contrato_id} não encontrado.`);

  const [contatoLocatario] = consultar<{ cpf: string | null; email: string | null; telefone: string | null }>(
    db,
    "SELECT cpf, email, telefone FROM contrato_locatarios WHERE contrato_id = ? AND papel = 'locatario' ORDER BY id ASC LIMIT 1",
    [competencia.contrato_id],
  );

  const cpfCnpj = opcoes.cpfCnpj ?? contatoLocatario?.cpf ?? null;
  if (!cpfCnpj) {
    throw new Error(
      `Locatário do contrato ${competencia.contrato_id} não tem CPF cadastrado (contrato_locatarios) — informe opcoes.cpfCnpj para emitir a cobrança; a Asaas exige CPF/CNPJ do cliente.`,
    );
  }

  const asaasCustomerId = await obterOuCriarClienteAsaas(db, apiClient, "contrato_locacao", competencia.contrato_id, {
    nome: contrato.locatario,
    cpfCnpj,
    email: opcoes.email ?? contatoLocatario?.email ?? undefined,
    telefone: opcoes.telefone ?? contatoLocatario?.telefone ?? undefined,
  });

  const resultado = await apiClient.criarCobranca({
    customer: asaasCustomerId,
    billingType: opcoes.tipoCobranca === "pix" ? "PIX" : "BOLETO",
    value: competencia.valor_devido,
    dueDate: competencia.data_vencimento,
    description: opcoes.descricao ?? `Aluguel — competência #${competenciaId} (contrato #${competencia.contrato_id})`,
    fine: opcoes.multaPercentual != null ? { value: opcoes.multaPercentual } : undefined,
    interest: opcoes.jurosPercentualMensal != null ? { value: opcoes.jurosPercentualMensal } : undefined,
  });

  return gravarCobrancaLocal(
    db,
    "aluguel_competencia",
    competenciaId,
    asaasCustomerId,
    opcoes,
    competencia.valor_devido,
    competencia.data_vencimento,
    resultado,
  );
}

/** Emite uma cobrança (boleto ou PIX) para uma parcela de honorário advocatício
 * pendente. `entidades_legais.cpf_cnpj` é `NOT NULL` no schema — diferente do locatário de
 * aluguel, nunca falta aqui por falta de cadastro. */
export async function emitirCobrancaHonorario(
  db: Database,
  apiClient: AsaasApiClient,
  honorarioId: number,
  opcoes: OpcoesEmissaoCobranca,
): Promise<CobrancaAsaasLocal> {
  const [honorario] = consultar<{
    id: number;
    processo_id: number;
    valor_devido: number;
    data_vencimento: string;
    status: string;
  }>(db, "SELECT id, processo_id, valor_devido, data_vencimento, status FROM honorarios_advocaticios WHERE id = ?", [
    honorarioId,
  ]);
  if (!honorario) throw new Error(`Honorário advocatício ${honorarioId} não encontrado.`);
  if (honorario.status !== "pendente") {
    throw new Error(
      `Honorário ${honorarioId} está '${honorario.status}' — só é possível emitir cobrança para uma parcela pendente.`,
    );
  }

  const [entidade] = consultar<{ id: number; nome: string; cpf_cnpj: string }>(
    db,
    `SELECT e.id, e.nome, e.cpf_cnpj
     FROM entidades_legais e
     JOIN processos_legais p ON p.entidade_id = e.id
     WHERE p.id = ?`,
    [honorario.processo_id],
  );
  if (!entidade) throw new Error(`Entidade legal do processo ${honorario.processo_id} não encontrada.`);

  const asaasCustomerId = await obterOuCriarClienteAsaas(db, apiClient, "entidade_legal", entidade.id, {
    nome: entidade.nome,
    cpfCnpj: opcoes.cpfCnpj ?? entidade.cpf_cnpj,
    email: opcoes.email,
    telefone: opcoes.telefone,
  });

  const resultado = await apiClient.criarCobranca({
    customer: asaasCustomerId,
    billingType: opcoes.tipoCobranca === "pix" ? "PIX" : "BOLETO",
    value: honorario.valor_devido,
    dueDate: honorario.data_vencimento,
    description: opcoes.descricao ?? `Honorários advocatícios — parcela #${honorarioId} (processo #${honorario.processo_id})`,
    fine: opcoes.multaPercentual != null ? { value: opcoes.multaPercentual } : undefined,
    interest: opcoes.jurosPercentualMensal != null ? { value: opcoes.jurosPercentualMensal } : undefined,
  });

  return gravarCobrancaLocal(
    db,
    "honorario_advocaticio",
    honorarioId,
    asaasCustomerId,
    opcoes,
    honorario.valor_devido,
    honorario.data_vencimento,
    resultado,
  );
}

export interface FiltrosListarCobrancas {
  origemTipo?: OrigemCobranca;
  status?: StatusCobrancaAsaas;
}

/** Lista cobranças já emitidas, mais recentes primeiro. */
export function listarCobrancas(db: Database, filtros: FiltrosListarCobrancas = {}): CobrancaAsaasLocal[] {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];
  if (filtros.origemTipo) {
    condicoes.push("origem_tipo = ?");
    params.push(filtros.origemTipo);
  }
  if (filtros.status) {
    condicoes.push("status = ?");
    params.push(filtros.status);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = consultar<LinhaCobranca>(db, `SELECT * FROM cobrancas_asaas ${where} ORDER BY id DESC`, params);
  return linhas.map(paraCobranca);
}

export interface EventoWebhookAsaasPendente {
  id: string;
  payload: unknown;
}

export interface ResultadoAplicacaoEventoAsaas {
  eventoId: string;
  aplicado: boolean;
  motivo?: string;
}

/** Vocabulário de eventos de webhook da Asaas que este módulo reconhece — mapeado para o
 * vocabulário local de `cobrancas_asaas.status`. Qualquer outro `event` (ex:
 * PAYMENT_CREATED, PAYMENT_UPDATED) é ignorado explicitamente (não é erro, só não altera
 * nada aqui), em vez de arriscar um mapeamento adivinhado.
 *
 * PAYMENT_REFUNDED é tratado separadamente em aplicarReembolsoWebhook — não entra aqui. */
const EVENTO_PARA_STATUS: Record<string, StatusCobrancaAsaas> = {
  PAYMENT_RECEIVED: "pago",
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_OVERDUE: "atrasado",
  PAYMENT_DELETED: "cancelado",
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function atualizarOrigemComoRecebida(db: Database, origemTipo: OrigemCobranca, origemId: number, dataRecebimento: string): void {
  const tabela = origemTipo === "aluguel_competencia" ? "aluguel_competencias" : "honorarios_advocaticios";
  // `AND status = 'pendente'`: nunca sobrescreve uma competência/honorário já cancelado
  // (decisão manual anterior prevalece sobre o webhook) nem reaplica sobre uma que já foi
  // baixada por outro caminho (ex: conciliação bancária manual, que já preencheu
  // ledger_entry_id_baixa) — update vira no-op nesses casos, de propósito.
  executar(db, `UPDATE ${tabela} SET status = 'recebido', data_recebimento = ? WHERE id = ? AND status = 'pendente'`, [
    dataRecebimento,
    origemId,
  ]);
}

function aplicarUmEvento(db: Database, evento: EventoWebhookAsaasPendente): ResultadoAplicacaoEventoAsaas {
  const payload = evento.payload as { event?: string; payment?: { id?: string; paymentDate?: string; refundedAmount?: number; refundDate?: string } } | null;
  const tipoEvento = payload?.event;
  const asaasChargeId = payload?.payment?.id;

  if (!tipoEvento || !asaasChargeId) {
    return {
      eventoId: evento.id,
      aplicado: false,
      motivo: "Payload sem 'event' ou 'payment.id' — não reconhecido como webhook da Asaas.",
    };
  }

  // Trata PAYMENT_REFUNDED separadamente
  if (tipoEvento === "PAYMENT_REFUNDED") {
    const resultado = aplicarEventoReembolsoWebhook(db, { payment: payload.payment, event: tipoEvento });
    return {
      eventoId: evento.id,
      aplicado: resultado.aplicado,
      motivo: resultado.motivo,
    };
  }

  const novoStatus = EVENTO_PARA_STATUS[tipoEvento];
  if (!novoStatus) {
    return { eventoId: evento.id, aplicado: false, motivo: `Tipo de evento '${tipoEvento}' não mapeado — ignorado.` };
  }

  const [cobranca] = consultar<{ id: number; origem_tipo: OrigemCobranca; origem_id: number; status: StatusCobrancaAsaas }>(
    db,
    "SELECT id, origem_tipo, origem_id, status FROM cobrancas_asaas WHERE asaas_charge_id = ?",
    [asaasChargeId],
  );
  if (!cobranca) {
    return {
      eventoId: evento.id,
      aplicado: false,
      motivo: `Nenhuma cobrança local encontrada para asaas_charge_id='${asaasChargeId}'.`,
    };
  }

  const dataPagamento = payload?.payment?.paymentDate ?? hoje();

  executar(
    db,
    `UPDATE cobrancas_asaas
     SET status = ?,
         webhook_ultimo_evento = ?,
         webhook_recebido_em = CURRENT_TIMESTAMP,
         data_pagamento_confirmado = CASE WHEN ? = 'pago' THEN ? ELSE data_pagamento_confirmado END
     WHERE id = ?`,
    [novoStatus, tipoEvento, novoStatus, dataPagamento, cobranca.id],
  );

  // NOTA (baixa contábil): abaixo só atualiza a VISIBILIDADE do recebível — nunca cria
  // lançamento em ledger_entries. A baixa contábil real continua exigindo o fluxo já
  // existente de conciliação bancária (baixarCompetencia / equivalente de honorários), que
  // escolhe a conta bancária de destino e produz um documento-fonte rastreável (uma linha
  // em `transacoes` + as duas pernas no razão). Aplicar o webhook direto no razão, sem esse
  // documento-fonte, quebraria a garantia de rastreabilidade que o resto deste sistema
  // segue (ver aluguel-competencias.ts, contasAPagar.ts) — a confirmação de pagamento da
  // Asaas é um SINAL de que o dinheiro chegou, não o lançamento contábil em si.
  if (novoStatus === "pago" && cobranca.status !== "pago") {
    atualizarOrigemComoRecebida(db, cobranca.origem_tipo, cobranca.origem_id, dataPagamento);
  }

  return { eventoId: evento.id, aplicado: true };
}

/** Aplica, em lote, eventos já enfileirados no inbox do servidor (consumidos via
 * GET /api/eventos-externos/pendentes?tipo=webhook_asaas) ao estado local de
 * `cobrancas_asaas`. Função PURA — nenhuma chamada de rede aqui; quem chama já baixou os
 * eventos e, depois de aplicar, é responsável por marcá-los consumidos
 * (POST /api/eventos-externos/:id/consumir) para não reaplicá-los no próximo polling. */
export function aplicarEventosWebhookAsaas(
  db: Database,
  eventos: EventoWebhookAsaasPendente[],
): ResultadoAplicacaoEventoAsaas[] {
  return eventos.map((evento) => aplicarUmEvento(db, evento));
}
