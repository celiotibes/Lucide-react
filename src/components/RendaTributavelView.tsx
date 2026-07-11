import { useMemo, useState } from "react";
import { useDb } from "../db/DbContext";
import { consultar } from "../db/connection";
import { gerarRendaTributavel, totalizarRendaTributavel } from "../domain/reports/rendaTributavel";
import { calcularCapacidadeContributiva, calcularCapacidadeContributivaMensal } from "../domain/reports/capacidadeContributiva";
import { calcularAnaliseVertical, calcularAnaliseHorizontal } from "../domain/reports/analiseVerticalHorizontal";
import { gerarDss } from "../domain/reports/dss";
import { sugerirAjusteRateio, aplicarAjusteRateio } from "../domain/rateio/ajusteAnual";
import type { ContratoLocacao, Imovel } from "../domain/types";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RendaTributavelView() {
  const { db, versao, persistir } = useDb();
  const hoje = hojeIso();
  const inicio12m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10);

  const linhas = useMemo(() => (db ? gerarRendaTributavel(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const totais = useMemo(() => totalizarRendaTributavel(linhas), [linhas]);
  const capacidade = useMemo(() => (db ? calcularCapacidadeContributiva(db, inicio12m, hoje) : null), [db, versao, inicio12m, hoje]);
  const capacidadeMensal = useMemo(() => (db ? calcularCapacidadeContributivaMensal(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const analiseVertical = useMemo(() => (db ? calcularAnaliseVertical(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const analiseHorizontal = useMemo(() => (db ? calcularAnaliseHorizontal(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);

  const contratosComRateio = useMemo<ContratoLocacao[]>(
    () => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE percentual_aluguel_efetivo < 100 ORDER BY id") : []),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);
  const [contratoDssId, setContratoDssId] = useState<number | null>(null);
  const contratoDssAtivo = contratoDssId ?? contratosComRateio[0]?.id ?? null;
  const contratoAtivo = contratosComRateio.find((c) => c.id === contratoDssAtivo) ?? null;
  const dss = useMemo(
    () => (db && contratoDssAtivo ? gerarDss(db, contratoDssAtivo, inicio12m, hoje) : null),
    [db, contratoDssAtivo, inicio12m, hoje],
  );
  const sugestaoRateio = useMemo(
    () => (db && contratoAtivo ? sugerirAjusteRateio(db, contratoAtivo, inicio12m, hoje) : null),
    [db, versao, contratoAtivo, inicio12m, hoje],
  );

  const aplicarSugestaoRateio = async () => {
    if (!db || !contratoAtivo || !sugestaoRateio) return;
    aplicarAjusteRateio(db, contratoAtivo.id, sugestaoRateio.percentualAluguelEfetivoSugerido);
    await persistir();
  };

  const percentualTributavel = totais.totalRecebido > 0 ? (totais.rendaTributavel / totais.totalRecebido) * 100 : 0;

  return (
    <div>
      <h2 className="section-title">Capacidade contributiva real</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        O número central para a Vara de Família: receita bruta alta não é capacidade contributiva alta. O total
        recebido bruto passa por duas reduções antes de virar dinheiro disponível — o reembolso de rateio (não é
        renda, é recomposição de custo repassado ao locatário) e a despesa operacional da atividade (condomínio,
        manutenção, prestadores, tarifas — já excluindo qualquer imóvel de uso pessoal).
      </p>

      {capacidade && (
        <div className="kpi-grid" style={{ marginBottom: 10 }}>
          <div className="kpi-tile">
            <div className="label">Total recebido bruto (12m)</div>
            <div className="value">{formatarMoeda(capacidade.totalRecebidoBruto)}</div>
          </div>
          <div className="kpi-tile">
            <div className="label">(−) Reembolso de rateio</div>
            <div className="value">{formatarMoeda(capacidade.reembolsoNaoTributavel)}</div>
          </div>
          <div className="kpi-tile">
            <div className="label">(−) Despesa operacional</div>
            <div className="value">{formatarMoeda(capacidade.despesaOperacionalTotal)}</div>
          </div>
          <div className="kpi-tile">
            <div className="label">= Resultado líquido real</div>
            <div className={`value ${capacidade.resultadoLiquidoReal >= 0 ? "good" : "critical"}`}>
              {formatarMoeda(capacidade.resultadoLiquidoReal)}
            </div>
          </div>
        </div>
      )}
      {capacidade && capacidade.percentualDisponivelSobreRecebido !== null && (
        <p style={{ fontSize: 13, marginBottom: 24 }}>
          Do total recebido bruto, apenas <strong>{capacidade.percentualDisponivelSobreRecebido.toFixed(1)}%</strong>{" "}
          é resultado líquido real disponível — o restante é reembolso de custo repassado ou despesa operacional da
          atividade.
        </p>
      )}

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr><th>Mês</th><th className="num">Recebido bruto</th><th className="num">Despesa operacional</th><th className="num">Resultado real</th></tr>
          </thead>
          <tbody>
            {capacidadeMensal.map((l) => (
              <tr key={l.mes}>
                <td>{l.mes}</td>
                <td className="num">{formatarMoeda(l.totalRecebidoBruto)}</td>
                <td className="num">{formatarMoeda(l.despesaOperacionalTotal)}</td>
                <td className="num">{formatarMoeda(l.resultadoLiquidoReal)}</td>
              </tr>
            ))}
            {capacidadeMensal.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum dado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Análise vertical e horizontal do DRE</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 16 }}>
        Vertical: cada linha como % da receita total do período — mostra a proporção do custo, não só o valor
        absoluto. Horizontal: comparação com os 12 meses imediatamente anteriores — evidencia se despesa de
        manutenção/obra subiu na mesma proporção da receita (capacidade contributiva estável) ou ficou para trás.
      </p>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="num">Valor (12m)</th>
              <th className="num">% da receita (vertical)</th>
              <th className="num">Valor (12m anteriores)</th>
              <th className="num">Variação (horizontal)</th>
            </tr>
          </thead>
          <tbody>
            {analiseHorizontal.map((h) => {
              const vertical = analiseVertical.find((v) => v.codigo === h.codigo);
              return (
                <tr key={h.codigo}>
                  <td>{h.codigo} · {h.descricao}</td>
                  <td className="num">{formatarMoeda(Math.abs(h.totalAtual))}</td>
                  <td className="num">{vertical?.percentualSobreReceita !== null && vertical?.percentualSobreReceita !== undefined ? `${vertical.percentualSobreReceita.toFixed(1)}%` : "—"}</td>
                  <td className="num" style={{ color: "var(--ink-soft)" }}>{formatarMoeda(Math.abs(h.totalAnterior))}</td>
                  <td className="num">
                    {h.variacaoPercentual !== null ? (
                      <span className={`pill ${h.variacaoPercentual > 20 ? "warning" : h.variacaoPercentual < -20 ? "critical" : "good"}`}>
                        {h.variacaoPercentual > 0 ? "+" : ""}{h.variacaoPercentual.toFixed(1)}%
                      </span>
                    ) : (
                      "novo"
                    )}
                  </td>
                </tr>
              );
            })}
            {analiseHorizontal.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum dado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Renda tributável (Carnê-Leão)</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Separa, de cada recebimento de aluguel, o que é Aluguel Efetivo (base do IRPF) do que é reembolso de rateio
        de custeio coletivo (trânsito contábil, não tributável) — a distinção que contratos com "valor único mensal"
        fazem explicitamente.
      </p>

      <div className="kpi-grid">
        <div className="kpi-tile">
          <div className="label">Total recebido (12m)</div>
          <div className="value">{formatarMoeda(totais.totalRecebido)}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">Renda tributável</div>
          <div className="value">{formatarMoeda(totais.rendaTributavel)}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">Reembolso não tributável</div>
          <div className="value">{formatarMoeda(totais.reembolsoNaoTributavel)}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">% do recebido que é renda</div>
          <div className="value">{percentualTributavel.toFixed(1)}%</div>
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Total recebido</th>
              <th className="num">Renda tributável</th>
              <th className="num">Reembolso não tributável</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td>{l.mes}</td>
                <td className="num">{formatarMoeda(l.totalRecebido)}</td>
                <td className="num">{formatarMoeda(l.rendaTributavel)}</td>
                <td className="num">{formatarMoeda(l.reembolsoNaoTributavel)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma receita no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {contratosComRateio.length > 0 && (
        <>
          <h2 className="section-title">DSS — Demonstrativo Semestral Simplificado</h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
            Arrecadação do rateio × gasto real em custeio coletivo do imóvel — o relatório que contratos deste tipo
            obrigam o locador a enviar periodicamente ao locatário (últimos 12 meses).
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {contratosComRateio.map((c) => (
              <button
                key={c.id}
                className="btn"
                aria-current={contratoDssAtivo === c.id ? "page" : undefined}
                style={contratoDssAtivo === c.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                onClick={() => setContratoDssId(c.id)}
              >
                {imoveis.get(c.imovel_id)?.apelido ?? c.imovel_id} · {c.locatario}
              </button>
            ))}
          </div>

          {dss && (
            <div className="card">
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-tile">
                  <div className="label">Arrecadado (rateio)</div>
                  <div className="value">{formatarMoeda(dss.totalArrecadadoRateio)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Despendido (custeio coletivo)</div>
                  <div className="value">{formatarMoeda(dss.totalDespendido)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Saldo do período</div>
                  <div className={`value ${dss.saldo === "deficit" ? "critical" : "good"}`}>
                    {formatarMoeda(dss.saldoValor)} ({dss.saldo})
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Categoria</th><th className="num">Total gasto</th></tr>
                  </thead>
                  <tbody>
                    {dss.linhasDespesa.map((l) => (
                      <tr key={l.codigo}><td>{l.codigo} · {l.descricao}</td><td className="num">{formatarMoeda(l.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sugestaoRateio && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Ajuste de rateio sugerido (renovação anual)</h3>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 14 }}>
                Recalcula o percentual de rateio embutido no valor único para que a arrecadação do próximo ciclo
                cubra a despesa média do período acima e absorva o saldo ({formatarMoeda(sugestaoRateio.saldoAcumulado)}
                {" "}{dss?.saldo}) ao longo dos próximos {sugestaoRateio.mesesAmortizacao} meses — não altera nada
                sozinho, só sugere; aplicar é uma decisão sua.
              </p>
              <div className="kpi-grid" style={{ marginBottom: 14 }}>
                <div className="kpi-tile">
                  <div className="label">Rateio atual</div>
                  <div className="value">{sugestaoRateio.percentualRateioAtual.toFixed(1)}%</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Rateio sugerido</div>
                  <div className="value">{sugestaoRateio.percentualRateioSugerido.toFixed(1)}%</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Aluguel efetivo atual</div>
                  <div className="value">{sugestaoRateio.percentualAluguelEfetivoAtual.toFixed(1)}%</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Aluguel efetivo sugerido</div>
                  <div className="value">{sugestaoRateio.percentualAluguelEfetivoSugerido.toFixed(1)}%</div>
                </div>
              </div>
              <button
                className="btn"
                disabled={Math.abs(sugestaoRateio.percentualAluguelEfetivoSugerido - sugestaoRateio.percentualAluguelEfetivoAtual) < 0.05}
                onClick={aplicarSugestaoRateio}
              >
                Aplicar ajuste sugerido ao contrato
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
