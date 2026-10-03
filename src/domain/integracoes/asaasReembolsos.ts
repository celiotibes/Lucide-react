/**
 * Sistema de reembolsos/devoluções de pagamentos em Asaas com idempotência.
 *
 * Implementa a OPÇÃO B (escolhida): registrar devolução como novo lançamento de SAÍDA
 * ('Devolução de Pagamento') em vez de reverter na Asaas, com suporte automático à detecção
 * de tipo (< 24h = reverter se suportado; ≥ 24h = registrar devolução).
 *
 * Idempotência: UNIQUE constraint (origem_tipo, origem_id) evita reemissão acidental de
 * cobrança ativa — impede duplicação por chamada acidental repetida da mesma rota.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { estornoBaixaCompetencia } from "../erp/aluguel-competencias";

export type StatusReembolso = "processando" | "sucesso" | "erro";
export type TipoReembolso = "reversao" | "devolucao";

export interface Reembolso {
  id: number;
  asaasChargeId: string;
  motivo: string;
  tipo: TipoReembolso;
  status: StatusReembolso;
  dataProcessamento: string;
  criadoEm: string;
  origemTipo: string;
  origemId: number;
  mensagemErro: string | null;
}

export interface ReembolsoInput {
  chargeId: string;
  motivo: string;
  tipoForce?: TipoReembolso; // Override manual do tipo detectado
}

interface LinhaReembolso {
  id: number;
  asaas_charge_id: string;
  motivo: string;
  tipo: TipoReembolso;
  status: StatusReembolso;
  data_processamento: string;
  criado_em: string;
  origem_tipo: string;
  origem_id: number;
  mensagem_erro: string | null;
}

function paraReembolso(linha: LinhaReembolso): Reembolso {
  return {
    id: linha.id,
    asaasChargeId: linha.asaas_charge_id,
    motivo: linha.motivo,
    tipo: linha.tipo,
    status: linha.status,
    dataProcessamento: linha.data_processamento,
    criadoEm: linha.criado_em,
    origemTipo: linha.origem_tipo,
    origemId: linha.origem_id,
    mensagemErro: linha.mensagem_erro,
  };
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function agora(): string {
  return new Date().toISOString();
}

/**
 * Detecta o tipo de reembolso a ser realizado com base no tempo desde a criação da cobrança.
 * - Se < 24h: tipo = 'reversao' (tentar reverter na Asaas, se suportado)
 * - Se ≥ 24h: tipo = 'devolucao' (registrar como novo lançamento de saída)
 *
 * O caller pode usar `tipoForce` para override manual.
 */
export function detectarTipoReembolso(db: Database, chargeId: string, tipoForce?: TipoReembolso): TipoReembolso {
  if (tipoForce) return tipoForce;

  const [cobranca] = consultar<{ criado_em: string }>(
    db,
    "SELECT criado_em FROM cobrancas_asaas WHERE asaas_charge_id = ?",
    [chargeId],
  );

  if (!cobranca) {
    throw new Error(`Cobrança Asaas com chargeId='${chargeId}' não encontrada.`);
  }

  const dataCriacao = new Date(cobranca.criado_em);
  const dataAgora = new Date();
  const diffHoras = (dataAgora.getTime() - dataCriacao.getTime()) / (1000 * 60 * 60);

  return diffHoras < 24 ? "reversao" : "devolucao";
}

/**
 * Processa um reembolso para uma cobrança já paga. Realiza a idempotência verificando
 * se já existe um reembolso ativo para essa cobrança.
 *
 * Fluxo:
 * 1. Localiza cobrança (deve existir e estar paga)
 * 2. Verifica idempotência (se já existe reembolso ativo, retorna o existente)
 * 3. Detecta tipo (< 24h = reversao, ≥ 24h = devolucao)
 * 4. Registra reembolso em tabela própria
 * 5. Atualiza status da cobrança para 'cancelado' (o schema não aceita 'reembolsado')
 */
