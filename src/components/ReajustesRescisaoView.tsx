import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { listarReajustes, sugerirProximoReajuste, registrarReajuste, registrarRecomposicaoValor, calcularMultaRescisoria, aplicarDescontoNegociado } from "../domain/contratos/reajustes";
import type { ContratoLocacao, Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function ReajustesRescisaoView() {
  const { db, versao, persistir } = useDb();
  const hoje = hojeIso();
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<number | null>(null);
  const [dataRescisao, setDataRescisao] = useState(hoje);
  const [descontoNegociado, setDescontoNegociado] = useState("");
  const [recomposicao, setRecomposicao] = useState({ data: hoje, valorNovo: "", motivo: "" });

  const contratos = useMemo<ContratoLocacao[]>(
    () => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE tipo = 'residencial_fixo' ORDER BY id") : []),
    [db, versao],
  );
  const imoveis = useMemo<Map<number, Imovel>>(
    () => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])),
    [db, versao],
  );

  const contratoAtivo = contratos.find((c) => c.id === contratoSelecionadoId) ?? contratos[0] ?? null;

  const reajustes = useMemo(() => (db && contratoAtivo ? listarReajustes(db, contratoAtivo.id) : []), [db, versao, contratoAtivo]);
  const sugestao = useMemo(
    () => (db && contratoAtivo ? sugerirProximoReajuste(db, contratoAtivo, hoje) : null),
    [db, versao, contratoAtivo, hoje],
  );
  const multa = useMemo(
    () => (db && contratoAtivo ? calcularMultaRescisoria(db, contratoAtivo, dataRescisao) : null),
    [db, versao, contratoAtivo, dataRescisao],
  );

  const registrarSugestao = async () => {
    if (!db || !contratoAtivo || !sugestao || sugestao.valorSugerido === null) return;
    registrarReajuste(db, contratoAtivo.id, hoje, sugestao.valorSugerido, sugestao.criterioSugerido, sugestao.ehPrimeiraRenovacao ? "1ª renovação — percentual fixo pré-acordado" : "renovação por índice");
    await persistir();
  };

  const registrarRecomposicao = async () => {
    if (!db || !contratoAtivo || recomposicao.data === "" || recomposicao.valorNovo.trim() === "") return;
    const valorNovo = Number.parseFloat(recomposicao.valorNovo.replace(",", "."));
    if (Number.isNaN(valorNovo)) return;
    registrarRecomposicaoValor(db, contratoAtivo.id, recomposicao.data, valorNovo, recomposicao.motivo.trim() || "recomposição de valor (não é reajuste anual)");
    await persistir();
    setRecomposicao({ data: hoje, valorNovo: "", motivo: "" });
  };

  return (
    <div>
      <h2 className="section-title">Reajustes e rescisão ({contratos.length} contratos)</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Histórico de reajuste real aplicado a cada contrato — 1ª renovação por percentual fixo pré-acordado (se
        definido no contrato), renovações seguintes pela variação acumulada do índice contratado — e calculadora de
        multa rescisória proporcional por quebra antecipada do prazo determinado (art. 4º, Lei 8.245/91).
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {contratos.map((c) => (
          <button
            key={c.id}
            className="btn"
            aria-current={contratoAtivo?.id === c.id ? "page" : undefined}
            style={contratoAtivo?.id === c.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => setContratoSelecionadoId(c.id)}
          >
            {imoveis.get(c.imovel_id)?.apelido ?? c.imovel_id} · {c.locatario}
          </button>
        ))}
      </div>

      {contratoAtivo && (
        <>
          <div className="kpi-grid">
            <KpiTile label="Valor vigente" value={sugestao ? formatarMoeda(sugestao.valorAtual) : "—"} />
            <KpiTile
              label="Próximo reajuste"
              value={sugestao?.ehPrimeiraRenovacao ? "1ª renovação (fixo)" : `índice ${sugestao?.criterioSugerido ?? "—"}`}
            />
            <KpiTile
              label="Percentual sugerido"
              value={sugestao?.percentualSugerido !== null && sugestao?.percentualSugerido !== undefined ? `${sugestao.percentualSugerido.toFixed(2)}%` : "sem índice suficiente"}
            />
            <KpiTile
              label="Valor sugerido"
              value={sugestao?.valorSugerido !== null && sugestao?.valorSugerido !== undefined ? formatarMoeda(sugestao.valorSugerido) : "—"}
            />
          </div>

          {sugestao?.valorSugerido !== null && sugestao?.valorSugerido !== undefined && (
            <button className="btn" style={{ marginTop: 4, marginBottom: 24 }} onClick={registrarSugestao}>
              Registrar reajuste de hoje ({formatarMoeda(sugestao.valorSugerido)})
            </button>
          )}
          {sugestao?.valorSugerido === null && (
            <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Faltam taxas do índice {sugestao.criterioSugerido} cadastradas em indices_economicos para o período — cadastre antes de registrar.</span>
            </div>
          )}

          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Histórico de reajustes aplicados</h3>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vigência</th>
                  <th className="num">Valor anterior</th>
                  <th className="num">Valor novo</th>
                  <th className="num">Percentual</th>
                  <th>Critério</th>
                  <th>Tipo</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {reajustes.map((r) => (
                  <tr key={r.id}>
                    <td>{r.data_vigencia}</td>
                    <td className="num">{formatarMoeda(r.valor_anterior)}</td>
                    <td className="num">{formatarMoeda(r.valor_novo)}</td>
                    <td className="num">{r.percentual_aplicado.toFixed(2)}%</td>
                    <td>{r.criterio}</td>
                    <td>
                      {r.eh_reajuste_anual ? (
                        <span className="pill good">reajuste anual</span>
                      ) : (
                        <span className="pill warning" title="Não conta como 1ª renovação nem fecha o ciclo da multa rescisória">recomposição</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{r.observacoes ?? "—"}</td>
                  </tr>
                ))}
                {reajustes.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                      Nenhum reajuste registrado ainda para este contrato — vale o valor de referência original.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Registrar recomposição de valor (não é o reajuste anual)</div>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", maxWidth: "68ch", margin: "0 0 8px" }}>
              Use para mudança de valor por outro motivo contratual — ex: variação de lotação (2 → 3 moradores) em
              contrato de "valor único mensal". Não segue índice, não conta como a 1ª renovação e não abre um novo
              ciclo de {contratoAtivo.duracao_minima_meses} meses para a multa rescisória.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" className="btn" value={recomposicao.data} onChange={(e) => setRecomposicao({ ...recomposicao, data: e.target.value })} />
              <input
                className="btn"
                style={{ cursor: "text", width: 140 }}
                placeholder="Novo valor (R$)"
                value={recomposicao.valorNovo}
                onChange={(e) => setRecomposicao({ ...recomposicao, valorNovo: e.target.value })}
              />
              <input
                className="btn"
                style={{ cursor: "text", width: 260 }}
                placeholder="Motivo (ex: 3º morador a partir de agosto/2026)"
                value={recomposicao.motivo}
                onChange={(e) => setRecomposicao({ ...recomposicao, motivo: e.target.value })}
              />
              <button className="btn" disabled={recomposicao.data === "" || recomposicao.valorNovo.trim() === ""} onClick={registrarRecomposicao}>
                Registrar
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Multa rescisória (quebra antecipada do prazo determinado)</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <label htmlFor="data-rescisao" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Data da rescisão
            </label>
            <input
              id="data-rescisao"
              type="date"
              value={dataRescisao}
              onChange={(e) => setDataRescisao(e.target.value)}
              className="btn"
              style={{ cursor: "text" }}
            />
            <label htmlFor="desconto-negociado" style={{ fontSize: 13, color: "var(--ink-soft)", marginLeft: 8 }}>
              Desconto comercial negociado (%)
            </label>
            <input
              id="desconto-negociado"
              type="number"
              min={0}
              max={100}
              placeholder="ex: 85"
              value={descontoNegociado}
              onChange={(e) => setDescontoNegociado(e.target.value)}
              className="btn"
              style={{ cursor: "text", width: 90 }}
            />
          </div>

          {multa && (
            <div className="kpi-grid">
              <KpiTile label="Duração do ciclo" value={`${multa.duracaoCicloMeses} meses`} />
              <KpiTile label="Meses restantes" value={multa.mesesRestantes} />
              <KpiTile label="Teto da multa" value={formatarMoeda(multa.tetoMulta)} />
              <KpiTile
                label="Multa proporcional"
                value={formatarMoeda(multa.multaProporcional)}
                variant={multa.multaProporcional > 0 ? "critical" : "good"}
              />
              {descontoNegociado.trim() !== "" && !Number.isNaN(Number(descontoNegociado)) && (
                <KpiTile
                  label={`Multa com desconto de ${descontoNegociado}%`}
                  value={formatarMoeda(aplicarDescontoNegociado(multa.multaProporcional, Number(descontoNegociado)))}
                  variant="good"
                />
              )}
            </div>
          )}
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginTop: 10 }}>
            Fórmula: teto ({contratoAtivo.multa_rescisoria_teto_meses} meses do valor vigente) dividido pela duração
            total do ciclo em meses, multiplicado pelos meses restantes até o fim do prazo determinado — mesma lógica
            de proporcionalidade de contratos reais de locação estudantil/residencial.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginTop: 4 }}>
            O desconto comercial é opcional e não fica salvo no contrato — cobre negociações
            pontuais de saída antecipada avisada com antecedência (ex: bonificação decrescente de
            fim de ano em contratos de locação estudantil), que contratos reais tratam
            explicitamente como liberalidade discricionária e revogável, não como regra fixa.
          </p>
        </>
      )}

      {contratos.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Nenhum contrato residencial cadastrado.</p>}
    </div>
  );
}
