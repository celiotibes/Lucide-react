/** CRM leve: leads, funil e propostas (captação de novo inquilino/comprador) — ver bloco
 * "CRM LEVE" em `contabilidade-reconstituicao/schema.sql` para o desenho das 3 tabelas
 * usadas aqui (`leads`, `lead_etapa_eventos`, `lead_propostas`). Este módulo só opera
 * sobre elas — nenhuma tabela nova, nenhuma mudança de schema.
 *
 * REGRA DE OURO (documentada no schema, repetida aqui porque é o núcleo do módulo):
 * proposta aceita muda o lead para 'convertido', mas NUNCA cria uma linha em
 * `contratos_locacao` automaticamente. A conversão em contrato de verdade — com todas as
 * cláusulas, caução, reajuste, locatários etc. — continua sendo uma ação manual e
 * separada do usuário, típica de sistemas onde a decisão comercial (aceitar a proposta) e
 * a formalização jurídica/contábil (criar o contrato) têm responsáveis e timing
 * diferentes. `decidirProposta` abaixo é o único lugar do módulo que toca `leads.etapa`
 * como efeito colateral de uma proposta, e ele PARA em 'convertido' — nada aqui faz
 * `INSERT INTO contratos_locacao`.
 *
 * DECISÕES DE DESIGN tomadas por conta própria (documentadas aqui porque o enunciado da
 * tarefa pedia explicitamente para decidir e registrar):
 *
 * 1) Máquina de estados de `moverEtapaLead` (única fonte de verdade sobre transição
 *    válida, ver `PROXIMA_ETAPA_FUNIL` e `ETAPAS_TERMINAIS` abaixo) — escolhi AVANÇO
 *    ESTRITO DE UM PASSO no funil, não "qualquer etapa à frente":
 *      novo            --avança--> contatado
 *      contatado       --avança--> visita_agendada
 *      visita_agendada --avança--> proposta
 *      proposta        --avança--> convertido
 *      {novo, contatado, visita_agendada, proposta} --perdido--> perdido
 *      convertido, perdido: TERMINAIS — nenhuma transição nova é aceita a partir daqui.
 *    Pular etapa (ex.: novo direto para proposta) é rejeitado — mesmo espírito de
 *    `ordensServico.ts` (tabela de transições explícita, nunca "qualquer coisa que pareça
 *    progresso"): um funil que registra "contatado" e "visita_agendada" como etapas
 *    reais perde o sentido se o operador pode pular por cima delas sem deixar rastro no
 *    funil, mesmo que o histórico em `lead_etapa_eventos` ainda gravasse a transição.
 *
 * 2) `criarPropostaLead` EXIGE apenas que o lead NÃO esteja em etapa terminal
 *    ('convertido'/'perdido') — não exige que já esteja exatamente em etapa 'proposta'.
 *    Motivo: no mundo real a proposta costuma ser redigida/negociada (rascunho) antes de
 *    o operador formalizar a mudança de etapa do lead para 'proposta' — são ações
 *    distintas, feitas por pessoas ou momentos diferentes. Quem move o lead para
 *    'proposta' continua sendo exclusivamente `moverEtapaLead`, chamado à parte pelo
 *    operador quando fizer sentido no fluxo dele.
 *
 * 3) Consequência direta de (2): `decidirProposta(..., aceita: true)` só terá sucesso se,
 *    NO MOMENTO da decisão, o lead já estiver exatamente em etapa 'proposta' — porque ele
 *    chama internamente `moverEtapaLead(db, lead_id, 'convertido', ator)`, e essa função
 *    só permite proposta→convertido (ver decisão 1). Se o operador aceitar uma proposta
 *    de um lead que ainda está em 'contatado' (proposta criada cedo, ver decisão 2), a
 *    chamada falha com mensagem clara pedindo para mover o lead para 'proposta' primeiro
 *    — e a atualização de `lead_propostas.status` NÃO é feita (tudo ou nada: nunca fica
 *    uma proposta marcada 'aceita' com o lead preso numa etapa anterior).
 *
 * 4) `ator` em `decidirProposta` é um PARÂMETRO EXPLÍCITO da função (não inferido de
 *    sessão/autenticação — este é um app single-user, sem backend de aplicação, sem
 *    conceito de usuário logado). É o mesmo ator que assina o evento de etapa gravado em
 *    `lead_etapa_eventos` quando a proposta é aceita, exatamente como qualquer outra
 *    chamada a `moverEtapaLead` já exige.
 *
 * 5) `decidirProposta` também recusa decidir uma proposta que já foi decidida antes
 *    (status 'aceita' ou 'recusada') e recusa decidir uma proposta que ainda está
 *    'rascunho' (precisa passar por `enviarProposta` primeiro) — mesmo espírito de
 *    `encerrarProcesso` em advocacia.ts: decidir de novo pisaria em `decidido_em`/`status`
 *    já gravados como histórico.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export type EtapaLead = "novo" | "contatado" | "visita_agendada" | "proposta" | "convertido" | "perdido";
export type StatusPropostaLead = "rascunho" | "enviada" | "aceita" | "recusada";

export interface Lead {
  id: number;
  imovel_id: number | null;
  nome: string;
  contato: string | null;
  fonte: string | null;
  interesse: string | null;
  etapa: EtapaLead;
  criado_em: string;
}

export interface LeadEtapaEvento {
  id: number;
  lead_id: number;
  etapa_anterior: EtapaLead;
  etapa_nova: EtapaLead;
  ator: string;
  criado_em: string;
}

export interface LeadProposta {
  id: number;
  lead_id: number;
  imovel_id: number;
  valor_proposto: number;
  condicoes: string | null;
  status: StatusPropostaLead;
  criado_em: string;
  decidido_em: string | null;
}

export interface ResultadoOperacaoLead {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

/** Etapas em que o lead está encerrado — nenhuma transição nova é aceita a partir delas
 * (ver decisão de design nº 1 no cabeçalho do arquivo). */
