/**
 * Resolve o destinatário real (e-mail / WhatsApp / Telegram) de uma cobrança Asaas,
 * navegando pelas tabelas de negócio do próprio cliente (sql.js) a partir de
 * `cobrancas_asaas.origem_tipo`/`origem_id` (ver schema.sql):
 *
 *   - 'aluguel_competencia'   -> aluguel_competencias.contrato_id -> contrato_locatarios
 *                                (papel='locatario') — mesmo caminho já usado por
 *                                `emitirCobrancaAluguel` em
 *                                `src/domain/integracoes/asaasCobranca.ts` para o CPF.
 *   - 'honorario_advocaticio' -> honorarios_advocaticios.processo_id -> processos_legais
 *                                -> entidades_legais (via processos_legais.entidade_id) —
 *                                mesmo caminho já usado por `CobrancasAsaasView.tsx` para
 *                                o nome do cliente ("JOIN processos_legais p ... JOIN
 *                                entidades_legais el ON el.id = p.entidade_id").
 *                                `entidades_legais.telefone`/`.email` foram adicionados
 *                                exatamente para isto (ver comentário na própria tabela,
 *                                schema.sql) — ao contrário do que se cogitou inicialmente,
 *                                NÃO é necessário passar por `partes_processo` (que não
 *                                tem e-mail/telefone, só nome/cpf_cnpj/papel): o vínculo
 *                                processo -> entidade_legal com contato já existe direto.
 *
 * ATUALIZAÇÃO (2026-10): `telegramChatId` agora é resolvido de verdade, via
 * `vinculos_telegram_externos` (ver schema.sql e `vinculosExternos.ts`) — locatário,
 * cliente da advocacia e prestador podem vincular o próprio chat_id pelo fluxo de código
 * único (`/vincular CODIGO` no bot). Antes desta rodada, este campo era sempre
 * `undefined`; continua sendo `undefined` sempre que a referência não tiver (ainda) um
 * vínculo confirmado — quem usa o resultado (ver `despachoCliente.ts`) trata a ausência
 * como "canal pulado", nunca como erro.
 *
 * Se não houver e-mail/telefone cadastrado para o destinatário resolvido (campo em
 * branco no cadastro), o campo correspondente vem como `undefined` — nunca lança erro:
 * a ausência de UM contato não deve travar o disparo dos outros canais disponíveis.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export type ReferenciaVinculoExterno = "contrato_locatario" | "entidade_legal" | "prestador";

/** Chat_id vinculado (confirmado) de um contato externo, ou `undefined` se não houver
 * vínculo — ou se o vínculo existir mas ainda não tiver sido confirmado pelo bot
 * (`chat_id IS NULL` até a confirmação, ver `vinculosExternos.ts`). Função central: toda
 * resolução de Telegram para contato externo passa por aqui, nunca lê
 * `vinculos_telegram_externos` direto em mais de um lugar. */
export function resolverChatIdExterno(
  db: Database,
  referenciaTipo: ReferenciaVinculoExterno,
  referenciaId: number,
): string | undefined {
  const [vinculo] = consultar<{ chat_id: string | null }>(
    db,
    "SELECT chat_id FROM vinculos_telegram_externos WHERE referencia_tipo = ? AND referencia_id = ? AND chat_id IS NOT NULL ORDER BY vinculado_em DESC LIMIT 1",
    [referenciaTipo, referenciaId],
  );
  return vinculo?.chat_id ?? undefined;
}

export interface DestinatariosResolvidos {
  email?: string;
  whatsappE164?: string;
  /** `undefined` quando a referência não tem vínculo confirmado — ver `resolverChatIdExterno`. */
  telegramChatId?: string;
}

const DESTINATARIOS_VAZIOS: DestinatariosResolvidos = {};

/** Normaliza um telefone em formato livre (como cadastrado em `contrato_locatarios.
 * telefone`/`entidades_legais.telefone` — texto livre, sem validação de formato) para
 * E.164, assumindo números brasileiros quando não há código de país explícito (hipótese
 * razoável para este sistema, que opera só com imóveis/clientes no Brasil — ver uso de
 * CPF em todo o domínio). Retorna `undefined` para entrada vazia/sem dígito nenhum, em
 * vez de produzir um "+55" sem número. */
function normalizarParaE164(telefoneBruto: string | null | undefined): string | undefined {
  if (!telefoneBruto) return undefined;
  const soDigitos = telefoneBruto.replace(/\D/g, "");
  if (!soDigitos) return undefined;
  if (telefoneBruto.trim().startsWith("+")) return `+${soDigitos}`;
  // 10/11 dígitos = DDD + número (fixo/celular) sem código de país -> assume Brasil (+55).
  // 12/13 dígitos já parece incluir o 55 do código de país.
  if (soDigitos.length === 10 || soDigitos.length === 11) return `+55${soDigitos}`;
  return `+${soDigitos}`;
}

function normalizarEmail(emailBruto: string | null | undefined): string | undefined {
  const limpo = emailBruto?.trim();
  return limpo ? limpo : undefined;
}

