import { Fragment, useMemo, useState } from "react";
import { Wand2, Split, Trash2, Download, X } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar, executar } from "../db/connection";
import type { Imovel, PlanoConta, Transacao } from "../domain/types";
import { aplicarRateio, obterRateiosDaTransacao, removerRateio, type CriterioRateio } from "../domain/rateio/motorRateio";
import { escaparParaRegex, listarRegras, salvarRegra, excluirRegra, aplicarRegrasSalvas } from "../domain/categorize/regrasAprendidas";
import { classificarPfNegocio, gerarMapaConciliacao, gerarCsvConciliacao, type ClassificacaoPfNegocio } from "../domain/reports/conciliacaoBancaria";

/** Filtro inicial vindo de outra tela (drill-down do Painel: clicar numa barra da cascata do
 * DRE ou numa célula do mapa de calor navega pra cá já filtrado pela categoria/mês/imóvel que
 * originou o clique). Aplicado uma única vez, na montagem — depois disso o usuário controla os
 * filtros normalmente pelos próprios controles da tela. */
export interface FiltroTransacoesInicial {
  planoContaCodigo?: string | null;
  /** Mais de um código do plano de contas (ex: juros + amortização de financiamento) —
   * combinável com imovelId/data, diferente de transacaoIds abaixo. Usado quando o drill-down
   * sabe que a evidência está espalhada entre 2+ categorias fixas, não uma só. */
  planoContaCodigos?: string[] | null;
  imovelId?: number | null;
  dataInicio?: string;
  dataFim?: string;
  /** IDs exatos de transação — usado pelos achados da Auditoria forense (duplicidade,
   * outlier), que já sabem precisamente quais lançamentos originaram o alerta em vez de só
   * uma categoria/período aproximado. Quando presente, ignora os demais filtros de categoria/
   * imóvel/data (é mais preciso que eles) e mostra só esses IDs. */
  transacaoIds?: number[];
}

const PILL_CLASSE_PF_NEGOCIO: Record<ClassificacaoPfNegocio, string> = {
  PF: "warning",
  "Negócio": "good",
  "Transferência": "",
  Pendente: "critical",
};

const ROTULO_CRITERIO: Record<CriterioRateio, string> = {
  fracao_ideal: "Fração ideal",
  area_m2: "Área (m²)",
  por_unidade: "Igual entre unidades",
};

