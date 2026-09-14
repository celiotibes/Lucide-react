import { useMemo } from "react";
import { useDb } from "../db/useDb";
import { calcularBudgetVariance } from "../domain/erp/budget-variance";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

function formatarMoedaDetalhado(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function formatarPercentual(valor: number): string {
  return `${valor.toFixed(1)}%`;
}

export function BudgetVarianceView() {
  const { db } = useDb();

  const varianceBudget = useMemo(() => {
    if (!db) return null;
    return calcularBudgetVariance(db, 1, 1);
  }, [db]);

  if (!db || !varianceBudget) {
    return (
      <div className="p-4 text-center">
        <p>Carregando análise de variação orçamentária...</p>
      </div>
    );
  }

  // Preparar dados para gráfico de Receitas vs Despesas
  const dadosResumo = [
    {
      categoria: "Receitas",
      orcado: varianceBudget.receitas_orcadas,
      realizado: varianceBudget.receitas_realizadas,
    },
    {
      categoria: "Despesas",
      orcado: varianceBudget.despesas_orcadas,
      realizado: varianceBudget.despesas_realizadas,
    },
    {
      categoria: "Resultado",
      orcado: varianceBudget.resultado_orcado,
      realizado: varianceBudget.resultado_realizado,
    },
  ];

  // Agrupar linhas por grupo (receita/despesa)
  const linhasReceita = varianceBudget.linhas.filter((l) => l.grupo === "receita");
  const linhasDespesa = varianceBudget.linhas.filter((l) => l.grupo === "despesa");


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Análise de Variação Orçamentária</h2>
        <span className="text-sm text-gray-600">Período: {varianceBudget.periodo}</span>
      </div>

      {/* KPIs de resumo */}
      <div className="kpi-grid">
        <KpiTile
          label="Receitas Orçadas"
          value={formatarMoeda(varianceBudget.receitas_orcadas)}
        />
        <KpiTile
          label="Receitas Realizadas"
          value={formatarMoeda(varianceBudget.receitas_realizadas)}
          variant={varianceBudget.receitas_variacao >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Variação (Receitas)"
          value={formatarMoeda(varianceBudget.receitas_variacao)}
          variant={varianceBudget.receitas_variacao >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Despesas Orçadas"
          value={formatarMoeda(varianceBudget.despesas_orcadas)}
        />
        <KpiTile
          label="Despesas Realizadas"
          value={formatarMoeda(varianceBudget.despesas_realizadas)}
          variant={varianceBudget.despesas_variacao <= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Variação (Despesas)"
          value={formatarMoeda(varianceBudget.despesas_variacao)}
          variant={varianceBudget.despesas_variacao <= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Resultado Orçado"
          value={formatarMoeda(varianceBudget.resultado_orcado)}
        />
        <KpiTile
          label="Resultado Realizado"
          value={formatarMoeda(varianceBudget.resultado_realizado)}
          variant={varianceBudget.resultado_realizado >= varianceBudget.resultado_orcado ? "good" : "critical"}
        />
      </div>

      {/* Gráfico de comparação */}
      <div className="bg-white rounded border p-4">
        <h3 className="font-bold mb-4">Orçado vs Realizado</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dadosResumo}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="categoria" />
            <YAxis />
            <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
            <Bar dataKey="orcado" fill="#3b82f6" name="Orçado" />
            <Bar dataKey="realizado" fill="#10b981" name="Realizado" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalhes de Receitas */}
      {linhasReceita.length > 0 && (
        <div className="bg-white rounded border">
          <div className="p-4 border-b font-bold">Receitas por Conta</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Código</th>
                  <th className="border p-2 text-left">Descrição</th>
                  <th className="border p-2 text-right">Orçado</th>
                  <th className="border p-2 text-right">Realizado</th>
                  <th className="border p-2 text-right">Variação</th>
                  <th className="border p-2 text-right">%</th>
                  <th className="border p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasReceita.map((linha, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="border p-2 font-mono text-xs">{linha.codigo}</td>
                    <td className="border p-2">{linha.descricao}</td>
                    <td className="border p-2 text-right">{formatarMoedaDetalhado(linha.orcado)}</td>
                    <td className="border p-2 text-right">{formatarMoedaDetalhado(linha.realizado)}</td>
                    <td className="border p-2 text-right font-semibold">{formatarMoedaDetalhado(linha.variacao)}</td>
                    <td className="border p-2 text-right">{formatarPercentual(linha.variacao_percentual)}</td>
                    <td className="border p-2 text-center">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          linha.status === "ok"
                            ? "bg-green-100 text-green-800"
                            : linha.status === "alerta"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {linha.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalhes de Despesas */}
      {linhasDespesa.length > 0 && (
        <div className="bg-white rounded border">
          <div className="p-4 border-b font-bold">Despesas por Conta</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Código</th>
                  <th className="border p-2 text-left">Descrição</th>
                  <th className="border p-2 text-right">Orçado</th>
                  <th className="border p-2 text-right">Realizado</th>
                  <th className="border p-2 text-right">Variação</th>
                  <th className="border p-2 text-right">%</th>
                  <th className="border p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasDespesa.map((linha, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="border p-2 font-mono text-xs">{linha.codigo}</td>
                    <td className="border p-2">{linha.descricao}</td>
                    <td className="border p-2 text-right">{formatarMoedaDetalhado(linha.orcado)}</td>
                    <td className="border p-2 text-right">{formatarMoedaDetalhado(linha.realizado)}</td>
                    <td className="border p-2 text-right font-semibold">{formatarMoedaDetalhado(linha.variacao)}</td>
                    <td className="border p-2 text-right">{formatarPercentual(linha.variacao_percentual)}</td>
                    <td className="border p-2 text-center">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          linha.status === "ok"
                            ? "bg-green-100 text-green-800"
                            : linha.status === "alerta"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {linha.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumo de variações críticas */}
      {varianceBudget.linhas.filter((l) => l.status === "critico").length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="font-bold text-red-900 mb-2">Variações Críticas Detectadas:</p>
          <ul className="space-y-1">
            {varianceBudget.linhas
              .filter((l) => l.status === "critico")
              .map((linha, idx) => (
                <li key={idx} className="text-sm text-red-800">
                  <strong>{linha.codigo}</strong> - {linha.descricao}: {formatarPercentual(Math.abs(linha.variacao_percentual))}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
