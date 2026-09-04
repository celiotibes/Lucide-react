import { useMemo, useState } from "react";
import { CheckCircle2, Download, AlertTriangle, Loader2, Plus } from "lucide-react";
import { useDb } from "../db/useDb";
import { executar } from "../db/connection";
import {
  buscarIndiceBacen,
  salvarTaxas,
  listarTaxas,
  dataMinimaNecessaria,
  ROTULO_INDICE,
  TODOS_INDICES,
  type TaxaMensal,
} from "../domain/indices/bacenSgs";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type StatusBusca = { estado: "ocioso" } | { estado: "buscando" } | { estado: "erro"; mensagem: string } | { estado: "ok"; quantidade: number };

export function IndicesEconomicosView() {
  const { db, versao, persistir } = useDb();
  const hoje = hojeIso();

  const dataMinima = useMemo(() => (db ? dataMinimaNecessaria(db, hoje) : hoje), [db, versao, hoje]);
  const [dataInicio, setDataInicio] = useState(dataMinima);
  const [dataFim, setDataFim] = useState(hoje);
  const [status, setStatus] = useState<Record<string, StatusBusca>>({});

  const [manualIndice, setManualIndice] = useState<(typeof TODOS_INDICES)[number]>("igpm");
  const [manualMes, setManualMes] = useState(hoje.slice(0, 7));
  const [manualTaxa, setManualTaxa] = useState("");

  const taxasPorIndice = useMemo(() => {
    if (!db) return {} as Record<string, TaxaMensal[]>;
    const mapa: Record<string, TaxaMensal[]> = {};
    for (const indice of TODOS_INDICES) mapa[indice] = listarTaxas(db, indice);
    return mapa;
  }, [db, versao]);

  const buscar = async (indice: (typeof TODOS_INDICES)[number]) => {
    if (!db) return;
    setStatus((s) => ({ ...s, [indice]: { estado: "buscando" } }));
    try {
      const taxas = await buscarIndiceBacen(indice, dataInicio, dataFim);
      if (taxas.length === 0) throw new Error("A API respondeu sem nenhum registro para o período informado.");
      salvarTaxas(db, indice, taxas);
      await persistir();
      setStatus((s) => ({ ...s, [indice]: { estado: "ok", quantidade: taxas.length } }));
    } catch (erro) {
      setStatus((s) => ({ ...s, [indice]: { estado: "erro", mensagem: erro instanceof Error ? erro.message : String(erro) } }));
    }
  };

  const buscarTodos = () => {
    for (const indice of TODOS_INDICES) buscar(indice);
  };

  const lancarManual = async () => {
    if (!db) return;
    const taxa = Number.parseFloat(manualTaxa.replace(",", "."));
    if (Number.isNaN(taxa)) return;
    executar(
      db,
      "INSERT OR REPLACE INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES (?, ?, ?)",
      [manualIndice, `${manualMes}-01`, taxa],
    );
    await persistir();
    setManualTaxa("");
  };

  return (
    <div>
      <h2 className="section-title">Índices econômicos</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Reajuste de aluguel, correção de mora e correção do depósito caução dependem inteiramente da série cadastrada
        aqui. Busque direto da API pública do Banco Central (SGS) — roda no seu navegador, sem passar por nenhum
        servidor deste sistema — ou lance manualmente se a busca falhar (rede, CORS ou mudança na API do BACEN).
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Data inicial</label>
          <input type="date" className="btn" style={{ cursor: "text" }} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Data final</label>
          <input type="date" className="btn" style={{ cursor: "text" }} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <button className="btn primary" onClick={buscarTodos}>
          <Download size={14} /> Buscar os 3 índices do BACEN
        </button>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Índice</th>
              <th>Meses cadastrados</th>
              <th>Cobertura</th>
              <th>Status da última busca</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TODOS_INDICES.map((indice) => {
              const taxas = taxasPorIndice[indice] ?? [];
              const s = status[indice] ?? { estado: "ocioso" as const };
              return (
                <tr key={indice}>
                  <td>{ROTULO_INDICE[indice]}</td>
                  <td className="num">{taxas.length}</td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                    {taxas.length > 0 ? `${taxas[0].mes_referencia.slice(0, 7)} a ${taxas[taxas.length - 1].mes_referencia.slice(0, 7)}` : "—"}
                  </td>
                  <td>
                    {s.estado === "ocioso" && <span style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>—</span>}
                    {s.estado === "buscando" && (
                      <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Loader2 size={12} className="spin" /> buscando…
                      </span>
                    )}
                    {s.estado === "ok" && (
                      <span className="pill good" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={12} /> {s.quantidade} meses atualizados
                      </span>
                    )}
                    {s.estado === "erro" && (
                      <span className="pill critical" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={s.mensagem}>
                        <AlertTriangle size={12} /> falhou — veja abaixo
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn" onClick={() => buscar(indice)}>
                      Buscar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {TODOS_INDICES.map((indice) => {
        const s = status[indice];
        if (s?.estado !== "erro") return null;
        return (
          <div key={indice} className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>{ROTULO_INDICE[indice]}:</strong> {s.mensagem}
            </span>
          </div>
        );
      })}

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Lançamento manual (fallback)</h3>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 10 }}>
        Use quando a busca automática falhar. Um lançamento manual sobrescreve qualquer valor existente para o mesmo
        índice e mês — inclusive um valor buscado do BACEN anteriormente, então confira a fonte antes de lançar.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Índice</label>
          <select className="btn" value={manualIndice} onChange={(e) => setManualIndice(e.target.value as (typeof TODOS_INDICES)[number])}>
            {TODOS_INDICES.map((i) => (
              <option key={i} value={i}>
                {ROTULO_INDICE[i]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Mês</label>
          <input type="month" className="btn" style={{ cursor: "text" }} value={manualMes} onChange={(e) => setManualMes(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Taxa mensal (%)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="ex: 0,53"
            className="btn"
            style={{ cursor: "text", width: 100 }}
            value={manualTaxa}
            onChange={(e) => setManualTaxa(e.target.value)}
          />
        </div>
        <button className="btn" onClick={lancarManual} disabled={manualTaxa.trim() === ""}>
          <Plus size={14} /> Lançar
        </button>
      </div>
    </div>
  );
}
