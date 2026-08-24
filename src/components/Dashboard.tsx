import { useCallback, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, Sankey, Rectangle } from "recharts";
import type { SankeyNodeProps, SankeyLinkProps } from "recharts";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarSerieMensal, gerarDre, resultadoLiquido } from "../domain/reports/dre";
import { gerarCascataDre } from "../domain/reports/dreCascata";
import { gerarHeatmapDespesas } from "../domain/reports/heatmapDespesas";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia, agingPorFaixa } from "../domain/reconcile/inadimplencia";
import { detectarOutliers } from "../domain/auditoria/auditoriaForense";
import { calcularDesempenhoPorImovel, agruparDesempenhoPorCidade } from "../domain/reports/desempenhoPorImovel";
import { gerarFluxoFinanceiro, type NoFluxo } from "../domain/reports/fluxoFinanceiro";
import { formatarMoeda as formatarMoedaCompleta } from "../domain/formatarMoeda";
import { ultimoDiaDoMes } from "../domain/data";
import { KpiTile } from "./KpiTile";
import type { FiltroTransacoesInicial } from "./TransacoesView";
import type { Imovel } from "../domain/types";

const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function formatarMesAbreviado(mesIso: string): string {
  const [ano, mes] = mesIso.split("-");
  return `${MESES_ABREVIADOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// KPIs compactos do painel dispensam centavos — só aqui, no resto do app formatarMoeda()
// usa 2 casas decimais (padrão de formatarMoeda() em domain/formatarMoeda.ts).
function formatarMoeda(valor: number): string {
  return formatarMoedaCompleta(valor, 0);
}

const CORES_COLUNA_FLUXO = ["var(--viz-receita)", "var(--viz-muted)", "var(--viz-despesa)"]; // coluna 0=origem, 1=conta, 2=categoria de destino

interface NoSankeyFluxoProps extends SankeyNodeProps {
  aoDrillDown?: (filtro: FiltroTransacoesInicial) => void;
  dataInicio?: string;
  dataFim?: string;
}

function NoSankeyFluxo({ x, y, width, height, payload, aoDrillDown, dataInicio, dataFim }: NoSankeyFluxoProps) {
  // payload.coluna vem de fluxoFinanceiro.ts (0/1/2, decidido pelo papel do nó no grafo) —
  // não usamos payload.depth (calculado pelo recharts a partir da topologia): uma conta sem
  // nenhuma origem roteada por ela nesta janela viraria "raiz" e ficaria com a cor/posição
  // erradas se a classificação dependesse só da profundidade automática.
  const no = payload as unknown as NoFluxo;
  const cor = CORES_COLUNA_FLUXO[no.coluna] ?? "var(--viz-muted)";
  const aoLadoDireito = no.coluna < 2; // colunas 0/1 escrevem o rótulo à direita do bloco; a última (destino), à esquerda
  // Só há alvo de drill-down em nós de origem ligados a um imóvel ou categoria própria (não em
  // "Outras origens/despesas", que agregam mais de um, nem em nós de conta bancária, sem filtro
  // equivalente ainda em Transações).
  const filtro: FiltroTransacoesInicial | null =
    no.imovelId !== null ? { imovelId: no.imovelId, dataInicio, dataFim } : no.codigo !== null ? { planoContaCodigo: no.codigo, dataInicio, dataFim } : null;
  return (
    <g
      onClick={() => filtro && aoDrillDown?.(filtro)}
      style={{ cursor: filtro && aoDrillDown ? "pointer" : "default" }}
    >
      <Rectangle x={x} y={y} width={width} height={height} fill={cor} fillOpacity={0.85} radius={2}>
        <title>{`${payload.name}: ${formatarMoeda(Number(payload.value))}${filtro && aoDrillDown ? " (clique para ver as transações)" : ""}`}</title>
      </Rectangle>
      <text
        x={aoLadoDireito ? x + width + 8 : x - 8}
        y={y + height / 2}
        textAnchor={aoLadoDireito ? "start" : "end"}
        dominantBaseline="middle"
        fontSize={11.5}
        fill="var(--ink-soft)"
      >
        {payload.name}
      </text>
    </g>
  );
}

function LigacaoSankeyFluxo({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth }: SankeyLinkProps) {
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke="var(--viz-muted)"
      strokeOpacity={0.28}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
}

function corEtapaCascata(tipo: "receita" | "despesa" | "total", valor: number): string {
  if (tipo === "receita") return "var(--viz-receita)";
  if (tipo === "despesa") return "var(--viz-despesa)";
  return valor >= 0 ? "var(--viz-good)" : "var(--viz-critical)";
}

function TooltipCascata({ active, payload }: { active?: boolean; payload?: { payload: { rotulo: string; valor: number; tipo: "receita" | "despesa" | "total" } }[] }) {
  if (!active || !payload?.length) return null;
  const etapa = payload[0].payload;
  return (
    <div className="tooltip-viz">
      <strong>{etapa.rotulo}</strong>
      <div style={{ color: corEtapaCascata(etapa.tipo, etapa.valor) }}>{formatarMoeda(etapa.valor)}</div>
    </div>
  );
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

export function Dashboard({ aoDrillDown }: { aoDrillDown?: (filtro: FiltroTransacoesInicial) => void }) {
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

  const fluxoFinanceiro = useMemo(() => (db ? gerarFluxoFinanceiro(db, dataInicio12m, hoje) : { nodes: [], links: [] }), [db, versao, dataInicio12m, hoje]);
  const cascataDre = useMemo(() => gerarCascataDre(linhasDre12m), [linhasDre12m]);
  const heatmapDespesas = useMemo(
    () => (db ? gerarHeatmapDespesas(db, dataInicio12m, hoje) : { categorias: [], meses: [], celulas: [], valorMaximo: 0 }),
    [db, versao, dataInicio12m, hoje],
  );
  // Cruza o mapa de calor com a auditoria forense: célula que contém um lançamento fora da
  // curva (z-score) da própria categoria ganha um indicador visual — vínculo direto entre o
  // achado da aba Auditoria forense e o BI do Painel, sem precisar visitar a outra aba pra
  // saber que aquele mês específico tem algo fora do padrão.
  const celulasComOutlier = useMemo(() => {
    if (!db) return new Set<string>();
    const outliers = detectarOutliers(db, dataInicio12m, hoje);
    return new Set(outliers.map((o) => `${o.planoContaCodigo}|${o.data.slice(0, 7)}`));
  }, [db, versao, dataInicio12m, hoje]);

  // Referência estável (useCallback, não uma arrow function recriada a cada render) — o prop
  // `node` do Sankey do recharts trata identidade de função diferente como um novo tipo de
  // componente e força desmontar/remontar todos os nós SVG do diagrama a cada render do
  // Dashboard não relacionado ao Sankey (ex: trocar o filtro de imóvel do DRE).
  const renderizarNoSankey = useCallback(
    (props: SankeyNodeProps) => <NoSankeyFluxo {...props} aoDrillDown={aoDrillDown} dataInicio={dataInicio12m} dataFim={hoje} />,
    [aoDrillDown, dataInicio12m, hoje],
  );

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
              <option key={i.id} value={i.id}>{i.apelido}{i.uso_pessoal ? " — uso pessoal" : ""}</option>
            ))}
          </select>
        </label>
      </div>
      {imovelFiltroId !== "" && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-8px 0 16px" }}>
          Inclui a fatia de despesas rateadas com este imóvel (condomínio coletivo, obras compartilhadas etc.).
        </p>
      )}
      {imovelFiltroId !== "" && imoveis.find((i) => i.id === imovelFiltroId)?.uso_pessoal === 1 && (
        <div className="aviso-caixa" style={{ margin: "-8px 0 16px" }}>
          Este imóvel é residência própria (uso pessoal) — o "Portfólio inteiro" já o exclui por não fazer parte da
          atividade de locação. Os números abaixo são só desta unidade, isolados por transparência, mas{" "}
          <strong>não representam capacidade contributiva da atividade de locação</strong>.
        </div>
      )}
      <div className="kpi-grid">
        <KpiTile label="Receita" value={formatarMoeda(receitaTotal)} />
        <KpiTile label="Despesa" value={formatarMoeda(Math.abs(despesaTotal))} />
        <KpiTile label="Resultado líquido" value={formatarMoeda(resultado)} variant={resultado >= 0 ? "good" : "critical"} />
        <KpiTile label="Em aberto (inadimplência)" value={formatarMoeda(totalEmAberto)} variant={totalEmAberto > 0 ? "critical" : "good"} />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="section-title">Cascata do resultado (12 meses)</h2>
        <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 14 }}>
          Da receita bruta até o resultado líquido, categoria de despesa por categoria, na ordem de quem mais pesa —
          mostra visualmente como cada corte de despesa "corrói" o resultado, em vez de só listar totais isolados.
          {aoDrillDown && " Clique numa barra de despesa para ver as transações que a compõem."}
        </p>
        <div style={{ width: "100%", height: 300, background: "var(--viz-surface)", borderRadius: 6 }}>
          <ResponsiveContainer>
            <BarChart data={cascataDre} margin={{ top: 10, right: 16, left: 0, bottom: 48 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis
                dataKey="rotulo"
                tick={{ fontSize: 10.5, fill: "var(--viz-muted)" }}
                axisLine={{ stroke: "var(--viz-baseline)" }}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => formatarMoeda(v)} />
              <Tooltip content={<TooltipCascata />} />
              <Bar dataKey="base" stackId="cascata" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="altura" stackId="cascata" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {cascataDre.map((etapa) => (
                  <Cell
                    key={etapa.rotulo}
                    fill={corEtapaCascata(etapa.tipo, etapa.valor)}
                    cursor={etapa.tipo === "despesa" && aoDrillDown ? "pointer" : "default"}
                    onClick={() => {
                      if (etapa.tipo === "despesa" && etapa.codigo && aoDrillDown) {
                        aoDrillDown({
                          planoContaCodigo: etapa.codigo,
                          imovelId: imovelFiltroId === "" ? undefined : imovelFiltroId,
                          dataInicio: dataInicio12m,
                          dataFim: hoje,
                        });
                      }
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
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

      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title">Mapa de calor — despesa por categoria × mês (12 meses)</h2>
        <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 14 }}>
          Intensidade da cor proporcional ao valor gasto naquela categoria naquele mês — identifica visualmente em
          qual mês cada centro de custo pesou mais, sem precisar ler linha a linha. Limitado às {heatmapDespesas.categorias.length} maiores
          categorias do período; o total completo continua nas tabelas acima. Célula com <AlertTriangle size={11} style={{ verticalAlign: "-1px" }} />
          {" "}contém um lançamento fora da curva da própria categoria (achado da Auditoria forense).
          {aoDrillDown && " Clique numa célula para ver as transações que a compõem."}
        </p>
        {heatmapDespesas.categorias.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma despesa lançada no período para montar o mapa de calor.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  {heatmapDespesas.meses.map((mes) => (
                    <th key={mes} className="num">{formatarMesAbreviado(mes)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapDespesas.categorias.map((categoria) => (
                  <tr key={categoria}>
                    <td>{categoria}</td>
                    {heatmapDespesas.meses.map((mes) => {
                      const celula = heatmapDespesas.celulas.find((c) => c.categoria === categoria && c.mes === mes);
                      const valor = celula?.valor ?? 0;
                      const intensidade = heatmapDespesas.valorMaximo > 0 ? Math.round((valor / heatmapDespesas.valorMaximo) * 100) : 0;
                      const temOutlier = celula ? celulasComOutlier.has(`${celula.codigo}|${celula.mes}`) : false;
                      return (
                        <td
                          key={mes}
                          className="num"
                          onClick={() => {
                            if (celula && aoDrillDown) {
                              aoDrillDown({ planoContaCodigo: celula.codigo, dataInicio: `${celula.mes}-01`, dataFim: ultimoDiaDoMes(celula.mes) });
                            }
                          }}
                          title={temOutlier ? "Contém lançamento fora da curva da própria categoria (achado da Auditoria forense)" : undefined}
                          style={{
                            background: valor > 0 ? `color-mix(in srgb, var(--viz-despesa) ${Math.max(intensidade, 12)}%, var(--viz-surface))` : undefined,
                            color: intensidade > 45 ? "#fff" : undefined,
                            fontSize: 12,
                            cursor: valor > 0 && aoDrillDown ? "pointer" : undefined,
                            position: "relative",
                          }}
                        >
                          {valor > 0 ? formatarMoeda(valor) : ""}
                          {temOutlier && <AlertTriangle size={10} style={{ position: "absolute", top: 2, right: 2 }} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title">Fluxo do dinheiro (12 meses)</h2>
        <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 14 }}>
          De onde o dinheiro entra (aluguel por imóvel, salário e outras entradas), por qual conta bancária passa,
          e para onde sai (categoria de despesa — inclui despesas pessoais e financiamento). O ponto deste
          diagrama: mostrar visualmente que receita de aluguel e renda pessoal atravessam as mesmas contas de onde
          saem despesas pessoais, evidenciando que não há segregação entre o fluxo de caixa da atividade e o fluxo
          pessoal. Portfólios grandes têm as maiores origens/despesas nomeadas e o resto agrupado em "Outras", para
          o diagrama continuar legível. Exclui transferência entre contas próprias e caução — mudar de conta não é
          "receber" nem "gastar".
          {aoDrillDown && " Clique num bloco de origem ou destino para ver as transações que o compõem."}
        </p>
        {fluxoFinanceiro.links.length > 0 ? (
          <div style={{ width: "100%", height: 460 }}>
            <ResponsiveContainer>
              <Sankey
                data={fluxoFinanceiro}
                nodeWidth={12}
                nodePadding={18}
                margin={{ top: 8, right: 160, bottom: 8, left: 160 }}
                link={LigacaoSankeyFluxo}
                node={renderizarNoSankey}
              >
                <Tooltip formatter={(valor) => formatarMoeda(Number(valor))} />
              </Sankey>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Sem receita e despesa lançadas simultaneamente no período para montar o fluxo.</p>
        )}
      </div>
    </div>
  );
}
