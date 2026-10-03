/**
 * Envelope de controle de exportações: `exportacoes_geradas` + `exportacoes_acessos`
 * (ver contabilidade-reconstituicao/schema.sql e schema.postgres.sql).
 *
 * Este módulo NÃO gera documento nenhum — ele envolve as funções de geração que já existem
 * (gerarLaudoPdf.ts, gerarRadPdf.ts, ecd-export.ts) e registra, para o conteúdo exato
 * produzido, um envelope com hash SHA-256, quem gerou, validade opcional e uma trilha
 * append-only de cada acesso. Serve para responder depois, com prova: "isto que estou
 * entregando agora é byte a byte o mesmo que foi gerado naquela data?" (verificarIntegridade-
 * Exportacao) e "quem e quando acessou este PDF/CSV/TXT desde então?" (listarAcessosDeExportacao).
 *
 * Revogar uma exportação (revogarExportacao) não apaga o registro nem o conteúdo entregue
 * antes — é sinalização de que aquele envelope não deve mais ser considerado válido para
 * novo acesso; um acesso a exportação revogada ou expirada é bloqueado ANTES de gravar,
 * porque registrar acesso a algo que não deveria mais estar acessível seria uma trilha de
 * auditoria mentirosa (pareceria que o acesso foi legítimo).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { gerarLaudoPdf, type DadosLaudo } from "../laudo/gerarLaudoPdf";
import { gerarRadPdf, type DadosRad } from "../laudo/gerarRadPdf";
import { gerarExportacaoECD, exportarECDComoTxt } from "../erp/ecd-export";

export type FormatoExportacao = "pdf" | "csv" | "json" | "txt" | "xlsx";

export interface ExportacaoGerada {
  id: number;
  tipo: string;
  formato: FormatoExportacao;
  arquivo_hash: string;
  gerado_por: string;
  gerado_em: string;
  expira_em: string | null;
  revogado: number; // 0 | 1 — é assim que sql.js devolve INTEGER
}

export interface ExportacaoAcesso {
  id: number;
  exportacao_id: number;
  acessado_em: string;
  ator: string;
}

/** SHA-256 do conteúdo em hexadecimal, pela Web Crypto API (`crypto.subtle`) — o mesmo
 * padrão já usado em src/domain/importacao/cofre.ts, src/domain/erp/ledger.ts e
 * src/domain/erp/compliance-audit-log.ts (nunca o módulo `crypto` nativo do Node, que o
 * Vite externaliza e estoura em tempo de execução no navegador). Nenhum desses três aceita
 * indistintamente string OU bytes — cada um foi escrito para o tipo do seu próprio
 * chamador —, por isso a função abaixo cobre a união aqui, sem duplicar a lógica de hash em
 * si (é a mesma chamada a `crypto.subtle.digest("SHA-256", ...)` seguida da mesma conversão
 * para hex). */
