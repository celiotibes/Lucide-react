import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/DbContext";
import { consultar, executar } from "../../db/connection";
import type { Imovel } from "../../domain/types";

type Sistema = "SAC" | "PRICE" | "OUTRO";

interface Financiamento {
  id: number;
  imovel_id: number;
  instituicao: string;
  sistema: Sistema;
  valor_contratado: number;
  taxa_juros_mensal: number;
  data_contrato: string;
  parcelas_total: number;
  saldo_devedor_manual: number | null;
  parcela_mensal_manual: number | null;
  data_referencia_saldo_manual: string | null;
  observacoes?: string;
}

interface Formulario {
  id: number | null;
  imovel_id: number | null;
  instituicao: string;
  sistema: Sistema;
  valor_contratado: string;
  taxa_juros_mensal: string;
  data_contrato: string;
  parcelas_total: string;
  saldo_devedor_manual: string;
  parcela_mensal_manual: string;
  data_referencia_saldo_manual: string;
  observacoes: string;
}

function formVazio(imovelPadrao: number | null): Formulario {
  return {
    id: null, imovel_id: imovelPadrao, instituicao: "", sistema: "SAC", valor_contratado: "", taxa_juros_mensal: "0,8", data_contrato: "", parcelas_total: "360",
    saldo_devedor_manual: "", parcela_mensal_manual: "", data_referencia_saldo_manual: "", observacoes: "",
  };
}

export function FinanciamentosForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis WHERE financiado = 1 ORDER BY apelido") : []), [db, versao]);
  const financiamentos = useMemo<Financiamento[]>(() => (db ? consultar<Financiamento>(db, "SELECT * FROM financiamentos ORDER BY data_contrato DESC") : []), [db, versao]);
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  function abrirEdicao(f: Financiamento) {
    setForm({
      id: f.id, imovel_id: f.imovel_id, instituicao: f.instituicao, sistema: f.sistema,
      valor_contratado: f.valor_contratado.toString(), taxa_juros_mensal: f.taxa_juros_mensal.toString().replace(".", ","),
      data_contrato: f.data_contrato, parcelas_total: f.parcelas_total.toString(),
      saldo_devedor_manual: f.saldo_devedor_manual?.toString() ?? "", parcela_mensal_manual: f.parcela_mensal_manual?.toString() ?? "",
      data_referencia_saldo_manual: f.data_referencia_saldo_manual ?? "", observacoes: f.observacoes ?? "",
    });
  }

  async function salvar() {
    if (!db || !form || form.imovel_id === null || form.instituicao.trim() === "" || form.data_contrato === "") return;
    const valorContratado = Number.parseFloat(form.valor_contratado.replace(",", "."));
    const taxaJuros = Number.parseFloat(form.taxa_juros_mensal.replace(",", "."));
    const parcelas = Number.parseInt(form.parcelas_total, 10);
    if (Number.isNaN(valorContratado) || Number.isNaN(taxaJuros) || Number.isNaN(parcelas)) return;
    const saldoDevedorManual = form.saldo_devedor_manual.trim() === "" ? null : Number.parseFloat(form.saldo_devedor_manual.replace(",", "."));
    const parcelaMensalManual = form.parcela_mensal_manual.trim() === "" ? null : Number.parseFloat(form.parcela_mensal_manual.replace(",", "."));
    const dataReferenciaSaldoManual = form.data_referencia_saldo_manual || null;

    if (form.id === null) {
      executar(
        db,
        `INSERT INTO financiamentos
           (imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total,
            saldo_devedor_manual, parcela_mensal_manual, data_referencia_saldo_manual, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [form.imovel_id, form.instituicao.trim(), form.sistema, valorContratado, taxaJuros, form.data_contrato, parcelas,
          saldoDevedorManual, parcelaMensalManual, dataReferenciaSaldoManual, form.observacoes.trim() || null],
      );
    } else {
      executar(
        db,
        `UPDATE financiamentos SET imovel_id = ?, instituicao = ?, sistema = ?, valor_contratado = ?, taxa_juros_mensal = ?,
           data_contrato = ?, parcelas_total = ?, saldo_devedor_manual = ?, parcela_mensal_manual = ?,
           data_referencia_saldo_manual = ?, observacoes = ? WHERE id = ?`,
        [form.imovel_id, form.instituicao.trim(), form.sistema, valorContratado, taxaJuros, form.data_contrato, parcelas,
          saldoDevedorManual, parcelaMensalManual, dataReferenciaSaldoManual, form.observacoes.trim() || null, form.id],
      );
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Financiamentos ({financiamentos.length})</h3>
        <button className="btn primary" disabled={imoveis.length === 0} onClick={() => setForm(formVazio(imoveis[0]?.id ?? null))}>
          <Plus size={14} /> Novo financiamento
        </button>
      </div>
      {imoveis.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          Nenhum imóvel marcado como "financiado" ainda — edite o imóvel na aba Imóveis antes de cadastrar um financiamento.
        </p>
      )}

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.imovel_id ?? ""} onChange={(e) => setForm({ ...form, imovel_id: Number(e.target.value) })}>
                {imoveis.map((i) => <option key={i.id} value={i.id}>{i.apelido}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Instituição *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.instituicao} onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Sistema
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value as Sistema })}>
                <option value="SAC">SAC</option>
                <option value="PRICE">Price</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor contratado (R$) *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.valor_contratado} onChange={(e) => setForm({ ...form, valor_contratado: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Taxa de juros mensal (%)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.taxa_juros_mensal} onChange={(e) => setForm({ ...form, taxa_juros_mensal: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data do contrato *
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_contrato} onChange={(e) => setForm({ ...form, data_contrato: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Parcelas totais
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.parcelas_total} onChange={(e) => setForm({ ...form, parcelas_total: e.target.value })} />
            </label>
          </div>

          {form.sistema === "OUTRO" && (
            <>
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                "Outro" cobre financiamento sem fórmula de amortização bancária conhecida (ex: hipoteca por
                consórcio) — o sistema não calcula SAC/Price para ele. Informe o saldo devedor e a parcela
                direto do extrato mais recente da administradora; sem isso, este financiamento fica de fora do
                passivo/patrimônio líquido em vez de usar um número estimado incorretamente.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Saldo devedor atual (R$)
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.saldo_devedor_manual} onChange={(e) => setForm({ ...form, saldo_devedor_manual: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Parcela mensal atual (R$)
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.parcela_mensal_manual} onChange={(e) => setForm({ ...form, parcela_mensal_manual: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Data do extrato/referência
                  <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_referencia_saldo_manual} onChange={(e) => setForm({ ...form, data_referencia_saldo_manual: e.target.value })} />
                </label>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.imovel_id === null || form.instituicao.trim() === "" || form.data_contrato === ""} onClick={salvar}>Salvar</button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Imóvel</th><th>Instituição</th><th>Sistema</th><th className="num">Valor</th><th className="num">Taxa a.m.</th><th>Contrato</th><th className="num">Parcelas</th><th></th></tr></thead>
          <tbody>
            {financiamentos.map((f) => (
              <tr key={f.id}>
                <td>{imoveisPorId.get(f.imovel_id)?.apelido ?? f.imovel_id}</td>
                <td>{f.instituicao}</td>
                <td>{f.sistema}</td>
                <td className="num">{f.valor_contratado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                <td className="num">{f.taxa_juros_mensal.toFixed(2)}%</td>
                <td>{f.data_contrato}</td>
                <td className="num">{f.parcelas_total}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(f)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {financiamentos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum financiamento cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
