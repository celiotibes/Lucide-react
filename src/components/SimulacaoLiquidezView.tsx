import { useMemo, useState } from "react";
import { AlertTriangle, Droplets, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { useDb } from "../db/useDb";
import { formatarMoeda } from "../domain/formatarMoeda";
import { priorizarQuitacaoDividas, type ItemPriorizacaoQuitacao } from "../domain/dividas/priorizacaoQuitacao";
import {
  simularCenarioLiquidezFutura,
  type CenarioLiquidez,
  type SimulacaoLiquidezResultado,
} from "../domain/dividas/simulacaoLiquidez";
import { KpiTile } from "./KpiTile";

const MESES_PT_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Mesmo padrão de legenda explicativa de fórmula/fonte de `PriorizacaoQuitacaoView.tsx` /
 * `HistoricoJurosView.tsx` (componente local replicado, mesmo visual). */
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

const ROTULO_CENARIO: Record<CenarioLiquidez, string> = {
  manter: "Manter como está",
  amortizar_parcial: "Amortizar parcialmente uma dívida",
  quitar_divida: "Quitar integralmente uma dívida",
};

export function SimulacaoLiquidezView() {
  const { db, versao } = useDb();

  const [meses, setMeses] = useState(12);
  const [cenario, setCenario] = useState<CenarioLiquidez>("quitar_divida");
  const [dividaChave, setDividaChave] = useState<string | null>(null);
  const [valorAmortizacaoTexto, setValorAmortizacaoTexto] = useState("");

  const dividasDisponiveis = useMemo<ItemPriorizacaoQuitacao[]>(() => {
    if (!db) return [];
    try {
      return priorizarQuitacaoDividas(db);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao]);

  const dividaSelecionada = useMemo(
    () => dividasDisponiveis.find((d) => `${d.dividaTipo}:${d.dividaId}` === dividaChave) ?? null,
    [dividasDisponiveis, dividaChave],
  );

  const precisaDeDivida = cenario !== "manter";
  const valorAmortizacao = Number(valorAmortizacaoTexto.replace(",", "."));

  const { resultado, erro } = useMemo<{ resultado: SimulacaoLiquidezResultado | null; erro: string | null }>(() => {
    if (!db) return { resultado: null, erro: null };
    if (precisaDeDivida && !dividaSelecionada) return { resultado: null, erro: null };
    if (cenario === "amortizar_parcial" && !(valorAmortizacao > 0)) return { resultado: null, erro: null };

    try {
      const r = simularCenarioLiquidezFutura(db, {
        meses,
        cenario,
        dividaTipo: dividaSelecionada?.dividaTipo,
        dividaId: dividaSelecionada?.dividaId,
        valorAmortizacao: cenario === "amortizar_parcial" ? valorAmortizacao : undefined,
      });
      return { resultado: r, erro: null };
    } catch (e) {
      return { resultado: null, erro: e instanceof Error ? e.message : "Não foi possível simular este cenário." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, meses, cenario, dividaSelecionada, valorAmortizacao, precisaDeDivida]);

  const dadosGrafico = useMemo(() => {
    if (!resultado) return [];
    return resultado.meses.map((m) => ({
      periodo: `${MESES_PT_ABREV[m.mes - 1]}/${String(m.ano).slice(-2)}`,
      "Manter como está": m.liquidezAcumuladaManter,
      [ROTULO_CENARIO[cenario]]: m.liquidezAcumuladaAlternativo,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, cenario]);

  const rotuloAlternativo = ROTULO_CENARIO[cenario];

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Droplets size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Simulação de liquidez futura — amortização e quitação de dívidas
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>SIMULAÇÃO GERENCIAL</strong> — apoia a decisão de alocação de caixa, mas <strong>nunca substitui</strong> nem
          alimenta os relatórios contábeis oficiais (DRE, Balanço Patrimonial, Fluxo de Caixa a custo histórico); nenhum
          lançamento é gravado no razão por esta tela. Receita futura e reajuste de aluguel são sempre{" "}
          <strong>extrapolação estatística de dado real</strong> (histórico de competências recebidas + reajustes já
          aplicados aos contratos, ou IGP-M oficial já cadastrado) — <strong>nunca</strong> um número de mercado
          inventado por IA.
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Parâmetros do cenário</h3>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Horizonte (meses)
            <input
              type="number"
              className="btn"
              style={{ width: 110, marginTop: 4, cursor: "text" }}
              min={1}
              max={60}
              value={meses}
              onChange={(e) => setMeses(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Cenário alternativo
            <select
              className="btn"
              style={{ width: 260, marginTop: 4 }}
              value={cenario}
              onChange={(e) => setCenario(e.target.value as CenarioLiquidez)}
            >
              {Object.entries(ROTULO_CENARIO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>

          {precisaDeDivida && (
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Dívida-alvo (ranqueada por priorizacaoQuitacao)
              <select
                className="btn"
                style={{ width: 320, marginTop: 4 }}
                value={dividaChave ?? ""}
                onChange={(e) => setDividaChave(e.target.value || null)}
              >
                <option value="">— selecione uma dívida —</option>
                {dividasDisponiveis.map((d) => (
                  <option key={`${d.dividaTipo}:${d.dividaId}`} value={`${d.dividaTipo}:${d.dividaId}`}>
                    #{d.prioridade} — {d.descricaoDivida} ({formatarMoeda(d.saldoDevedorAtual)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {cenario === "amortizar_parcial" && (
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor a amortizar (R$)
              <input
                type="text"
                inputMode="decimal"
                className="btn"
                style={{ width: 160, marginTop: 4, cursor: "text" }}
                placeholder="ex: 5000"
                value={valorAmortizacaoTexto}
                onChange={(e) => setValorAmortizacaoTexto(e.target.value)}
              />
            </label>
          )}
        </div>
        {precisaDeDivida && dividasDisponiveis.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 12 }}>Nenhuma dívida ativa encontrada no sistema.</p>
        )}
      </div>

      {erro && (
        <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--viz-critical)" }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--viz-critical)" }} />
          <span>{erro}</span>
        </div>
      )}

      {!resultado && !erro && precisaDeDivida && (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Selecione uma dívida-alvo para simular este cenário.</p>
      )}

      {resultado && (
        <>
          {resultado.projecaoBase.amostraPequena && (
            <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--viz-warning)" }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--viz-warning)" }} />
              <span>
                <strong>Amostra pequena:</strong> só {resultado.projecaoBase.mesesComDadosReais} mês(es) de histórico real de
                receita disponível — a projeção abaixo tem baixa confiança estatística.
              </span>
            </div>
          )}

          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <KpiTile label="Receita média histórica mensal" value={formatarMoeda(resultado.projecaoBase.receitaMediaHistoricaMensal)} />
            <KpiTile label="Ocupação média histórica" value={`${resultado.projecaoBase.ocupacaoMediaHistorica.toFixed(1)}%`} />
            <KpiTile
              label="Ganho de liquidez acumulada"
              value={formatarMoeda(resultado.ganhoLiquidezAcumulada)}
              variant={resultado.ganhoLiquidezAcumulada >= 0 ? "good" : "critical"}
            />
            <KpiTile
              label="Ganho de patrimônio líquido futuro"
              value={formatarMoeda(resultado.ganhoPatrimonioLiquidoFuturo)}
              variant={resultado.ganhoPatrimonioLiquidoFuturo >= 0 ? "good" : "critical"}
            />
          </div>

          {resultado.impactoAmortizacao && (
            <div className="card" style={{ marginBottom: 20, background: "var(--surface-2)" }}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Efeito da {cenario === "quitar_divida" ? "quitação" : "amortização"} sobre a dívida-alvo</h4>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Valor efetivamente pago agora</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{formatarMoeda(resultado.impactoAmortizacao.valorAmortizadoEfetivo)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Novo saldo devedor</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{formatarMoeda(resultado.impactoAmortizacao.novoSaldoDevedor)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Economia de juros estimada</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--viz-good)" }}>
                    {formatarMoeda(resultado.impactoAmortizacao.economiaJurosEstimada)}
                  </div>
                </div>
              </div>
              <LegendaFormula formula={resultado.impactoAmortizacao.formula} fonte={resultado.impactoAmortizacao.fonteDados} />
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Liquidez acumulada projetada — "manter" vs. "{rotuloAlternativo}"</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
              Caixa acumulado mês a mês nos próximos {meses} mês(es); a queda no mês 1 do cenário alternativo (quando houver)
              é a saída de caixa única da amortização/quitação.
            </p>
            <div style={{ width: "100%", height: 300, background: "var(--viz-surface)", borderRadius: 6 }}>
              <ResponsiveContainer>
                <LineChart data={dadosGrafico} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11.5, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatarMoeda(v)} />
                  <Tooltip formatter={(valor: number, nome: string) => [formatarMoeda(valor), nome]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="var(--viz-critical)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="Manter como está" stroke="var(--viz-resultado)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey={rotuloAlternativo} stroke="var(--viz-good)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Detalhe mês a mês</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="num">Receita projetada</th>
                    <th className="num">Despesa recorrente</th>
                    <th className="num">Serviço da dívida — manter</th>
                    <th className="num">Serviço da dívida — alternativo</th>
                    <th className="num">Saída de caixa (amortização)</th>
                    <th className="num">Liquidez — manter</th>
                    <th className="num">Liquidez — alternativo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.meses.map((m) => (
                    <tr key={`${m.ano}-${m.mes}`}>
                      <td>
                        {MESES_PT_ABREV[m.mes - 1]}/{m.ano}
                      </td>
                      <td className="num">{formatarMoeda(m.receitaProjetada)}</td>
                      <td className="num">{formatarMoeda(m.despesaRecorrenteProjetada)}</td>
                      <td className="num">{formatarMoeda(m.servicoDividaTotalManter)}</td>
                      <td className="num">{formatarMoeda(m.servicoDividaTotalAlternativo)}</td>
                      <td className="num">{m.saidaCaixaAmortizacao > 0 ? formatarMoeda(m.saidaCaixaAmortizacao) : "—"}</td>
                      <td className="num">
                        <span className={`pill ${m.liquidezManter >= 0 ? "good" : "critical"}`}>{formatarMoeda(m.liquidezManter)}</span>
                      </td>
                      <td className="num">
                        <span className={`pill ${m.liquidezAlternativo >= 0 ? "good" : "critical"}`}>{formatarMoeda(m.liquidezAlternativo)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LegendaFormula formula={resultado.formula} fonte={resultado.fonteDados} />
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Metodologia da base histórica (ocupação, receita e reajuste)</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>{resultado.projecaoBase.metodologia}</p>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
            <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {resultado.avisoGerencial}
          </p>
        </>
      )}
    </div>
  );
}
