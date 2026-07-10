import { useMemo, useState } from "react";
import { Plus, Pencil, Home } from "lucide-react";
import { useDb } from "../db/DbContext";
import { consultar, executar } from "../db/connection";
import type { Imovel, TipoImovel } from "../domain/types";

const ROTULO_TIPO: Record<TipoImovel, string> = {
  apartamento: "Apartamento",
  kitnet: "Kitnet",
  outro: "Outro",
};

interface FormularioImovel {
  id: number | null;
  apelido: string;
  tipo: TipoImovel;
  cidade: string;
  endereco: string;
  fracao_ideal: string;
  area_m2: string;
  financiado: boolean;
  uso_pessoal: boolean;
}

const FORM_VAZIO: FormularioImovel = {
  id: null,
  apelido: "",
  tipo: "apartamento",
  cidade: "",
  endereco: "",
  fracao_ideal: "",
  area_m2: "",
  financiado: false,
  uso_pessoal: false,
};

export function ImoveisView() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<FormularioImovel | null>(null);

  const imoveis = useMemo<Imovel[]>(
    () => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY COALESCE(cidade, 'zzz'), apelido") : []),
    [db, versao],
  );

  const cidadesConhecidas = useMemo(
    () => Array.from(new Set(imoveis.map((i) => i.cidade).filter((c): c is string => !!c))).sort(),
    [imoveis],
  );

  function abrirNovo() {
    setForm(FORM_VAZIO);
  }

  function abrirEdicao(imovel: Imovel) {
    setForm({
      id: imovel.id,
      apelido: imovel.apelido,
      tipo: imovel.tipo,
      cidade: imovel.cidade ?? "",
      endereco: imovel.endereco ?? "",
      fracao_ideal: imovel.fracao_ideal?.toString() ?? "",
      area_m2: imovel.area_m2?.toString() ?? "",
      financiado: imovel.financiado === 1,
      uso_pessoal: imovel.uso_pessoal === 1,
    });
  }

  async function salvar() {
    if (!db || !form || form.apelido.trim() === "") return;
    const fracaoIdeal = form.fracao_ideal.trim() === "" ? null : Number.parseFloat(form.fracao_ideal.replace(",", "."));
    const areaM2 = form.area_m2.trim() === "" ? null : Number.parseFloat(form.area_m2.replace(",", "."));

    if (form.id === null) {
      executar(
        db,
        `INSERT INTO imoveis (apelido, tipo, cidade, endereco, fracao_ideal, area_m2, financiado, uso_pessoal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [form.apelido.trim(), form.tipo, form.cidade.trim() || null, form.endereco.trim() || null, fracaoIdeal, areaM2, form.financiado ? 1 : 0, form.uso_pessoal ? 1 : 0],
      );
    } else {
      executar(
        db,
        `UPDATE imoveis SET apelido = ?, tipo = ?, cidade = ?, endereco = ?, fracao_ideal = ?, area_m2 = ?, financiado = ?, uso_pessoal = ?
         WHERE id = ?`,
        [form.apelido.trim(), form.tipo, form.cidade.trim() || null, form.endereco.trim() || null, fracaoIdeal, areaM2, form.financiado ? 1 : 0, form.uso_pessoal ? 1 : 0, form.id],
      );
    }
    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 className="section-title">Imóveis ({imoveis.length})</h2>
        <button className="btn primary" onClick={abrirNovo}>
          <Plus size={14} /> Novo imóvel
        </button>
      </div>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Cadastre aqui seus imóveis reais — cidade agrupa relatórios e rateio por região (ex: Floripa, Curitiba);
        marcar "uso pessoal" (residência própria, não é aluguel) tira o imóvel do DRE da atividade de locação por
        padrão, mantendo suas despesas visíveis separadamente.
      </p>

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>{form.id === null ? "Novo imóvel" : "Editar imóvel"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Apelido *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoImovel })}>
                {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Cidade / grupo
              <input
                className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                list="cidades-conhecidas" value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                placeholder="ex: Florianópolis"
              />
              <datalist id="cidades-conhecidas">
                {cidadesConhecidas.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Endereço
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Fração ideal (0-1)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.fracao_ideal} onChange={(e) => setForm({ ...form, fracao_ideal: e.target.value })} placeholder="ex: 0,08" />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Área (m²)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} placeholder="ex: 72" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={form.financiado} onChange={(e) => setForm({ ...form, financiado: e.target.checked })} />
              Financiado
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={form.uso_pessoal} onChange={(e) => setForm({ ...form, uso_pessoal: e.target.checked })} />
              Uso pessoal (residência própria, fora do DRE da atividade)
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.apelido.trim() === ""} onClick={salvar}>
              Salvar
            </button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Apelido</th>
              <th>Tipo</th>
              <th>Cidade</th>
              <th>Endereço</th>
              <th className="num">Fração ideal</th>
              <th className="num">Área (m²)</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((i) => (
              <tr key={i.id}>
                <td>{i.apelido}</td>
                <td>{ROTULO_TIPO[i.tipo]}</td>
                <td>{i.cidade ?? "—"}</td>
                <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{i.endereco ?? "—"}</td>
                <td className="num">{i.fracao_ideal ?? "—"}</td>
                <td className="num">{i.area_m2 ?? "—"}</td>
                <td>
                  {i.uso_pessoal === 1 ? (
                    <span className="pill warning" title="Fora do DRE da atividade de locação">
                      <Home size={11} style={{ marginRight: 3, verticalAlign: -1 }} /> uso pessoal
                    </span>
                  ) : i.financiado === 1 ? (
                    <span className="pill">financiado</span>
                  ) : (
                    <span className="pill good">rendimento</span>
                  )}
                </td>
                <td>
                  <button className="btn" style={{ padding: "4px 7px" }} onClick={() => abrirEdicao(i)}>
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {imoveis.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum imóvel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
