import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";
import type { ContaBancaria, TipoConta } from "../../domain/types";

const ROTULO_TIPO: Record<TipoConta, string> = { corrente: "Corrente", poupanca: "Poupança", investimento: "Investimento" };

interface Formulario {
  id: number | null;
  banco: string;
  agencia: string;
  numero: string;
  titular: string;
  tipo: TipoConta;
  ativa_desde: string;
  observacoes: string;
}

const FORM_VAZIO: Formulario = { id: null, banco: "", agencia: "", numero: "", titular: "", tipo: "corrente", ativa_desde: "", observacoes: "" };

export function ContasBancariasForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const contas = useMemo<ContaBancaria[]>(() => (db ? consultar<ContaBancaria>(db, "SELECT * FROM contas_bancarias ORDER BY banco") : []), [db, versao]);

  function abrirEdicao(c: ContaBancaria) {
    setForm({ id: c.id, banco: c.banco, agencia: c.agencia ?? "", numero: c.numero, titular: c.titular, tipo: c.tipo, ativa_desde: c.ativa_desde ?? "", observacoes: c.observacoes ?? "" });
  }

  async function salvar() {
    if (!db || !form || form.banco.trim() === "" || form.numero.trim() === "" || form.titular.trim() === "") return;
    const jaExiste = contas.some(
      (c) =>
        c.id !== form.id &&
        c.banco.trim().toLowerCase() === form.banco.trim().toLowerCase() &&
        (c.agencia ?? "").trim() === form.agencia.trim() &&
        c.numero.trim() === form.numero.trim(),
    );
    if (jaExiste) {
      alert("Já existe uma conta cadastrada com esse banco, agência e número — importar o mesmo extrato contra as duas dobraria a renda/despesa. Reutilize a conta existente em vez de cadastrar de novo.");
      return;
    }
    const params = [form.banco.trim(), form.agencia.trim() || null, form.numero.trim(), form.titular.trim(), form.tipo, form.ativa_desde || null, form.observacoes.trim() || null] as const;
    if (form.id === null) {
      executar(db, "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo, ativa_desde, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)", [...params]);
    } else {
      executar(db, "UPDATE contas_bancarias SET banco = ?, agencia = ?, numero = ?, titular = ?, tipo = ?, ativa_desde = ?, observacoes = ? WHERE id = ?", [...params, form.id]);
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Contas bancárias ({contas.length})</h3>
        <button className="btn primary" onClick={() => setForm(FORM_VAZIO)}>
          <Plus size={14} /> Nova conta
        </button>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Banco *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Agência
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Número/conta *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Titular *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoConta })}>
                {Object.entries(ROTULO_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Ativa desde
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.ativa_desde} onChange={(e) => setForm({ ...form, ativa_desde: e.target.value })} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.banco.trim() === "" || form.numero.trim() === "" || form.titular.trim() === ""} onClick={salvar}>
              Salvar
            </button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Banco</th><th>Agência</th><th>Número</th><th>Titular</th><th>Tipo</th><th>Ativa desde</th><th></th></tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id}>
                <td>{c.banco}</td>
                <td>{c.agencia ?? "—"}</td>
                <td>{c.numero}</td>
                <td>{c.titular}</td>
                <td>{ROTULO_TIPO[c.tipo]}</td>
                <td>{c.ativa_desde ?? "—"}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(c)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {contas.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhuma conta cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
