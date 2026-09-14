import { useMemo, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";
import { listarPartes, adicionarParte, removerParte } from "../../domain/contratos/locatarios";
import { registrarLog, resumirDiferenca } from "../../domain/auditoria/logAlteracoes";
import type { Caucao, ContratoLocacao, FranquiaHidrica, Imovel, IndiceReajuste, PapelLocatario, RubricaCusteio, TipoContrato } from "../../domain/types";

interface Formulario {
  id: number | null;
  imovel_id: number | null;
  locatario: string;
  tipo: TipoContrato;
  valor_referencia: string;
  dia_vencimento: string;
  data_inicio: string;
  data_fim: string;
  indice_reajuste: IndiceReajuste;
  percentual_reajuste_primeira_renovacao: string;
  duracao_minima_meses: string;
  multa_rescisoria_teto_meses: string;
  percentual_aluguel_efetivo: string;
  multa_percentual: string;
  multa_ate_dias: string;
  multa_percentual_substitutiva: string;
  juros_mensal_percentual: string;
  indice_correcao_mora: IndiceReajuste;
  honorarios_percentual: string;
  dias_gatilho_judicial: string;
  observacoes: string;
}

function formVazio(imovelPadrao: number | null): Formulario {
  return {
    id: null, imovel_id: imovelPadrao, locatario: "", tipo: "residencial_fixo",
    valor_referencia: "", dia_vencimento: "10", data_inicio: "", data_fim: "",
    indice_reajuste: "igpm", percentual_reajuste_primeira_renovacao: "", duracao_minima_meses: "12", multa_rescisoria_teto_meses: "3",
    percentual_aluguel_efetivo: "100",
    multa_percentual: "2", multa_ate_dias: "5", multa_percentual_substitutiva: "10", juros_mensal_percentual: "1",
    indice_correcao_mora: "ipca", honorarios_percentual: "0", dias_gatilho_judicial: "9999",
    observacoes: "",
  };
}

function paraFormulario(c: ContratoLocacao): Formulario {
  return {
    id: c.id, imovel_id: c.imovel_id, locatario: c.locatario, tipo: c.tipo,
    valor_referencia: c.valor_referencia.toString(), dia_vencimento: c.dia_vencimento?.toString() ?? "",
    data_inicio: c.data_inicio, data_fim: c.data_fim ?? "",
    indice_reajuste: c.indice_reajuste ?? "igpm", percentual_reajuste_primeira_renovacao: c.percentual_reajuste_primeira_renovacao?.toString() ?? "",
    duracao_minima_meses: c.duracao_minima_meses.toString(), multa_rescisoria_teto_meses: c.multa_rescisoria_teto_meses.toString(),
    percentual_aluguel_efetivo: c.percentual_aluguel_efetivo.toString(),
    multa_percentual: c.multa_percentual.toString(), multa_ate_dias: c.multa_ate_dias.toString(),
    multa_percentual_substitutiva: c.multa_percentual_substitutiva.toString(), juros_mensal_percentual: c.juros_mensal_percentual.toString(),
    indice_correcao_mora: c.indice_correcao_mora ?? "ipca", honorarios_percentual: c.honorarios_percentual.toString(),
    dias_gatilho_judicial: c.dias_gatilho_judicial.toString(), observacoes: c.observacoes ?? "",
  };
}

function num(valor: string, fallback: number): number {
  const n = Number.parseFloat(valor.replace(",", "."));
  return Number.isNaN(n) ? fallback : n;
}

/** Como num(), mas trava o resultado em [min, max] — usado para percentuais que não fazem
 * sentido físico fora da faixa (ex: mais de 100% do valor recebido sendo "aluguel efetivo"
 * produziria renda tributável maior que o próprio recebimento). O campo era texto livre sem
 * nenhum limite, nem no HTML nem no banco — um erro de digitação distorcia silenciosamente a
 * renda tributável reportada (achado de auditoria adversarial). */
function numFaixa(valor: string, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num(valor, fallback)));
}

