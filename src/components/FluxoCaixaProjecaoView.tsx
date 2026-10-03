import { useState, useEffect } from "react";
import { useDb } from "../db/useDb";
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
  ComposedChart,
  Area,
  AreaChart,
} from "recharts";
import { KpiTile } from "./KpiTile";
import { AlertTriangle, TrendingUp, TrendingDown, Settings } from "lucide-react";

interface ProjecaoFluxo {
  data: string;
  saldoEstimado: number;
  min: number;
  max: number;
  metodo: "media_movel" | "regressao";
}

interface ProjecaoResponse {
  diasAdiante: number;
  algoritmo: "media_movel" | "regressao";
  projecao: ProjecaoFluxo[];
  alertas: Array<{
    data: string;
    saldo: number;
    mensagem: string;
  }>;
  resumo: {
    saldoAtual: number;
    saldoFinal: number;
    temCaixaNegativo: boolean;
    diasCaixaNegativo: number;
    periodoProjecao: string;
  };
}

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

function formatarData(dataStr: string): string {
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function FluxoCaixaProjecaoView() {
  const { db } = useDb();
  const [diasAdiante, setDiasAdiante] = useState(30);
  const [algoritmo, setAlgoritmo] = useState<"media_movel" | "regressao">("media_movel");
  const [projecao, setProjecao] = useState<ProjecaoResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarProjecao() {
      if (!db) return;

      setCarregando(true);
      setErro(null);

      try {
        // Buscar projeção do servidor (fase 6 — rota de relatórios)
        const params = new URLSearchParams({
          diasAdiante: String(diasAdiante),
          algoritmo,
        });

        const response = await fetch(`/api/relatorios/fluxo-caixa/projecao?${params}`, {
          method: "GET",
          headers: {
            "X-API-Key": process.env.REACT_APP_API_KEY || "",
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.erro || "Falha ao carregar projeção");
        }

        const dados = (await response.json()) as ProjecaoResponse;
        setProjecao(dados);
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
        setErro(mensagem);
        console.error("Erro ao carregar projeção:", err);
      } finally {
        setCarregando(false);
      }
    }

    const timer = setTimeout(carregarProjecao, 500);
    return () => clearTimeout(timer);
  }, [db, diasAdiante, algoritmo]);

  if (!db) {
    return (
      <div className="p-4 text-center">
        <p>Banco de dados não disponível</p>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="p-4 text-center">
        <p>Calculando projeção...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-800">Erro: {erro}</p>
      </div>
    );
  }

  if (!projecao) {
    return (
      <div className="p-4 text-center">
        <p>Nenhuma projeção disponível</p>
      </div>
    );
  }

  // Preparar dados para o gráfico
  const dadosGrafico = projecao.projecao.map((proj) => ({
    data: formatarData(proj.data),
    dataCompleta: proj.data,
    saldoEstimado: Math.round(proj.saldoEstimado),
    min: Math.round(proj.min),
    max: Math.round(proj.max),
  }));

  // Detectar tendência
  const primeiroSaldo = dadosGrafico[0]?.saldoEstimado ?? 0;
  const ultimoSaldo = dadosGrafico[dadosGrafico.length - 1]?.saldoEstimado ?? 0;
  const tendencia = ultimoSaldo > primeiroSaldo ? "positiva" : ultimoSaldo < primeiroSaldo ? "negativa" : "estável";
  const tendenciaIcon = tendencia === "positiva"
    ? <TrendingUp size={20} className="text-green-600" />
    : tendencia === "negativa"
    ? <TrendingDown size={20} className="text-red-600" />
    : <span className="text-gray-600">→</span>;

  const métodoLabel = algoritmo === "media_movel" ? "Média Móvel (90 dias)" : "Regressão Linear (Tendência + Sazonalidade)";

  return (
    <div className="space-y-4">
      {/* Cabeçalho com controles */}
      <div className="bg-white rounded border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Projeção de Fluxo de Caixa</h2>
            <div className="flex items-center gap-2 text-sm">
              {tendenciaIcon}
              <span className="text-gray-600 capitalize">{tendencia}</span>
            </div>
          </div>
          <Settings size={20} className="text-gray-400" />
        </div>

        {/* Controles de algoritmo e período */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Algoritmo</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAlgoritmo("media_movel")}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  algoritmo === "media_movel"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Média Móvel
              </button>
              <button
                onClick={() => setAlgoritmo("regressao")}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  algoritmo === "regressao"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Regressão
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Período de Projeção</label>
            <div className="flex gap-2">
              {[30, 60, 90].map((dias) => (
                <button
                  key={dias}
                  onClick={() => setDiasAdiante(dias)}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    diasAdiante === dias
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {dias} dias
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">Método: {métodoLabel}</p>
      </div>

      {/* KPIs principais */}
      <div className="kpi-grid">
        <KpiTile
          label="Saldo Atual"
          value={formatarMoeda(projecao.resumo.saldoAtual)}
        />
        <KpiTile
          label="Saldo Projetado (Fim)"
          value={formatarMoeda(projecao.resumo.saldoFinal)}
          variant={projecao.resumo.saldoFinal >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Dias de Caixa Negativo"
          value={String(projecao.resumo.diasCaixaNegativo)}
          variant={projecao.resumo.diasCaixaNegativo === 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Período"
          value={projecao.resumo.periodoProjecao}
        />
      </div>

      {/* Alertas de caixa negativo */}
      {projecao.alertas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-900">Alerta: Caixa Negativo Detectado</p>
            <div className="text-sm text-red-800 mt-2 space-y-1">
              {projecao.alertas.slice(0, 5).map((alerta, idx) => (
                <p key={idx}>
                  {formatarData(alerta.data)}: {alerta.mensagem}
                </p>
              ))}
            </div>
            {projecao.alertas.length > 5 && (
              <p className="text-xs text-red-700 mt-2">
                ... e mais {projecao.alertas.length - 5} período(s)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gráfico com área de confiança */}
      <div className="bg-white rounded border p-4">
        <h3 className="font-bold mb-4">Evolução do Saldo Projetado</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="data"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis />
            <Tooltip
              formatter={(value) => formatarMoedaDetalhado(value as number)}
              labelFormatter={(label) => `Data: ${label}`}
            />
            <Legend />
            <ReferenceLine
              y={0}
              stroke="#ef4444"
              strokeDasharray="5 5"
              label={{ value: "Zero (crítico)", position: "insideBottomRight", offset: -10 }}
            />

            {/* Área de confiança (min/max) */}
            <Area
              type="monotone"
              dataKey="min"
              fill="#e0e7ff"
              stroke="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="max"
              fill="none"
              stroke="none"
              isAnimationActive={false}
            />

            {/* Linha de saldo estimado */}
            <Line
              type="monotone"
              dataKey="saldoEstimado"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Saldo Estimado"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          A área sombreada representa o intervalo de confiança (95%) entre o saldo mínimo e máximo projetado.
        </p>
      </div>

      {/* Tabela detalhada */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">Projeção Detalhada</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Data</th>
                <th className="border p-2 text-right">Mín.</th>
                <th className="border p-2 text-right">Estimado</th>
                <th className="border p-2 text-right">Máx.</th>
                <th className="border p-2 text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {dadosGrafico.map((linha, idx) => {
                const saldoAnterior = idx > 0 ? dadosGrafico[idx - 1]?.saldoEstimado ?? 0 : projecao.resumo.saldoAtual;
                const variacao = linha.saldoEstimado - saldoAnterior;
                return (
                  <tr
                    key={idx}
                    className={`${
                      idx % 2 === 0 ? "bg-gray-50" : ""
                    } ${linha.saldoEstimado < 0 ? "bg-red-50" : ""}`}
                  >
                    <td className="border p-2 font-mono text-xs">{linha.data}</td>
                    <td className={`border p-2 text-right text-orange-600`}>
                      {formatarMoedaDetalhado(linha.min)}
                    </td>
                    <td className={`border p-2 text-right font-bold ${
                      linha.saldoEstimado < 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {formatarMoedaDetalhado(linha.saldoEstimado)}
                    </td>
                    <td className={`border p-2 text-right text-blue-600`}>
                      {formatarMoedaDetalhado(linha.max)}
                    </td>
                    <td className={`border p-2 text-right text-xs ${
                      variacao >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {variacao >= 0 ? "+" : ""}{formatarMoedaDetalhado(variacao)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explicação dos algoritmos */}
      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
        <p className="font-bold text-blue-900 mb-2">Sobre os algoritmos de projeção:</p>
        <ul className="space-y-1 text-blue-800 text-xs">
          <li>
            <strong>Média Móvel:</strong> Calcula a média diária dos últimos 90 dias de transações e projeta mantendo essa média constante.
            Ideal para padrões estáveis e previsíveis.
          </li>
          <li>
            <strong>Regressão Linear:</strong> Detecta tendência de crescimento/queda e padrão por dia da semana (sazonalidade).
            Mais preciso para fluxos com tendência clara.
          </li>
        </ul>
      </div>
    </div>
  );
}
