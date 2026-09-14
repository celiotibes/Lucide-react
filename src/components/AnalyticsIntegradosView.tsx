import { useMemo, useState } from "react";
import { useDb } from "../db/useDb";
import {
  calcularKPIRentabilidade,
  calcularTendencia,
  calcularOcupacao,
  calcularComposicaoPatrimonio,
  calcularRankingImoveisPerformance,
} from "../domain/erp/analytics-integradas";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { KpiTile } from "./KpiTile";

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

function formatarPercentual(valor: number): string {
  return `${valor.toFixed(1)}%`;
}

export function AnalyticsIntegradosView() {
  const { db } = useDb();
  const [tabAtiva, setTabAtiva] = useState<"kpi" | "ocupacao" | "patrimonio" | "ranking">(
    "kpi",
  );

  // Obter períodos
  const periodosDisp = useMemo(() => {
    if (!db) return [];
    const periodos = db
      .exec(`SELECT id, ano, mes FROM periodos_contabeis ORDER BY ano DESC, mes DESC LIMIT 12`)[0]
      ?.values as Array<[number, number, number]>;
    return (periodos || []).map((p) => ({
      id: p[0],
      label: `${p[1]}/${String(p[2]).padStart(2, "0")}`,
    }));
  }, [db]);

  const [periodoAtual, setPeriodoAtual] = useState(periodosDisp[0]?.id || 1);
  const periodoPrevio = periodosDisp[1]?.id || periodosDisp[0]?.id || 1;

  // Calcular KPIs
  const kpiAtual = useMemo(() => {
    if (!db) return null;
    return calcularKPIRentabilidade(db, 1, periodoAtual);
  }, [db, periodoAtual]);

  const tendencia = useMemo(() => {
    if (!db || !kpiAtual) return null;
    return calcularTendencia(db, 1, periodoAtual, periodoPrevio);
  }, [db, kpiAtual, periodoAtual, periodoPrevio]);

  // Ocupação
  const ocupacao = useMemo(() => {
    if (!db) return null;
    return calcularOcupacao(db);
  }, [db]);

  // Patrimônio
  const patrimonio = useMemo(() => {
    if (!db) return null;
    return calcularComposicaoPatrimonio(db);
  }, [db]);

  // Ranking
  const ranking = useMemo(() => {
    if (!db) return [];
    return calcularRankingImoveisPerformance(db).slice(0, 10);
  }, [db]);

  if (!db || !kpiAtual || !tendencia || !ocupacao || !patrimonio) {
    return (
      <div className="p-4 text-center">
        <p>Carregando analytics...</p>
      </div>
    );
  }

  const dadosTendencia = [
    {
      periodo: "Anterior",
      receita: tendencia.periodo_anterior.receita_total,
      despesa: tendencia.periodo_anterior.despesa_total,
      lucro: tendencia.periodo_anterior.resultado_liquido,
    },
    {
      periodo: "Atual",
      receita: tendencia.periodo_atual.receita_total,
      despesa: tendencia.periodo_atual.despesa_total,
      lucro: tendencia.periodo_atual.resultado_liquido,
    },
  ];

  const dadosOcupacao = [
    {
      nome: "Alugados",
      valor: ocupacao.imoveis_alugados,
      fill: "#10b981",
    },
    {
      nome: "Vagos",
      valor: ocupacao.imoveis_vagos,
      fill: "#ef4444",
    },
  ];

  const dadosPatrimonio = [
    {
      nome: "Valor Próprio",
      valor: patrimonio.valor_proprio,
      fill: "#10b981",
    },
    {
      nome: "Financiado",
      valor: patrimonio.valor_financiado,
      fill: "#ef4444",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Analytics Integrados</h2>
        <select
          value={periodoAtual}
          onChange={(e) => setPeriodoAtual(Number(e.target.value))}
          className="px-3 py-2 border rounded"
        >
          {periodosDisp.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs Principais */}
      <div className="kpi-grid">
        <KpiTile
          label="Receita"
          value={formatarMoeda(kpiAtual.receita_total)}
          variant={tendencia.variacao_receita_pct > 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Despesa"
          value={formatarMoeda(kpiAtual.despesa_total)}
          variant={tendencia.variacao_despesa_pct < 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Resultado"
          value={formatarMoeda(kpiAtual.resultado_liquido)}
          variant={kpiAtual.resultado_liquido >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Ocupação"
          value={formatarPercentual(ocupacao.taxa_ocupacao_pct)}
        />
      </div>

      {/* Outros KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiTile
          label="ROI Patrimônio"
          value={formatarPercentual(kpiAtual.roi_patrimonio)}
          variant={kpiAtual.roi_patrimonio > 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Inadimplência"
          value={formatarPercentual(kpiAtual.taxa_inadimplencia)}
          variant={kpiAtual.taxa_inadimplencia < 5 ? "good" : "critical"}
        />
        <KpiTile
          label="Tendência"
          value={
            tendencia.tendencia === "crescente"
              ? "↑ Crescente"
              : tendencia.tendencia === "decrescente"
                ? "↓ Decrescente"
                : "→ Estável"
          }
          variant={
            tendencia.variacao_lucro_pct > 0
              ? "good"
              : tendencia.variacao_lucro_pct < 0
                ? "critical"
                : undefined
          }
        />
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTabAtiva("kpi")}
          className={`px-4 py-2 ${tabAtiva === "kpi" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Tendência
        </button>
        <button
          onClick={() => setTabAtiva("ocupacao")}
          className={`px-4 py-2 ${tabAtiva === "ocupacao" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Ocupação
        </button>
        <button
          onClick={() => setTabAtiva("patrimonio")}
          className={`px-4 py-2 ${tabAtiva === "patrimonio" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Patrimônio
        </button>
        <button
          onClick={() => setTabAtiva("ranking")}
          className={`px-4 py-2 ${tabAtiva === "ranking" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Ranking
        </button>
      </div>

      {/* Conteúdo */}
      <div className="bg-white rounded border p-4">
        {tabAtiva === "kpi" && (
          <div className="space-y-4">
            <h3 className="font-bold">Comparativo Períodos</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosTendencia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="receita" stroke="#10b981" name="Receita" />
                <Line type="monotone" dataKey="despesa" stroke="#ef4444" name="Despesa" />
                <Line type="monotone" dataKey="lucro" stroke="#3b82f6" name="Lucro" />
              </LineChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="border rounded p-3">
                <p className="font-semibold">Variação Receita</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatarPercentual(tendencia.variacao_receita_pct)}
                </p>
              </div>
              <div className="border rounded p-3">
                <p className="font-semibold">Variação Despesa</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatarPercentual(tendencia.variacao_despesa_pct)}
                </p>
              </div>
              <div className="border rounded p-3">
                <p className="font-semibold">Variação Lucro</p>
                <p
                  className={`text-2xl font-bold ${
                    tendencia.variacao_lucro_pct > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatarPercentual(tendencia.variacao_lucro_pct)}
                </p>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "ocupacao" && (
          <div className="space-y-4">
            <h3 className="font-bold">Taxa de Ocupação</h3>
            <div className="flex gap-4">
              <ResponsiveContainer width="50%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosOcupacao}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.valor}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="valor"
                  >
                    {dadosOcupacao.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              <div className="flex-1 space-y-3">
                <div className="border rounded p-3">
                  <p className="font-semibold">Taxa de Ocupação</p>
                  <p className="text-3xl font-bold">
                    {formatarPercentual(ocupacao.taxa_ocupacao_pct)}
                  </p>
                </div>
                <div className="border rounded p-3">
                  <p className="font-semibold">Imóveis</p>
                  <ul className="text-sm space-y-1 mt-2">
                    <li className="flex justify-between">
                      <span>Total</span>
                      <span className="font-bold">{ocupacao.total_imoveis}</span>
                    </li>
                    <li className="flex justify-between text-green-600">
                      <span>Alugados</span>
                      <span className="font-bold">{ocupacao.imoveis_alugados}</span>
                    </li>
                    <li className="flex justify-between text-red-600">
                      <span>Vagos</span>
                      <span className="font-bold">{ocupacao.imoveis_vagos}</span>
                    </li>
                  </ul>
                </div>
                <div className="border rounded p-3">
                  <p className="font-semibold">Receita</p>
                  <ul className="text-sm space-y-1 mt-2">
                    <li className="flex justify-between">
                      <span>Potencial</span>
                      <span>{formatarMoeda(ocupacao.receita_potencial)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Realizada</span>
                      <span>{formatarMoeda(ocupacao.receita_realizada)}</span>
                    </li>
                    <li className="flex justify-between text-red-600">
                      <span>Gap</span>
                      <span>{formatarMoeda(ocupacao.gap_receita)}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "patrimonio" && (
          <div className="space-y-4">
            <h3 className="font-bold">Composição do Patrimônio</h3>
            <div className="flex gap-4">
              <ResponsiveContainer width="50%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosPatrimonio}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.nome}: ${formatarMoeda(entry.valor)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="valor"
                  >
                    {dadosPatrimonio.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatarMoeda(v as number)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="flex-1 space-y-3">
                <div className="border rounded p-3 bg-blue-50">
                  <p className="font-semibold">Valor Total</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {formatarMoeda(patrimonio.valor_total_imoveis)}
                  </p>
                </div>
                <div className="border rounded p-3">
                  <p className="font-semibold">Composição</p>
                  <ul className="text-sm space-y-1 mt-2">
                    <li className="flex justify-between">
                      <span>Próprio</span>
                      <span className="text-green-600">
                        {formatarPercentual(100 - patrimonio.proporção_financiado_pct)}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>Financiado</span>
                      <span className="text-red-600">
                        {formatarPercentual(patrimonio.proporção_financiado_pct)}
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="border rounded p-3">
                  <p className="font-semibold">Valores</p>
                  <ul className="text-sm space-y-1 mt-2">
                    <li className="flex justify-between">
                      <span>Valor Próprio</span>
                      <span>{formatarMoeda(patrimonio.valor_proprio)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Valor Financiado</span>
                      <span>{formatarMoeda(patrimonio.valor_financiado)}</span>
                    </li>
                    <li className="border-t pt-1 flex justify-between font-bold">
                      <span>Valor Líquido</span>
                      <span>{formatarMoeda(patrimonio.valor_liquido_imoveis)}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "ranking" && (
          <div className="space-y-4">
            <h3 className="font-bold">Ranking de Imóveis por Rentabilidade</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={ranking}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="apelido" type="category" width={190} />
                <Tooltip formatter={(v) => `${(v as number).toFixed(1)}%`} />
                <Bar dataKey="taxa_rentabilidade_pct" fill="#3b82f6">
                  {ranking.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.taxa_rentabilidade_pct > 0 ? "#10b981" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Imóvel</th>
                  <th className="border p-2 text-right">Receita</th>
                  <th className="border p-2 text-right">Despesa</th>
                  <th className="border p-2 text-right">Resultado</th>
                  <th className="border p-2 text-right">Rentabilidade</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((imovel, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="border p-2">{imovel.apelido}</td>
                    <td className="border p-2 text-right">
                      {formatarMoeda(imovel.receita_mensal)}
                    </td>
                    <td className="border p-2 text-right">
                      {formatarMoeda(imovel.despesa_mensal)}
                    </td>
                    <td className="border p-2 text-right font-bold">
                      <span
                        className={
                          imovel.resultado_liquido >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {formatarMoeda(imovel.resultado_liquido)}
                      </span>
                    </td>
                    <td className="border p-2 text-right font-bold">
                      <span
                        className={
                          imovel.taxa_rentabilidade_pct > 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {formatarPercentual(imovel.taxa_rentabilidade_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
