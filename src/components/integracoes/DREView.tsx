/**
 * Componente DREView: Visualizador de DRE (Demonstração de Resultado do Exercício)
 *
 * Opção A: On-The-Fly (real-time) — GET /api/relatorios/dre?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 * Opção B: Histórico (gravado 1x/dia) — GET /api/relatorios/dre/historico + GET /api/relatorios/dre/:ano/:mes
 *
 * UI:
 * - Card mostrando período corrente (mês atual com dados on-the-fly ou histórico)
 * - Gráfico: receita vs despesa (stacked bar)
 * - Modo: "Este período" vs "Histórico últimos 12 meses" (toggle)
 * - CTA: "Calcular e gravar agora" (dispara POST /api/relatorios/dre/calcular)
 */

import React, { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ResultadoDRE {
  ano: number;
  mes: number;
  dataInicio: string;
  dataFim: string;

  // Receitas
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  receitaTotal: number;

  // Despesas Variáveis
  despesaComissoes: number;
  despesaImpostosReceita: number;
  despesaVariavelTotal: number;

  // Lucro Bruto
  lucroBruto: number;

  // Despesas Fixas
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaJuros: number;
  despesaFixaTotal: number;

  // Resultado Final
  lucroLiquido: number;

  // Metadata
  calculadoEm?: string;
}

interface DataGrafico {
  periodo: string;
  receita: number;
  despesa: number;
}

export const DREView: React.FC = () => {
  const [modo, setModo] = useState<"este-periodo" | "historico">("este-periodo");
  const [dreAtual, setDREAtual] = useState<ResultadoDRE | null>(null);
  const [dreHistorico, setDREHistorico] = useState<ResultadoDRE[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Carrega DRE on-the-fly ou histórico conforme modo selecionado
  const carregarDRE = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      if (modo === "este-periodo") {
        // Opção A: On-The-Fly — período do mês atual
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = agora.getMonth() + 1;
        const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

        const resposta = await fetch(
          `/api/relatorios/dre?dataInicio=${dataInicio}&dataFim=${dataFim}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
          }
        );

        if (!resposta.ok) throw new Error("Falha ao carregar DRE período atual");
        const dados = (await resposta.json()) as ResultadoDRE;
        setDREAtual(dados);
      } else {
        // Opção B: Histórico — últimos 12 meses
        const resposta = await fetch(`/api/relatorios/dre/historico`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        });

        if (!resposta.ok) throw new Error("Falha ao carregar histórico DRE");
        const dados = await resposta.json();
        setDREHistorico(dados.periodos || []);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar DRE");
    } finally {
      setCarregando(false);
    }
  }, [modo]);

  useEffect(() => {
    carregarDRE();
  }, [carregarDRE]);

  async function calcularEGravarAgora() {
    setCalculando(true);
    setErro(null);

    try {
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = agora.getMonth() + 1;

      const resposta = await fetch(`/api/relatorios/dre/calcular`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({ ano, mes }),
      });

      if (!resposta.ok) throw new Error("Falha ao calcular e gravar DRE");

      // Recarrega dados após calcular
      await carregarDRE();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao calcular DRE");
    } finally {
      setCalculando(false);
    }
  }

  // Constrói dados para o gráfico
  const construirDadosGrafico = (): DataGrafico[] => {
    if (modo === "este-periodo" && dreAtual) {
      const periodoStr = `${dreAtual.ano}-${String(dreAtual.mes).padStart(2, "0")}`;
      return [
        {
          periodo: periodoStr,
          receita: dreAtual.receitaTotal,
          despesa: dreAtual.despesaVariavelTotal + dreAtual.despesaFixaTotal,
        },
      ];
    } else if (modo === "historico" && dreHistorico.length > 0) {
      return dreHistorico.map((d) => ({
        periodo: `${d.ano}-${String(d.mes).padStart(2, "0")}`,
        receita: d.receitaTotal,
        despesa: d.despesaVariavelTotal + d.despesaFixaTotal,
      }));
    }
    return [];
  };

  const formatarMoeda = (valor: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  };

  return (
    <div className="p-6 bg-gray-50 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Demonstração de Resultado (DRE)</h2>

      {/* Modo: Este Período vs Histórico */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setModo("este-periodo")}
          className={`px-4 py-2 rounded ${
            modo === "este-periodo"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800"
          }`}
        >
          Este Período
        </button>
        <button
          onClick={() => setModo("historico")}
          className={`px-4 py-2 rounded ${
            modo === "historico"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800"
          }`}
        >
          Histórico (12 meses)
        </button>

        {modo === "este-periodo" && (
          <button
            onClick={calcularEGravarAgora}
            disabled={calculando}
            className="ml-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {calculando ? "Calculando..." : "Calcular e Gravar Agora"}
          </button>
        )}
      </div>

      {/* Mensagens de erro */}
      {erro && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-center py-8 text-gray-500">Carregando...</div>
      ) : modo === "este-periodo" && dreAtual ? (
        <div>
          {/* Card com resumo do período */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h3 className="text-lg font-semibold mb-4">
              Período: {dreAtual.dataInicio} até {dreAtual.dataFim}
            </h3>

            <div className="grid grid-cols-2 gap-6">
              {/* Receitas */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-700 mb-2">Receitas</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Aluguel:</span>
                    <span>{formatarMoeda(dreAtual.receitaAluguel)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Honorário:</span>
                    <span>{formatarMoeda(dreAtual.receitaHonorario)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Extraordinária:</span>
                    <span>{formatarMoeda(dreAtual.receitaExtraordinaria)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-green-700 mt-2 pt-2 border-t">
                    <span>Total de Receita:</span>
                    <span>{formatarMoeda(dreAtual.receitaTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Despesas */}
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-700 mb-2">Despesas</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Comissões:</span>
                    <span>{formatarMoeda(dreAtual.despesaComissoes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Impostos:</span>
                    <span>{formatarMoeda(dreAtual.despesaImpostosReceita)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Folha:</span>
                    <span>{formatarMoeda(dreAtual.despesaFolhaPagamento)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Condomínio:</span>
                    <span>{formatarMoeda(dreAtual.despesaCondominio)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Manutenção:</span>
                    <span>{formatarMoeda(dreAtual.despesaManutencao)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Juros:</span>
                    <span>{formatarMoeda(dreAtual.despesaJuros)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-red-700 mt-2 pt-2 border-t">
                    <span>Total de Despesa:</span>
                    <span>
                      {formatarMoeda(
                        dreAtual.despesaVariavelTotal + dreAtual.despesaFixaTotal
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resultado Final */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-gray-600">Lucro Bruto</div>
                  <div className="text-xl font-bold text-blue-600">
                    {formatarMoeda(dreAtual.lucroBruto)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Despesa Fixa</div>
                  <div className="text-xl font-bold text-red-600">
                    {formatarMoeda(dreAtual.despesaFixaTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Lucro Líquido</div>
                  <div className={`text-xl font-bold ${dreAtual.lucroLiquido >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatarMoeda(dreAtual.lucroLiquido)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : modo === "historico" && dreHistorico.length > 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Últimos 12 Meses</h3>
          {/* Tabela de histórico */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Período</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                  <th className="px-4 py-2 text-right">Despesa</th>
                  <th className="px-4 py-2 text-right">Lucro Bruto</th>
                  <th className="px-4 py-2 text-right">Lucro Líquido</th>
                </tr>
              </thead>
              <tbody>
                {dreHistorico.map((d) => (
                  <tr key={`${d.ano}-${d.mes}`} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{d.ano}-{String(d.mes).padStart(2, "0")}</td>
                    <td className="px-4 py-2 text-right">{formatarMoeda(d.receitaTotal)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatarMoeda(d.despesaVariavelTotal + d.despesaFixaTotal)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatarMoeda(d.lucroBruto)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${d.lucroLiquido >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatarMoeda(d.lucroLiquido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          Nenhum dado disponível para o período selecionado.
        </div>
      )}

      {/* Gráfico: Receita vs Despesa */}
      {construirDadosGrafico().length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
          <h3 className="text-lg font-semibold mb-4">Receita vs Despesa</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={construirDadosGrafico()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip formatter={(value) => formatarMoeda(value as number)} />
              <Legend />
              <Bar dataKey="receita" fill="#22c55e" name="Receita" />
              <Bar dataKey="despesa" fill="#ef4444" name="Despesa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
