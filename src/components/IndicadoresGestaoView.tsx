import { useMemo, useState } from "react";
import { Gauge, Info } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "../ui/useToast";
import { consultar } from "../db/connection";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { formatarMoeda } from "../domain/formatarMoeda";
import {
  gerarPainelIndicadoresGestao,
  type PainelIndicadoresGestao,
} from "../domain/patrimonio/indicadoresGestao";
import { KpiTile } from "./KpiTile";

function formatarPercentual(valor: number | null, casasDecimais = 1): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(casasDecimais)}%`;
}

function formatarIndice(valor: number | null, casasDecimais = 2): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return valor.toFixed(casasDecimais);
}

/** Legenda de fórmula/fonte sempre visível (não escondida atrás de hover — um tooltip
 * só em `title` não é acessível por toque num celular, e o pedido exige a legenda
 * "visível" junto de cada indicador) logo abaixo do grupo de KpiTiles a que se refere.
 * O ícone é só reforço visual de "isto é uma explicação", com o mesmo texto acessível
 * também via `title` para quem passar o mouse. */
function LegendaFormula({ formula, fonte }: { formula: string; fonte: string }) {
  return (
    <p
      title={`Fórmula: ${formula}\n\nFonte dos dados: ${fonte}`}
      style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "-10px 0 16px", lineHeight: 1.5 }}
    >
      <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      <strong>Fórmula:</strong> {formula}
      <br />
      <strong>Fonte:</strong> {fonte}
    </p>
  );
}

export function IndicadoresGestaoView() {
  const { db, versao } = useDb();
  const { avisar } = useToast();

  const entidade = useMemo(() => {
    void versao;
    return db ? obterEntidadeAtiva(db) : null;
  }, [db, versao]);

  const periodosDisp = useMemo(() => {
    void versao;
    if (!db || !entidade) return [];
    return consultar<{ id: number; ano: number; mes: number }>(
      db,
      "SELECT id, ano, mes FROM periodos_contabeis WHERE entidade_id = ? ORDER BY ano DESC, mes DESC",
      [entidade.id],
    ).map((p) => ({ id: p.id, label: `${p.ano}/${String(p.mes).padStart(2, "0")}` }));
  }, [db, versao, entidade]);

  const [periodoSelecionadoId, setPeriodoSelecionadoId] = useState<number | null>(null);
  const periodoAtualId = periodoSelecionadoId ?? periodosDisp[0]?.id ?? null;

  const [erro, setErro] = useState<string | null>(null);

  const painel: PainelIndicadoresGestao | null = useMemo(() => {
    if (!db || !entidade || periodoAtualId === null) return null;
    try {
      setErro(null);
      return gerarPainelIndicadoresGestao(db, entidade.id, periodoAtualId);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro ao calcular indicadores de gestão.";
      setErro(mensagem);
      avisar("critical", mensagem);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, entidade, periodoAtualId]);

  const margemDoPeriodo = useMemo(() => {
    if (!painel) return null;
    return painel.margem_liquida.periodos.find((p) => p.periodo_id === periodoAtualId) ?? null;
  }, [painel, periodoAtualId]);

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  if (!entidade) {
    return (
      <div className="aviso-caixa">
        Nenhuma entidade legal cadastrada ainda — cadastre a entidade titular da contabilidade antes de ver os
        indicadores de gestão (eles leem o mesmo razão oficial das outras telas).
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">
        <Gauge size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Indicadores de gestão financeira
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20 }}>
        <strong>Painel de gestão financeira consolidada</strong> — usa os mesmos dados do razão contábil oficial, mas
        apresentado de forma gerencial. Não substitui nem altera o Balanço/DRE oficiais.
      </div>

      {erro && (
        <div className="aviso-caixa" style={{ marginBottom: 16, borderColor: "var(--critical, #b91c1c)" }}>
          {erro}
        </div>
      )}

      {periodosDisp.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>
          Nenhum período contábil registrado ainda para esta entidade — os indicadores abaixo dependem do razão
          contábil oficial (ledger_entries).
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Período de referência (liquidez / endividamento / margem)
            </label>
            <select
              className="btn"
              value={periodoAtualId ?? ""}
              onChange={(e) => setPeriodoSelecionadoId(Number(e.target.value))}
            >
              {periodosDisp.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {painel && (
            <>
              {/* Liquidez corrente */}
              <div className="kpi-grid" style={{ marginBottom: 4 }}>
                <KpiTile
                  label="Liquidez corrente"
                  value={formatarIndice(painel.liquidez_corrente.indice)}
                  variant={
                    painel.liquidez_corrente.indice !== null
                      ? painel.liquidez_corrente.indice >= 1
                        ? "good"
                        : "critical"
                      : undefined
                  }
                />
                <KpiTile
                  label="Ativo circulante financeiro"
                  value={formatarMoeda(painel.liquidez_corrente.ativo_circulante_financeiro)}
                />
                <KpiTile
                  label="Contas a pagar em aberto"
                  value={formatarMoeda(painel.liquidez_corrente.contas_a_pagar_em_aberto)}
                />
                <KpiTile
                  label="Parcela financiamento (12m)"
                  value={formatarMoeda(painel.liquidez_corrente.parcela_financiamento_proximos_12_meses)}
                />
              </div>
              <LegendaFormula formula={painel.liquidez_corrente.formula} fonte={painel.liquidez_corrente.fonte_dados} />
              {painel.liquidez_corrente.motivo_nulo && (
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-12px 0 16px" }}>
                  Índice indefinido: {painel.liquidez_corrente.motivo_nulo}
                </p>
              )}

              {/* Endividamento + margem + consumo */}
              <div className="kpi-grid" style={{ marginBottom: 4 }}>
                <KpiTile
                  label="Índice de endividamento"
                  value={formatarIndice(painel.indice_endividamento.indice)}
                  variant={
                    painel.indice_endividamento.indice !== null
                      ? painel.indice_endividamento.indice <= 0.6
                        ? "good"
                        : "critical"
                      : undefined
                  }
                />
                <KpiTile
                  label="Margem líquida (período)"
                  value={margemDoPeriodo ? formatarPercentual(margemDoPeriodo.margem_percentual) : "—"}
                  variant={
                    margemDoPeriodo?.margem_percentual !== null && margemDoPeriodo?.margem_percentual !== undefined
                      ? margemDoPeriodo.margem_percentual >= 0
                        ? "good"
                        : "critical"
                      : undefined
                  }
                />
                <KpiTile
                  label="Consumo médio mensal de caixa"
                  value={formatarMoeda(painel.consumo_medio_mensal_caixa.media_mensal ?? 0)}
                />
              </div>
              <LegendaFormula
                formula={painel.indice_endividamento.formula}
                fonte={painel.indice_endividamento.fonte_dados}
              />

              {/* Inadimplência + ocupação (não dependem do período selecionado acima) */}
              <div className="kpi-grid" style={{ marginBottom: 4 }}>
                <KpiTile
                  label="Inadimplência consolidada"
                  value={formatarPercentual(painel.inadimplencia_consolidada.taxa_percentual)}
                  variant={
                    painel.inadimplencia_consolidada.taxa_percentual !== null
                      ? painel.inadimplencia_consolidada.taxa_percentual <= 5
                        ? "good"
                        : "critical"
                      : undefined
                  }
                />
                <KpiTile
                  label="Valor em atraso"
                  value={formatarMoeda(painel.inadimplencia_consolidada.valor_em_atraso)}
                />
                <KpiTile
                  label="Taxa de ocupação do portfólio"
                  value={formatarPercentual(painel.ocupacao_portfolio.taxa_percentual)}
                  variant={
                    painel.ocupacao_portfolio.taxa_percentual !== null
                      ? painel.ocupacao_portfolio.taxa_percentual >= 80
                        ? "good"
                        : "critical"
                      : undefined
                  }
                />
                <KpiTile
                  label="Imóveis ocupados / aptos"
                  value={`${painel.ocupacao_portfolio.imoveis_ocupados} / ${painel.ocupacao_portfolio.imoveis_aptos}`}
                />
              </div>
              <LegendaFormula
                formula={painel.inadimplencia_consolidada.formula}
                fonte={painel.inadimplencia_consolidada.fonte_dados}
              />
              <LegendaFormula formula={painel.ocupacao_portfolio.formula} fonte={painel.ocupacao_portfolio.fonte_dados} />
              {painel.inadimplencia_consolidada.motivo_nulo && (
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-12px 0 16px" }}>
                  Inadimplência indefinida: {painel.inadimplencia_consolidada.motivo_nulo}
                </p>
              )}
              {painel.ocupacao_portfolio.motivo_nulo && (
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-12px 0 16px" }}>
                  Ocupação indefinida: {painel.ocupacao_portfolio.motivo_nulo}
                </p>
              )}

              {/* Consumo médio: detalhe dos meses considerados */}
              {painel.consumo_medio_mensal_caixa.meses_considerados.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 24 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Saída de caixa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.consumo_medio_mensal_caixa.meses_considerados.map((m) => (
                        <tr key={m.periodo_id}>
                          <td>
                            {m.ano}/{String(m.mes).padStart(2, "0")}
                          </td>
                          <td>{formatarMoeda(m.saida_caixa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