function resolverParaAluguel(db: Database, competenciaId: number): DestinatariosResolvidos {
  const [competencia] = consultar<{ contrato_id: number }>(
    db,
    "SELECT contrato_id FROM aluguel_competencias WHERE id = ?",
    [competenciaId],
  );
  if (!competencia) return DESTINATARIOS_VAZIOS;

  const [contato] = consultar<{ id: number; email: string | null; telefone: string | null }>(
    db,
    "SELECT id, email, telefone FROM contrato_locatarios WHERE contrato_id = ? AND papel = 'locatario' ORDER BY id ASC LIMIT 1",
    [competencia.contrato_id],
  );
  if (!contato) return DESTINATARIOS_VAZIOS;

  return {
    email: normalizarEmail(contato.email),
    whatsappE164: normalizarParaE164(contato.telefone),
    telegramChatId: resolverChatIdExterno(db, "contrato_locatario", contato.id),
  };
}

function resolverParaHonorario(db: Database, honorarioId: number): DestinatariosResolvidos {
  const [linha] = consultar<{ entidade_id: number; email: string | null; telefone: string | null }>(
    db,
    `SELECT el.id AS entidade_id, el.email AS email, el.telefone AS telefone
     FROM honorarios_advocaticios h
     JOIN processos_legais p ON p.id = h.processo_id
     JOIN entidades_legais el ON el.id = p.entidade_id
     WHERE h.id = ?`,
    [honorarioId],
  );
  if (!linha) return DESTINATARIOS_VAZIOS;

  return {
    email: normalizarEmail(linha.email),
    whatsappE164: normalizarParaE164(linha.telefone),
    telegramChatId: resolverChatIdExterno(db, "entidade_legal", linha.entidade_id),
  };
}

/** Resolve os destinatários de um prestador de serviço (`prestadores.id`) — usado pelas
 * telas de operações/ordem de serviço para notificar o prestador atribuído. */
export function resolverDestinatariosPrestador(db: Database, prestadorId: number): DestinatariosResolvidos {
  const [prestador] = consultar<{ email: string | null; telefone: string | null }>(
    db,
    "SELECT email, telefone FROM prestadores WHERE id = ?",
    [prestadorId],
  );
  if (!prestador) return DESTINATARIOS_VAZIOS;

  return {
    email: normalizarEmail(prestador.email),
    whatsappE164: normalizarParaE164(prestador.telefone),
    telegramChatId: resolverChatIdExterno(db, "prestador", prestadorId),
  };
}

/** Resolve os destinatários de um locatário específico (`contrato_locatarios.id`) — usado
 * por telas que não partem de uma competência/cobrança (ex: envio de laudo de vistoria),
 * mas já sabem exatamente qual linha de `contrato_locatarios` notificar. */
export function resolverDestinatariosContratoLocatario(db: Database, contratoLocatarioId: number): DestinatariosResolvidos {
  const [contato] = consultar<{ email: string | null; telefone: string | null }>(
    db,
    "SELECT email, telefone FROM contrato_locatarios WHERE id = ?",
    [contratoLocatarioId],
  );
  if (!contato) return DESTINATARIOS_VAZIOS;

  return {
    email: normalizarEmail(contato.email),
    whatsappE164: normalizarParaE164(contato.telefone),
    telegramChatId: resolverChatIdExterno(db, "contrato_locatario", contratoLocatarioId),
  };
}

/**
 * Resolve os destinatários de uma cobrança Asaas local (`cobrancas_asaas.id`), a partir
 * de `origem_tipo`/`origem_id` — ver cabeçalho do arquivo para o caminho de cada tipo.
 *
 * `origemTipo`/`origemId` aqui são os da tabela `cobrancas_asaas`, não os de
 * `notificacoes_enviadas` — a notificação é sobre a MESMA cobrança
 * (`origem_tipo='cobranca_asaas'`, `origem_id=cobrancas_asaas.id`), mas o que esta função
 * precisa para achar o contato é o tipo/id de origem DA cobrança
 * (`aluguel_competencia`/`honorario_advocaticio` + o id da competência/honorário).
 *
 * Nunca lança por falta de contato — devolve os campos que conseguir, `undefined` para
 * os que não achar (cobrança/competência/honorário inexistente também devolve tudo
 * `undefined`, em vez de erro, pelo mesmo motivo: a ausência de dado nunca deve travar o
 * disparo dos canais que tiverem dado).
 */
export function resolverDestinatariosCobranca(
  db: Database,
  origemTipo: "aluguel_competencia" | "honorario_advocaticio",
  origemId: number,
): DestinatariosResolvidos {
  if (origemTipo === "aluguel_competencia") return resolverParaAluguel(db, origemId);
  if (origemTipo === "honorario_advocaticio") return resolverParaHonorario(db, origemId);
  return DESTINATARIOS_VAZIOS;
}

/** Variante de conveniência: resolve a partir do id LOCAL da cobrança (`cobrancas_asaas.id`),
 * lendo primeiro `origem_tipo`/`origem_id` dela e então delegando para
 * `resolverDestinatariosCobranca`. É o que `despachoCliente.ts` usa na prática, porque
 * quem dispara a notificação de uma cobrança emitida tem o id da cobrança, não
 * necessariamente já separado em (tipoDeOrigemDaCobranca, idDeOrigemDaCobranca). */
export function resolverDestinatariosPorCobrancaId(db: Database, cobrancaAsaasId: number): DestinatariosResolvidos {
  const [cobranca] = consultar<{ origem_tipo: "aluguel_competencia" | "honorario_advocaticio"; origem_id: number }>(
    db,
    "SELECT origem_tipo, origem_id FROM cobrancas_asaas WHERE id = ?",
    [cobrancaAsaasId],
  );
  if (!cobranca) return DESTINATARIOS_VAZIOS;
  return resolverDestinatariosCobranca(db, cobranca.origem_tipo, cobranca.origem_id);
}
