/**
 * Dashboard Interativo de Relatório Executivo
 *
 * Exibe:
 * - Cards de KPI (Receita, Despesa, Lucro, Taxa Ocupação)
 * - Gráficos de DRE e Fluxo de Caixa
 * - Tabelas de Contas a Receber/Pagar
 * - Alertas em destaque
 * - Botões: Baixar PDF, Enviar Email, Imprimir
 */

import React, { useState, useEffect, useCallback } from "react";
import type { RelatorioExecutivo, RelatorioExecutivoResposta, SecaoIndisponivel } from "../types/relatorio.js";

interface RelatorioExecutivoViewProps {
  mes: number;
  ano: number;
}

export function RelatorioExecutivoView({ mes, ano }: RelatorioExecutivoViewProps) {
  const [resposta, setResposta] = useState<RelatorioExecutivoResposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumo" | "dre" | "fluxo" | "margens" | "contas">("resumo");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailPara, setEmailPara] = useState("");

  // Carrega relatório ao montar
  const carregarRelatorio = useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);

      const response = await fetch(
        `/api/relatorios/executivo/dashboard?mes=${mes}&ano=${ano}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Erro ao carregar relatório: ${response.statusText}`);
      }

      const data = (await response.json()) as RelatorioExecutivoResposta;
      setResposta(data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    carregarRelatorio();
  }, [carregarRelatorio]);

  async function baixarPDF() {
    try {
      const link = document.createElement("a");
      link.href = `/api/relatorios/executivo/download/${mes}/${ano}`;
      link.download = `relatorio-executivo-${ano}-${String(mes).padStart(2, "0")}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao baixar PDF");
    }
  }

  async function enviarPorEmail() {
    if (!emailPara.includes("@")) {
      setErro("Email inválido");
      return;
    }

    try {
      setEnviandoEmail(true);
      const response = await fetch(
        `/api/relatorios/executivo/enviar-email?mes=${mes}&ano=${ano}&email=${encodeURIComponent(emailPara)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao enviar email");
      }

      await response.json();
      alert(`Relatório enviado para ${emailPara}`);
      setEmailPara("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar email");
    } finally {
      setEnviandoEmail(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Carregando relatório executivo...</div>;
  }

  if (erro) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded text-red-800">
        <strong>Erro:</strong> {erro}
      </div>
    );
  }

  if (!resposta) {
    return <div className="p-8 text-center">Nenhum relatório disponível</div>;
  }

  // O servidor só calcula o que existe no banco dele; seções sem base real vêm como
  // "indisponivel" (com motivo) em vez de números inventados. Enquanto houver alguma,
  // mostramos o que há e explicamos o resto.
  if (!resposta.completo) {
    const secoes: Array<[string, unknown]> = [
      ["DRE", resposta.dre],
      ["Fluxo de Caixa", resposta.fluxo],
      ["Margens por Propriedade", resposta.margens],
      ["Contas a Receber / Pagar", resposta.contas],
      ["Sumário", resposta.sumario],
    ];
    const indisponiveis = secoes.filter(
      (par): par is [string, SecaoIndisponivel] => (par[1] as SecaoIndisponivel).indisponivel === true,
    );
    const razao = resposta.razaoServidor;
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Relatório Executivo (parcial)</h1>
          <p className="text-gray-600 mb-6">
            Período: {String(mes).padStart(2, "0")}/{ano}. Valores não calculáveis pelo servidor não são estimados.
          </p>
          {indisponiveis.map(([nome, secao]) => (
            <div key={nome} className="mb-3 p-4 bg-yellow-50 border border-yellow-300 rounded text-yellow-900">
              <strong>{nome}: indisponível.</strong> {secao.motivo}
              <div className="text-xs mt-1">Fonte esperada: {secao.fonteEsperada}</div>
            </div>
          ))}
          {"indisponivel" in razao ? null : (
            <div className="mt-6 p-4 bg-white border rounded">
              <h2 className="font-bold mb-2">Razão do servidor (conciliação PIX/OFX)</h2>
              <p>
                {razao.totalLancamentos} lançamento(s) no mês; soma{" "}
                {razao.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-600 mt-1">{razao.aviso}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const relatorio = resposta as unknown as RelatorioExecutivo;

  const formatarMoeda = (valor: number) => {
    return `R$ ${(valor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OK":
        return "bg-green-100 text-green-800";
      case "ATENÇÃO":
        return "bg-yellow-100 text-yellow-800";
      case "CRÍTICO":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Relatório Executivo</h1>
          <p className="text-gray-600">
            Período: {String(mes).padStart(2, "0")}/{ano} • Gerado em{" "}
            {new Date(relatorio.criadoEm).toLocaleDateString("pt-BR")}
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="mb-8 flex gap-4 flex-wrap">
          <button
            onClick={baixarPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Baixar PDF
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Imprimir
          </button>
          <div className="flex gap-2 ml-auto">
            <input
              type="email"
              placeholder="seu@email.com"
              value={emailPara}
              onChange={(e) => setEmailPara(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded"
            />
            <button
              onClick={enviarPorEmail}
              disabled={enviandoEmail}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {enviandoEmail ? "Enviando..." : "Enviar Email"}
            </button>
          </div>
        </div>

        {/* Status Geral */}
        <div className="mb-8 p-6 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Status Geral</h2>
              <p className="text-gray-600">Análise consolidada do período</p>
            </div>
            <span className={`px-6 py-3 rounded-lg font-bold text-lg ${getStatusColor(relatorio.sumario.statusGeral)}`}>
              {relatorio.sumario.statusGeral}
            </span>
          </div>
        </div>

        {/* KPIs Principais */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600 uppercase font-semibold">Receita Total</p>
            <p className="text-2xl font-bold text-blue-600 mt-2">
              {formatarMoeda(relatorio.dre.receitaTotal)}
            </p>
            <p className="text-xs text-gray-500 mt-2">Mês/YTD: {relatorio.dre.variacao.mesAnterior.toFixed(1)}% / {relatorio.dre.variacao.ytd.toFixed(1)}%</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600 uppercase font-semibold">Despesa Total</p>
            <p className="text-2xl font-bold text-orange-600 mt-2">
              {formatarMoeda(relatorio.dre.despesaTotal)}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {((relatorio.dre.despesaTotal / relatorio.dre.receitaTotal) * 100).toFixed(1)}% da receita
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600 uppercase font-semibold">Lucro Líquido</p>
            <p className={`text-2xl font-bold mt-2 ${relatorio.dre.lucroLiquido >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatarMoeda(relatorio.dre.lucroLiquido)}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Margem: {((relatorio.dre.lucroLiquido / relatorio.dre.receitaTotal) * 100).toFixed(1)}%
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600 uppercase font-semibold">Taxa Ocupação</p>
            <p className="text-2xl font-bold text-purple-600 mt-2">{relatorio.sumario.taxaOcupacao.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-2">Imóveis alugados</p>
          </div>
        </div>

        {/* Abas de Conteúdo */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b flex">
            {(["resumo", "dre", "fluxo", "margens", "contas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-6 py-3 font-medium border-b-2 ${
                  tab === t
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {t === "resumo" && "Resumo"}
                {t === "dre" && "DRE"}
                {t === "fluxo" && "Fluxo de Caixa"}
                {t === "margens" && "Margens"}
                {t === "contas" && "Contas"}
              </button>
            ))}
          </div>

          <div className="p-8">
            {/* Aba: Resumo */}
            {tab === "resumo" && (
              <div>
                <h3 className="text-lg font-semibold mb-6">Alertas Críticos</h3>
                {relatorio.sumario.alertasTopCinco.length === 0 ? (
                  <p className="text-green-600 font-semibold">✓ Nenhum alerta pendente</p>
                ) : (
                  <div className="space-y-4">
                    {relatorio.sumario.alertasTopCinco.map((alerta, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded border-l-4 ${
                          alerta.tipo === "crítico"
                            ? "bg-red-50 border-red-400"
                            : alerta.tipo === "aviso"
                            ? "bg-yellow-50 border-yellow-400"
                            : "bg-blue-50 border-blue-400"
                        }`}
                      >
                        <p className="font-semibold text-gray-900">{alerta.titulo}</p>
                        <p className="text-sm text-gray-600 mt-1">{alerta.descricao}</p>
                        {alerta.recomendacao && (
                          <p className="text-sm text-gray-700 mt-2 italic">
                            <strong>Recomendação:</strong> {alerta.recomendacao}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-8 pt-8 border-t">
                  <h3 className="text-lg font-semibold mb-4">Indicadores Chave</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-600">Inadimplência</p>
                      <p className={`text-xl font-bold ${relatorio.sumario.inadimplencia > 10 ? "text-red-600" : "text-green-600"}`}>
                        {relatorio.sumario.inadimplencia.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-600">Dias de Caixa</p>
                      <p className="text-xl font-bold text-blue-600">{relatorio.sumario.diasDeCaixaDisponivel}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Aba: DRE */}
            {tab === "dre" && (
              <div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="bg-blue-50 font-semibold">
                      <td className="px-4 py-2">Receita de Aluguel</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.receitaAluguel)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Receita de Honorários</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.receitaHonorario)}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2">Receita Extraordinária</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.receitaExtraordinaria)}</td>
                    </tr>
                    <tr className="bg-green-50 font-semibold">
                      <td className="px-4 py-2">Receita Total</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.receitaTotal)}</td>
                    </tr>
                    <tr className="border-t-2 mt-4">
                      <td className="px-4 py-2 font-semibold">Despesa - Folha</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaFolhaPagamento)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Despesa - Condomínio</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaCondominio)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Despesa - Manutenção</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaManutencao)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Despesa - Impostos</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaImpostos)}</td>
                    </tr>
                    <tr className="bg-orange-50">
                      <td className="px-4 py-2">Despesa - Juros</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaJuros)}</td>
                    </tr>
                    <tr className="bg-red-50 font-semibold">
                      <td className="px-4 py-2">Despesa Total</td>
                      <td className="text-right px-4 py-2">{formatarMoeda(relatorio.dre.despesaTotal)}</td>
                    </tr>
                    <tr className={`font-bold text-lg ${relatorio.dre.lucroLiquido >= 0 ? "bg-green-100" : "bg-red-100"}`}>
                      <td className="px-4 py-2">Lucro Líquido</td>
                      <td className={`text-right px-4 py-2 ${relatorio.dre.lucroLiquido >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatarMoeda(relatorio.dre.lucroLiquido)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Aba: Fluxo de Caixa */}
            {tab === "fluxo" && (
              <div>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Saldo Atual</p>
                    <p className={`text-2xl font-bold ${relatorio.fluxo.saldoAtual >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatarMoeda(relatorio.fluxo.saldoAtual)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-xs text-gray-600 uppercase">Projeção 30d</p>
                      <p className="text-lg font-bold text-blue-600">{formatarMoeda(relatorio.fluxo.projecao30dias)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-xs text-gray-600 uppercase">Projeção 60d</p>
                      <p className="text-lg font-bold text-blue-600">{formatarMoeda(relatorio.fluxo.projecao60dias)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-xs text-gray-600 uppercase">Projeção 90d</p>
                      <p className="text-lg font-bold text-blue-600">{formatarMoeda(relatorio.fluxo.projecao90dias)}</p>
                    </div>
                  </div>
                  {relatorio.fluxo.diasAteSaldoNegativo !== null && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded">
                      <p className="text-red-800 font-semibold">
                        ⚠️ Saldo negativo projetado em {relatorio.fluxo.diasAteSaldoNegativo} dias
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aba: Margens */}
            {tab === "margens" && (
              <div>
                <div className="mb-8">
                  <h4 className="font-semibold mb-4 text-gray-900">Top 5 Propriedades</h4>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Propriedade</th>
                        <th className="px-4 py-2 text-right">Margem</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.margens.top5.map((prop, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="px-4 py-2">{prop.nomePropriedade}</td>
                          <td className="px-4 py-2 text-right font-semibold">{prop.margem.toFixed(1)}%</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(prop.status)}`}>
                              {prop.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 className="font-semibold mb-4 text-gray-900">Bottom 5 Propriedades</h4>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Propriedade</th>
                        <th className="px-4 py-2 text-right">Margem</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.margens.bottom5.map((prop, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="px-4 py-2">{prop.nomePropriedade}</td>
                          <td className="px-4 py-2 text-right font-semibold">{prop.margem.toFixed(1)}%</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(prop.status)}`}>
                              {prop.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Aba: Contas */}
            {tab === "contas" && (
              <div>
                <div className="mb-8">
                  <h4 className="font-semibold mb-4 text-gray-900">Contas a Receber</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-600">Total a Receber</p>
                      <p className="text-xl font-bold text-blue-600">{formatarMoeda(relatorio.contas.aReceber.total)}</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded">
                      <p className="text-sm text-gray-600">Vencido</p>
                      <p className="text-xl font-bold text-red-600">{formatarMoeda(relatorio.contas.aReceber.vencido)}</p>
                      <p className="text-xs text-gray-600 mt-1">{relatorio.contas.aReceber.percentualVencido.toFixed(1)}% da carteira</p>
                    </div>
                  </div>
                  {relatorio.contas.aReceber.topDevedores.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-semibold mb-2">Top Devedores</h5>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Devedor</th>
                            <th className="px-2 py-1 text-right">Valor</th>
                            <th className="px-2 py-1 text-right">Dias Vencido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorio.contas.aReceber.topDevedores.map((dev, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="px-2 py-1">{dev.nome}</td>
                              <td className="px-2 py-1 text-right">{formatarMoeda(dev.valor)}</td>
                              <td className="px-2 py-1 text-right text-red-600 font-semibold">{dev.diasVencido}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold mb-4 text-gray-900">Contas a Pagar</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-600">Total a Pagar</p>
                      <p className="text-xl font-bold text-orange-600">{formatarMoeda(relatorio.contas.aPagar.total)}</p>
                    </div>
                    <div className={`p-4 rounded ${relatorio.contas.aPagar.vencido > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <p className="text-sm text-gray-600">Vencido</p>
                      <p className={`text-xl font-bold ${relatorio.contas.aPagar.vencido > 0 ? "text-red-600" : "text-green-600"}`}>
                        {formatarMoeda(relatorio.contas.aPagar.vencido)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