export async function processarReembolsoAsaas(
  db: Database,
  input: ReembolsoInput,
): Promise<Reembolso> {
  // 1. Localiza cobrança
  const [cobranca] = consultar<{
    id: number;
    origem_tipo: string;
    origem_id: number;
    status: string;
  }>(db, "SELECT id, origem_tipo, origem_id, status FROM cobrancas_asaas WHERE asaas_charge_id = ?", [
    input.chargeId,
  ]);

  if (!cobranca) {
    throw new Error(`Cobrança Asaas com chargeId='${input.chargeId}' não encontrada.`);
  }

  // 2. Verifica idempotência PRIMEIRO — se já existe reembolso ativo, retorna o existente
  // Isso permite reprocessar idempotentemente, mesmo que a cobrança tenha sido atualizada para 'reembolsado'
  const [reembolsoExistente] = consultar<LinhaReembolso>(
    db,
    "SELECT * FROM reembolsos_asaas WHERE asaas_charge_id = ? AND status = 'sucesso' LIMIT 1",
    [input.chargeId],
  );

  if (reembolsoExistente) {
    return paraReembolso(reembolsoExistente);
  }

  // 3. Verifica se cobrança está paga (agora que sabemos que não há reembolso existente)
  if (cobranca.status !== "pago") {
    throw new Error(
      `Cobrança ${input.chargeId} está '${cobranca.status}' — só é possível reembolsar uma cobrança com status 'pago'.`,
    );
  }

  // 4. Detecta tipo
  const tipo = detectarTipoReembolso(db, input.chargeId, input.tipoForce);

  // 5. Registra reembolso
  const dataProcessamento = hoje();
  executar(
    db,
    `INSERT INTO reembolsos_asaas
      (asaas_charge_id, motivo, tipo, status, data_processamento, origem_tipo, origem_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.chargeId, input.motivo, tipo, "sucesso", dataProcessamento, cobranca.origem_tipo, cobranca.origem_id],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

  // PARTE A: 5.5. Se a origem é competência/honorário e tem ledger_entry_id_baixa,
  // estorna a baixa (reverte lançamentos no razão e volta ao estado "pendente")
  if (cobranca.origem_tipo === "aluguel_competencia") {
    const [origem] = consultar<{ ledger_entry_id_baixa: number | null }>(
      db,
      "SELECT ledger_entry_id_baixa FROM aluguel_competencias WHERE id = ?",
      [cobranca.origem_id],
    );
    if (origem && origem.ledger_entry_id_baixa) {
      const resultadoEstorno = estornoBaixaCompetencia(db, cobranca.origem_id, input.motivo, undefined);
      if (!resultadoEstorno.sucesso) {
        // Nunca engolir: reembolso registrado sem estorno deixaria a receita no razão.
        const msg = `Estorno contábil não realizado: ${resultadoEstorno.mensagem}`;
        executar(db, "UPDATE reembolsos_asaas SET status = 'erro', mensagem_erro = ? WHERE id = ?", [msg, id]);
        throw new Error(msg);
      }
    }
  }
  // NOTA: honorários ainda não têm modelo equivalente de baixa/estorno — deixar para
  // migração futura quando houver estorno_baixa_honorario() similar.

  // 6. Cobrança reembolsada deixa de valer. O CHECK de cobrancas_asaas.status (schema.sql) só aceita
  // pendente|pago|atrasado|cancelado: gravar 'reembolsado' violava a constraint e o reembolso quebrava
  // sempre no banco real. O tipo e o motivo ficam em reembolsos_asaas.
  executar(db, "UPDATE cobrancas_asaas SET status = 'cancelado' WHERE asaas_charge_id = ?", [input.chargeId]);

  // Retorna o reembolso criado
  const [reembolso] = consultar<LinhaReembolso>(db, "SELECT * FROM reembolsos_asaas WHERE id = ?", [id]);
  if (!reembolso) throw new Error(`Reembolso ${id} não encontrado logo após ser criado — estado inconsistente.`);

  return paraReembolso(reembolso);
}

/**
 * Lista reembolsos com filtros opcionais.
 */
export interface FiltrosListarReembolsos {
  tipo?: TipoReembolso;
  status?: StatusReembolso;
}

export function listarReembolsos(db: Database, filtros: FiltrosListarReembolsos = {}): Reembolso[] {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.tipo) {
    condicoes.push("tipo = ?");
    params.push(filtros.tipo);
  }

  if (filtros.status) {
    condicoes.push("status = ?");
    params.push(filtros.status);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = consultar<LinhaReembolso>(
    db,
    `SELECT * FROM reembolsos_asaas ${where} ORDER BY data_processamento DESC`,
    params,
  );

  return linhas.map(paraReembolso);
}

/**
 * Obtém um reembolso específico por ID.
 */
export function obterReembolso(db: Database, id: number): Reembolso {
  const [linha] = consultar<LinhaReembolso>(db, "SELECT * FROM reembolsos_asaas WHERE id = ?", [id]);
  if (!linha) throw new Error(`Reembolso ${id} não encontrado.`);
  return paraReembolso(linha);
}

/**
 * Obtém reembolsos de uma cobrança específica (geralmente um ou zero).
 */
export function obterReembolsosPorChargeId(db: Database, chargeId: string): Reembolso[] {
  const linhas = consultar<LinhaReembolso>(
    db,
    "SELECT * FROM reembolsos_asaas WHERE asaas_charge_id = ? ORDER BY data_processamento DESC",
    [chargeId],
  );
  return linhas.map(paraReembolso);
}

/**
 * Marca um reembolso como falho (ex: API da Asaas rejeitou a reversão).
 */
export function marcarReembolsoComoErro(db: Database, id: number, mensagem: string): Reembolso {
  executar(
    db,
    "UPDATE reembolsos_asaas SET status = 'erro', mensagem_erro = ? WHERE id = ?",
    [mensagem, id],
  );

  return obterReembolso(db, id);
}

/**
 * Webhook para PAYMENT_REFUNDED da Asaas — detectado em aplicarEventosWebhookAsaas()
 * quando o evento chega. Aqui fazemos o link entre o webhook e o status local.
 */
export interface EventoReembolsoWebhook {
  payment?: {
    id?: string;
    refundedAmount?: number;
    refundDate?: string;
  };
  event?: string;
}

/**
 * Aplica um evento PAYMENT_REFUNDED do webhook da Asaas. Este é chamado
 * por aplicarEventosWebhookAsaas() quando detecta o evento.
 */
export function aplicarEventoReembolsoWebhook(
  db: Database,
  evento: EventoReembolsoWebhook,
): { aplicado: boolean; motivo?: string } {
  const chargeId = evento.payment?.id;
  if (!chargeId) {
    return { aplicado: false, motivo: "Webhook sem 'payment.id'" };
  }

  const [cobranca] = consultar<{ id: number }>(
    db,
    "SELECT id FROM cobrancas_asaas WHERE asaas_charge_id = ?",
    [chargeId],
  );

  if (!cobranca) {
    return { aplicado: false, motivo: `nenhuma cobrança encontrada para chargeId='${chargeId}'` };
  }

  // Se já existe reembolso registrado, não processa novamente
  const [reembolsoExistente] = consultar<{ id: number }>(
    db,
    "SELECT id FROM reembolsos_asaas WHERE asaas_charge_id = ? AND status = 'sucesso'",
    [chargeId],
  );

  if (reembolsoExistente) {
    return { aplicado: false, motivo: "Reembolso já registrado para esta cobrança" };
  }

  // Registra o reembolso automaticamente via webhook
  // Extrai refundDate do webhook (data de devolução da Asaas)
  const dataProcessamento = evento.payment?.refundDate ? String(evento.payment.refundDate) : hoje();
  executar(
    db,
    `INSERT INTO reembolsos_asaas
      (asaas_charge_id, motivo, tipo, status, data_processamento, origem_tipo, origem_id)
     VALUES (
       ?,
       ?,
       ?,
       ?,
       ?,
       (SELECT origem_tipo FROM cobrancas_asaas WHERE asaas_charge_id = ?),
       (SELECT origem_id FROM cobrancas_asaas WHERE asaas_charge_id = ?)
     )`,
    [chargeId, "Reembolso automático via webhook Asaas", "devolucao", "sucesso", dataProcessamento, chargeId, chargeId],
  );

  // Atualiza status da cobrança
  executar(db, "UPDATE cobrancas_asaas SET status = 'cancelado' WHERE asaas_charge_id = ?", [chargeId]);

  return { aplicado: true };
}
