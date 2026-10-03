import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb } from "../../db/useDb";
import { useToast } from "../../ui/useToast";
import {
  listarRateioDestinos,
  registrarRateioDestino,
  removerRateioDestino,
  percentualTotalClassificado,
  type DividaTipo,
} from "../../domain/dividas/rateioDividas";

// Sugestões apenas — `destino` é texto livre no schema (decisão do usuário 2026-09-29),
// para poder abrir quantas linhas precisar ao segregar mais.
const SUGESTOES_DESTINO = ["Pessoal", "Empresa (imóveis de locação/Airbnb)", "Advocacia"];

interface Props {
  dividaTipo: DividaTipo;
  dividaId: number;
}

/** Seção "Rateio de destino (PF / empresa / advocacia)" — reutilizada dentro de
 * DividasConsumoForm.tsx e FinanciamentosForm.tsx para a dívida/financiamento em edição.
 * Mostra as linhas de rateio já cadastradas, quanto já foi classificado (0-100%) e um
 * formulário para adicionar uma nova linha. Não trava em 100%: uma dívida pode ficar com
 * rateio parcial por um tempo — isso vira pendência visível em outro lugar (painel de
 * pendências), não um impedimento aqui. */
export function RateioDestinoDivida({ dividaTipo, dividaId }: Props) {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [destino, setDestino] = useState("");
  const [percentual, setPercentual] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const linhas = useMemo(
    () => (db ? listarRateioDestinos(db, dividaTipo, dividaId) : []),
    [db, versao, dividaTipo, dividaId],
  );
  const totalClassificado = useMemo(
    () => (db ? percentualTotalClassificado(db, dividaTipo, dividaId) : 0),
    [db, versao, dividaTipo, dividaId],
  );
  const faltante = Math.round((100 - totalClassificado) * 100) / 100;
  const datalistId = `sugestoes-destino-rateio-${dividaTipo}-${dividaId}`;

  async function adicionar() {
    if (!db) return;
    const percentualNum = Number.parseFloat(percentual.replace(",", "."));
    if (destino.trim() === "" || percentual.trim() === "" || Number.isNaN(percentualNum)) {
      avisar("critical", "Informe destino e percentual.");
      return;
    }
    try {
      registrarRateioDestino(db, { dividaTipo, dividaId, destino, percentual: percentualNum, observacoes: observacoes.trim() || undefined });
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : String(erro));
      return;
    }
    await persistir();
    setDestino("");
    setPercentual("");
    setObservacoes("");
    avisar("good", "Rateio de destino adicionado.");
  }

  async function remover(id: number) {
    if (!db) return;
    try {
      removerRateioDestino(db, id);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : String(erro));
      return;
    }
    await persistir();
    avisar("good", "Linha de rateio removida.");
  }

  return (
    <div className="card" style={{ marginTop: 12, marginBottom: 12, background: "var(--surface-2)" }}>
      <strong style={{ fontSize: 13 }}>Rateio de destino (PF / empresa / advocacia)</strong>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 12px", maxWidth: "62ch" }}>
        A que parte da vida/atividade esta dívida pertence — pessoal, empresa de fato (imóveis de locação/Airbnb),
        advocacia, ou uma mistura rateada por percentual entre destinos. Cada linha leva sua própria justificativa.
      </p>

      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden", border: "1px solid var(--line)" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, totalClassificado))}%`,
              background: totalClassificado >= 100 ? "var(--pill-good-ink)" : "var(--accent)",
              transition: "width 0.2s",
            }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
          {totalClassificado}% classificado{faltante > 0 ? ` — faltam ${faltante}%` : ""}
        </div>
      </div>

      {linhas.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="data-table">
            <thead><tr><th>Destino</th><th className="num">%</th><th>Observações</th><th></th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td>{l.destino}</td>
                  <td className="num">{l.percentual}%</td>
                  <td style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{l.observacoes ?? ""}</td>
                  <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => remover(l.id)} aria-label="Remover linha de rateio"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Destino
          <input
            className="btn"
            style={{ cursor: "text", width: "100%", marginTop: 4 }}
            list={datalistId}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Ex: Pessoal"
          />
          <datalist id={datalistId}>
            {SUGESTOES_DESTINO.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Percentual (%)
          <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="Ex: 20" />
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Observações
          <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
        <button className="btn primary" onClick={adicionar} disabled={destino.trim() === "" || percentual.trim() === ""}>
          <Plus size={14} /> Adicionar
        </button>
      </div>
    </div>
  );
}
