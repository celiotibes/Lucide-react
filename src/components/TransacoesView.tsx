import { Fragment, useMemo, useState } from "react";
import { Wand2, Split, Trash2 } from "lucide-react";
import { useDb } from "../db/DbContext";
import { consultar, executar } from "../db/connection";
import type { Imovel, PlanoConta, Transacao } from "../domain/types";
import { aplicarRateio, obterRateiosDaTransacao, removerRateio, type CriterioRateio } from "../domain/rateio/motorRateio";
import { escaparParaRegex, listarRegras, salvarRegra, excluirRegra, aplicarRegrasSalvas } from "../domain/categorize/regrasAprendidas";

const ROTULO_CRITERIO: Record<CriterioRateio, string> = {
  fracao_ideal: "Fração ideal",
  area_m2: "Área (m²)",
  por_unidade: "Igual entre unidades",
};

export function TransacoesView() {
  const { db, versao, persistir } = useDb();
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [rateioAbertoId, setRateioAbertoId] = useState<number | null>(null);
  const [regraAbertaId, setRegraAbertaId] = useState<number | null>(null);
  const [padraoRegra, setPadraoRegra] = useState("");
  const [imoveisSelecionados, setImoveisSelecionados] = useState<number[]>([]);
  const [criterio, setCriterio] = useState<CriterioRateio>("fracao_ideal");
  const [mensagem, setMensagem] = useState<string | null>(null);

  const planoContas = useMemo<PlanoConta[]>(() => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []), [db, versao]);
  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const regrasSalvas = useMemo(() => (db ? listarRegras(db) : []), [db, versao]);

  const transacoes = useMemo<Transacao[]>(() => {
    if (!db) return [];
    const filtro = somentePendentes ? "WHERE plano_conta_codigo IS NULL" : "";
    return consultar<Transacao>(db, `SELECT * FROM transacoes ${filtro} ORDER BY data DESC LIMIT 300`);
  }, [db, versao, somentePendentes]);

  const totalPendentes = useMemo(
    () => (db ? consultar<{ total: number }>(db, "SELECT COUNT(*) as total FROM transacoes WHERE plano_conta_codigo IS NULL")[0]?.total ?? 0 : 0),
    [db, versao],
  );

  async function categorizar(transacaoId: number, codigo: string) {
    if (!db) return;
    executar(db, "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = 'manual' WHERE id = ?", [codigo || null, transacaoId]);
    await persistir();
  }

  function abrirSalvarRegra(transacao: Transacao) {
    setRegraAbertaId(transacao.id);
    setPadraoRegra(escaparParaRegex(transacao.descricao_original));
  }

  async function confirmarSalvarRegra(transacao: Transacao) {
    if (!db || !transacao.plano_conta_codigo) return;
    salvarRegra(db, padraoRegra, transacao.plano_conta_codigo);
    const aplicadas = aplicarRegrasSalvas(db);
    await persistir();
    setRegraAbertaId(null);
    setMensagem(`Regra salva. Aplicada automaticamente a ${aplicadas} transação(ões) pendente(s) semelhante(s).`);
  }

  function abrirRateio(transacao: Transacao) {
    setRateioAbertoId(transacao.id);
    const existentes = db ? obterRateiosDaTransacao(db, transacao.id) : [];
    setImoveisSelecionados(existentes.length ? existentes.map((r) => r.imovelId) : transacao.imovel_id ? [transacao.imovel_id] : []);
    setCriterio(existentes[0]?.criterio ?? "fracao_ideal");
  }

  async function confirmarRateio(transacaoId: number) {
    if (!db || imoveisSelecionados.length < 2) return;
    aplicarRateio(db, transacaoId, imoveisSelecionados, criterio);
    await persistir();
    setRateioAbertoId(null);
    setMensagem("Rateio aplicado — o valor foi dividido entre os imóveis selecionados no DRE por imóvel.");
  }

  async function limparRateio(transacaoId: number) {
    if (!db) return;
    removerRateio(db, transacaoId);
    await persistir();
    setRateioAbertoId(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 className="section-title">Transações {totalPendentes > 0 && <span className="pill warning">{totalPendentes} pendente(s) de categorização</span>}</h2>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={somentePendentes} onChange={(e) => setSomentePendentes(e.target.checked)} />
          Mostrar apenas pendentes
        </label>
      </div>

      {regrasSalvas.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Regras aprendidas ({regrasSalvas.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {regrasSalvas.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span>
                  <code>{r.padrao}</code> → {r.plano_conta_codigo}
                </span>
                <button className="btn" style={{ padding: "3px 8px" }} onClick={async () => { if (!db) return; excluirRegra(db, r.id); await persistir(); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mensagem && (
        <div className="aviso-caixa" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }}>
          {mensagem}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th className="num">Valor</th>
              <th>Categoria</th>
              <th>Imóvel</th>
              <th>Origem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => {
              const rateios = db ? obterRateiosDaTransacao(db, t.id) : [];
              return (
                <Fragment key={t.id}>
                  <tr>
                    <td>{t.data}</td>
                    <td>{t.descricao_original}</td>
                    <td className="num" style={{ color: t.valor < 0 ? "var(--viz-despesa)" : "var(--viz-good)" }}>
                      {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    <td>
                      <select value={t.plano_conta_codigo ?? ""} onChange={(e) => categorizar(t.id, e.target.value)}>
                        <option value="">— sem categoria —</option>
                        {planoContas.map((p) => (
                          <option key={p.codigo} value={p.codigo}>
                            {p.codigo} · {p.descricao}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {rateios.length > 0 ? (
                        <span className="pill good">rateado · {rateios.length} imóveis</span>
                      ) : t.imovel_id ? (
                        imoveis.find((i) => i.id === t.imovel_id)?.apelido ?? t.imovel_id
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{t.categorizado_por ? <span className="pill good">{t.categorizado_por}</span> : <span className="pill warning">pendente</span>}</td>
                    <td style={{ display: "flex", gap: 4 }}>
                      {t.plano_conta_codigo && (
                        <button className="btn" title="Salvar como regra" style={{ padding: "4px 7px" }} onClick={() => abrirSalvarRegra(t)}>
                          <Wand2 size={13} />
                        </button>
                      )}
                      <button className="btn" title="Ratear entre imóveis" style={{ padding: "4px 7px" }} onClick={() => abrirRateio(t)}>
                        <Split size={13} />
                      </button>
                    </td>
                  </tr>
                  {regraAbertaId === t.id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 4px" }}>
                          <span style={{ fontSize: 13 }}>Padrão (regex):</span>
                          <input value={padraoRegra} onChange={(e) => setPadraoRegra(e.target.value)} style={{ flex: 1, padding: "5px 8px" }} />
                          <button className="btn primary" onClick={() => confirmarSalvarRegra(t)}>Salvar regra</button>
                          <button className="btn" onClick={() => setRegraAbertaId(null)}>Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {rateioAbertoId === t.id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <div style={{ padding: "10px 4px" }}>
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                            {imoveis.map((i) => (
                              <label key={i.id} style={{ fontSize: 13, display: "flex", gap: 5, alignItems: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={imoveisSelecionados.includes(i.id)}
                                  onChange={(e) =>
                                    setImoveisSelecionados((atual) =>
                                      e.target.checked ? [...atual, i.id] : atual.filter((id) => id !== i.id),
                                    )
                                  }
                                />
                                {i.apelido}
                              </label>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <select value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioRateio)}>
                              {Object.entries(ROTULO_CRITERIO).map(([valor, rotulo]) => (
                                <option key={valor} value={valor}>{rotulo}</option>
                              ))}
                            </select>
                            <button className="btn primary" disabled={imoveisSelecionados.length < 2} onClick={() => confirmarRateio(t.id)}>
                              Aplicar rateio ({imoveisSelecionados.length} imóveis)
                            </button>
                            {rateios.length > 0 && (
                              <button className="btn danger" onClick={() => limparRateio(t.id)}>Remover rateio</button>
                            )}
                            <button className="btn" onClick={() => setRateioAbertoId(null)}>Fechar</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {transacoes.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma transação encontrada. Importe documentos ou carregue os dados de demonstração.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