const ETAPAS_TERMINAIS: ReadonlySet<EtapaLead> = new Set(["convertido", "perdido"]);

/** Único próximo passo válido de avanço no funil a partir de cada etapa não-terminal —
 * avanço estrito de um passo, pular etapa não é permitido (ver decisão de design nº 1). */
const PROXIMA_ETAPA_FUNIL: Record<Exclude<EtapaLead, "convertido" | "perdido">, EtapaLead> = {
  novo: "contatado",
  contatado: "visita_agendada",
  visita_agendada: "proposta",
  proposta: "convertido",
};

function agora(): string {
  return new Date().toISOString();
}

function imovelExiste(db: Database, imovelId: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [imovelId]).length > 0;
}

function obterLeadBruto(db: Database, leadId: number): Lead | null {
  return consultar<Lead>(db, "SELECT * FROM leads WHERE id = ?", [leadId])[0] ?? null;
}

function obterPropostaBruta(db: Database, propostaId: number): LeadProposta | null {
  return consultar<LeadProposta>(db, "SELECT * FROM lead_propostas WHERE id = ?", [propostaId])[0] ?? null;
}

// ============================================================================
// CRIAÇÃO
// ============================================================================

export interface NovoLead {
  nome: string;
  imovelId?: number;
  contato?: string;
  fonte?: string;
  interesse?: string;
}

/** Cria um lead — nasce sempre 'novo', sem evento inicial (mesmo espírito de
 * `criarOrdemServico`: a ENTIDADE nasce, o EVENTO só existe a partir da primeira
 * transição de etapa real, via `moverEtapaLead`). */