export function TransacoesView({ filtroInicial }: { filtroInicial?: FiltroTransacoesInicial | null }) {
  const { db, versao, persistir } = useDb();
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [rateioAbertoId, setRateioAbertoId] = useState<number | null>(null);
  const [regraAbertaId, setRegraAbertaId] = useState<number | null>(null);
  const [padraoRegra, setPadraoRegra] = useState("");
  const [imovelRegra, setImovelRegra] = useState<number | "">("");
  const [imoveisSelecionados, setImoveisSelecionados] = useState<number[]>([]);
  const [criterio, setCriterio] = useState<CriterioRateio>("fracao_ideal");
  const [mensagem, setMensagem] = useState<string | null>(null);

  // Estado lazy-inicializado a partir de filtroInicial (drill-down) — só lido na primeira
  // renderização; depois disso o usuário controla os filtros normalmente pelos selects abaixo.
  const [filtroCategoria, setFiltroCategoria] = useState(filtroInicial?.planoContaCodigo ?? "");
  const [filtroImovel, setFiltroImovel] = useState<number | "">(filtroInicial?.imovelId ?? "");
  const [filtroDataInicio, setFiltroDataInicio] = useState(filtroInicial?.dataInicio ?? "");
  const [filtroDataFim, setFiltroDataFim] = useState(filtroInicial?.dataFim ?? "");
  const [filtroTransacaoIds, setFiltroTransacaoIds] = useState<number[] | null>(filtroInicial?.transacaoIds ?? null);
  const [filtroCategorias, setFiltroCategorias] = useState<string[] | null>(filtroInicial?.planoContaCodigos ?? null);

  const planoContas = useMemo<PlanoConta[]>(() => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []), [db, versao]);
  const planoContasPorCodigo = useMemo(() => new Map(planoContas.map((p) => [p.codigo, p])), [planoContas]);
  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const regrasSalvas = useMemo(() => (db ? listarRegras(db) : []), [db, versao]);

  // "Somente pendentes" (plano_conta_codigo IS NULL) é incompatível com um filtro de categoria
  // (plano_conta_codigo = X): toda transação categorizada já tem código preenchido, então a
  // combinação nunca traria resultado — e com filtroTransacaoIds a lista já é um conjunto exato
  // de IDs, sem nada a refinar. Desabilita o checkbox nesses dois casos em vez de deixá-lo
  // "morto" sem indicação visual de que está sendo ignorado.
  const pendentesIndisponivel = filtroCategoria !== "" || filtroCategorias !== null || filtroTransacaoIds !== null;
  const algumFiltroAtivo =
    somentePendentes || filtroCategoria !== "" || filtroImovel !== "" || filtroDataInicio !== "" || filtroDataFim !== "" || filtroTransacaoIds !== null || filtroCategorias !== null;
  function limparFiltros() {
    setSomentePendentes(false);
    setFiltroCategoria("");
    setFiltroImovel("");
    setFiltroDataInicio("");
    setFiltroDataFim("");
    setFiltroTransacaoIds(null);
    setFiltroCategorias(null);
  }

  const transacoes = useMemo<Transacao[]>(() => {
    if (!db) return [];
    if (filtroTransacaoIds !== null) {
      if (filtroTransacaoIds.length === 0) return [];
      const placeholders = filtroTransacaoIds.map(() => "?").join(",");
      return consultar<Transacao>(db, `SELECT * FROM transacoes WHERE id IN (${placeholders}) ORDER BY data DESC`, filtroTransacaoIds);
    }
    const condicoes: string[] = [];
    const params: (string | number)[] = [];
    // "Somente pendentes" e filtro de categoria são mutuamente exclusivos (ver
    // pendentesIndisponivel) — a guarda aqui é a garantia real de correção, o checkbox
    // desabilitado na UI é só o reflexo visual dela; sem isso, marcar "pendentes" e DEPOIS
    // aplicar um filtro de categoria (ex. via drill-down) deixaria as duas condições ativas ao
    // mesmo tempo, uma combinação estruturalmente impossível que sempre retorna vazio.
    if (somentePendentes && filtroCategoria === "" && filtroCategorias === null) condicoes.push("plano_conta_codigo IS NULL");
    if (filtroCategoria !== "") { condicoes.push("plano_conta_codigo = ?"); params.push(filtroCategoria); }
    if (filtroCategorias !== null && filtroCategorias.length > 0) {
      condicoes.push(`plano_conta_codigo IN (${filtroCategorias.map(() => "?").join(",")})`);
      params.push(...filtroCategorias);
    }
    if (filtroImovel !== "") { condicoes.push("imovel_id = ?"); params.push(filtroImovel); }
    if (filtroDataInicio !== "") { condicoes.push("data >= ?"); params.push(filtroDataInicio); }
    if (filtroDataFim !== "") { condicoes.push("data <= ?"); params.push(filtroDataFim); }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    return consultar<Transacao>(db, `SELECT * FROM transacoes ${where} ORDER BY data DESC LIMIT 300`, params);
  }, [db, versao, somentePendentes, filtroCategoria, filtroCategorias, filtroImovel, filtroDataInicio, filtroDataFim, filtroTransacaoIds]);

  const totalPendentes = useMemo(
    () => (db ? consultar<{ total: number }>(db, "SELECT COUNT(*) as total FROM transacoes WHERE plano_conta_codigo IS NULL")[0]?.total ?? 0 : 0),
    [db, versao],
  );

  async function categorizar(transacaoId: number, codigo: string) {
    if (!db) return;
    executar(db, "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = 'manual' WHERE id = ?", [codigo || null, transacaoId]);
    await persistir();
  }

  async function atribuirImovel(transacaoId: number, imovelId: string) {
    if (!db) return;
    executar(db, "UPDATE transacoes SET imovel_id = ? WHERE id = ?", [imovelId || null, transacaoId]);
    await persistir();
  }

  function abrirSalvarRegra(transacao: Transacao) {
    setRegraAbertaId(transacao.id);
    setPadraoRegra(escaparParaRegex(transacao.descricao_original));
    setImovelRegra(transacao.imovel_id ?? "");
  }

  async function confirmarSalvarRegra(transacao: Transacao) {
    if (!db || !transacao.plano_conta_codigo) return;
    salvarRegra(db, padraoRegra, transacao.plano_conta_codigo, imovelRegra === "" ? null : imovelRegra);
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

  function exportarMapaConciliacao() {
    if (!db) return;
    const csv = gerarCsvConciliacao(gerarMapaConciliacao(db));
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mapa-conciliacao-bancaria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 className="section-title">Transações {totalPendentes > 0 && <span className="pill warning">{totalPendentes} pendente(s) de categorização</span>}</h2>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, opacity: pendentesIndisponivel ? 0.5 : 1 }}
            title={
              pendentesIndisponivel
                ? filtroTransacaoIds !== null
                  ? "Não se aplica: esta lista já é um conjunto exato de lançamentos vindo de um achado da auditoria"
                  : "Não se aplica junto com um filtro de categoria — toda transação com categoria já tem plano_conta_codigo preenchido, então a combinação nunca traria resultado"
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={somentePendentes}
              disabled={pendentesIndisponivel}
              onChange={(e) => setSomentePendentes(e.target.checked)}
            />
            Mostrar apenas pendentes
          </label>
          <button className="btn" onClick={exportarMapaConciliacao} title="Exporta todas as transações com Data, Descrição, Valor, Categoria, Imóvel e PF/Negócio">
            <Download size={13} /> Exportar mapa de conciliação (CSV)
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {filtroTransacaoIds !== null ? (
          <>
            <span className="pill critical" title="Filtro aplicado a partir de um achado da Auditoria forense (duplicidade ou outlier) — mostra exatamente os lançamentos envolvidos">
              filtrando: {filtroTransacaoIds.length} transação(ões) específica(s) — achado da auditoria
            </span>
            <button className="btn" onClick={limparFiltros} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <X size={13} /> Limpar filtro
            </button>
          </>
        ) : (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              Categoria:
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">— todas —</option>
                {planoContas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.descricao}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              Imóvel:
              <select value={filtroImovel} onChange={(e) => setFiltroImovel(e.target.value ? Number(e.target.value) : "")}>
                <option value="">— todos —</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.apelido}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              De:
              <input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              Até:
              <input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
            </label>
            {algumFiltroAtivo && (
              <button className="btn" onClick={limparFiltros} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <X size={13} /> Limpar filtros
              </button>
            )}
            {(filtroCategoria !== "" || filtroImovel !== "" || filtroCategorias !== null) && (
              <span className="pill good" title="Filtro aplicado a partir de um clique no Painel, na Auditoria forense ou em Financiamentos">
                filtrando:{" "}
                {[
                  filtroCategoria !== "" ? (planoContasPorCodigo.get(filtroCategoria)?.descricao ?? filtroCategoria) : null,
                  filtroCategorias !== null ? filtroCategorias.map((c) => planoContasPorCodigo.get(c)?.descricao ?? c).join(" + ") : null,
                  filtroImovel !== "" ? imoveis.find((i) => i.id === filtroImovel)?.apelido : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </>
        )}
      </div>

      {regrasSalvas.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Regras aprendidas ({regrasSalvas.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {regrasSalvas.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span>
                  <code>{r.padrao}</code> → {r.plano_conta_codigo}
                  {r.imovel_id !== null && ` · ${imoveis.find((i) => i.id === r.imovel_id)?.apelido ?? "imóvel #" + r.imovel_id}`}
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
              <th>PF × Negócio</th>
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
                        <span
                          className="pill good"
                          style={{ cursor: "pointer" }}
                          title="Clique para editar o rateio"
                          onClick={() => abrirRateio(t)}
                        >
                          rateado · {rateios.length} imóveis
                        </span>
                      ) : (
                        <select value={t.imovel_id ?? ""} onChange={(e) => atribuirImovel(t.id, e.target.value)}>
                          <option value="">— sem imóvel —</option>
                          {imoveis.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.apelido}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const classificacao = classificarPfNegocio(t.plano_conta_codigo ? planoContasPorCodigo.get(t.plano_conta_codigo)?.grupo : undefined);
                        const classe = PILL_CLASSE_PF_NEGOCIO[classificacao];
                        return <span className={`pill ${classe}`.trim()}>{classificacao}</span>;
                      })()}
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
                      <td colSpan={8} style={{ background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 4px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13 }}>Padrão (regex):</span>
                          <input value={padraoRegra} onChange={(e) => setPadraoRegra(e.target.value)} style={{ flex: 1, minWidth: 160, padding: "5px 8px" }} />
                          <span style={{ fontSize: 13 }}>Imóvel (opcional):</span>
                          <select value={imovelRegra} onChange={(e) => setImovelRegra(e.target.value ? Number(e.target.value) : "")}>
                            <option value="">— não associar imóvel —</option>
                            {imoveis.map((i) => (
                              <option key={i.id} value={i.id}>{i.apelido}</option>
                            ))}
                          </select>
                          <button className="btn primary" onClick={() => confirmarSalvarRegra(t)}>Salvar regra</button>
                          <button className="btn" onClick={() => setRegraAbertaId(null)}>Cancelar</button>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 4px 8px" }}>
                          Se um imóvel for escolhido, a regra passa a atribuí-lo automaticamente em toda transação
                          futura que casar com o padrão — mas nunca sobrescreve um imóvel (ou rateio) já atribuído
                          manualmente. Útil para fornecedores fixos de uma única unidade (ex: CEMIG, CASAN de um
                          imóvel específico).
                        </p>
                      </td>
                    </tr>
                  )}
                  {rateioAbertoId === t.id && (
                    <tr>
                      <td colSpan={8} style={{ background: "var(--surface-2)" }}>
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
                <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
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
