import { useMemo } from "react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia } from "../domain/reconcile/inadimplencia";
import { listarPartes } from "../domain/contratos/locatarios";
import type { ContratoLocacao, Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function ContratosInadimplenciaView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();

  const contratos = useMemo<ContratoLocacao[]>(() => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao ORDER BY id") : []), [db, versao]);
  const imoveis = useMemo<Map<number, Imovel>>(
    () => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])),
    [db, versao],
  );
  const partesPorContrato = useMemo(
    () => new Map(contratos.map((c) => [c.id, db ? listarPartes(db, c.id) : []])),
    [db, versao, contratos],
  );

  const statusInadimplencia = useMemo(() => {
    if (!db) return [];
    const competencias = gerarCompetencias(db, hoje);
    const excecoes = conciliar(db, competencias);
    // "pago" aqui significa "ainda não venceu dentro do mês" — não é uma pendência real, então
    // não entra na lista de competências em aberto (evita mostrar uma "inadimplência" com 0 dias de atraso).
    return calcularInadimplencia(db, excecoes, hoje)
      .filter((s) => s.diasAtraso > 0)
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [db, versao, hoje]);

  const contratosPorId = useMemo(() => new Map(contratos.map((c) => [c.id, c])), [contratos]);

  return (
    <div>
      <h2 className="section-title">Contratos de locação ({contratos.length})</h2>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Partes solidárias</th>
              <th>Tipo</th>
              <th className="num">Valor</th>
              <th>Início</th>
              <th>Fim</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((c) => {
              const partes = (partesPorContrato.get(c.id) ?? []).filter((p) => p.papel === "responsavel_solidario");
              const coLocatarios = (partesPorContrato.get(c.id) ?? []).filter((p) => p.papel === "locatario");
              return (
                <tr key={c.id}>
                  <td>{imoveis.get(c.imovel_id)?.apelido ?? c.imovel_id}</td>
                  <td>
                    {c.locatario}
                    {coLocatarios.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>+ {coLocatarios.map((p) => p.nome).join(", ")}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{partes.length > 0 ? partes.map((p) => p.nome).join(", ") : "—"}</td>
                  <td>{c.tipo === "residencial_fixo" ? "Residencial" : "Airbnb"}</td>
                  <td className="num">{formatarMoeda(c.valor_referencia)}</td>
                  <td>{c.data_inicio}</td>
                  <td>{c.data_fim ?? "vigente"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Competências em aberto (inadimplência)</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
        Multa em duas faixas (inicial até o prazo do contrato, substituída — não somada — depois disso), juros
        pro-rata die, correção monetária pelo índice contratado e honorários advocatícios quando o atraso ultrapassa
        o gatilho de execução judicial definido em cada contrato.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Competência</th>
              <th className="num">Valor</th>
              <th className="num">Dias de atraso</th>
              <th className="num">Multa</th>
              <th className="num">Juros</th>
              <th className="num">Correção</th>
              <th className="num">Honorários</th>
              <th className="num">Total devido</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {statusInadimplencia.map((s, indice) => {
              const contrato = contratosPorId.get(s.competencia.contrato_id);
              const pillClasse = s.situacao === "inadimplente" ? "critical" : s.situacao === "em_aberto" ? "warning" : "good";
              return (
                <tr key={indice}>
                  <td>{imoveis.get(s.competencia.imovel_id)?.apelido ?? s.competencia.imovel_id}</td>
                  <td>{contrato?.locatario}</td>
                  <td>{s.competencia.mes_referencia.slice(0, 7)}</td>
                  <td className="num">{formatarMoeda(s.competencia.valor_esperado)}</td>
                  <td className="num">{s.diasAtraso}</td>
                  <td className="num">{formatarMoeda(s.multa)}</td>
                  <td className="num">{formatarMoeda(s.juros)}</td>
                  <td className="num">{formatarMoeda(s.correcaoMonetaria)}</td>
                  <td className="num">{s.honorarios > 0 ? formatarMoeda(s.honorarios) : "—"}</td>
                  <td className="num">{formatarMoeda(s.totalDevido)}</td>
                  <td>
                    <span className={`pill ${pillClasse}`}>{s.situacao.replace("_", " ")}</span>
                  </td>
                </tr>
              );
            })}
            {statusInadimplencia.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma competência em aberto encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
