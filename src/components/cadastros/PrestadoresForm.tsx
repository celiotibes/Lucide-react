import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";

interface Prestador {
  id: number;
  nome: string;
  cpf_cnpj?: string;
  servico: string;
}

interface Formulario {
  id: number | null;
  nome: string;
  cpf_cnpj: string;
  servico: string;
}

const FORM_VAZIO: Formulario = { id: null, nome: "", cpf_cnpj: "", servico: "" };

export function PrestadoresForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const prestadores = useMemo<Prestador[]>(() => (db ? consultar<Prestador>(db, "SELECT * FROM prestadores ORDER BY nome") : []), [db, versao]);

  function abrirEdicao(p: Prestador) {
    setForm({ id: p.id, nome: p.nome, cpf_cnpj: p.cpf_cnpj ?? "", servico: p.servico });
  }

  async function salvar() {
    if (!db || !form || form.nome.trim() === "" || form.servico.trim() === "") return;
    if (form.id === null) {
      executar(db, "INSERT INTO prestadores (nome, cpf_cnpj, servico) VALUES (?, ?, ?)", [form.nome.trim(), form.cpf_cnpj.trim() || null, form.servico.trim()]);
    } else {
      executar(db, "UPDATE prestadores SET nome = ?, cpf_cnpj = ?, servico = ? WHERE id = ?", [form.nome.trim(), form.cpf_cnpj.trim() || null, form.servico.trim(), form.id]);
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Prestadores de serviço ({prestadores.length})</h3>
        <button className="btn primary" onClick={() => setForm(FORM_VAZIO)}>
          <Plus size={14} /> Novo prestador
        </button>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Nome / razão social *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              CPF/CNPJ
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Serviço *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.servico} onChange={(e) => setForm({ ...form, servico: e.target.value })} placeholder="ex: faxina, portaria, gestão de Airbnb, reforma" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.nome.trim() === "" || form.servico.trim() === ""} onClick={salvar}>Salvar</button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Serviço</th><th></th></tr></thead>
          <tbody>
            {prestadores.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{p.cpf_cnpj ?? "—"}</td>
                <td>{p.servico}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(p)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {prestadores.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum prestador cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
