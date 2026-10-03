import { useState, useMemo } from "react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarRelatorioIntegrado } from "../domain/erp/relatorios-integrados";
import {
  dashboardRentabilidadePorImovel,
  relatorioDespesosPorCentro,
  sincronizarCentrosCustoImoveis,
} from "../domain/erp/alocacao-centros-custo";
import { relatorioRateiosRealizados } from "../domain/erp/automacao-rateios";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { useToast } from "../ui/useToast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

export function RelatoriosIntegradosView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [tabAtiva, setTabAtiva] = useState<"dre" | "balanco" | "fluxo" | "rateio">("dre");
  const [sincronizando, setSincronizando] = useState(false);

  // Obter período contábil atual. consultar() já devolve o array de linhas como objetos
  // ({id, ano, mes}[]) — ao contrário de db.exec()[0]?.values, que devolvia um array de
  // tuplas posicionais (daí o `as Array<[number, number, number]>` que havia aqui).
  const periodosDisp = useMemo(() => {
    if (!db) return [];
    const periodos = consultar<{ id: number; ano: number; mes: number }>(
      db,
      `SELECT id, ano, mes FROM periodos_contabeis ORDER BY ano DESC, mes DESC LIMIT 12`,
    );
    return periodos.map((p) => ({
      id: p.id,
      label: `${p.ano}/${String(p.mes).padStart(2, "0")}`,
    }));
  }, [db]);

  const [periodoSelecionado, setPeriodoSelecionado] = useState(periodosDisp[0]?.id || 1);

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);

  // Gerar relatórios
  const relatorio = useMemo(() => {
    if (!db) return null;
    return gerarRelatorioIntegrado(db, 1, periodoSelecionado);
  }, [db, periodoSelecionado]);

  // Rateio e Centro de Custo: rentabilidade por imóvel, despesas alocadas e reconciliação
  // de rateios (esperado vs. recebido). Recalculam ao trocar de período e após
  // `sincronizarCentrosCustoImoveis` (via `versao`, que muda ao persistir).
  const dashboardRentabilidade = useMemo(() => {
    if (!db || !entidade) return null;
    return dashboardRentabilidadePorImovel(db, entidade.id, periodoSelecionado);
  }, [db, versao, entidade, periodoSelecionado]);

  const despesasPorCentro = useMemo(() => {
    if (!db || !entidade) return [];
    return relatorioDespesosPorCentro(db, entidade.id, periodoSelecionado);
  }, [db, versao, entidade, periodoSelecionado]);

  const rateiosRealizados = useMemo(() => {
    if (!db) return [];
    return relatorioRateiosRealizados(db, periodoSelecionado);
  }, [db, versao, periodoSelecionado]);

  async function sincronizarCentros() {
    if (!db || !entidade) return;
    setSincronizando(true);
    try {
      const criados = sincronizarCentrosCustoImoveis(db, entidade.id);
      await persistir();
      avisar(
        "good",
        criados > 0
          ? `${criados} centro(s) de custo criado(s) para imóveis sem centro.`
          : "Todos os imóveis ativos já têm centro de custo.",
      );
    } catch {
      avisar("critical", "Falha ao sincronizar centros de custo.");
    } finally {
      setSincronizando(false);
    }
  }

  if (!db || !relatorio) {
    return (
      <div className="p-4 text-center">
        <p>Carregando relatórios...</p>
      </div>
    );
  }

  const { dre, balanço, fluxo_caixa, resultado_liquido } = relatorio;

  // Preparar dados para gráfico de DRE
  const dadosDRE = [
    { nome: "Receitas", valor: dre.receitas.total_receitas },
    {
      nome: "Despesas",
      valor: -dre.custos.total_custos,
    },
    { nome: "Resultado", valor: resultado_liquido },
  ];

  // Preparar dados para gráfico de Balanço
  const dadosBalanco = [
    {
      categoria: "Ativo Circulante",
      valor: balanço.ativo.circulante_total,
    },
    {
      categoria: "Ativo Não-Circulante",
      valor: balanço.ativo.nao_circulante_total,
    },
    {
      categoria: "Passivo Circulante",
      valor: balanço.passivo.circulante_total,
    },
    {
      categoria: "Passivo Não-Circulante",
      valor: balanço.passivo.nao_circulante_total,
    },
  ];

  // Preparar dados para fluxo de caixa
  const dadosFluxo = [
    { atividade: "Operacional", valor: fluxo_caixa.operacional.liquido },
    { atividade: "Investimento", valor: fluxo_caixa.investimento.liquido },
    { atividade: "Financiamento", valor: fluxo_caixa.financiamento.liquido },
  ];

  // Preparar dados para gráfico de despesas por centro de custo (total por imóvel)
  const dadosDespesasPorCentro = (() => {
    const porCentro = new Map<string, number>();
    despesasPorCentro.forEach((d) => {
      porCentro.set(d.centro_descricao, (porCentro.get(d.centro_descricao) || 0) + d.valor_total);
    });
    return Array.from(porCentro.entries()).map(([centro, valor]) => ({ centro, valor }));
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Relatórios Integrados</h2>
        <select
          value={periodoSelecionado}
          onChange={(e) => setPeriodoSelecionado(Number(e.target.value))}
          className="px-3 py-2 border rounded"
        >
          {periodosDisp.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiTile
          label="Receita Total"
          value={formatarMoeda(dre.receitas.total_receitas)}
        />
        <KpiTile
          label="Despesa Total"
          value={formatarMoeda(dre.custos.total_custos)}
        />
        <KpiTile
          label="Resultado Líquido"
          value={formatarMoeda(resultado_liquido)}
          variant={resultado_liquido >= 0 ? "good" : "critical"}
        />
        <KpiTile
          label="Saldo Final Caixa"
          value={formatarMoeda(fluxo_caixa.saldo_final)}
        />
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTabAtiva("dre")}
          className={`px-4 py-2 ${tabAtiva === "dre" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          DRE
        </button>
        <button
          onClick={() => setTabAtiva("balanco")}
          className={`px-4 py-2 ${tabAtiva === "balanco" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Balanço
        </button>
        <button
          onClick={() => setTabAtiva("fluxo")}
          className={`px-4 py-2 ${tabAtiva === "fluxo" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Fluxo de Caixa
        </button>
        <button
          onClick={() => setTabAtiva("rateio")}
          className={`px-4 py-2 ${tabAtiva === "rateio" ? "border-b-2 border-blue-500 font-bold" : ""}`}
        >
          Rateio e Centro de Custo
        </button>
      </div>

      {/* Conteúdo por aba */}
      <div className="bg-white rounded border p-4">
        {tabAtiva === "dre" && (
          <div className="space-y-4">
            <h3 className="font-bold">Demonstração de Resultado do Exercício</h3>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosDRE}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
                <Bar dataKey="valor" fill="#3b82f6">
                  {dadosDRE.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        entry.nome === "Resultado"
                          ? resultado_liquido >= 0
                            ? "#10b981"
                            : "#ef4444"
                          : entry.valor > 0
                            ? "#3b82f6"
                            : "#f59e0b"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid-2">
              <div>
                <p className="font-semibold" style={{ fontSize: 13 }}>Receitas por Tipo</p>
                <ul style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Aluguel</span>
                    <span>{formatarMoedaDetalhado(dre.receitas.aluguel)}</span>
                  </li>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Reajustes</span>
                    <span>{formatarMoedaDetalhado(dre.receitas.reajustes)}</span>
                  </li>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Rateios</span>
                    <span>{formatarMoedaDetalhado(dre.receitas.rateios)}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold" style={{ fontSize: 13 }}>Despesas por Tipo</p>
                <ul style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Condomínio</span>
                    <span>{formatarMoedaDetalhado(dre.custos.condominio)}</span>
                  </li>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Manutenção</span>
                    <span>{formatarMoedaDetalhado(dre.custos.manutencao)}</span>
                  </li>
                  <li style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Utilidades</span>
                    <span>{formatarMoedaDetalhado(dre.custos.agua_esgoto + dre.custos.eletricidade)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "balanco" && (
          <div className="space-y-4">
            <h3 className="font-bold">Balanço Patrimonial</h3>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosBalanco}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="categoria" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
                <Bar dataKey="valor" fill="#8b5cf6">
                  {dadosBalanco.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index < 2 ? "#10b981" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="border rounded p-3">
                <p className="font-semibold text-green-600">Ativo Total</p>
                <p className="text-xl font-bold">
                  {formatarMoeda(balanço.ativo.total_ativo)}
                </p>
                <ul className="text-xs space-y-1 mt-2">
                  <li className="flex justify-between">
                    <span>Circulante</span>
                    <span>{formatarMoedaDetalhado(balanço.ativo.circulante_total)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Não-Circulante</span>
                    <span>
                      {formatarMoedaDetalhado(balanço.ativo.nao_circulante_total)}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="border rounded p-3">
                <p className="font-semibold text-red-600">Passivo + PL</p>
                <p className="text-xl font-bold">
                  {formatarMoeda(
                    balanço.passivo.total_passivo + balanço.patrimonio_liquido,
                  )}
                </p>
                <ul className="text-xs space-y-1 mt-2">
                  <li className="flex justify-between">
                    <span>Passivo</span>
                    <span>{formatarMoedaDetalhado(balanço.passivo.total_passivo)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>PL</span>
                    <span>{formatarMoedaDetalhado(balanço.patrimonio_liquido)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "fluxo" && (
          <div className="space-y-4">
            <h3 className="font-bold">Fluxo de Caixa</h3>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosFluxo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="atividade" />
                <YAxis />
                <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
                <Bar dataKey="valor" fill="#06b6d4">
                  {dadosFluxo.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.valor >= 0 ? "#10b981" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="border rounded p-3">
                <p className="font-semibold">Atividades Operacionais</p>
                <ul className="text-xs space-y-1 mt-2">
                  <li className="flex justify-between">
                    <span>Entradas</span>
                    <span className="text-green-600">
                      +{formatarMoedaDetalhado(fluxo_caixa.operacional.entradas)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Saídas</span>
                    <span className="text-red-600">
                      -{formatarMoedaDetalhado(fluxo_caixa.operacional.saidas)}
                    </span>
                  </li>
                  <li className="border-t pt-1 flex justify-between font-bold">
                    <span>Líquido</span>
                    <span>{formatarMoedaDetalhado(fluxo_caixa.operacional.liquido)}</span>
                  </li>
                </ul>
              </div>
              <div className="border rounded p-3">
                <p className="font-semibold">Saldo de Caixa</p>
                <ul className="text-xs space-y-1 mt-2">
                  <li className="flex justify-between">
                    <span>Saldo Inicial</span>
                    <span>{formatarMoedaDetalhado(fluxo_caixa.saldo_inicial)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Variação</span>
                    <span>
                      {formatarMoedaDetalhado(
                        fluxo_caixa.saldo_final - fluxo_caixa.saldo_inicial,
                      )}
                    </span>
                  </li>
                  <li className="border-t pt-1 flex justify-between font-bold">
                    <span>Saldo Final</span>
                    <span>{formatarMoedaDetalhado(fluxo_caixa.saldo_final)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tabAtiva === "rateio" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Rateio e Centro de Custo</h3>
              <button
                className="btn primary"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={sincronizarCentros}
                disabled={sincronizando || !entidade}
              >
                {sincronizando ? "Sincronizando..." : "Sincronizar Centros de Custo"}
              </button>
            </div>

            {/* Dashboard: imóvel com maior/menor rentabilidade */}
            <div className="kpi-grid">
              <KpiTile
                label="Melhor Imóvel"
                value={dashboardRentabilidade?.melhor_imovel?.nome ?? "—"}
                variant={dashboardRentabilidade?.melhor_imovel ? "good" : undefined}
              />
              <KpiTile
                label="Margem do Melhor"
                value={
                  dashboardRentabilidade?.melhor_imovel
                    ? formatarPercentual(dashboardRentabilidade.melhor_imovel.margem)
                    : "—"
                }
                variant={dashboardRentabilidade?.melhor_imovel ? "good" : undefined}
              />
              <KpiTile
                label="Pior Imóvel"
                value={dashboardRentabilidade?.pior_imovel?.nome ?? "—"}
                variant={
                  dashboardRentabilidade?.pior_imovel && dashboardRentabilidade.pior_imovel.margem < 0
                    ? "critical"
                    : undefined
                }
              />
              <KpiTile
                label="Rentabilidade Média"
                value={dashboardRentabilidade ? formatarPercentual(dashboardRentabilidade.rentabilidade_media) : "—"}
                variant={
                  dashboardRentabilidade
                    ? dashboardRentabilidade.rentabilidade_media >= 0
                      ? "good"
                      : "critical"
                    : undefined
                }
              />
            </div>

            {/* Gráfico: despesas totais por centro de custo (imóvel) */}
            {dadosDespesasPorCentro.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosDespesasPorCentro}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="centro" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(v) => formatarMoedaDetalhado(v as number)} />
                  <Bar dataKey="valor" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Tabela: despesas por centro de custo, detalhado por tipo de despesa */}
            <div>
              <p className="font-semibold" style={{ fontSize: 13, marginBottom: 8 }}>
                Despesas por Centro de Custo (Imóvel) — {periodosDisp.find((p) => p.id === periodoSelecionado)?.label ?? ""}
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Centro</th>
                      <th>Tipo de Despesa</th>
                      <th className="num">Valor</th>
                      <th className="num">% do Centro</th>
                      <th className="num">Lançamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasPorCentro.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "#888" }}>
                          Nenhuma despesa alocada a centro de custo neste período.
                        </td>
                      </tr>
                    ) : (
                      despesasPorCentro.map((d, idx) => (
                        <tr key={`${d.centro_codigo}-${d.tipo_despesa}-${idx}`}>
                          <td>{d.centro_descricao}</td>
                          <td>{d.tipo_despesa}</td>
                          <td className="num">{formatarMoedaDetalhado(d.valor_total)}</td>
                          <td className="num">{formatarPercentual(d.percentual_do_centro)}</td>
                          <td className="num">{d.quantidade_lancamentos}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela: rateios realizados — valor esperado vs. recebido por imóvel */}
            <div>
              <p className="font-semibold" style={{ fontSize: 13, marginBottom: 8 }}>
                Rateios Realizados: Esperado vs. Recebido
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Imóvel</th>
                      <th className="num">Esperado</th>
                      <th className="num">Recebido</th>
                      <th className="num">Divergência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateiosRealizados.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", color: "#888" }}>
                          Nenhum imóvel elegível a rateio neste período.
                        </td>
                      </tr>
                    ) : (
                      rateiosRealizados.map((r) => (
                        <tr key={r.imovel_id}>
                          <td>{r.apelido}</td>
                          <td className="num">{formatarMoedaDetalhado(r.valor_rateio_esperado)}</td>
                          <td className="num">{formatarMoedaDetalhado(r.valor_rateio_recebido)}</td>
                          <td className="num">
                            <span className={`pill ${Math.abs(r.divergencia) < 0.01 ? "good" : "warning"}`}>
                              {formatarMoedaDetalhado(r.divergencia)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
