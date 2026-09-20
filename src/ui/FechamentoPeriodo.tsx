import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  Lock,
  Loader2,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "./useToast";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { encerrarPeriodo, gerarBalancete, validarBalanceamento } from "../domain/erp/ledger";
import {
  listarPeriodosContabeis,
  obterUltimoEncerramento,
  NOME_MES,
  type PeriodoContabilResumo,
} from "../domain/fechamento/periodos";

/** Fechamento de período contábil.
 *
 * Não existe fluxo de reabertura no domínio (nenhuma função desfaz `status = 'fechado'`
 * em `periodos_contabeis`) — de propósito: um UPDATE direto furaria a garantia que o
 * hash_snapshot existe para dar. Por isso este botão não tem par de "reabrir": uma vez
 * fechado aqui, o período só volta a aceitar lançamento se alguém alterar o banco por
 * fora do app, o que a tela deixa explícito, não esconde.
 *
 * Não há sistema de usuário/login no app (é local, um titular só) — por isso
 * `encerrado_por` é gravado com um id fixo, na mesma convenção dos testes de domínio. */
const ENCERRADO_POR = 1;

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function descricaoPeriodo(p: { ano: number; mes: number }) {
  return `${NOME_MES[p.mes - 1]}/${p.ano}`;
}

export function FechamentoPeriodo() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [tick, setTick] = useState(0);
  const [periodoSelecionadoId, setPeriodoSelecionadoId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [hashCopiado, setHashCopiado] = useState(false);

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);

  const periodos = useMemo<PeriodoContabilResumo[]>(
    () => (db && entidade ? listarPeriodosContabeis(db, entidade.id) : []),
    [db, entidade, versao, tick],
  );

  // Período selecionado por clique; sem seleção prévia, cai no mais recente da lista
  // (que já vem ordenada por ano/mês decrescente) — é o que a pessoa quer ver primeiro
  // ao abrir a tela, sem exigir um clique extra.
  const periodoSelecionado = useMemo(
    () => periodos.find((p) => p.id === periodoSelecionadoId) ?? periodos[0] ?? null,
    [periodos, periodoSelecionadoId],
  );

  const balancete = useMemo(
    () => (db && periodoSelecionado ? gerarBalancete(db, periodoSelecionado.id) : null),
    [db, periodoSelecionado, versao, tick],
  );

  const validacao = useMemo(
    () => (db && periodoSelecionado ? validarBalanceamento(db, periodoSelecionado.id) : null),
    [db, periodoSelecionado, versao, tick],
  );

  const encerramento = useMemo(
    () =>
      db && periodoSelecionado && periodoSelecionado.status === "fechado"
        ? obterUltimoEncerramento(db, periodoSelecionado.id)
        : null,
    [db, periodoSelecionado, versao, tick],
  );

  const selecionarPeriodo = useCallback((id: number) => {
    setPeriodoSelecionadoId(id);
    setMotivo("");
    setHashCopiado(false);
  }, []);

  const copiarHash = useCallback(
    async (hash: string) => {
      try {
        await navigator.clipboard.writeText(hash);
        setHashCopiado(true);
        setTimeout(() => setHashCopiado(false), 2000);
      } catch {
        avisar("warning", "O navegador bloqueou a cópia. Selecione o hash na tela e copie manualmente.");
      }
    },
    [avisar],
  );

  const encerrar = useCallback(async () => {
    if (!db || !periodoSelecionado || motivo.trim().length === 0) return;
    setEncerrando(true);
    try {
      const r = await encerrarPeriodo(db, periodoSelecionado.id, ENCERRADO_POR, motivo.trim());
      if (!r.sucesso) {
        avisar("critical", r.mensagem);
        return;
      }
      await persistir();
      setMotivo("");
      setTick((t) => t + 1);
      avisar("good", `${descricaoPeriodo(periodoSelecionado)} encerrado. ${r.mensagem}`);
    } finally {
      setEncerrando(false);
    }
  }, [db, periodoSelecionado, motivo, persistir, avisar]);

  if (!entidade) {
    return (
      <div>
        <h2 className="section-title">Fechamento de período</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Nenhuma entidade legal cadastrada ainda. O fechamento de período pende do razão, que
            pende da entidade — complete o onboarding antes.
          </p>
        </div>
      </div>
    );
  }

  if (periodos.length === 0) {
    return (
      <div>
        <h2 className="section-title">Fechamento de período</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Nenhum período contábil ainda. Períodos são criados automaticamente conforme
            lançamentos entram no razão — importe ou lance algo primeiro.
          </p>
        </div>
      </div>
    );
  }

  const podeEncerrar =
    !!periodoSelecionado &&
    periodoSelecionado.status === "aberto" &&
    !!validacao?.balanceado &&
    motivo.trim().length > 0 &&
    !encerrando;

  return (
    <div>
      <h2 className="section-title">Fechamento de período</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8 }}>
        Encerrar um período trava a competência: nenhum lançamento novo ou retificação entra mais
        nela (o razão recusa com "período fechado"), e o balancete de fechamento é gravado com um
        hash — se alguém tentar alterar o histórico depois, o hash não bate mais.
        Não existe função de reabertura: um período fechado por aqui permanece fechado.
      </p>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Situação</th>
              <th className="num">Lançamentos</th>
              <th className="num">Débito</th>
              <th className="num">Crédito</th>
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => {
              const selecionado = periodoSelecionado?.id === p.id;
              return (
                <tr
                  key={p.id}
                  onClick={() => selecionarPeriodo(p.id)}
                  style={{ cursor: "pointer", background: selecionado ? "var(--surface-2)" : undefined }}
                  aria-current={selecionado || undefined}
                >
                  <td>{descricaoPeriodo(p)}</td>
                  <td>
                    <span className={`pill ${p.status === "fechado" ? "good" : ""}`}>
                      {p.status === "fechado" ? <><Lock size={11} /> fechado</> : <><Unlock size={11} /> aberto</>}
                    </span>
                    {p.data_fechamento && (
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>
                        {new Date(p.data_fechamento.replace(" ", "T") + "Z").toLocaleString("pt-BR")}
                      </div>
                    )}
                  </td>
                  <td className="num">{p.qtd_lancamentos}</td>
                  <td className="num">{moeda(p.total_debito)}</td>
                  <td className="num">{moeda(p.total_credito)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {periodoSelecionado && balancete && validacao && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
            <div>
              <strong>Balancete — {descricaoPeriodo(periodoSelecionado)}</strong>{" "}
              <span className={`pill ${periodoSelecionado.status === "fechado" ? "good" : ""}`}>
                {periodoSelecionado.status === "fechado" ? "fechado" : "aberto"}
              </span>
            </div>
            <span className={`pill ${validacao.balanceado ? "good" : "critical"}`}>
              {validacao.balanceado ? <><CheckCircle2 size={12} /> balanceado</> : <><AlertTriangle size={12} /> desbalanceado</>}
            </span>
          </div>

          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th className="num">Débito</th>
                  <th className="num">Crédito</th>
                  <th className="num">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {balancete.saldos.map((s) => (
                  <tr key={s.conta_codigo}>
                    <td>
                      {s.conta_codigo} — {s.conta_descricao}
                    </td>
                    <td className="num">{s.total_debito !== 0 ? moeda(s.total_debito) : "—"}</td>
                    <td className="num">{s.total_credito !== 0 ? moeda(s.total_credito) : "—"}</td>
                    <td className="num">{moeda(s.saldo_final)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total do período</strong></td>
                  <td className="num"><strong>{moeda(balancete.total_debito_periodo)}</strong></td>
                  <td className="num"><strong>{moeda(balancete.total_credito_periodo)}</strong></td>
                  <td className="num">
                    <strong>{validacao.balanceado ? "diferença: R$ 0,00" : `diferença: ${moeda(validacao.diferenca)}`}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {periodoSelecionado.status === "fechado" ? (
            <div className="aviso-caixa" style={{ background: "var(--surface-2)", color: "var(--ink)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                Período fechado — lançamentos e retificações nesta competência são recusados
                automaticamente pelo razão. Não há como reabrir por aqui.
                {encerramento?.observacoes && (
                  <div style={{ marginTop: 6, color: "var(--ink-soft)" }}>Motivo do encerramento: {encerramento.observacoes}</div>
                )}
                {encerramento?.hash_snapshot && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <Fingerprint size={13} style={{ flexShrink: 0, color: "var(--ink-soft)" }} />
                    <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>hash do balancete de fechamento:</span>
                    <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{encerramento.hash_snapshot}</code>
                    <button className="btn" style={{ padding: "2px 7px", fontSize: 11.5 }} onClick={() => copiarHash(encerramento.hash_snapshot!)}>
                      {hashCopiado ? <><Check size={11} /> copiado</> : <><Copy size={11} /> copiar</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : !validacao.balanceado ? (
            <div className="aviso-caixa" role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                Débitos e créditos não batem — diferença de <strong>{moeda(validacao.diferenca)}</strong>.
                Não é possível encerrar este período enquanto a diferença não for zerada; o razão
                recusaria o fechamento com esta mesma diferença.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                <span>Motivo do encerramento (obrigatório — fica gravado em ledger_encerramentos)</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ex.: Fechamento mensal de competência, balancete conferido."
                  style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px", background: "var(--surface)", color: "var(--ink)", resize: "vertical" }}
                />
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn danger" onClick={encerrar} disabled={!podeEncerrar}>
                  {encerrando ? <><Loader2 size={14} className="spin" /> Encerrando…</> : <><Lock size={14} /> Encerrar período</>}
                </button>
                <small style={{ color: "var(--ink-soft)", display: "flex", gap: 6, alignItems: "center" }}>
                  <ShieldCheck size={13} /> Irreversível: sem motivo não encerra, e não há botão de reabrir depois.
                </small>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
