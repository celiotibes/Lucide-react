import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { compararComTransacoes, type Financiamento } from "../domain/financiamento/amortizacao";
import type { Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { ultimoDiaDoMes } from "../domain/data";
import { KpiTile } from "./KpiTile";
import type { FiltroTransacoesInicial } from "./TransacoesView";

export function FinanciamentosView({ aoDrillDown }: { aoDrillDown?: (filtro: FiltroTransacoesInicial) => void }) {
  const { db, versao } = useDb();
  const [financiamentoSelecionadoId, setFinanciamentoSelecionadoId] = useState<number | null>(null);

  const financiamentos = useMemo<Financiamento[]>(
    () => (db ? consultar<Financiamento>(db, "SELECT * FROM financiamentos ORDER BY id") : []),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);

  const financiamentoAtivo = financiamentos.find((f) => f.id === financiamentoSelecionadoId) ?? financiamentos[0] ?? null;

  const divergencias = useMemo(() => {
    if (!db || !financiamentoAtivo) return [];
    return compararComTransacoes(db, financiamentoAtivo);
  }, [db, financiamentoAtivo, versao]);

  const alertas = divergencias.filter((d) => d.possivelAnatocismo);

  return (
    <div>
      <h2 className="section-title">Financiamentos ({financiamentos.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Cronograma teórico gerado localmente pelo sistema {financiamentoAtivo?.sistema ?? "SAC"} — sem juros sobre
        juros — comparado mês a mês com o que foi de fato lançado nas transações do imóvel. Divergência de juros
        acima de 5% é sinalizada como possível encargo indevido, para investigar contra o contrato original.
        Financiamento "Outro" (ex: hipoteca por consórcio) não tem fórmula bancária conhecida — não há cronograma
        teórico nem comparação de anatocismo para ele; saldo devedor e parcela vêm do que for lançado manualmente
        no cadastro.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {financiamentos.map((f) => (
          <button
            key={f.id}
            className="btn"
            aria-current={financiamentoAtivo?.id === f.id ? "page" : undefined}
            style={financiamentoAtivo?.id === f.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => setFinanciamentoSelecionadoId(f.id)}
          >
            {imoveis.get(f.imovel_id)?.apelido ?? f.imovel_id} · {f.instituicao}
          </button>
        ))}
      </div>

      {financiamentoAtivo && (
        <>
          <div className="kpi-grid">
            <KpiTile label="Valor contratado" value={formatarMoeda(financiamentoAtivo.valor_contratado)} />
            {financiamentoAtivo.sistema === "OUTRO" ? (
              <>
                <KpiTile
                  label="Saldo devedor (informado)"
                  value={financiamentoAtivo.saldo_devedor_manual !== null ? formatarMoeda(financiamentoAtivo.saldo_devedor_manual) : "não informado"}
                  variant={financiamentoAtivo.saldo_devedor_manual !== null ? undefined : "critical"}
                />
                <KpiTile
                  label="Parcela mensal (informada)"
                  value={financiamentoAtivo.parcela_mensal_manual !== null ? formatarMoeda(financiamentoAtivo.parcela_mensal_manual) : "não informada"}
                  variant={financiamentoAtivo.parcela_mensal_manual !== null ? undefined : "critical"}
                />
              </>
            ) : (
              <KpiTile label="Taxa contratada" value={`${financiamentoAtivo.taxa_juros_mensal.toFixed(2)}% a.m.`} />
            )}
            <KpiTile label="Sistema" value={financiamentoAtivo.sistema} />
            <KpiTile label="Meses com divergência" value={alertas.length} variant={alertas.length > 0 ? "critical" : "good"} />
          </div>

          {alertas.length > 0 && (
            <div className="callout-anatocismo aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {alertas.length} mês(es) com juros cobrados acima do cronograma {financiamentoAtivo.sistema} teórico
                em mais de 5% — possível indício de anatocismo ou encargo não previsto. Confira contra o contrato de
                financiamento original antes de usar como prova.
              </span>
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Competência</th>
                  <th className="num">Juros teórico</th>
                  <th className="num">Juros cobrado</th>
                  <th className="num">Divergência</th>
                  <th className="num">Amortização teórica</th>
                  <th className="num">Amortização cobrada</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {divergencias.map((d) => (
                  <tr key={d.numero}>
                    <td>{d.mes}</td>
                    <td className="num">{formatarMoeda(d.jurosTeorico)}</td>
                    <td className="num">{formatarMoeda(d.jurosCobrado)}</td>
                    <td className="num">{d.divergenciaJurosPercentual !== null ? `${(d.divergenciaJurosPercentual * 100).toFixed(1)}%` : "—"}</td>
                    <td className="num">{formatarMoeda(d.amortizacaoTeorica)}</td>
                    <td className="num">{formatarMoeda(d.amortizacaoCobrada)}</td>
                    <td>
                      {d.possivelAnatocismo ? <span className="pill critical">divergente</span> : <span className="pill good">confere</span>}
                    </td>
                    <td>
                      {aoDrillDown && financiamentoAtivo && (
                        <button
                          className="btn"
                          style={{ padding: "3px 8px", fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}
                          title="Ver os lançamentos de juros/amortização deste mês na aba Transações"
                          onClick={() =>
                            aoDrillDown({
                              imovelId: financiamentoAtivo.imovel_id,
                              // 2.1.05/2.1.06 = juros/amortização de financiamento (mesmos códigos que
                              // compararComTransacoes usa pra montar jurosCobrado/amortizacaoCobrada
                              // acima) — sem isso o "Ver" mostrava TODOS os lançamentos do imóvel no
                              // mês (aluguel, condomínio etc.), diluindo a evidência específica do
                              // alerta de possível anatocismo que o título do botão promete mostrar.
                              planoContaCodigos: ["2.1.05", "2.1.06"],
                              dataInicio: `${d.mes}-01`,
                              dataFim: ultimoDiaDoMes(d.mes),
                            })
                          }
                        >
                          <Search size={11} /> Ver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {divergencias.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                      {financiamentoAtivo.sistema === "OUTRO"
                        ? "Sistema \"Outro\" não tem cronograma teórico SAC/Price — não há base de comparação de anatocismo para ele."
                        : "Nenhuma transação lançada para este imóvel dentro da janela do cronograma."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {financiamentos.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Nenhum financiamento cadastrado.</p>}
    </div>
  );
}
