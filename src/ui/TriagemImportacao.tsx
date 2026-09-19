import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileWarning,
  Fingerprint,
  Trash2,
  X,
} from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "./useToast";
import { consultar } from "../db/connection";
import {
  aprovarLinhas,
  concluirLote,
  corrigirLinha,
  descartarLote,
  listarLinhas,
  listarLotes,
  rejeitarLinhas,
  type LinhaTriagem,
  type ResumoLote,
} from "../domain/importacao/triagem";
import { sincronizarRazao } from "../domain/erp/entidadeLegal";

/** Triagem de importação e cofre de evidências.
 *
 * Nada que entra por arquivo vira lançamento contábil sem passar por aqui. Cada arquivo é
 * um lote, com o SHA-256 do próprio conteúdo — é esse hash que permite, depois, provar
 * que o extrato apresentado num laudo é byte a byte o que originou o valor.
 *
 * A tela mostra o que o fluxo antigo escondia: a linha que o parser não conseguiu ler
 * (antes era descartada com uma contagem no rodapé), a que parece duplicata de algo já
 * lançado (antes o banco só pegava OFX, por FITID — CSV e PDF dobravam em silêncio) e a
 * que foi recusada, com o motivo de ter ficado de fora. */

const ROTULO_STATUS: Record<LinhaTriagem["status"], { texto: string; pill: string }> = {
  pendente: { texto: "pendente", pill: "" },
  aprovada: { texto: "aprovada", pill: "good" },
  rejeitada: { texto: "rejeitada", pill: "" },
  duplicata_provavel: { texto: "possível duplicidade", pill: "warning" },
  malformada: { texto: "ilegível no arquivo", pill: "critical" },
};

