import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info, TrendingDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { formatarMoeda } from "../domain/formatarMoeda";
import {
  priorizarQuitacaoDividas,
  simularImpactoAmortizacaoParcial,
  type ItemPriorizacaoQuitacao,
  type ResultadoSimulacaoAmortizacao,
} from "../domain/dividas/priorizacaoQuitacao";

const NAO_CLASSIFICADO = "não classificado";
const TODOS_OS_DESTINOS = "__todos__";

function ChipsDestino({ quebra }: { quebra: ItemPriorizacaoQuitacao["quebraPorDestino"] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {quebra.map((fatia) => (
        <span
          key={fatia.destino}
          className={`pill ${fatia.destino === NAO_CLASSIFICADO ? "critical" : ""}`}
          title={fatia.destino === NAO_CLASSIFICADO ? "Sem rateio de destino cadastrado — classifique esta dívida." : undefined}
        >
          {fatia.destino}: {formatarMoeda(fatia.valor)}
        </span>
      ))}
    </div>
  );
}

/** Mesmo padrão de legenda explicativa de fórmula/fonte de `HistoricoJurosView.tsx` /
 * `IndicadoresGestaoView.tsx` (componente local replicado, mesmo visual). */
function LegendaFormula({ formula, fonte }: { formula: string; fonte: string }) {
  return (
    <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "10px 0 0", lineHeight: 1.5 }}>
      <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      <strong>Fórmula:</strong> {formula}
      <br />
      <strong>Fonte:</strong> {fonte}
    </p>
  );
}

