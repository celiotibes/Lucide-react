import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";
import type { DeclaracaoFiscal, TipoDeclaracaoFiscal } from "../../domain/types";
import { formatarMoeda } from "../../domain/formatarMoeda";

interface Formulario {
  id: number | null;
  ano_calendario: string;
  tipo: TipoDeclaracaoFiscal;
  mes_referencia: string;
  rendimento_tributavel_declarado: string;
  imposto_pago: string;
  fonte_documento: string;
  observacoes: string;
}

function anoAtual(): number {
  return new Date().getFullYear();
}

function formVazio(): Formulario {
  return {
    id: null, ano_calendario: anoAtual().toString(), tipo: "dirpf_anual", mes_referencia: "",
    rendimento_tributavel_declarado: "", imposto_pago: "", fonte_documento: "", observacoes: "",
  };
}

const ROTULO_TIPO: Record<TipoDeclaracaoFiscal, string> = {
  dirpf_anual: "DIRPF anual",
  carne_leao_mensal: "DARF Carnê-Leão mensal",
};

export function DeclaracoesFiscaisForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);

  const declaracoes = useMemo<DeclaracaoFiscal[]>(
    () => (db ? consultar<DeclaracaoFiscal>(db, "SELECT * FROM declaracoes_fiscais ORDER BY ano_calendario DESC, tipo, mes_referencia") : []),
    [db, versao],
  );

  function abrirEdicao(d: DeclaracaoFiscal) {
    setForm({
      id: d.id, ano_calendario: d.ano_calendario.toString(), tipo: d.tipo, mes_referencia: d.mes_referencia ?? "",
      rendimento_tributavel_declarado: d.rendimento_tributavel_declarado.toString(),
      imposto_pago: d.imposto_pago?.toString() ?? "", fonte_documento: d.fonte_documento ?? "", observacoes: d.observacoes ?? "",
    });
  }

  async function salvar() {
    if (!db || !form) return;
    const ano = Number.parseInt(form.ano_calendario, 10);
    const rendimento = Number.parseFloat(form.rendimento_tributavel_declarado.replace(",", "."));
    if (Number.isNaN(ano) || Number.isNaN(rendimento)) return;
    if (form.tipo === "carne_leao_mensal" && form.mes_referencia === "") return;
    const impostoPago = form.imposto_pago.trim() === "" ? null : Number.parseFloat(form.imposto_pago.replace(",", "."));
    const mesReferencia = form.tipo === "carne_leao_mensal" ? form.mes_referencia : null;

    if (form.id === null) {
      executar(
        db,
        `INSERT INTO declaracoes_fiscais (ano_calendario, tipo, mes_referencia, rendimento_tributavel_declarado, imposto_pago, fonte_documento, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ano, form.tipo, mesReferencia, rendimento, impostoPago, form.fonte_documento.trim() || null, form.observacoes.trim() || null],
      );
    } else {
      executar(
        db,
        `UPDATE declaracoes_fiscais SET ano_calendario = ?, tipo = ?, mes_referencia = ?, rendimento_tributavel_declarado = ?,
           imposto_pago = ?, fonte_documento = ?, observacoes = ? WHERE id = ?`,
        [ano, form.tipo, mesReferencia, rendimento, impostoPago, form.fonte_documento.trim() || null, form.observacoes.trim() || null, form.id],
      );
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Declarações fiscais ({declaracoes.length})</h3>
        <button className="btn primary" onClick={() => setForm(formVazio())}>
          <Plus size={14} /> Nova declaração
        </button>
      </div>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Lance aqui o que foi de fato declarado/pago à Receita Federal (ficha de rendimentos recebidos de pessoa
        física da DIRPF, ou os DARFs de Carnê-Leão pagos mês a mês) — não há API pública para consultar
        declarações já entregues, então precisa ser lançado manualmente a partir dos seus documentos. A aba
        "Renda tributável" cruza este valor contra a renda reconstituída dos extratos bancários reais.
      </p>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Ano-calendário *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.ano_calendario} onChange={(e) => setForm({ ...form, ano_calendario: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDeclaracaoFiscal })}>
                {Object.entries(ROTULO_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {form.tipo === "carne_leao_mensal" && (
              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Mês de referência *
                <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.mes_referencia} onChange={(e) => setForm({ ...form, mes_referencia: e.target.value })} />
              </label>
            )}
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Rendimento tributável declarado (R$) *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.rendimento_tributavel_declarado} onChange={(e) => setForm({ ...form, rendimento_tributavel_declarado: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imposto pago (R$)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.imposto_pago} onChange={(e) => setForm({ ...form, imposto_pago: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Documento de origem
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} placeholder="ex: DIRPF 2025 - ficha rendimentos PF" value={form.fonte_documento} onChange={(e) => setForm({ ...form, fonte_documento: e.target.value })} />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Observações
            <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn primary"
              disabled={form.ano_calendario.trim() === "" || form.rendimento_tributavel_declarado.trim() === "" || (form.tipo === "carne_leao_mensal" && form.mes_referencia === "")}
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
            <tr><th>Ano</th><th>Tipo</th><th>Referência</th><th className="num">Rendimento declarado</th><th className="num">Imposto pago</th><th>Documento</th><th></th></tr>
          </thead>
          <tbody>
            {declaracoes.map((d) => (
              <tr key={d.id}>
                <td>{d.ano_calendario}</td>
                <td>{ROTULO_TIPO[d.tipo]}</td>
                <td>{d.mes_referencia ?? "—"}</td>
                <td className="num">{formatarMoeda(d.rendimento_tributavel_declarado)}</td>
                <td className="num">{d.imposto_pago !== undefined && d.imposto_pago !== null ? formatarMoeda(d.imposto_pago) : "—"}</td>
                <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{d.fonte_documento ?? "—"}</td>
                <td><button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(d)}><Pencil size={13} /></button></td>
              </tr>
            ))}
            {declaracoes.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhuma declaração fiscal lançada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
