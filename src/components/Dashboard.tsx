import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { useDb } from "../db/DbContext";
import { consultar } from "../db/connection";
import { gerarSerieMensal, gerarDre, resultadoLiquido } from "../domain/reports/dre";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia, agingPorFaixa } from "../domain/reconcile/inadimplencia";
import { calcularDesempenhoPorImovel, agruparDesempenhoPorCidade } from "../domain/reports/desempenhoPorImovel";
import { formatarMoeda as formatarMoedaCompleta } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";
import type { Imovel } from "../domain/types";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// KPIs compactos do painel dispensam centavos — só aqui, no resto do app formatarMoeda()
// usa 2 casas decimais (padrão de formatarMoeda() em domain/formatarMoeda.ts).
function formatarMoeda(valor: number): string {
  return formatarMoedaCompleta(valor, 0);
}

function TooltipSerie({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-viz">
      <strong>{label}</strong>
      {payload.map((entrada) => (
        <div key={entrada.name} style={{ color: entrada.color }}>
          {entrada.name}: {formatarMoeda(entrada.value)}
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const dataInicio12m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10);
  const dataInicio36m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 36)).toISOString().slice(0, 10);
  const [imovelFiltroId, setImovelFiltroId] = useState<number | "">("");

  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const serieMensal = useMemo(() => (db ? gerarSerieMensal(db, dataInicio36m, hoje) : []), [db, versao, dataInicio36m, hoje]);
  const linhasDre12m = useMemo(
    () => (db ? gerarDre(db, dataInicio12m, hoje, imovelFiltroId === "" ? undefined : imovelFiltroId) : []),
    [db, versao, dataInicio12m, hoje, imovelFiltroId],
  );

  const statusInadimplencia = useMemo(() => {
    if (!db) return [];
    const competencias = gerarCompetencias(db, hoje);
    const excecoes = conciliar(db, competencias);
    return calcularInadimplencia(db, excecoes, hoje);
  }, [db, versao, hoje]);

  const desempenhoImoveis = useMemo(() => (db ? calcularDesempenhoPorImovel(db, dataInicio12m, hoje) : []), [db, versao, dataInicio12m, hoje]);
  // Deriva de desempenhoImoveis (já calculado acima) em vez de rodar o DRE de cada
  // imóvel de novo — calcularDesempenhoPorCidade() faz exatamente essa segunda rodada.
  const desempenhoCidades = useMemo(() => agruparDesempenhoPorCidade(desempenhoImoveis), [desempenhoImoveis]);

  const aging = useMemo(() => agingPorFaixa(statusInadimplencia), [statusInadimplencia]);
  const dadosAging = Object.entries(aging).map(([faixa, valores]) => ({ faixa, ...valores }));
  const corPorFaixa = ["var(--viz-warning)", "var(--viz-serious)", "var(--viz-critical)"];

  const receitaTotal = linhasDre12m.filter((l) => l.grupo === "receita").reduce((acc, l) => acc + l.total, 0);
  const despesaTotal = linhasDre12m.filter((l) => l.grupo === "despesa").reduce((acc, l) => acc + l.total, 0);
  const resultado = resultadoLiquido(linhasDre12m);
  const totalEmAberto = statusInadimplencia.filter((s) => s.diasAtraso > 0).reduce((acc, s) => acc + s.totalDevido, 0);

  const dadosSerie = serieMensal.map((linha) => ({
    mes: linha.mes,
    Receita: linha.receita,
    Despesa: Math.abs(linha.despesa),
    Resultado: linha.receita + linha.despesa,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 className="section-title">Visão geral — últimos 12 meses</h2>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          DRE por imóvel:
          <select value={imovelFiltroId} onChange={(e) => setImovelFiltroId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Portfólio inteiro</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>{i.apelido}</option>
            ))}
          </select>
        </label>
      </div>
      {imovelFiltroId !== "" && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-8px 0 16px" }}>
          Inclui a fatia de despesas rateadas com este imóvel (condomínio coletivo, obras compartilhadas etc.).
        </p>
      )}
      <div className="kpi-grid">
        <KpiTile label="Receita" value={formatarMoeda(receitaTotal)} />
        <KpiTile label="Despesa" value={formatarMoeda(Math.abs(despesaTotal))} />
        <KpiTile label="Resultado líquido" value={formatarMoeda(resultado)} variant={resultado >= 0 ? "good" : "critical"} />
        <KpiTile label="Em aberto (inadimplência)" value={formatarMoeda(totalEmAberto)} variant={totalEmAberto > 0 ? "critical" : "good"} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Receita × despesa × resultado (36 meses)</h2>
          <div style={{ width: "100%", height: 280, background: "var(--viz-surface)", borderRadius: 6 }}>
            <ResponsiveContainer>
              <LineChart data={dadosSerie} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => formatarMoeda(v)} />
                <Tooltip content={<TooltipSerie />} />
                <Legend wrapperStyle={{ fontSize: 12.5 }} />
                <Line type="monotone" dataKey="Receita" stroke="var(--viz-receita)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Despesa" stroke="var(--viz-despesa)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Resultado" stroke="var(--viz-resultado)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Inadimplência por faixa de atraso</h2>
          <div style={{ width: "100%", height: 280, background: "var(--viz-surface)", borderRadius: 6 }}>
            <ResponsiveContainer>
              <BarChart data={dadosAging} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="faixa" tick={{ fontSize: 11.5, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => formatarMoeda(v)} />
                <Tooltip content={<TooltipSerie />} />
                <Bar dataKey="total" name="Valor em aberto" radius={[4, 4, 0, 0]}>
                  {dadosAging.map((entrada, indice) => (
                    <Cell key={entrada.faixa} fill={corPorFaixa[indice]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {statusInadimplencia.filter((s) => s.diasAtraso > 0).length === 0 && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 10 }}>Nenhuma competência em aberto — todos os contratos residenciais conciliados.</p>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <div className="card">
          <h2 className="section-title">Resultado por imóvel (12 meses)</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Imóvel</th><th className="num">Receita</th><th className="num">Despesa</th><th className="num">Resultado</th></tr>
              </thead>
              <tbody>
                {desempenhoImoveis.map((d) => (
                  <tr key={d.imovel.id}>
                    <td>{d.imovel.apelido}</td>
                    <td className="num">{formatarMoeda(d.receita)}</td>
                    <td className="num">{formatarMoeda(d.despesa)}</td>
                    <td className="num" style={{ color: d.resultadoLiquido >= 0 ? "var(--viz-good)" : "var(--viz-despesa)" }}>{formatarMoeda(d.resultadoLiquido)}</td>
                  </tr>
                ))}
                {desempenhoImoveis.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum imóvel cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Resultado por cidade / centro de custo</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Cidade</th><th className="num">Imóveis</th><th className="num">Receita</th><th className="num">Despesa</th><th className="num">Resultado</th></tr>
              </thead>
              <tbody>
                {desempenhoCidades.map((d) => (
                  <tr key={d.cidade}>
                    <td>{d.cidade}</td>
                    <td className="num">{d.quantidadeImoveis}</td>
                    <td className="num">{formatarMoeda(d.receita)}</td>
                    <td className="num">{formatarMoeda(d.despesa)}</td>
                    <td className="num" style={{ color: d.resultadoLiquido >= 0 ? "var(--viz-good)" : "var(--viz-despesa)" }}>{formatarMoeda(d.resultadoLiquido)}</td>
                  </tr>
                ))}
                {desempenhoCidades.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum imóvel cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