export function ContratosForm() {
  const { db, versao, persistir } = useDb();
  const [form, setForm] = useState<Formulario | null>(null);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);

  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const contratos = useMemo<ContratoLocacao[]>(() => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao ORDER BY data_inicio DESC") : []), [db, versao]);
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  async function salvar() {
    if (!db || !form || form.imovel_id === null || form.locatario.trim() === "" || form.valor_referencia.trim() === "" || form.data_inicio === "") return;
    if (form.data_fim !== "" && form.data_fim < form.data_inicio) {
      alert("A data de fim não pode ser anterior à data de início — corrija antes de salvar.");
      return;
    }
    const valores = {
      imovel_id: form.imovel_id,
      locatario: form.locatario.trim(),
      tipo: form.tipo,
      valor_referencia: num(form.valor_referencia, 0),
      dia_vencimento: form.dia_vencimento.trim() === "" ? null : Number.parseInt(form.dia_vencimento, 10),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      indice_reajuste: form.indice_reajuste,
      percentual_reajuste_primeira_renovacao: form.percentual_reajuste_primeira_renovacao.trim() === "" ? null : num(form.percentual_reajuste_primeira_renovacao, 0),
      duracao_minima_meses: Number.parseInt(form.duracao_minima_meses, 10) || 12,
      multa_rescisoria_teto_meses: num(form.multa_rescisoria_teto_meses, 3),
      percentual_aluguel_efetivo: numFaixa(form.percentual_aluguel_efetivo, 100, 0, 100),
      multa_percentual: num(form.multa_percentual, 2),
      multa_ate_dias: Number.parseInt(form.multa_ate_dias, 10) || 5,
      multa_percentual_substitutiva: num(form.multa_percentual_substitutiva, 10),
      juros_mensal_percentual: num(form.juros_mensal_percentual, 1),
      indice_correcao_mora: form.indice_correcao_mora,
      honorarios_percentual: num(form.honorarios_percentual, 0),
      dias_gatilho_judicial: Number.parseInt(form.dias_gatilho_judicial, 10) || 9999,
      observacoes: form.observacoes.trim() || null,
    };
    const campos = Object.keys(valores);
    const placeholders = campos.map(() => "?").join(", ");
    const valoresArray = campos.map((c) => (valores as Record<string, string | number | null>)[c]);

    const dadosAnteriores = form.id !== null ? (consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE id = ?", [form.id])[0] as unknown as Record<string, unknown>) ?? null : null;

    if (form.id === null) {
      executar(db, `INSERT INTO contratos_locacao (${campos.join(", ")}) VALUES (${placeholders})`, valoresArray);
    } else {
      executar(db, `UPDATE contratos_locacao SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...valoresArray, form.id]);
    }

    const idRegistro = form.id ?? consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
    const dadosNovos = consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE id = ?", [idRegistro])[0] as unknown as Record<string, unknown>;
    registrarLog(db, "contratos_locacao", idRegistro, form.id === null ? "criacao" : "edicao", resumirDiferenca(dadosAnteriores, dadosNovos), dadosAnteriores, dadosNovos);

    await persistir();
    setForm(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Contratos de locação ({contratos.length})</h3>
        <button className="btn primary" disabled={imoveis.length === 0} onClick={() => setForm(formVazio(imoveis[0]?.id ?? null))}>
          <Plus size={14} /> Novo contrato
        </button>
      </div>
      {imoveis.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>Cadastre um imóvel primeiro, na aba Imóveis.</p>
      )}

      {form && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6, fontWeight: 600 }}>Dados básicos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.imovel_id ?? ""} onChange={(e) => setForm({ ...form, imovel_id: Number(e.target.value) })}>
                {imoveis.map((i) => <option key={i.id} value={i.id}>{i.apelido}{i.uso_pessoal ? " — uso pessoal" : ""}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Locatário principal *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.locatario} onChange={(e) => setForm({ ...form, locatario: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoContrato })}>
                <option value="residencial_fixo">Residencial (prazo fixo)</option>
                <option value="airbnb_temporada">Airbnb / temporada</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor de referência (R$) *
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.valor_referencia} onChange={(e) => setForm({ ...form, valor_referencia: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Dia de vencimento
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Início *
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Fim (vazio = vigente)
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              % do valor que é aluguel efetivo
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.percentual_aluguel_efetivo} onChange={(e) => setForm({ ...form, percentual_aluguel_efetivo: e.target.value })} title="100 = contrato simples, sem rateio de custeio embutido" />
            </label>
          </div>

          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6, fontWeight: 600 }}>Reajuste e rescisão</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Índice de reajuste
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.indice_reajuste} onChange={(e) => setForm({ ...form, indice_reajuste: e.target.value as IndiceReajuste })}>
                <option value="igpm">IGP-M</option>
                <option value="ipca">IPCA</option>
                <option value="nenhum">Nenhum</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              % fixo na 1ª renovação (opcional)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.percentual_reajuste_primeira_renovacao} onChange={(e) => setForm({ ...form, percentual_reajuste_primeira_renovacao: e.target.value })} placeholder="ex: 6" />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Duração do ciclo (meses)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.duracao_minima_meses} onChange={(e) => setForm({ ...form, duracao_minima_meses: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Teto multa rescisória (meses)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.multa_rescisoria_teto_meses} onChange={(e) => setForm({ ...form, multa_rescisoria_teto_meses: e.target.value })} />
            </label>
          </div>

          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6, fontWeight: 600 }}>Inadimplência</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Multa inicial (%)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.multa_percentual} onChange={(e) => setForm({ ...form, multa_percentual: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Multa inicial até (dias)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.multa_ate_dias} onChange={(e) => setForm({ ...form, multa_ate_dias: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Multa substitutiva (%)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.multa_percentual_substitutiva} onChange={(e) => setForm({ ...form, multa_percentual_substitutiva: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Juros mora (% a.m.)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.juros_mensal_percentual} onChange={(e) => setForm({ ...form, juros_mensal_percentual: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Índice de correção da mora
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={form.indice_correcao_mora} onChange={(e) => setForm({ ...form, indice_correcao_mora: e.target.value as IndiceReajuste })}>
                <option value="igpm">IGP-M</option>
                <option value="ipca">IPCA</option>
                <option value="nenhum">Nenhum</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Honorários advocatícios (%)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.honorarios_percentual} onChange={(e) => setForm({ ...form, honorarios_percentual: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Gatilho judicial (dias de atraso)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.dias_gatilho_judicial} onChange={(e) => setForm({ ...form, dias_gatilho_judicial: e.target.value })} />
            </label>
          </div>

          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 14 }}>
            Observações
            <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={form.imovel_id === null || form.locatario.trim() === "" || form.valor_referencia.trim() === "" || form.data_inicio === ""} onClick={salvar}>
              Salvar
            </button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Imóvel</th><th>Locatário</th><th>Tipo</th><th className="num">Valor</th><th>Início</th><th>Fim</th><th></th></tr></thead>
          <tbody>
            {contratos.map((c) => (
              <ContratoLinha
                key={c.id}
                contrato={c}
                imovelApelido={imoveisPorId.get(c.imovel_id)?.apelido ?? String(c.imovel_id)}
                expandido={expandidoId === c.id}
                onToggle={() => setExpandidoId(expandidoId === c.id ? null : c.id)}
                onEditar={() => setForm(paraFormulario(c))}
              />
            ))}
            {contratos.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum contrato cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContratoLinha({
  contrato, imovelApelido, expandido, onToggle, onEditar,
}: {
  contrato: ContratoLocacao;
  imovelApelido: string;
  expandido: boolean;
  onToggle: () => void;
  onEditar: () => void;
}) {
  const { db, versao, persistir } = useDb();
  const [novaParte, setNovaParte] = useState({ nome: "", papel: "responsavel_solidario" as PapelLocatario });
  const [novaCaucao, setNovaCaucao] = useState({ valor_inicial: "", data_deposito: "", indice_correcao: "nenhum" as Caucao["indice_correcao"] });
  const [novaRubrica, setNovaRubrica] = useState({ referencia: "", descricao: "", percentual: "", valor_base: "" });
  const [novaFranquia, setNovaFranquia] = useState({ ocupacao_pessoas: "", franquia_total_m3: "", custo_estimado_reais: "" });

  const partes = useMemo(() => (db && expandido ? listarPartes(db, contrato.id) : []), [db, versao, expandido, contrato.id]);
  const caucoes = useMemo(() => (db && expandido ? consultar<Caucao>(db, "SELECT * FROM caucoes WHERE contrato_id = ?", [contrato.id]) : []), [db, versao, expandido, contrato.id]);
  const rubricas = useMemo(
    () => (db && expandido ? consultar<RubricaCusteio>(db, "SELECT * FROM contrato_custeio_rubricas WHERE contrato_id = ? ORDER BY referencia", [contrato.id]) : []),
    [db, versao, expandido, contrato.id],
  );
  const franquias = useMemo(
    () => (db && expandido ? consultar<FranquiaHidrica>(db, "SELECT * FROM contrato_franquia_hidrica WHERE contrato_id = ? ORDER BY ocupacao_pessoas", [contrato.id]) : []),
    [db, versao, expandido, contrato.id],
  );

  async function adicionar() {
    if (!db || novaParte.nome.trim() === "") return;
    adicionarParte(db, contrato.id, { nome: novaParte.nome.trim(), papel: novaParte.papel });
    await persistir();
    setNovaParte({ nome: "", papel: "responsavel_solidario" });
  }
  async function remover(parteId: number) {
    if (!db) return;
    removerParte(db, parteId);
    await persistir();
  }
  async function adicionarCaucao() {
    if (!db || novaCaucao.valor_inicial.trim() === "" || novaCaucao.data_deposito === "") return;
    executar(
      db,
      "INSERT INTO caucoes (contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (?, ?, ?, ?)",
      [contrato.id, Number.parseFloat(novaCaucao.valor_inicial.replace(",", ".")), novaCaucao.data_deposito, novaCaucao.indice_correcao],
    );
    await persistir();
    setNovaCaucao({ valor_inicial: "", data_deposito: "", indice_correcao: "nenhum" });
  }
  async function adicionarRubrica() {
    if (!db || novaRubrica.descricao.trim() === "") return;
    executar(
      db,
      "INSERT INTO contrato_custeio_rubricas (contrato_id, referencia, descricao, percentual, valor_base) VALUES (?, ?, ?, ?, ?)",
      [
        contrato.id,
        novaRubrica.referencia.trim() || null,
        novaRubrica.descricao.trim(),
        novaRubrica.percentual.trim() === "" ? null : Number.parseFloat(novaRubrica.percentual.replace(",", ".")),
        novaRubrica.valor_base.trim() === "" ? null : Number.parseFloat(novaRubrica.valor_base.replace(",", ".")),
      ],
    );
    await persistir();
    setNovaRubrica({ referencia: "", descricao: "", percentual: "", valor_base: "" });
  }
  async function removerRubrica(rubricaId: number) {
    if (!db) return;
    executar(db, "DELETE FROM contrato_custeio_rubricas WHERE id = ?", [rubricaId]);
    await persistir();
  }
  async function adicionarFranquia() {
    if (!db || novaFranquia.ocupacao_pessoas.trim() === "") return;
    const ocupacao = Number.parseInt(novaFranquia.ocupacao_pessoas, 10);
    if (Number.isNaN(ocupacao) || ocupacao < 1) return;
    executar(
      db,
      "INSERT INTO contrato_franquia_hidrica (contrato_id, ocupacao_pessoas, franquia_total_m3, custo_estimado_reais) VALUES (?, ?, ?, ?)",
      [
        contrato.id,
        ocupacao,
        novaFranquia.franquia_total_m3.trim() === "" ? null : Number.parseFloat(novaFranquia.franquia_total_m3.replace(",", ".")),
        novaFranquia.custo_estimado_reais.trim() === "" ? null : Number.parseFloat(novaFranquia.custo_estimado_reais.replace(",", ".")),
      ],
    );
    await persistir();
    setNovaFranquia({ ocupacao_pessoas: "", franquia_total_m3: "", custo_estimado_reais: "" });
  }
  async function removerFranquia(franquiaId: number) {
    if (!db) return;
    executar(db, "DELETE FROM contrato_franquia_hidrica WHERE id = ?", [franquiaId]);
    await persistir();
  }

  return (
    <>
      <tr>
        <td>{imovelApelido}</td>
        <td>{contrato.locatario}</td>
        <td>{contrato.tipo === "residencial_fixo" ? "Residencial" : "Airbnb"}</td>
        <td className="num">{contrato.valor_referencia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
        <td>{contrato.data_inicio}</td>
        <td>{contrato.data_fim ?? "vigente"}</td>
        <td style={{ display: "flex", gap: 4 }}>
          <button className="btn" style={{ padding: "4px 7px" }} onClick={onEditar}><Pencil size={13} /></button>
          <button className="btn" style={{ padding: "4px 7px" }} onClick={onToggle}>
            {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-2)" }}>
            <div style={{ padding: "12px 4px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Locatários / responsáveis solidários</div>
                {partes.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{p.nome} <span style={{ color: "var(--ink-soft)" }}>({p.papel === "locatario" ? "locatário" : "responsável solidário"})</span></span>
                    <button className="btn" style={{ padding: "3px 6px" }} onClick={() => remover(p.id)}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="btn" style={{ cursor: "text", flex: 1 }} placeholder="Nome" value={novaParte.nome} onChange={(e) => setNovaParte({ ...novaParte, nome: e.target.value })} />
                  <select className="btn" value={novaParte.papel} onChange={(e) => setNovaParte({ ...novaParte, papel: e.target.value as PapelLocatario })}>
                    <option value="locatario">Locatário</option>
                    <option value="responsavel_solidario">Responsável solidário</option>
                  </select>
                  <button className="btn" onClick={adicionar}><Plus size={13} /></button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Depósito caução</div>
                {caucoes.map((c) => (
                  <div key={c.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
                    {c.valor_inicial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em {c.data_deposito} ({c.indice_correcao})
                  </div>
                ))}
                <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "4px 0 8px" }}>
                  Caução parcelada (ex: 50% na entrada, 50% no 2º boleto): lance uma linha por parcela — cada uma
                  corrige a partir da sua própria data de depósito.
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="btn" style={{ cursor: "text", width: 100 }} placeholder="Valor" value={novaCaucao.valor_inicial} onChange={(e) => setNovaCaucao({ ...novaCaucao, valor_inicial: e.target.value })} />
                  <input type="date" className="btn" value={novaCaucao.data_deposito} onChange={(e) => setNovaCaucao({ ...novaCaucao, data_deposito: e.target.value })} />
                  <select className="btn" value={novaCaucao.indice_correcao} onChange={(e) => setNovaCaucao({ ...novaCaucao, indice_correcao: e.target.value as Caucao["indice_correcao"] })}>
                    <option value="poupanca">Poupança</option>
                    <option value="igpm">IGP-M</option>
                    <option value="ipca">IPCA</option>
                    <option value="nenhum">Nenhum</option>
                  </select>
                  <button className="btn" onClick={adicionarCaucao}><Plus size={13} /></button>
                </div>
              </div>
            </div>
            <div style={{ padding: "0 4px 12px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Composição contratada da Cota de Custeio (opcional)
              </div>
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                Sub-rubricas itemizadas no próprio contrato (ex: "conservação de mobiliário de
                áreas comuns", "lavanderia coletiva"), com o percentual/valor na data da
                assinatura — referência documental exibida no DSS ao lado do gasto real, nunca
                somada a ele (a conciliação bancária só existe no grão do plano de contas).
              </p>
              {rubricas.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 8 }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>Ref.</th><th>Descrição</th><th className="num">%</th><th className="num">Valor (R$)</th><th></th></tr>
                    </thead>
                    <tbody>
                      {rubricas.map((r) => (
                        <tr key={r.id}>
                          <td>{r.referencia ?? "—"}</td>
                          <td>{r.descricao}</td>
                          <td className="num">{r.percentual !== undefined && r.percentual !== null ? `${r.percentual}%` : "—"}</td>
                          <td className="num">{r.valor_base !== undefined && r.valor_base !== null ? r.valor_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                          <td>
                            <button className="btn" style={{ padding: "3px 6px" }} onClick={() => removerRubrica(r.id)}><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input className="btn" style={{ cursor: "text", width: 60 }} placeholder="Ref." value={novaRubrica.referencia} onChange={(e) => setNovaRubrica({ ...novaRubrica, referencia: e.target.value })} />
                <input className="btn" style={{ cursor: "text", flex: 1, minWidth: 200 }} placeholder="Descrição (ex: Lavanderia coletiva)" value={novaRubrica.descricao} onChange={(e) => setNovaRubrica({ ...novaRubrica, descricao: e.target.value })} />
                <input className="btn" style={{ cursor: "text", width: 70 }} placeholder="%" value={novaRubrica.percentual} onChange={(e) => setNovaRubrica({ ...novaRubrica, percentual: e.target.value })} />
                <input className="btn" style={{ cursor: "text", width: 100 }} placeholder="Valor (R$)" value={novaRubrica.valor_base} onChange={(e) => setNovaRubrica({ ...novaRubrica, valor_base: e.target.value })} />
                <button className="btn" disabled={novaRubrica.descricao.trim() === ""} onClick={adicionarRubrica}><Plus size={13} /></button>
              </div>
            </div>
            <div style={{ padding: "0 4px 12px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Franquia hídrica contratada por ocupação (opcional)
              </div>
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                Matriz de referência quando não há hidrômetro individualizado por unidade (ex:
                Anexo V) — documenta o que foi contratado por faixa de moradores, não mede
                consumo real nem calcula rateio extraordinário por excedente (o sistema não tem
                leitura de hidrômetro).
              </p>
              {franquias.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 8 }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>Ocupação</th><th className="num">Franquia total (m³/mês)</th><th className="num">Custo estimado</th><th></th></tr>
                    </thead>
                    <tbody>
                      {franquias.map((f) => (
                        <tr key={f.id}>
                          <td>{f.ocupacao_pessoas} pessoa(s)</td>
                          <td className="num">{f.franquia_total_m3 !== undefined && f.franquia_total_m3 !== null ? `${f.franquia_total_m3} m³` : "—"}</td>
                          <td className="num">{f.custo_estimado_reais !== undefined && f.custo_estimado_reais !== null ? f.custo_estimado_reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                          <td>
                            <button className="btn" style={{ padding: "3px 6px" }} onClick={() => removerFranquia(f.id)}><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input className="btn" style={{ cursor: "text", width: 110 }} placeholder="Ocupação (nº pessoas)" value={novaFranquia.ocupacao_pessoas} onChange={(e) => setNovaFranquia({ ...novaFranquia, ocupacao_pessoas: e.target.value })} />
                <input className="btn" style={{ cursor: "text", width: 130 }} placeholder="Franquia (m³)" value={novaFranquia.franquia_total_m3} onChange={(e) => setNovaFranquia({ ...novaFranquia, franquia_total_m3: e.target.value })} />
                <input className="btn" style={{ cursor: "text", width: 130 }} placeholder="Custo estimado (R$)" value={novaFranquia.custo_estimado_reais} onChange={(e) => setNovaFranquia({ ...novaFranquia, custo_estimado_reais: e.target.value })} />
                <button className="btn" disabled={novaFranquia.ocupacao_pessoas.trim() === ""} onClick={adicionarFranquia}><Plus size={13} /></button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
