import { Fragment, useCallback, useMemo, useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, ChevronUp, CircleCheck, History, Landmark } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "./useToast";
import {
  apurarConciliacao,
  registrarConciliacao,
  obterSaldoExtratoInformado,
  listarConciliacoes,
  obterConciliacao,
  listarContasBancarias,
  resolverReferenciasItem,
  type ApuracaoConciliacao,
  type ConciliacaoItemRegistrado,
  type TipoItemConciliacao,
  type DetalheTransacao,
  type DetalheTriagem,
  type DetalheLancamentoOrfao,
} from "../domain/conciliacao/conciliacao";
import { detectarLacunasEmLotesImportados } from "../domain/conciliacao/deteccaoLacunas";

/** Conciliação bancária: o saldo do extrato real, numa data, contra o que o app
 * reconstituiu (as transações importadas e a parcela do razão contábil que vem desta
 * conta) — e, quando os três não batem, o que explica a diferença item a item.
 *
 * Sem esta tela não havia como afirmar que o razão bate com o banco numa data, nem
 * apontar o que compõe a diferença quando não bate — requisito central de um núcleo
 * contábil. Ver src/domain/conciliacao/conciliacao.ts para a apuração em si. */

const ROTULO_ITEM: Record<TipoItemConciliacao, string> = {
  nao_lancada_no_razao: "Transações sem lançamento no razão",
  triagem_pendente: "Linhas do extrato ainda em triagem",
  classificacao_pendente: "Transações na conta transitória (1.9.99)",
  lancamento_orfao_no_razao: "Lançamentos no razão sem transação de origem",
  residual_nao_identificado: "Diferença não identificada",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function contextoTexto(c: { data: string; valor: number; descricao_original: string } | null): string {
  if (!c) return "nenhuma transação registrada";
  return `${c.data} · ${moeda(c.valor)} · ${c.descricao_original}`;
}

function linhaDetalhe(chave: string | number, esquerda: string, valor: number, extra?: string) {
  return (
    <div
      key={chave}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "5px 2px",
        borderBottom: "1px solid var(--line-soft)",
        fontSize: 13,
      }}
    >
      <span>
        {esquerda}
        {extra && <span className="pill" style={{ marginLeft: 6 }}>{extra}</span>}
      </span>
      <span className="num">{moeda(valor)}</span>
    </div>
  );
}

/** Lista de linhas por trás de um item — recebe as linhas já resolvidas (da apuração ao
 * vivo, ou re-resolvidas de uma conciliação salva) e só formata, sem saber a origem. */
function ListaDetalhe({
  tipo,
  transacoes,
  triagem,
  orfaos,
}: {
  tipo: TipoItemConciliacao;
  transacoes: DetalheTransacao[];
  triagem: DetalheTriagem[];
  orfaos: DetalheLancamentoOrfao[];
}) {
  if (tipo === "residual_nao_identificado") return null;

  if (tipo === "nao_lancada_no_razao" || tipo === "classificacao_pendente") {
    if (transacoes.length === 0) return <p style={{ margin: "6px 2px", color: "var(--ink-soft)", fontSize: 13 }}>Nada a mostrar.</p>;
    return <div>{transacoes.map((t) => linhaDetalhe(t.id, `${t.data} · ${t.descricao_original}`, t.valor))}</div>;
  }

  if (tipo === "triagem_pendente") {
    if (triagem.length === 0) return <p style={{ margin: "6px 2px", color: "var(--ink-soft)", fontSize: 13 }}>Nada a mostrar.</p>;
    return (
      <div>
        {triagem.map((l) =>
          linhaDetalhe(
            l.id,
            `${l.arquivo_nome} · linha ${l.linha_numero} · ${l.data ?? "data ilegível"} · ${l.descricao_original}`,
            l.valor ?? 0,
            l.status === "pendente" ? "pendente" : l.status === "malformada" ? "ilegível" : "possível duplicidade",
          ),
        )}
      </div>
    );
  }

  // lancamento_orfao_no_razao
  if (orfaos.length === 0) return <p style={{ margin: "6px 2px", color: "var(--ink-soft)", fontSize: 13 }}>Nada a mostrar.</p>;
  return (
    <div>
      {orfaos.map((l) =>
        linhaDetalhe(
          l.id,
          `${l.data_lancamento} · ${l.descricao} · ${l.referencia_documento}`,
          l.valor_debito ?? -(l.valor_credito ?? 0),
        ),
      )}
    </div>
  );
}

