import { useState, useMemo } from "react";
import { useDb } from "../db/useDb";
import { gerarRelatorioIntegrado } from "../domain/erp/relatorios-integrados";
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

export function RelatoriosIntegradosView() {
  const { db } = useDb();
  const [tabAtiva, setTabAtiva] = useState<"dre" | "balanco" | "fluxo">("dre");

  // Obter período contábil atual
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

  const [periodoSelecionado, setPeriodoSelecionado] = useState(periodosDisp[0]?.id || 1);

  // Gerar relatórios
  const relatorio = useMemo(() => {
    if (!db) return null;
    return gerarRelatorioIntegrado(db, 1, periodoSelecionado);
  }, [db, periodoSelecionado]);

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
      </div>
    </div>
  );
}