function formatarTamanho(bytes: number) {
  if (bytes === 0) return "sem arquivo (API)";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function moeda(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TriagemImportacao() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [loteAberto, setLoteAberto] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);
  const [hashCopiado, setHashCopiado] = useState<string | null>(null);

  const lotes = useMemo<ResumoLote[]>(() => (db ? listarLotes(db) : []), [db, versao, tick]);
  const linhas = useMemo<LinhaTriagem[]>(
    () => (db && loteAberto ? listarLinhas(db, loteAberto) : []),
    [db, loteAberto, versao, tick],
  );

  const atualizar = useCallback(async () => {
    await persistir();
    setSelecionadas(new Set());
    setTick((t) => t + 1);
  }, [persistir]);

  const alternar = (id: number) =>
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const decidiveis = linhas.filter((l) => l.status !== "aprovada" && l.status !== "rejeitada");

  const aprovar = useCallback(async () => {
    if (!db || selecionadas.size === 0) return;
    const r = aprovarLinhas(db, [...selecionadas]);

    // Aprovada, a linha vira transação — e transação só conta quando chega ao razão.
    // Sem isto a pessoa aprovaria a importação e os Relatórios Integrados continuariam
    // sem enxergar o valor, que é a discrepância que a auditoria já tinha apontado.
    const entidade = consultar<{ id: number }>(db, "SELECT id FROM entidades_legais ORDER BY id LIMIT 1")[0];
    const migracao = entidade ? sincronizarRazao(db, entidade.id) : null;

    await atualizar();

    if (r.aprovadas === 0) {
      avisar("critical", r.recusadas[0]?.motivo ?? "Nenhuma linha pôde ser aprovada.");
      return;
    }
    const partes = [`${r.aprovadas} linha(s) aprovada(s) e lançada(s).`];
    if (migracao) partes.push(`${migracao.transacoes_migradas} no razão.`);
    if (r.recusadas.length > 0) partes.push(`${r.recusadas.length} recusada(s): ${r.recusadas[0].motivo}`);
    avisar(r.recusadas.length > 0 ? "warning" : "good", partes.join(" "));
  }, [db, selecionadas, atualizar, avisar]);

  const rejeitar = useCallback(async () => {
    if (!db || selecionadas.size === 0) return;
    const motivo = prompt(
      "Por que estas linhas não entram na contabilidade?\n(O motivo fica registrado — é o que explica a ausência do valor depois.)",
    );
    if (motivo === null) return;
    const r = rejeitarLinhas(db, [...selecionadas], motivo);
    await atualizar();
    if (r.rejeitadas === 0) {
      avisar("critical", r.recusadas[0]?.motivo ?? "Nenhuma linha pôde ser rejeitada.");
      return;
    }
    avisar("good", `${r.rejeitadas} linha(s) rejeitada(s) com motivo registrado.`);
  }, [db, selecionadas, atualizar, avisar]);

  const corrigir = useCallback(
    async (linha: LinhaTriagem) => {
      if (!db) return;
      const campos: { data?: string; valor?: number } = {};
      if (linha.data === null) {
        const data = prompt(`Data da linha ${linha.linha_numero} (AAAA-MM-DD):\n"${linha.descricao_original}"`);
        if (data === null) return;
        campos.data = data.trim();
      }
      if (linha.valor === null) {
        const valor = prompt(`Valor da linha ${linha.linha_numero} (use ponto decimal, negativo para saída):\n"${linha.descricao_original}"`);
        if (valor === null) return;
        campos.valor = Number(valor.replace(",", "."));
      }
      const r = corrigirLinha(db, linha.id, campos);
      await atualizar();
      avisar(r.sucesso ? "good" : "critical", r.mensagem);
    },
    [db, atualizar, avisar],
  );

  const concluir = useCallback(
    async (lote_id: number) => {
      if (!db) return;
      const r = concluirLote(db, lote_id);
      await atualizar();
      avisar(r.sucesso ? "good" : "warning", r.mensagem);
    },
    [db, atualizar, avisar],
  );

  const descartar = useCallback(
    async (lote_id: number) => {
      if (!db) return;
      const motivo = prompt("Por que este lote inteiro está sendo descartado?");
      if (motivo === null) return;
      const r = descartarLote(db, lote_id, motivo);
      await atualizar();
      avisar(r.sucesso ? (r.aprovadas_mantidas > 0 ? "warning" : "good") : "critical", r.mensagem);
    },
    [db, atualizar, avisar],
  );

  const copiarHash = useCallback(
    async (hash: string) => {
      try {
        await navigator.clipboard.writeText(hash);
        setHashCopiado(hash);
        setTimeout(() => setHashCopiado(null), 2000);
      } catch {
        avisar("warning", "O navegador bloqueou a cópia. Selecione o hash e copie à mão.");
      }
    },
    [avisar],
  );

  if (lotes.length === 0) {
    return (
      <div>
        <h2 className="section-title">Triagem de importação</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Nenhum arquivo em triagem. Os arquivos importados em <strong>Importar documentos</strong> aparecem
            aqui, linha a linha, antes de virarem lançamentos contábeis.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 0 }}>
            Cada arquivo entra com o SHA-256 do próprio conteúdo. É esse hash que prova, depois, que o
            documento apresentado é exatamente o que originou cada valor — nome de arquivo não prova nada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Triagem de importação e cofre de evidências</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8 }}>
        Nada vira lançamento contábil sem passar por aqui. Cada arquivo guarda o hash SHA-256 do próprio
        conteúdo, e cada linha guarda o número da linha no arquivo de origem.
      </p>

      {lotes.map((lote) => {
        const aberto = loteAberto === lote.id;
        const indecisas = lote.pendentes + lote.duplicatas + lote.malformadas;
        return (
          <div key={lote.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong>{lote.arquivo_nome}</strong>{" "}
                <span className={`pill ${lote.status === "concluido" ? "good" : lote.status === "descartado" ? "critical" : "warning"}`}>
                  {lote.status === "em_triagem" ? "em triagem" : lote.status}
                </span>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                  {/* Arredondar tudo para KB mostrava "0 KB" num extrato pequeno, que parece
                      arquivo vazio — e, no cofre de evidências, o tamanho é parte da
                      identificação do documento. */}
                  {lote.tipo_detectado} · {formatarTamanho(lote.arquivo_bytes)} · {lote.total_linhas} linha(s) ·
                  importado em {new Date(lote.importado_em.replace(" ", "T") + "Z").toLocaleString("pt-BR")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <Fingerprint size={13} style={{ flexShrink: 0, color: "var(--ink-soft)" }} />
                  <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{lote.arquivo_hash_sha256}</code>
                  <button className="btn" style={{ padding: "2px 7px", fontSize: 11.5 }} onClick={() => copiarHash(lote.arquivo_hash_sha256)}>
                    {hashCopiado === lote.arquivo_hash_sha256 ? <><Check size={11} /> copiado</> : <><Copy size={11} /> copiar</>}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {lote.aprovadas > 0 && <span className="pill good">{lote.aprovadas} aprovada(s)</span>}
                {lote.duplicatas > 0 && <span className="pill warning">{lote.duplicatas} possível duplicidade</span>}
                {lote.malformadas > 0 && <span className="pill critical">{lote.malformadas} ilegível</span>}
                {lote.rejeitadas > 0 && <span className="pill">{lote.rejeitadas} rejeitada(s)</span>}
                {lote.pendentes > 0 && <span className="pill">{lote.pendentes} pendente(s)</span>}
              </div>
            </div>

            <div className="toolbar-actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { setLoteAberto(aberto ? null : lote.id); setSelecionadas(new Set()); }}>
                {aberto ? "Fechar linhas" : "Ver linhas"}
              </button>
              {lote.status === "em_triagem" && (
                <>
                  <button className="btn" onClick={() => concluir(lote.id)} disabled={indecisas > 0} title={indecisas > 0 ? `${indecisas} linha(s) ainda sem decisão` : undefined}>
                    <CheckCircle2 size={14} /> Concluir lote
                  </button>
                  <button className="btn danger" onClick={() => descartar(lote.id)}>
                    <Trash2 size={14} /> Descartar lote
                  </button>
                </>
              )}
            </div>

            {aberto && (
              <>
                {decidiveis.length > 0 && (
                  <div className="toolbar-actions" style={{ marginTop: 14 }}>
                    <button className="btn" onClick={() => setSelecionadas(new Set(decidiveis.map((l) => l.id)))}>
                      Selecionar as {decidiveis.length} sem decisão
                    </button>
                    <button className="btn primary" onClick={aprovar} disabled={selecionadas.size === 0}>
                      <Check size={14} /> Aprovar {selecionadas.size > 0 ? `(${selecionadas.size})` : ""}
                    </button>
                    <button className="btn" onClick={rejeitar} disabled={selecionadas.size === 0}>
                      <X size={14} /> Rejeitar com motivo
                    </button>
                  </div>
                )}

                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }} />
                        <th style={{ width: 48 }}>Linha</th>
                        <th>Data</th>
                        <th>Descrição no arquivo</th>
                        <th className="num">Valor</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const decidivel = l.status !== "aprovada" && l.status !== "rejeitada";
                        return (
                          <tr key={l.id}>
                            <td>
                              {decidivel && (
                                <input
                                  type="checkbox"
                                  checked={selecionadas.has(l.id)}
                                  onChange={() => alternar(l.id)}
                                  aria-label={`Selecionar linha ${l.linha_numero}`}
                                />
                              )}
                            </td>
                            <td className="num">{l.linha_numero}</td>
                            <td>{l.data ?? <span style={{ color: "var(--warn)" }}>ilegível</span>}</td>
                            <td>
                              {l.descricao_original}
                              {l.motivo && (
                                <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: 5, marginTop: 3 }}>
                                  {l.status === "malformada" ? <FileWarning size={12} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
                                  <span>{l.motivo}</span>
                                </div>
                              )}
                            </td>
                            <td className="num">{moeda(l.valor)}</td>
                            <td>
                              <span className={`pill ${ROTULO_STATUS[l.status].pill}`}>{ROTULO_STATUS[l.status].texto}</span>
                              {l.status === "malformada" && (
                                <button className="btn" style={{ padding: "2px 7px", fontSize: 11.5, marginLeft: 6 }} onClick={() => corrigir(l)}>
                                  corrigir
                                </button>
                              )}
                              {l.decidido_em && (
                                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>
                                  {l.decidido_por} · {new Date(l.decidido_em.replace(" ", "T") + "Z").toLocaleString("pt-BR")}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
