import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface SugestaoIA {
  id: number;
  documento_id: number | null;
  campo: string;
  valor_sugerido: string;
  confianca: number;
  modelo?: string;
  status: "pendente" | "aceita" | "corrigida" | "rejeitada";
  valor_final?: string;
  revisado_por?: string;
  revisado_em?: string;
  criado_em: string;
}

export interface RegistroSugestao {
  documento_id?: number | null;
  campo: string;
  valor_sugerido: string;
  confianca: number;
  modelo?: string;
}

export interface RevisaoSugestao {
  status: "aceita" | "corrigida" | "rejeitada";
  valor_final?: string;
  revisado_por: string;
}

/** Registra uma sugestão de IA para um campo do documento. Nasce com status 'pendente'. */
export function registrarSugestao(db: Database, sugestao: RegistroSugestao): number {
  executar(
    db,
    `INSERT INTO sugestoes_ia_documentos (documento_id, campo, valor_sugerido, confianca, modelo, status, criado_em)
     VALUES (?, ?, ?, ?, ?, 'pendente', CURRENT_TIMESTAMP)`,
    [
      sugestao.documento_id ?? null,
      sugestao.campo,
      sugestao.valor_sugerido,
      sugestao.confianca,
      sugestao.modelo ?? null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

/** Revisa uma sugestão pendente. Transição permitida: 'pendente' → ('aceita'|'corrigida'|'rejeitada').
 * A função rejeita se já tiver sido revisada (status != 'pendente').
 * Para 'corrigida', valor_final é obrigatório. */
export function revisarSugestao(
  db: Database,
  id: number,
  revisao: RevisaoSugestao,
): void {
  const [sugestao] = consultar<SugestaoIA>(
    db,
    "SELECT status FROM sugestoes_ia_documentos WHERE id = ?",
    [id],
  );
  if (!sugestao) throw new Error(`Sugestão ${id} não encontrada`);
  if (sugestao.status !== "pendente") {
    throw new Error(`Sugestão ${id} já foi revisada (status: ${sugestao.status})`);
  }

  if (revisao.status === "corrigida" && !revisao.valor_final) {
    throw new Error("Valor final é obrigatório para status 'corrigida'");
  }

  executar(
    db,
    `UPDATE sugestoes_ia_documentos
     SET status = ?, valor_final = ?, revisado_por = ?, revisado_em = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [revisao.status, revisao.valor_final ?? null, revisao.revisado_por, id],
  );
}

/** Lista sugestões pendentes (opcionalmente filtradas por documento). */
export function sugestoesPendentes(db: Database, documentoId?: number): SugestaoIA[] {
  const sql = documentoId
    ? "SELECT * FROM sugestoes_ia_documentos WHERE status = 'pendente' AND documento_id = ? ORDER BY criado_em DESC"
    : "SELECT * FROM sugestoes_ia_documentos WHERE status = 'pendente' ORDER BY criado_em DESC";
  const params = documentoId ? [documentoId] : [];
  return consultar<SugestaoIA>(db, sql, params);
}

/** Define se uma sugestão EXIGE revisão humana obrigatória: confiança < 0.85 OU campo de
 * documento com valor >= 5000. Avalia apenas os critérios de negócio; não consulta o banco. */
export function exigeRevisaoHumana({
  confianca,
  valor,
}: {
  confianca: number;
  valor?: number;
}): boolean {
  if (confianca < 0.85) return true;
  if (valor !== undefined && valor >= 5000) return true;
  return false;
}

/** Define se um documento pode ser lançado em transações: retorna false enquanto houver
 * sugestão pendente que exige revisão humana. */
export function documentoPodeSerLancado(db: Database, documentoId: number): boolean {
  const pendentes = sugestoesPendentes(db, documentoId);
  for (const p of pendentes) {
    if (exigeRevisaoHumana({ confianca: p.confianca })) {
      return false;
    }
  }
  return true;
}

export interface DadosAcuracia {
  campo: string;
  total_revisado: number;
  aceitas: number;
  corrigidas: number;
  rejeitadas: number;
  taxa_acerto: number; // aceitas / (aceitas + corrigidas + rejeitadas)
}

export interface ResultadoAcuraciaIA {
  periodo: {
    de?: string;
    ate?: string;
  };
  por_campo: DadosAcuracia[];
  total: {
    revisado: number;
    aceitas: number;
    corrigidas: number;
    rejeitadas: number;
    taxa_acerto: number;
  };
}

/** Calcula acurácia de IA: por campo e/ou por período.
 * Taxa de acerto = aceitas / (aceitas + corrigidas + rejeitadas).
 * Ignora sugestões ainda pendentes. */
export function acuraciaIA(
  db: Database,
  filtro?: { de?: string; ate?: string },
): ResultadoAcuraciaIA {
  const whereClause = [];
  const params: (string | number | null)[] = [];

  if (filtro?.de) {
    whereClause.push("criado_em >= ?");
    params.push(filtro.de);
  }
  if (filtro?.ate) {
    whereClause.push("criado_em <= ?");
    params.push(filtro.ate);
  }

  // Exclui sugestões em 'pendente'
  whereClause.push("status IN ('aceita', 'corrigida', 'rejeitada')");

  const whereSql = whereClause.length ? "WHERE " + whereClause.join(" AND ") : "";

  // Por campo
  const porCampo = consultar<{
    campo: string;
    total_revisado: number;
    aceitas: number;
    corrigidas: number;
    rejeitadas: number;
  }>(
    db,
    `SELECT
      campo,
      COUNT(*) as total_revisado,
      SUM(CASE WHEN status = 'aceita' THEN 1 ELSE 0 END) as aceitas,
      SUM(CASE WHEN status = 'corrigida' THEN 1 ELSE 0 END) as corrigidas,
      SUM(CASE WHEN status = 'rejeitada' THEN 1 ELSE 0 END) as rejeitadas
    FROM sugestoes_ia_documentos
    ${whereSql}
    GROUP BY campo
    ORDER BY campo`,
    params,
  );

  const dadosPorCampo: DadosAcuracia[] = porCampo.map((row) => ({
    campo: row.campo,
    total_revisado: row.total_revisado,
    aceitas: row.aceitas,
    corrigidas: row.corrigidas,
    rejeitadas: row.rejeitadas,
    taxa_acerto: row.aceitas + row.corrigidas + row.rejeitadas > 0
      ? row.aceitas / (row.aceitas + row.corrigidas + row.rejeitadas)
      : 0,
  }));

  // Total
  const totalRow = consultar<{
    total_revisado: number;
    aceitas: number;
    corrigidas: number;
    rejeitadas: number;
  }>(
    db,
    `SELECT
      COUNT(*) as total_revisado,
      COALESCE(SUM(CASE WHEN status = 'aceita' THEN 1 ELSE 0 END), 0) as aceitas,
      COALESCE(SUM(CASE WHEN status = 'corrigida' THEN 1 ELSE 0 END), 0) as corrigidas,
      COALESCE(SUM(CASE WHEN status = 'rejeitada' THEN 1 ELSE 0 END), 0) as rejeitadas
    FROM sugestoes_ia_documentos
    ${whereSql}`,
    params,
  )[0] ?? { total_revisado: 0, aceitas: 0, corrigidas: 0, rejeitadas: 0 };

  const totalRevisado = totalRow.total_revisado;
  const totalAceitas = totalRow.aceitas;
  const totalCorrigidas = totalRow.corrigidas;
  const totalRejeitadas = totalRow.rejeitadas;

  return {
    periodo: { de: filtro?.de, ate: filtro?.ate },
    por_campo: dadosPorCampo,
    total: {
      revisado: totalRevisado,
      aceitas: totalAceitas,
      corrigidas: totalCorrigidas,
      rejeitadas: totalRejeitadas,
      taxa_acerto: totalAceitas + totalCorrigidas + totalRejeitadas > 0
        ? totalAceitas / (totalAceitas + totalCorrigidas + totalRejeitadas)
        : 0,
    },
  };
}
