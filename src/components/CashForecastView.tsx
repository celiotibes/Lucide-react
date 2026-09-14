import { useMemo } from "react";
import { useDb } from "../db/useDb";
import { gerarProjecaoCaixa } from "../domain/erp/cash-forecast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { KpiTile } from "./KpiTile";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

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

export function CashForecastView() {
  const { db } = useDb();

  const projecaoCaixa = useMemo(() => {
    if (!db) return null;
    return gerarProjecaoCaixa(db, 1, 1);
  }, [db]);

  if (!db || !projecaoCaixa) {
    return (
      <div className="p-4 text-center">
        <p>Carregando projeção de fluxo de caixa...</p>
      </div>
    );
  }

  // Preparar dados para gráfico de tendência de saldo
  const dadosGrafico = projecaoCaixa.projecoes.map((proj) => ({
    periodo: `${proj.mes}/${String(proj.ano).slice(-2)}`,
    saldo: Math.round(proj.saldo_final),
    entradas: Math.round(proj.entradas_operacional),
    saidas: Math.round(proj.saidas_operacional),
  }));

  const tendenciaIcon = projecaoCaixa.tendencia === "positiva" ?
    <TrendingUp size={20} className="text-green-600" /> :
    projecaoCaixa.tendencia === "negativa" ?
    <TrendingDown size={20} className="text-red-600" /> :
    <span className="text-gray-600">→</span>;

  const mesCriticoFormatado = projecaoCaixa.mes_critico ?
    `Risco de déficit em ${projecaoCaixa.mes_critico}` :
    "Nenhum período crítico detectado";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Projeção de Fluxo de Caixa (12 meses)</h2>
        <div className="flex items-center gap-2">
          {tendenciaIcon}
          <span className="text-sm text-gray-600 capitalize">{projecaoCaixa.tendencia}</span>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="kpi-grid">
        <KpiTile
          label="Saldo Atual"
          value={formatarMoeda(projecaoCaixa.saldo_atual)}
        />
        <KpiTile
          label="Saldo Mínimo Projetado"
          value={formatarMoeda(projecaoCaixa.saldo_minimo_projetado)}
          variant={projecaoCaixa.saldo_minimo_projetado >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Saldo Máximo Projetado"
          value={formatarMoeda(projecaoCaixa.saldo_maximo_projetado)}
        />
        <KpiTile
          label="Status"
          value={projecaoCaixa.mes_critico ? "⚠️ Crítico" : "✓ Saudável"}
          variant={projecaoCaixa.mes_critico ? "critical" : "good"}
        />
      </div>

      {/* Aviso de período crítico */}
      {projecaoCaixa.mes_critico && (
        <div className="bg-red-50 border border-red-200 rounded p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-900">Período Crítico Detectado</p>
            <p className="text-sm text-red-800 mt-1">{mesCriticoFormatado}</p>
            <p className="text-xs text-red-700 mt-2">Recomenda-se revisar política de crédito ou buscar financiamento</p>
          </div>
        </div>
      )}

      {/* Gráfico de tendência */}
      <div className="bg-white rounded border p-4">
        <h3 className="font-bold mb-4">Evolução do Saldo Projetado</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo" />
            <YAxis />
            <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
            <Legend />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label="Zero (crítico)" />
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="#3b82f6"
              name="Saldo Projetado"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela de projeções detalhadas */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">Projeção Detalhada por Mês</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Período</th>
                <th className="border p-2 text-right">Saldo Inicial</th>
                <th className="border p-2 text-right">Entradas</th>
                <th className="border p-2 text-right">Saídas</th>
                <th className="border p-2 text-right">Líquido</th>
                <th className="border p-2 text-right">Saldo Final</th>
                <th className="border p-2 text-center">Confiança</th>
              </tr>
            </thead>
            <tbody>
              {projecaoCaixa.projecoes.map((proj, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="border p-2 font-mono text-xs">{proj.ano}/{String(proj.mes).padStart(2, "0")}</td>
                  <td className="border p-2 text-right">{formatarMoedaDetalhado(proj.saldo_inicial)}</td>
                  <td className="border p-2 text-right text-green-600">{formatarMoedaDetalhado(proj.entradas_operacional)}</td>
                  <td className="border p-2 text-right text-red-600">{formatarMoedaDetalhado(proj.saidas_operacional)}</td>
                  <td className="border p-2 text-right font-semibold">
                    {formatarMoedaDetalhado(proj.variacao_mes)}
                  </td>
                  <td
                    className={`border p-2 text-right font-bold ${
                      proj.saldo_final < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {formatarMoedaDetalhado(proj.saldo_final)}
                  </td>
                  <td className="border p-2 text-center">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        proj.confianca === "alta"
                          ? "bg-green-100 text-green-800"
                          : proj.confianca === "media"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {proj.confianca}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recomendações */}
      {projecaoCaixa.recomendacoes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <p className="font-bold text-blue-900 mb-3">Recomendações</p>
          <ul className="space-y-2">
            {projecaoCaixa.recomendacoes.map((rec, idx) => (
              <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Informações sobre a projeção */}
      <div className="bg-gray-50 rounded border p-3 text-xs">
        <p className="font-semibold mb-2">Sobre esta projeção:</p>
        <ul className="space-y-1 text-gray-700">
          <li>• Baseada em padrões históricos dos últimos períodos</li>
          <li>• Inclui variação sazonal por mês do ano</li>
          <li>• Investimentos e financiamentos assumidos como zero (conservador)</li>
          <li>• Confiança aumenta com mais dados históricos disponíveis</li>
          <li>• Atualizada conforme novos períodos contábeis são fechados</li>
        </ul>
      </div>
    </div>
  );
}
