import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";
import type { Imovel } from "../../domain/types";

type Natureza = "capex" | "manutencao";

interface Obra {
  id: number;
  imovel_id: number;
  descricao: string;
  data_inicio?: string;
  data_fim?: string;
  natureza: Natureza;
  valor_total?: number;
}

interface Formulario {
  id: number | null;
  imovel_id: number | null;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  natureza: Natureza;
  valor_total: string;
}

function formVazio(imovelPadrao: number | null): Formulario {
  return { id: null, imovel_id: imovelPadrao, descricao: "", data_inicio: "", data_fim: "", natureza: "manutencao", valor_total: "" };
}

export function ObrasForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const obras = useMemo<Obra[]>(() => (db ? consultar<Obra>(db, "SELECT * FROM obras ORDER BY data_inicio DESC") : []), [db, versao]);
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  function abrirEdicao(o: Obra) {
    setForm({ id: o.id, imovel_id: o.imovel_id, descricao: o.descricao, data_inicio: o.data_inicio ?? "", data_fim: o.data_fim ?? "", natureza: o.natureza, valor_total: o.valor_total?.toString() ?? "" });
  }

  async function salvar() {
    if (!db || !form || form.imovel_id === null || form.descricao.trim() === "") return;
    const valorTotal = form.valor_total.trim() === "" ? null : Number.parseFloat(form.valor_total.replace(",", "."));
    if (form.id === null) {
      executar(
        db,
        "INSERT INTO obras (imovel_id, descricao, data_inicio, data_fim, natureza, valor_total) VALUES (?, ?, ?, ?, ?, ?)",
        [form.imovel_id, form.descricao.trim(), form.data_inicio || null, form.data_fim || null, form.natureza, valorTotal],
      );
    } else {
      executar(
        db,
        "UPDATE obras SET imovel_id = ?, descricao = ?, data_inicio = ?, data_fim = ?, natureza = ?, valor_total = ? WHERE id = ?",
        [form.imovel_id, form.descricao.trim(), form.data_inicio || null, form.data_fim || null, form.natureza, valorTotal, form.id],
      );
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Obras ({obras.length})</h3>
        <button className="btn primary" disabled={imoveis.length === 0} onClick={() => setForm(formVazio(imoveis[0]?.id ?? null))}>
          <Plus size={14} /> Nova obra
        </button>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.imovel_id ?? ""} onChange={(e) => setForm({ ...form, imovel_id: Number(e.target.value) })}>
                {imoveis.map((i) => <option key={i.id} value={i.id}>{i.apelido}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)", gridColumn: "span 2" }}>
              Descrição *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Natureza
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.natureza} onChange={(e) => setForm({ ...form, natureza: e.target.value as Natureza })}>
                <option value="manutencao">Manutenção corrente</option>
                <option value="capex">Capex (capitalizável)</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Início
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Fim
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor total (R$)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.valor_total} onChange={(e) => setForm({ ...form, valor_total: e.target.value })} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.imovel_id === null || form.descricao.trim() === ""} onClick={salvar}>Salvar</button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Imóvel</th><th>Descrição</th><th>Natureza</th><th>Início</th><th>Fim</th><th className="num">Valor</th><th></th></tr></thead>
          <tbody>
            {obras.map((o) => (
              <tr key={o.id}>
                <td>{imoveisPorId.get(o.imovel_id)?.apelido ?? o.imovel_id}</td>
                <td>{o.descricao}</td>
                <td>{o.natureza === "capex" ? "Capex" : "Manutenção"}</td>
                <td>{o.data_inicio ?? "—"}</td>
                <td>{o.data_fim ?? "—"}</td>
                <td className="num">{o.valor_total !== undefined ? o.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(o)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {obras.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhuma obra cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