function SimuladorAmortizacao({ item, db }: { item: ItemPriorizacaoQuitacao; db: NonNullable<ReturnType<typeof useDb>["db"]> }) {
  const [valorTexto, setValorTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoSimulacaoAmortizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function simular() {
    setErro(null);
    setResultado(null);
    const valor = Number(valorTexto.replace(",", "."));
    if (!(valor > 0)) {
      setErro("Informe um valor de amortização maior que zero.");
      return;
    }
    try {
      const r = simularImpactoAmortizacaoParcial(db, item.dividaTipo, item.dividaId, valor);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível simular esta amortização.");
    }
  }

  return (
    <div className="card" style={{ marginTop: 12, background: "var(--surface-2)" }}>
      <h4 style={{ fontSize: 14, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <Calculator size={15} />
        Simulador de amortização parcial — {item.descricaoDivida}
      </h4>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
        Saldo devedor atual: <strong>{formatarMoeda(item.saldoDevedorAtual)}</strong>. Digite um valor hipotético de
        amortização para ver a economia de juros estimada — nada é lançado, é só simulação.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Valor a amortizar (R$)
          <input
            type="text"
            inputMode="decimal"
            className="btn"
            style={{ width: 160, marginTop: 4, cursor: "text" }}
            placeholder="ex: 5000"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
        </label>
        <button className="btn primary" onClick={simular}>
          Simular economia
        </button>
      </div>

      {erro && (
        <p style={{ marginTop: 10, color: "var(--viz-critical)", fontSize: 12.5, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {erro}
        </p>
      )}

      {resultado && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Economia de juros estimada</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--viz-good)" }}>
                {formatarMoeda(resultado.economiaJurosEstimada)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Novo saldo devedor</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{formatarMoeda(resultado.novoSaldoDevedor)}</div>
            </div>
            {resultado.valorAmortizadoEfetivo !== resultado.valorAmortizadoSolicitado && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Valor efetivamente amortizado</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{formatarMoeda(resultado.valorAmortizadoEfetivo)}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>limitado ao saldo devedor — quita a dívida</div>
              </div>
            )}
          </div>
          <LegendaFormula formula={resultado.formula} fonte={resultado.fonteDados} />
        </div>
      )}
    </div>
  );
}

export function PriorizacaoQuitacaoView() {
  const { db, versao } = useDb();
  const [dividaSelecionada, setDividaSelecionada] = useState<string | null>(null);
  const [filtroDestino, setFiltroDestino] = useState<string>(TODOS_OS_DESTINOS);

  const ranking = useMemo<ItemPriorizacaoQuitacao[]>(() => {
    if (!db) return [];
    try {
      return priorizarQuitacaoDividas(db);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao]);

  const destinosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const item of ranking) {
      for (const fatia of item.quebraPorDestino) set.add(fatia.destino);
    }
    // "não classificado" sempre por último, os demais em ordem alfabética.
    return [...set].sort((a, b) => {
      if (a === NAO_CLASSIFICADO) return 1;
      if (b === NAO_CLASSIFICADO) return -1;
      return a.localeCompare(b, "pt-BR");
    });
  }, [ranking]);

  const rankingFiltrado = useMemo(() => {
    if (filtroDestino === TODOS_OS_DESTINOS) return ranking;
    return ranking.filter((item) => item.quebraPorDestino.some((fatia) => fatia.destino === filtroDestino && fatia.valor > 0));
  }, [ranking, filtroDestino]);

  const itemSelecionado = useMemo(
    () => rankingFiltrado.find((item) => `${item.dividaTipo}:${item.dividaId}` === dividaSelecionada) ?? null,
    [rankingFiltrado, dividaSelecionada],
  );

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <TrendingDown size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Priorização de quitação de dívidas — método avalanche
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Priorização baseada em <strong>taxa de juros efetiva</strong> (método avalanche) e{" "}
          <strong>dado histórico real</strong> — a decisão final de quitar ou não deve considerar também sua{" "}
          <strong>reserva de liquidez disponível</strong>.
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por destino
          <select
            className="btn"
            style={{ width: 220, marginTop: 4, display: "block" }}
            value={filtroDestino}
            onChange={(e) => setFiltroDestino(e.target.value)}
          >
            <option value={TODOS_OS_DESTINOS}>— todos os destinos —</option>
            {destinosDisponiveis.map((destino) => (
              <option key={destino} value={destino}>
                {destino}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ranking de prioridade de quitação</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          {rankingFiltrado.length} dívida(s) ativa(s) — maior taxa de juros efetiva ao ano primeiro. Clique numa linha
          para simular uma amortização parcial.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Dívida</th>
                <th className="num">Taxa anual efetiva</th>
                <th className="num">Saldo devedor</th>
                <th className="num">Custo anual estimado de juros</th>
                <th className="num">Juros pagos (12m)</th>
                <th>Destino</th>
              </tr>
            </thead>
            <tbody>
              {rankingFiltrado.map((item) => {
                const chave = `${item.dividaTipo}:${item.dividaId}`;
                const selecionada = chave === dividaSelecionada;
                return (
                  <tr
                    key={chave}
                    onClick={() => setDividaSelecionada(selecionada ? null : chave)}
                    style={{ cursor: "pointer", background: selecionada ? "var(--surface-2)" : undefined }}
                    title="Clique para simular uma amortização parcial desta dívida"
                  >
                    <td>{item.prioridade}</td>
                    <td>
                      {item.descricaoDivida}
                      <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{item.justificativa}</div>
                    </td>
                    <td className="num">
                      {item.taxaDesconhecida ? (
                        <span className="pill warning" title={item.motivoTaxaDesconhecida ?? undefined}>
                          Taxa desconhecida
                        </span>
                      ) : (
                        `${item.taxaJurosAnualEfetivaPercentual!.toFixed(2)}% a.a.`
                      )}
                    </td>
                    <td className="num">{formatarMoeda(item.saldoDevedorAtual)}</td>
                    <td className="num">
                      {item.custoAnualEstimadoJuros !== null ? formatarMoeda(item.custoAnualEstimadoJuros) : "—"}
                    </td>
                    <td className="num">{formatarMoeda(item.jurosPagosUltimos12Meses)}</td>
                    <td>
                      <ChipsDestino quebra={item.quebraPorDestino} />
                    </td>
                  </tr>
                );
              })}
              {rankingFiltrado.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhuma dívida ativa encontrada {filtroDestino !== TODOS_OS_DESTINOS ? "para este destino" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LegendaFormula
          formula="Ordenado por taxaJurosAnualEfetivaPercentual (maior primeiro, avalanche); taxa desconhecida sempre por último."
          fonte="domain/dividas/priorizacaoQuitacao.ts::priorizarQuitacaoDividas"
        />
      </div>

      {itemSelecionado && <SimuladorAmortizacao item={itemSelecionado} db={db} />}
    </div>
  );
}
