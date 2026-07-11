import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/DbContext";
import { consultar, executar } from "../../db/connection";
import { ROTULO_TIPO_DIVIDA } from "../../domain/patrimonio/balancoPatrimonial";
import type { DividaConsumo, TipoDividaConsumo } from "../../domain/types";

interface Formulario {
  id: number | null;
  tipo: TipoDividaConsumo;
  instituicao: string;
  valor_contratado: string;
  saldo_devedor_atual: string;
  parcela_mensal: string;
  data_referencia_saldo: string;
  observacoes: string;
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formVazio(): Formulario {
  return { id: null, tipo: "consignado", instituicao: "", valor_contratado: "", saldo_devedor_atual: "", parcela_mensal: "", data_referencia_saldo: hojeIso(), observacoes: "" };
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DividasConsumoForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const dividas = useMemo<DividaConsumo[]>(() => (db ? consultar<DividaConsumo>(db, "SELECT * FROM dividas_consumo ORDER BY saldo_devedor_atual DESC") : []), [db, versao]);

  function abrirEdicao(d: DividaConsumo) {
    setForm({
      id: d.id, tipo: d.tipo, instituicao: d.instituicao,
      valor_contratado: d.valor_contratado?.toString() ?? "",
      saldo_devedor_atual: d.saldo_devedor_atual.toString(),
      parcela_mensal: d.parcela_mensal.toString(),
      data_referencia_saldo: d.data_referencia_saldo,
      observacoes: d.observacoes ?? "",
    });
  }

  async function salvar() {
    if (!db || !form || form.instituicao.trim() === "" || form.saldo_devedor_atual.trim() === "" || form.parcela_mensal.trim() === "") return;
    const valorContratado = form.valor_contratado.trim() === "" ? null : Number.parseFloat(form.valor_contratado.replace(",", "."));
    const saldoDevedor = Number.parseFloat(form.saldo_devedor_atual.replace(",", "."));
    const parcelaMensal = Number.parseFloat(form.parcela_mensal.replace(",", "."));
    if (Number.isNaN(saldoDevedor) || Number.isNaN(parcelaMensal)) return;

    if (form.id === null) {
      executar(
        db,
        "INSERT INTO dividas_consumo (tipo, instituicao, valor_contratado, saldo_devedor_atual, parcela_mensal, data_referencia_saldo, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [form.tipo, form.instituicao.trim(), valorContratado, saldoDevedor, parcelaMensal, form.data_referencia_saldo, form.observacoes.trim() || null],
      );
    } else {
      executar(
        db,
        "UPDATE dividas_consumo SET tipo = ?, instituicao = ?, valor_contratado = ?, saldo_devedor_atual = ?, parcela_mensal = ?, data_referencia_saldo = ?, observacoes = ? WHERE id = ?",
        [form.tipo, form.instituicao.trim(), valorContratado, saldoDevedor, parcelaMensal, form.data_referencia_saldo, form.observacoes.trim() || null, form.id],
      );
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Dívidas de consumo ({dividas.length})</h3>
        <button className="btn primary" onClick={() => setForm(formVazio())}>
          <Plus size={14} /> Nova dívida
        </button>
      </div>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Consignado, empréstimo pessoal e cartão parcelado — sem matrícula/imóvel associado. Não há como buscar isso
        automaticamente: o Registrato/SCR do Bacen é um portal de autoatendimento do cidadão, sem API pública. Baixe
        seu relatório em <code>registrato.bcb.gov.br</code> periodicamente e relance o saldo devedor atual aqui.
      </p>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDividaConsumo })}>
                {Object.entries(ROTULO_TIPO_DIVIDA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Instituição *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.instituicao} onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor contratado (R$)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.valor_contratado} onChange={(e) => setForm({ ...form, valor_contratado: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Saldo devedor atual (R$) *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.saldo_devedor_atual} onChange={(e) => setForm({ ...form, saldo_devedor_atual: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Parcela mensal (R$) *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.parcela_mensal} onChange={(e) => setForm({ ...form, parcela_mensal: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data de referência do saldo
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_referencia_saldo} onChange={(e) => setForm({ ...form, data_referencia_saldo: e.target.value })} />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Observações
            <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn primary"
              disabled={form.instituicao.trim() === "" || form.saldo_devedor_atual.trim() === "" || form.parcela_mensal.trim() === ""}
              onClick={salvar}
            >
              Salvar
            </button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Tipo</th><th>Instituição</th><th className="num">Saldo devedor</th><th className="num">Parcela mensal</th><th>Referência</th><th></th></tr>
          </thead>
          <tbody>
            {dividas.map((d) => (
              <tr key={d.id}>
                <td>{ROTULO_TIPO_DIVIDA[d.tipo]}</td>
                <td>{d.instituicao}</td>
                <td className="num">{formatarMoeda(d.saldo_devedor_atual)}</td>
                <td className="num">{formatarMoeda(d.parcela_mensal)}</td>
                <td>{d.data_referencia_saldo}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(d)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {dividas.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhuma dívida de consumo cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