export function criarLead(db: Database, dados: NovoLead): ResultadoOperacaoLead {
  if (!dados.nome || !dados.nome.trim()) {
    return { sucesso: false, mensagem: "Informe o nome do lead." };
  }
  if (dados.imovelId !== undefined && !imovelExiste(db, dados.imovelId)) {
    return { sucesso: false, mensagem: `Imóvel ${dados.imovelId} não encontrado.` };
  }

  executar(
    db,
    `INSERT INTO leads (imovel_id, nome, contato, fonte, interesse, etapa, criado_em)
     VALUES (?, ?, ?, ?, ?, 'novo', ?)`,
    [
      dados.imovelId ?? null,
      dados.nome.trim(),
      dados.contato?.trim() || null,
      dados.fonte?.trim() || null,
      dados.interesse?.trim() || null,
      agora(),
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Lead criado.", id };
}

// ============================================================================
// TRANSIÇÕES DE ETAPA (máquina de estados do funil)
// ============================================================================

/** Move o lead para uma nova etapa do funil — só aceita AVANÇAR exatamente um passo
 * (novo→contatado→visita_agendada→proposta→convertido, ver `PROXIMA_ETAPA_FUNIL`) ou ir
 * para 'perdido' a partir de qualquer etapa não-terminal. Uma vez 'convertido' ou
 * 'perdido' (etapas terminais), nenhuma transição nova é aceita. Toda transição
 * bem-sucedida grava um evento append-only em `lead_etapa_eventos` e atualiza
 * `leads.etapa` atomicamente — nada é gravado em caso de rejeição. */
export function moverEtapaLead(db: Database, leadId: number, novaEtapa: EtapaLead, ator: string): ResultadoOperacaoLead {
  const lead = obterLeadBruto(db, leadId);
  if (!lead) {
    return { sucesso: false, mensagem: `Lead ${leadId} não encontrado.` };
  }
  if (!ator || !ator.trim()) {
    return { sucesso: false, mensagem: "Informe o ator responsável pela mudança de etapa." };
  }
  if (ETAPAS_TERMINAIS.has(lead.etapa)) {
    return {
      sucesso: false,
      mensagem: `Lead já está em etapa terminal ('${lead.etapa}') — nenhuma transição nova é permitida.`,
    };
  }

  const proximaEtapaValida = PROXIMA_ETAPA_FUNIL[lead.etapa as Exclude<EtapaLead, "convertido" | "perdido">];
  const transicaoValida = novaEtapa === "perdido" || novaEtapa === proximaEtapaValida;
  if (!transicaoValida) {
    return {
      sucesso: false,
      mensagem: `Transição inválida: lead está em '${lead.etapa}', só pode avançar para '${proximaEtapaValida}' ou ir para 'perdido'.`,
    };
  }

  executar(
    db,
    `INSERT INTO lead_etapa_eventos (lead_id, etapa_anterior, etapa_nova, ator, criado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [leadId, lead.etapa, novaEtapa, ator.trim(), agora()],
  );
  executar(db, "UPDATE leads SET etapa = ? WHERE id = ?", [novaEtapa, leadId]);
  return { sucesso: true, mensagem: `Lead movido de '${lead.etapa}' para '${novaEtapa}'.`, id: leadId };
}

// ============================================================================
// PROPOSTAS
// ============================================================================

export interface NovaPropostaLead {
  leadId: number;
  imovelId: number;
  valorProposto: number;
  condicoes?: string;
}

/** Cria uma proposta em 'rascunho' — exige apenas que o lead não esteja numa etapa
 * terminal ('convertido'/'perdido'); não exige que o lead já esteja exatamente em etapa
 * 'proposta' (ver decisão de design nº 2 no cabeçalho do arquivo). Quem move o lead para
 * 'proposta' é `moverEtapaLead`, chamado separadamente pelo operador. */
export function criarPropostaLead(db: Database, dados: NovaPropostaLead): ResultadoOperacaoLead {
  const lead = obterLeadBruto(db, dados.leadId);
  if (!lead) {
    return { sucesso: false, mensagem: `Lead ${dados.leadId} não encontrado.` };
  }
  if (ETAPAS_TERMINAIS.has(lead.etapa)) {
    return {
      sucesso: false,
      mensagem: `Lead já está em etapa terminal ('${lead.etapa}') — não é possível criar proposta nova.`,
    };
  }
  if (!imovelExiste(db, dados.imovelId)) {
    return { sucesso: false, mensagem: `Imóvel ${dados.imovelId} não encontrado.` };
  }
  if (!(dados.valorProposto > 0)) {
    return { sucesso: false, mensagem: "Valor proposto deve ser maior que zero." };
  }

  executar(
    db,
    `INSERT INTO lead_propostas (lead_id, imovel_id, valor_proposto, condicoes, status, criado_em)
     VALUES (?, ?, ?, ?, 'rascunho', ?)`,
    [dados.leadId, dados.imovelId, dados.valorProposto, dados.condicoes?.trim() || null, agora()],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Proposta criada (rascunho).", id };
}

/** Envia a proposta ao lead — só a partir de 'rascunho'. */
export function enviarProposta(db: Database, propostaId: number): ResultadoOperacaoLead {
  const proposta = obterPropostaBruta(db, propostaId);
  if (!proposta) {
    return { sucesso: false, mensagem: `Proposta ${propostaId} não encontrada.` };
  }
  if (proposta.status !== "rascunho") {
    return { sucesso: false, mensagem: `Proposta já está '${proposta.status}' — só é possível enviar uma proposta em 'rascunho'.` };
  }
  executar(db, "UPDATE lead_propostas SET status = 'enviada' WHERE id = ?", [propostaId]);
  return { sucesso: true, mensagem: "Proposta enviada.", id: propostaId };
}

/** Decide uma proposta já enviada — 'aceita' ou 'recusada', preenchendo `decidido_em`.
 * Recusa decidir uma proposta ainda 'rascunho' (envie primeiro) ou já decidida antes
 * (ver decisão de design nº 5). Se `aceita = true`, chama internamente
 * `moverEtapaLead(db, lead_id, 'convertido', ator)` ANTES de marcar a proposta como
 * 'aceita' — se o lead não estiver exatamente em etapa 'proposta' nesse momento, a
 * transição falha e a proposta permanece 'enviada' (tudo ou nada, ver decisão de design
 * nº 3). REGRA DE OURO: aceitar não cria linha nenhuma em `contratos_locacao` — a
 * conversão em contrato continua sendo ação manual e separada do usuário. */
export function decidirProposta(db: Database, propostaId: number, aceita: boolean, ator: string): ResultadoOperacaoLead {
  const proposta = obterPropostaBruta(db, propostaId);
  if (!proposta) {
    return { sucesso: false, mensagem: `Proposta ${propostaId} não encontrada.` };
  }
  if (proposta.status === "aceita" || proposta.status === "recusada") {
    return {
      sucesso: false,
      mensagem: `Proposta já foi decidida (status '${proposta.status}' em ${proposta.decidido_em}) — não pode ser decidida de novo.`,
    };
  }
  if (proposta.status !== "enviada") {
    return { sucesso: false, mensagem: `Proposta está '${proposta.status}' — envie com enviarProposta antes de decidir.` };
  }

  if (aceita) {
    const conversao = moverEtapaLead(db, proposta.lead_id, "convertido", ator);
    if (!conversao.sucesso) {
      return { sucesso: false, mensagem: `Não foi possível converter o lead: ${conversao.mensagem}` };
    }
  }

  const novoStatus: StatusPropostaLead = aceita ? "aceita" : "recusada";
  executar(db, "UPDATE lead_propostas SET status = ?, decidido_em = ? WHERE id = ?", [novoStatus, agora(), propostaId]);
  return { sucesso: true, mensagem: `Proposta '${novoStatus}'.`, id: propostaId };
}

// ============================================================================
// LEITURA
// ============================================================================

export interface FiltrosLeads {
  etapa?: EtapaLead;
  imovelId?: number;
}

/** Lista leads com filtro opcional de etapa/imóvel. */
export function listarLeads(db: Database, filtros: FiltrosLeads = {}): Lead[] {
  let sql = "SELECT * FROM leads WHERE 1 = 1";
  const params: (string | number)[] = [];
  if (filtros.etapa) {
    sql += " AND etapa = ?";
    params.push(filtros.etapa);
  }
  if (filtros.imovelId !== undefined) {
    sql += " AND imovel_id = ?";
    params.push(filtros.imovelId);
  }
  sql += " ORDER BY id ASC";
  return consultar<Lead>(db, sql, params);
}

/** Lead com seu histórico completo: eventos de etapa (append-only, ordem cronológica) e
 * propostas — ou null se o lead não existir. */
export function obterLeadComHistorico(
  db: Database,
  leadId: number,
): (Lead & { eventos: LeadEtapaEvento[]; propostas: LeadProposta[] }) | null {
  const lead = obterLeadBruto(db, leadId);
  if (!lead) return null;
  const eventos = consultar<LeadEtapaEvento>(
    db,
    "SELECT * FROM lead_etapa_eventos WHERE lead_id = ? ORDER BY id ASC",
    [leadId],
  );
  const propostas = consultar<LeadProposta>(
    db,
    "SELECT * FROM lead_propostas WHERE lead_id = ? ORDER BY id ASC",
    [leadId],
  );
  return { ...lead, eventos, propostas };
}

/** Contagem de leads por etapa, para um painel de funil — sempre inclui as 6 etapas
 * possíveis (com 0 quando não há lead nela), para o painel não precisar tratar etapa
 * ausente como caso especial. */
export function funilResumo(db: Database): Record<EtapaLead, number> {
  const resumo: Record<EtapaLead, number> = {
    novo: 0,
    contatado: 0,
    visita_agendada: 0,
    proposta: 0,
    convertido: 0,
    perdido: 0,
  };
  const linhas = consultar<{ etapa: EtapaLead; total: number }>(
    db,
    "SELECT etapa, COUNT(*) AS total FROM leads GROUP BY etapa",
  );
  for (const linha of linhas) {
    resumo[linha.etapa] = linha.total;
  }
  return resumo;
}