export function Conciliacao() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [tick, setTick] = useState(0);
  const contas = useMemo(() => (db ? listarContasBancarias(db) : []), [db, versao]);

  const [contaId, setContaId] = useState<number | null>(null);
  const contaAtiva = contaId ?? contas[0]?.id ?? null;
  const contaSelecionada = contas.find((c) => c.id === contaAtiva) ?? null;

  const [dataCorte, setDataCorte] = useState(hojeISO());
  const [saldoExtratoTexto, setSaldoExtratoTexto] = useState("");
  const [realizadoPor, setRealizadoPor] = useState("");
  const [apuracao, setApuracao] = useState<ApuracaoConciliacao | null>(null);
  const [itemAberto, setItemAberto] = useState<TipoItemConciliacao | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [conciliacaoAbertaId, setConciliacaoAbertaId] = useState<number | null>(null);

  const historico = useMemo(
    () => (db && contaAtiva ? listarConciliacoes(db, contaAtiva) : []),
    [db, versao, tick, contaAtiva],
  );

  // Lacunas no extrato importado — reusa a mesma conta selecionada acima. Infere o período
  // a partir dos lotes de importação concluídos da conta (não há um período separado
  // selecionado nesta tela, só a data de corte), ver deteccaoLacunas.ts.
  const lacunasResultado = useMemo(
    () => (db && contaAtiva ? detectarLacunasEmLotesImportados(db, contaAtiva) : null),
    [db, versao, tick, contaAtiva],
  );

  const conciliacaoDetalhe = useMemo(
    () => (db && conciliacaoAbertaId ? obterConciliacao(db, conciliacaoAbertaId) : null),
    [db, conciliacaoAbertaId, versao, tick],
  );

  const [itemHistoricoAberto, setItemHistoricoAberto] = useState<ConciliacaoItemRegistrado | null>(null);
  const detalheHistoricoResolvido = useMemo(() => {
    if (!db || !itemHistoricoAberto) return null;
    return resolverReferenciasItem(db, itemHistoricoAberto.tipo, itemHistoricoAberto.referencias);
  }, [db, itemHistoricoAberto, versao, tick]);

  const carregarSaldoSalvo = useCallback(
    (conta: number, data: string) => {
      if (!db) return;
      const salvo = obterSaldoExtratoInformado(db, conta, data);
      setSaldoExtratoTexto(salvo ? String(salvo.saldo) : "");
    },
    [db],
  );

  const selecionarConta = (id: number) => {
    setContaId(id);
    setApuracao(null);
    setItemAberto(null);
    carregarSaldoSalvo(id, dataCorte);
  };

  const alterarData = (data: string) => {
    setDataCorte(data);
    setApuracao(null);
    setItemAberto(null);
    if (contaAtiva) carregarSaldoSalvo(contaAtiva, data);
  };

  const apurar = useCallback(() => {
    if (!db || !contaAtiva) return;
    const saldo = Number(saldoExtratoTexto.replace(",", "."));
    if (!Number.isFinite(saldo)) {
      avisar("critical", "Informe o saldo do extrato como número (use ponto ou vírgula decimal).");
      return;
    }
    const resultado = apurarConciliacao(db, contaAtiva, dataCorte, saldo);
    setApuracao(resultado);
    setItemAberto(null);
  }, [db, contaAtiva, dataCorte, saldoExtratoTexto, avisar]);

  const registrar = useCallback(async () => {
    if (!db || !apuracao) return;
    setRegistrando(true);
    try {
      const r = registrarConciliacao(db, apuracao, {
        realizada_por: realizadoPor.trim() || undefined,
      });
      await persistir();
      setTick((t) => t + 1);
      avisar(r.sucesso ? (apuracao.fechada_sem_diferenca ? "good" : "warning") : "critical", r.mensagem);
    } finally {
      setRegistrando(false);
    }
  }, [db, apuracao, realizadoPor, persistir, avisar]);

  if (contas.length === 0) {
    return (
      <div>
        <h2 className="section-title"><Landmark size={16} /> Conciliação bancária</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Nenhuma conta bancária cadastrada ainda. Cadastre uma na aba <strong>Cadastros</strong> antes de
            conciliar — a conciliação compara o saldo real do banco com o que o app reconstituiu para essa conta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title"><Landmark size={16} /> Conciliação bancária</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8 }}>
        Compara o saldo do extrato real do banco, numa data, com as transações que o app reconstituiu e com a
        parcela do razão contábil atribuível a esta conta — e mostra, item a item, o que explica a diferença
        quando os três não batem.
      </p>

      <div className="card">
        <div className="form-grid">
          <label>
            Conta bancária
            <select value={contaAtiva ?? ""} onChange={(e) => selecionarConta(Number(e.target.value))}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · ag {c.agencia ?? "—"} · cc {c.numero}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data de corte
            <input type="date" value={dataCorte} onChange={(e) => alterarData(e.target.value)} />
          </label>
          <label>
            Saldo do extrato nesta data
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={saldoExtratoTexto}
              onChange={(e) => setSaldoExtratoTexto(e.target.value)}
            />
          </label>
          <label>
            Realizado por (opcional)
            <input
              type="text"
              placeholder="operador-local"
              value={realizadoPor}
              onChange={(e) => setRealizadoPor(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar-actions">
          <button className="btn primary" onClick={apurar} disabled={!contaAtiva || saldoExtratoTexto.trim() === ""}>
            <Calculator size={14} /> Apurar conciliação
          </button>
        </div>
      </div>

      {apuracao && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="kpi-grid">
            <div className="kpi-tile">
              <div className="label">Saldo do extrato</div>
              <div className="value">{moeda(apuracao.saldo_extrato)}</div>
            </div>
            <div className="kpi-tile">
              <div className="label">Saldo das transações</div>
              <div className="value">{moeda(apuracao.saldo_transacoes)}</div>
            </div>
            <div className="kpi-tile">
              <div className="label">Saldo no razão (esta conta)</div>
              <div className="value">{moeda(apuracao.saldo_razao)}</div>
            </div>
            <div className="kpi-tile">
              <div className="label">Diferença total</div>
              <div className={`value ${apuracao.fechada_sem_diferenca ? "good" : "critical"}`}>
                {moeda(apuracao.diferenca_extrato_razao)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span
              className={`pill ${
                apuracao.fechada_sem_diferenca
                  ? "good"
                  : apuracao.itens.some((i) => i.tipo === "residual_nao_identificado")
                    ? "critical"
                    : "warning"
              }`}
            >
              {apuracao.fechada_sem_diferenca ? "fecha sem diferença" : "com diferença"}
            </span>
            {!apuracao.fechada_sem_diferenca && (
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                extrato × transações: {moeda(apuracao.diferenca_extrato_transacoes)} · transações × razão:{" "}
                {moeda(apuracao.diferenca_transacoes_razao)}
              </span>
            )}
          </div>

          {apuracao.itens.length > 0 && (
            <>
              <h3 className="section-title" style={{ fontSize: 12 }}>O que explica a diferença</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }} />
                      <th>Item</th>
                      <th className="num">Qtde</th>
                      <th className="num">Valor</th>
                      <th>Afeta a diferença?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apuracao.itens.map((item) => {
                      const aberto = itemAberto === item.tipo;
                      const temDetalhe = item.tipo !== "residual_nao_identificado";
                      return (
                        <Fragment key={item.tipo}>
                          <tr>
                            <td>
                              {temDetalhe && (
                                <button
                                  className="btn"
                                  style={{ padding: "2px 6px" }}
                                  onClick={() => setItemAberto(aberto ? null : item.tipo)}
                                  aria-label={`Ver lista de ${ROTULO_ITEM[item.tipo]}`}
                                >
                                  {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              )}
                            </td>
                            <td>
                              <div>{ROTULO_ITEM[item.tipo]}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "normal" }}>{item.descricao}</div>
                            </td>
                            <td className="num">{item.quantidade || "—"}</td>
                            <td className="num">{moeda(item.valor)}</td>
                            <td>
                              <span className={`pill ${item.afeta_diferenca ? "warning" : ""}`}>
                                {item.afeta_diferenca ? "sim" : "não (informativo)"}
                              </span>
                            </td>
                          </tr>
                          {aberto && (
                            <tr>
                              <td colSpan={5} style={{ background: "var(--surface-2)" }}>
                                <ListaDetalhe
                                  tipo={item.tipo}
                                  transacoes={
                                    item.tipo === "nao_lancada_no_razao"
                                      ? apuracao.detalhes.nao_lancada_no_razao
                                      : item.tipo === "classificacao_pendente"
                                        ? apuracao.detalhes.classificacao_pendente
                                        : []
                                  }
                                  triagem={apuracao.detalhes.triagem_pendente}
                                  orfaos={apuracao.detalhes.lancamento_orfao_no_razao}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="toolbar-actions" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={registrar} disabled={registrando}>
              {registrando ? "Registrando…" : "Registrar conciliação"}
            </button>
          </div>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 26 }}>
        <AlertTriangle size={16} /> Lacunas no extrato{contaSelecionada ? ` — ${contaSelecionada.banco} cc ${contaSelecionada.numero}` : ""}
      </h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8, maxWidth: "72ch" }}>
        Trechos de dias corridos sem nenhuma transação importada para esta conta, dentro do período coberto pelos
        lotes de importação já concluídos. A conciliação acima pode fechar sem diferença mesmo com um trecho do
        extrato nunca importado — esta seção existe para esse achado não passar despercebido.
      </p>
      {!contaAtiva ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            Selecione uma conta bancária acima para verificar lacunas no extrato importado.
          </p>
        </div>
      ) : !lacunasResultado || lacunasResultado.data_inicio === null || lacunasResultado.data_fim === null ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            Nenhum lote de importação concluído para esta conta ainda — não há período coberto para verificar
            lacunas.
          </p>
        </div>
      ) : lacunasResultado.lacunas.length === 0 ? (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <CircleCheck size={18} color="var(--viz-good)" />
          <span>
            Nenhuma lacuna suspeita encontrada no período coberto ({lacunasResultado.data_inicio} a{" "}
            {lacunasResultado.data_fim}, {lacunasResultado.lotes_considerados} lote(s) concluído(s) considerado(s)).
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
            Período coberto: {lacunasResultado.data_inicio} a {lacunasResultado.data_fim} ·{" "}
            {lacunasResultado.lotes_considerados} lote(s) concluído(s) considerado(s).
          </p>
          {lacunasResultado.lacunas.map((lacuna) => (
            <div
              key={`${lacuna.data_inicio_lacuna}_${lacuna.data_fim_lacuna}`}
              className="card"
              style={{ borderLeft: `4px solid ${lacuna.severidade === "alta" ? "var(--viz-critical)" : "var(--viz-warning)"}` }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>
                  {lacuna.data_inicio_lacuna} a {lacuna.data_fim_lacuna}
                </strong>
                <span className={`pill ${lacuna.severidade === "alta" ? "critical" : "warning"}`}>
                  {lacuna.dias_sem_movimento} dias sem movimento
                  {lacuna.severidade === "alta" ? " · saldo informado no período" : ""}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", flexDirection: "column", gap: 2 }}>
                <span>Última transação antes: {contextoTexto(lacuna.contexto.antes)}</span>
                <span>Primeira transação depois: {contextoTexto(lacuna.contexto.depois)}</span>
              </div>
              {lacuna.saldos_informados_no_periodo.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  <span style={{ color: "var(--ink-soft)" }}>Saldo do extrato informado dentro da lacuna: </span>
                  {lacuna.saldos_informados_no_periodo.map((s, i) => (
                    <span key={s.data} className="num">
                      {i > 0 ? " · " : ""}
                      {s.data} = {moeda(s.saldo)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 26 }}>
        <History size={16} /> Conciliações já registradas{contaSelecionada ? ` — ${contaSelecionada.banco} cc ${contaSelecionada.numero}` : ""}
      </h2>
      {historico.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Nenhuma conciliação registrada ainda para esta conta.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data de corte</th>
                <th className="num">Extrato</th>
                <th className="num">Transações</th>
                <th className="num">Razão</th>
                <th className="num">Diferença</th>
                <th>Situação</th>
                <th>Realizado por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {historico.map((c) => {
                const abertaAgora = conciliacaoAbertaId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>{c.data_corte}</td>
                      <td className="num">{moeda(c.saldo_extrato)}</td>
                      <td className="num">{moeda(c.saldo_transacoes)}</td>
                      <td className="num">{moeda(c.saldo_razao)}</td>
                      <td className="num">{moeda(c.diferenca_extrato_razao)}</td>
                      <td>
                        <span className={`pill ${c.fechada_sem_diferenca ? "good" : "warning"}`}>
                          {c.fechada_sem_diferenca ? "sem diferença" : "com diferença"}
                        </span>
                      </td>
                      <td>{c.realizada_por ?? "—"}</td>
                      <td>
                        <button
                          className="btn"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() => {
                            setConciliacaoAbertaId(abertaAgora ? null : c.id);
                            setItemHistoricoAberto(null);
                          }}
                        >
                          {abertaAgora ? "fechar" : "ver itens"}
                        </button>
                      </td>
                    </tr>
                    {abertaAgora && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--surface-2)" }}>
                          {!conciliacaoDetalhe || conciliacaoDetalhe.itens.length === 0 ? (
                            <p style={{ margin: "6px 2px", color: "var(--ink-soft)", fontSize: 13 }}>
                              Nenhum item registrado — fechou sem diferença.
                            </p>
                          ) : (
                            conciliacaoDetalhe.itens.map((item) => {
                              const itemAbertoAqui = itemHistoricoAberto?.id === item.id;
                              return (
                                <div key={item.id} style={{ padding: "6px 2px", borderBottom: "1px solid var(--line-soft)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    <div>
                                      <strong>{ROTULO_ITEM[item.tipo]}</strong>
                                      <span style={{ fontSize: 12, color: "var(--ink-soft)", marginLeft: 8 }}>{item.descricao}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span className="num">{moeda(item.valor)}</span>
                                      {item.referencias.length > 0 && (
                                        <button
                                          className="btn"
                                          style={{ padding: "2px 6px" }}
                                          onClick={() => setItemHistoricoAberto(itemAbertoAqui ? null : item)}
                                        >
                                          {itemAbertoAqui ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {itemAbertoAqui && detalheHistoricoResolvido && (
                                    <div style={{ marginTop: 6 }}>
                                      <ListaDetalhe
                                        tipo={item.tipo}
                                        transacoes={item.tipo === "nao_lancada_no_razao" || item.tipo === "classificacao_pendente" ? (detalheHistoricoResolvido as DetalheTransacao[]) : []}
                                        triagem={item.tipo === "triagem_pendente" ? (detalheHistoricoResolvido as DetalheTriagem[]) : []}
                                        orfaos={item.tipo === "lancamento_orfao_no_razao" ? (detalheHistoricoResolvido as DetalheLancamentoOrfao[]) : []}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
