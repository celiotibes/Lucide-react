/**
 * Publicação do espelho do portal do inquilino (lado do app do dono).
 *
 * A verdade contábil continua no sql.js local; aqui só se monta uma VITRINE mínima e a envia ao servidor
 * (POST /api/portal/publicar — ver docs/PORTAL-INQUILINO-SERVIDOR.md). Nada volta do servidor para o razão.
 *
 * Minimização (LGPD): só apelido do imóvel, valor, vencimento, vigência e cobranças. Sem CPF, e-mail,
 * telefone, endereço, nome do locatário, caução, multas ou juros. Valores em CENTAVOS inteiros, validados
 * por `normalizarCentavos` (recusa fração de centavo em vez de arredondar em silêncio).
 *
 * Este módulo NÃO conhece login/cookies: a chamada HTTP usa um `apiFetch` injetado (cliente autenticado
 * do app), o que também a torna testável sem rede.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { normalizarCentavos } from "../erp/ledger";

export type StatusCobrancaPortal = "pendente" | "paga" | "vencida" | "cancelada";

export interface CobrancaPortal {
  cobrancaRef: string;
  competencia: string; // YYYY-MM
  vencimento: string; // YYYY-MM-DD
  valorCentavos: number;
  status: StatusCobrancaPortal;
  dataPagamento?: string | null;
}

export interface PayloadPublicacaoPortal {
  usuarioId: string;
  contratoRef: string;
  versao: number;
  imovelApelido: string;
  valorAluguelCentavos: number;
  diaVencimento: number | null;
  dataInicio: string;
  dataFim: string | null;
  cobrancas: CobrancaPortal[];
}

/** Linhas locais (sql.js) de que o montador precisa — nada além disso entra no payload. */
export interface EntradaMontagemPortal {
  /** Id do usuário com papel inquilino no SERVIDOR (não existe no banco local). */
  usuarioId: string;
  /** Inteiro crescente por contrato; reenviar a mesma versão com o mesmo conteúdo é idempotente. */
  versao: number;
  /** Data de referência (YYYY-MM-DD) para decidir pendente x vencida. */
  hoje: string;
  contrato: {
    id: number;
    valor_referencia: number;
    dia_vencimento: number | null;
    data_inicio: string;
    data_fim: string | null;
  };
  imovel: { apelido: string };
  competencias: Array<{
    id: number;
    ano: number;
    mes: number;
    valor_devido: number;
    data_vencimento: string;
    status: "pendente" | "recebido" | "cancelado";
    data_recebimento: string | null;
  }>;
}

export function reaisParaCentavos(valor: number, campo: string): number {
  return Math.round(normalizarCentavos(valor, campo) * 100);
}

function statusDaCompetencia(
  status: "pendente" | "recebido" | "cancelado",
  vencimento: string,
  hoje: string,
): StatusCobrancaPortal {
  if (status === "recebido") return "paga";
  if (status === "cancelado") return "cancelada";
  return vencimento < hoje ? "vencida" : "pendente";
}

/** Função pura: linhas locais -> payload do servidor. Lança se algum valor não for centavo exato. */
export function montarPayloadPortal(e: EntradaMontagemPortal): PayloadPublicacaoPortal {
  const cobrancas = [...e.competencias]
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
    .map<CobrancaPortal>((c) => {
      const status = statusDaCompetencia(c.status, c.data_vencimento, e.hoje);
      return {
        cobrancaRef: String(c.id),
        competencia: `${c.ano}-${String(c.mes).padStart(2, "0")}`,
        vencimento: c.data_vencimento,
        valorCentavos: reaisParaCentavos(c.valor_devido, `valor_devido da competência ${c.ano}-${c.mes}`),
        status,
        dataPagamento: status === "paga" ? (c.data_recebimento ?? null) : null,
      };
    });
  return {
    usuarioId: e.usuarioId,
    contratoRef: String(e.contrato.id),
    versao: e.versao,
    imovelApelido: e.imovel.apelido,
    valorAluguelCentavos: reaisParaCentavos(e.contrato.valor_referencia, "valor_referencia"),
    diaVencimento: e.contrato.dia_vencimento ?? null,
    dataInicio: e.contrato.data_inicio,
    dataFim: e.contrato.data_fim ?? null,
    cobrancas,
  };
}

/** Lê do sql.js local apenas as colunas necessárias e monta o payload. `null` se o contrato não existe. */
export function lerContratoParaPortal(
  db: Database,
  contratoId: number,
  opcoes: { usuarioId: string; versao: number; hoje: string },
): PayloadPublicacaoPortal | null {
  const contrato = consultar<EntradaMontagemPortal["contrato"] & { imovel_id: number }>(
    db,
    "SELECT id, imovel_id, valor_referencia, dia_vencimento, data_inicio, data_fim FROM contratos_locacao WHERE id = ?",
    [contratoId],
  )[0];
  if (!contrato) return null;
  const imovel = consultar<{ apelido: string }>(db, "SELECT apelido FROM imoveis WHERE id = ?", [contrato.imovel_id])[0];
  if (!imovel) return null;
  const competencias = consultar<EntradaMontagemPortal["competencias"][number]>(
    db,
    `SELECT id, ano, mes, valor_devido, data_vencimento, status, data_recebimento
       FROM aluguel_competencias WHERE contrato_id = ? ORDER BY ano, mes`,
    [contratoId],
  );
  return montarPayloadPortal({ ...opcoes, contrato, imovel, competencias });
}

/** Cliente HTTP autenticado injetado (o do app); como `fetch`, com caminho relativo à API. */
export type ApiFetch = (caminho: string, init?: RequestInit) => Promise<Response>;

export interface ResultadoPublicacaoPortal {
  ok: boolean;
  status: number;
  /** true quando o servidor já tinha exatamente esta versão/conteúdo. */
  idempotente?: boolean;
  erro?: string;
}

/** Envia o payload. Não lança por resposta HTTP de erro (devolve `ok:false` com a mensagem do servidor);
 * falha de rede propaga a exceção do `apiFetch` para o chamador decidir o retry (reenviar é seguro: idempotente). */
export async function publicarContratoNoPortal(
  apiFetch: ApiFetch,
  payload: PayloadPublicacaoPortal,
): Promise<ResultadoPublicacaoPortal> {
  const resp = await apiFetch("/api/portal/publicar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let corpo: { idempotente?: boolean; erro?: string; detalhes?: string[] } = {};
  try {
    corpo = await resp.json();
  } catch {
    /* corpo vazio/não JSON */
  }
  if (!resp.ok) {
    const detalhes = corpo.detalhes?.length ? ` (${corpo.detalhes.join("; ")})` : "";
    return { ok: false, status: resp.status, erro: `${corpo.erro ?? `HTTP ${resp.status}`}${detalhes}` };
  }
  return { ok: true, status: resp.status, idempotente: corpo.idempotente === true };
}
