import { useMemo, useState } from "react";
import { useDb } from "../db/DbContext";
import { consultar } from "../db/connection";
import { gerarRendaTributavel, totalizarRendaTributavel } from "../domain/reports/rendaTributavel";
import { gerarDss } from "../domain/reports/dss";
import type { ContratoLocacao, Imovel } from "../domain/types";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RendaTributavelView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const inicio12m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10);

  const linhas = useMemo(() => (db ? gerarRendaTributavel(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const totais = useMemo(() => totalizarRendaTributavel(linhas), [linhas]);

  const contratosComRateio = useMemo<ContratoLocacao[]>(
    () => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE percentual_aluguel_efetivo < 100 ORDER BY id") : []),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);
  const [contratoDssId, setContratoDssId] = useState<number | null>(null);
  const contratoDssAtivo = contratoDssId ?? contratosComRateio[0]?.id ?? null;
  const dss = useMemo(
    () => (db && contratoDssAtivo ? gerarDss(db, contratoDssAtivo, inicio12m, hoje) : null),
    [db, contratoDssAtivo, inicio12m, hoje],
  );

  const percentualTributavel = totais.totalRecebido > 0 ? (totais.rendaTributavel / totais.totalRecebido) * 100 : 0;

  return (
    <div>
      <h2 className="section-title">Renda tributável (Carnê-Leão)</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Separa, de cada recebimento de aluguel, o que é Aluguel Efetivo (base do IRPF) do que é reembolso de rateio
        de custeio coletivo (trânsito contábil, não tributável) — a distinção que contratos com "valor único mensal"
        fazem explicitamente. O total recebido nas contas quase sempre é maior do que a renda de fato, e é essa
        diferença que importa para capacidade contributiva.
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
        </>
      )}
    </div>
  );
}
