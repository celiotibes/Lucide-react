import { useMemo } from "react";
import { AlertOctagon, AlertTriangle, Info, CircleCheck } from "lucide-react";
import { useDb } from "../db/useDb";
import { gerarPainelPendencias, type SeveridadePendencia } from "../domain/auditoria/painelPendencias";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ICONE_SEVERIDADE: Record<SeveridadePendencia, typeof AlertOctagon> = {
  critica: AlertOctagon,
  atencao: AlertTriangle,
  info: Info,
};
const PILL_SEVERIDADE: Record<SeveridadePendencia, string> = { critica: "critical", atencao: "warning", info: "good" };
const ROTULO_SEVERIDADE: Record<SeveridadePendencia, string> = { critica: "crítico", atencao: "atenção", info: "informativo" };

export function PendenciasView({ aoNavegar }: { aoNavegar: (aba: string) => void }) {
  const { db, versao } = useDb();
  const hoje = hojeIso();

  const pendencias = useMemo(() => (db ? gerarPainelPendencias(db, hoje) : []), [db, versao, hoje]);
  const criticas = pendencias.filter((p) => p.severidade === "critica").length;
  const atencoes = pendencias.filter((p) => p.severidade === "atencao").length;

  return (
    <div>
      <h2 className="section-title">Painel de pendências</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Consolida, num único lugar, tudo que já foi detectado nas outras abas (transações sem categoria,
        inadimplência em aberto, inconsistências entre cadastro e extrato, financiamento sem dado, divergência
        fiscal, backup) — para não precisar visitar aba por aba para saber o que está pendente. Não introduz
        nenhuma checagem nova: só reúne o que as próprias telas já calculam.
      </p>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KpiTile label="Itens críticos" value={criticas} variant={criticas > 0 ? "critical" : undefined} />
        <KpiTile label="Itens de atenção" value={atencoes} variant={atencoes > 0 ? "critical" : undefined} />
        <KpiTile label="Total de pendências" value={pendencias.length} />
      </div>

      {pendencias.length === 0 ? (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <CircleCheck size={18} color="var(--viz-good)" />
          <span>Nenhuma pendência encontrada nas verificações disponíveis.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pendencias.map((p) => {
            const Icone = ICONE_SEVERIDADE[p.severidade];
            const abaAlvo = p.aba;
            return (
              <div
                key={p.id}
                className="card"
                data-interactive={abaAlvo ? "true" : undefined}
                role={abaAlvo ? "button" : undefined}
                tabIndex={abaAlvo ? 0 : undefined}
                onClick={abaAlvo ? () => aoNavegar(abaAlvo) : undefined}
                onKeyDown={abaAlvo ? (e) => (e.key === "Enter" || e.key === " ") && aoNavegar(abaAlvo) : undefined}
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <Icone size={18} style={{ flexShrink: 0, marginTop: 2 }} color={p.severidade === "critica" ? "var(--viz-critical)" : p.severidade === "atencao" ? "var(--viz-warning)" : "var(--viz-muted)"} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <strong style={{ fontSize: 14 }}>{p.titulo}</strong>
                    <span className={`pill ${PILL_SEVERIDADE[p.severidade]}`}>{ROTULO_SEVERIDADE[p.severidade]}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>{p.descricao}</p>
                </div>
                {abaAlvo && (
                  <button className="btn" style={{ flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); aoNavegar(abaAlvo); }}>
                    Ver
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