export async function calcularHashConteudo(conteudo: string | Uint8Array): Promise<string> {
  const bytes = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo;
  // slice() garante um ArrayBuffer próprio (não SharedArrayBuffer nem uma view sobre um
  // buffer maior) — mesmo cuidado de hashDoArquivo() em cofre.ts.
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DadosExportacaoGerada {
  tipo: string;
  formato: FormatoExportacao;
  conteudo: string | Uint8Array;
  geradoPor: string;
  /** Dias até a exportação expirar, a partir de agora. Omitido/undefined = sem expiração. */
  validadeDias?: number;
}

/** Registra o envelope de controle de uma exportação já gerada — hash do conteúdo exato,
 * quem gerou e validade opcional. Não persiste o conteúdo em si (isso já é responsabilidade
 * de cada gerador: PDF vai para download do navegador, ECD/CSV idem) — só a prova do que foi
 * gerado. O chamador ainda precisa persistir() o banco depois, como em qualquer outra
 * escrita neste sistema. */
export async function registrarExportacaoGerada(
  db: Database,
  dados: DadosExportacaoGerada,
): Promise<{ id: number; hash: string }> {
  const hash = await calcularHashConteudo(dados.conteudo);
  const expiraEm =
    dados.validadeDias !== undefined
      ? new Date(Date.now() + dados.validadeDias * 24 * 60 * 60 * 1000).toISOString()
      : null;

  executar(
    db,
    `INSERT INTO exportacoes_geradas (tipo, formato, arquivo_hash, gerado_por, gerado_em, expira_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.tipo, dados.formato, hash, dados.geradoPor, new Date().toISOString(), expiraEm],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");

  return { id, hash };
}

/** Registra um acesso (reabertura/reenvio) a uma exportação já gerada — append-only.
 *
 * Bloqueia ANTES de gravar quando a exportação está revogada ou expirada: não existe
 * "acesso legítimo" a um envelope que não deveria mais estar acessível, então gravar a
 * linha mesmo assim produziria uma trilha de auditoria que parece dizer o contrário. */
export function registrarAcessoExportacao(db: Database, exportacaoId: number, ator: string): void {
  const [exportacao] = consultar<{ revogado: number; expira_em: string | null }>(
    db,
    "SELECT revogado, expira_em FROM exportacoes_geradas WHERE id = ?",
    [exportacaoId],
  );

  if (!exportacao) {
    throw new Error(`Exportação #${exportacaoId} não encontrada — nenhum acesso registrado.`);
  }
  if (exportacao.revogado === 1) {
    throw new Error(`Exportação #${exportacaoId} foi revogada — acesso bloqueado, nenhum acesso registrado.`);
  }
  if (exportacao.expira_em !== null && exportacao.expira_em < new Date().toISOString()) {
    throw new Error(
      `Exportação #${exportacaoId} expirou em ${exportacao.expira_em} — acesso bloqueado, nenhum acesso registrado.`,
    );
  }

  executar(
    db,
    "INSERT INTO exportacoes_acessos (exportacao_id, acessado_em, ator) VALUES (?, ?, ?)",
    [exportacaoId, new Date().toISOString(), ator],
  );
}

/** Revoga uma exportação: acessos futuros a ela passam a ser bloqueados por
 * registrarAcessoExportacao(). Não apaga o registro nem desfaz acessos já gravados antes. */
export function revogarExportacao(db: Database, exportacaoId: number): void {
  executar(db, "UPDATE exportacoes_geradas SET revogado = 1 WHERE id = ?", [exportacaoId]);
}

export interface FiltrosListarExportacoes {
  tipo?: string;
  geradoPor?: string;
}

/** Lista exportações geradas, mais recente primeiro, com filtro opcional por tipo e/ou
 * quem gerou. */
export function listarExportacoes(db: Database, filtros: FiltrosListarExportacoes = {}): ExportacaoGerada[] {
  const condicoes: string[] = [];
  const params: (string | number | null)[] = [];

  if (filtros.tipo !== undefined) {
    condicoes.push("tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.geradoPor !== undefined) {
    condicoes.push("gerado_por = ?");
    params.push(filtros.geradoPor);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  return consultar<ExportacaoGerada>(
    db,
    `SELECT * FROM exportacoes_geradas ${where} ORDER BY gerado_em DESC, id DESC`,
    params,
  );
}

/** Lista os acessos registrados para uma exportação, em ordem cronológica. */
export function listarAcessosDeExportacao(db: Database, exportacaoId: number): ExportacaoAcesso[] {
  return consultar<ExportacaoAcesso>(
    db,
    "SELECT * FROM exportacoes_acessos WHERE exportacao_id = ? ORDER BY acessado_em ASC, id ASC",
    [exportacaoId],
  );
}

/** Recalcula o hash do conteúdo fornecido e compara com o hash gravado no envelope — prova
 * depois que um arquivo entregue (ex: o PDF que a parte contrária recebeu) é exatamente o
 * que este sistema gerou, e não uma versão alterada. `false` também quando a exportação não
 * existe (não há hash gravado contra o qual comparar). */
export async function verificarIntegridadeExportacao(
  db: Database,
  exportacaoId: number,
  conteudoAtual: string | Uint8Array,
): Promise<boolean> {
  const [exportacao] = consultar<{ arquivo_hash: string }>(
    db,
    "SELECT arquivo_hash FROM exportacoes_geradas WHERE id = ?",
    [exportacaoId],
  );
  if (!exportacao) return false;

  const hashAtual = await calcularHashConteudo(conteudoAtual);
  return hashAtual === exportacao.arquivo_hash;
}

// ---------------------------------------------------------------------------------------
// Conveniência: geração real + registro de controle, num só passo. Cada função abaixo só
// CHAMA o gerador original e passa o resultado para registrarExportacaoGerada() — nenhuma
// lógica de geração é duplicada aqui.
// ---------------------------------------------------------------------------------------

/** Gera o laudo pericial em PDF (gerarLaudoPdf.ts, sem alterar nada nele) e registra o
 * envelope de controle do conteúdo exato gerado. Devolve o próprio jsPDF (para o chamador
 * decidir o que fazer com ele — salvar, baixar, etc.) junto com o id e o hash do envelope. */
export async function gerarLaudoPdfControlado(
  db: Database,
  dados: DadosLaudo,
  geradoPor: string,
  validadeDias?: number,
): Promise<{ doc: Awaited<ReturnType<typeof gerarLaudoPdf>>; id: number; hash: string }> {
  const doc = await gerarLaudoPdf(dados);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const { id, hash } = await registrarExportacaoGerada(db, {
    tipo: "laudo_pericial",
    formato: "pdf",
    conteudo: bytes,
    geradoPor,
    validadeDias,
  });
  return { doc, id, hash };
}

/** Gera o RAD em PDF (gerarRadPdf.ts, sem alterar nada nele) e registra o envelope de
 * controle do conteúdo exato gerado. */
export async function gerarRadPdfControlado(
  db: Database,
  dados: DadosRad,
  geradoPor: string,
  validadeDias?: number,
): Promise<{ doc: Awaited<ReturnType<typeof gerarRadPdf>>; id: number; hash: string }> {
  const doc = await gerarRadPdf(dados);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const { id, hash } = await registrarExportacaoGerada(db, {
    tipo: "rad",
    formato: "pdf",
    conteudo: bytes,
    geradoPor,
    validadeDias,
  });
  return { doc, id, hash };
}

export interface ArgsGerarEcdControlado {
  entidade_id: number;
  periodo_id: number;
  nomeContador?: string;
  cpfContador?: string;
}

/** Gera a exportação ECD (ecd-export.ts, sem alterar nada nele) no formato texto SPED — o
 * mesmo que `exportarECDComoTxt` já produz para o arquivo que vai à Receita — e registra o
 * envelope de controle do conteúdo exato gerado. */
export async function gerarEcdControlado(
  db: Database,
  args: ArgsGerarEcdControlado,
  geradoPor: string,
  validadeDias?: number,
): Promise<{ relatorio: ReturnType<typeof gerarExportacaoECD>; conteudoTxt: string; id: number; hash: string }> {
  const relatorio = gerarExportacaoECD(db, args.entidade_id, args.periodo_id, args.nomeContador, args.cpfContador);
  const conteudoTxt = exportarECDComoTxt(relatorio);
  const { id, hash } = await registrarExportacaoGerada(db, {
    tipo: "ecd",
    formato: "txt",
    conteudo: conteudoTxt,
    geradoPor,
    validadeDias,
  });
  return { relatorio, conteudoTxt, id, hash };
}
