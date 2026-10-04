import { useMemo, useState } from "react";
import { Building2, Calculator, Info, Loader2, TrendingUp } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "../ui/useToast";
import { consultar } from "../db/connection";
import type { Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import {
  atualizarStatusProjeto,
  calcularViabilidadeProjeto,
  compararProjetos,
  criarProjetoExpansao,
  listarProjetosExpansao,
  type ProjetoExpansao,
  type StatusProjetoExpansao,
  type ViabilidadeProjetoExpansao,
} from "../domain/dividas/projetosExpansao";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatarPercentual(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(1)}%`;
}

function formatarAnos(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(2)} anos`;
}

const LABEL_STATUS: Record<StatusProjetoExpansao, string> = {
  rascunho: "Rascunho",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  descartado: "Descartado",
};

const VARIANT_STATUS: Record<StatusProjetoExpansao, "good" | "warning" | "critical" | undefined> = {
  rascunho: undefined,
  em_analise: "warning",
  aprovado: "good",
  descartado: "critical",
};

/** Mesmo padrão de legenda explicativa de fórmula/fonte visível de `IndicadoresGestaoView.tsx`
 * (componente `LegendaFormula` local lá, não exportado — replicado aqui com o mesmo visual). */
function LegendaFormula({ formula, fonte }: { formula: string; fonte: string }) {
  return (
    <p
      title={`Fórmula: ${formula}\n\nFonte dos dados: ${fonte}`}
      style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "-6px 0 14px", lineHeight: 1.5 }}
    >
      <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      <strong>Fórmula:</strong> {formula}
      <br />
      <strong>Fonte:</strong> {fonte}
    </p>
  );
}

interface FormNovoProjeto {
  imovelId: string; // "" = nenhum (unidade nova hipotética)
  descricao: string;
  custoObraEstimado: string;
  receitaAdicionalMensalEstimada: string;
  despesaAdicionalMensalEstimada: string;
  dataEstimativa: string;
  observacoes: string;
}

function formVazio(): FormNovoProjeto {
  return {
    imovelId: "",
    descricao: "",
    custoObraEstimado: "",
    receitaAdicionalMensalEstimada: "",
    despesaAdicionalMensalEstimada: "",
    dataEstimativa: hojeIso(),
    observacoes: "",
  };
}

function parseNumero(texto: string): number {
  return Number.parseFloat(texto.replace(",", "."));
}

export function ProjetosExpansaoView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [form, setForm] = useState<FormNovoProjeto>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [projetoSelecionadoId, setProjetoSelecionadoId] = useState<number | null>(null);
  const [statusOcupado, setStatusOcupado] = useState<number | null>(null);

  const imoveis = useMemo(() => {
    void versao;
    return db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : [];
  }, [db, versao]);
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  const projetos = useMemo<ProjetoExpansao[]>(() => {
    void versao;
    return db ? listarProjetosExpansao(db) : [];
  }, [db, versao]);

  const projetoSelecionado = projetoSelecionadoId ?? projetos[0]?.id ?? null;

  const viabilidadeSelecionada: ViabilidadeProjetoExpansao | null = useMemo(() => {
    if (!db || projetoSelecionado === null) return null;
    try {
      return calcularViabilidadeProjeto(db, projetoSelecionado);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, projetoSelecionado]);

  const projetosEmAnalise = useMemo(() => projetos.filter((p) => p.status === "em_analise"), [projetos]);

  const comparacao: ViabilidadeProjetoExpansao[] = useMemo(() => {
    if (!db || projetosEmAnalise.length < 2) return [];
    try {
      return compararProjetos(db, projetosEmAnalise.map((p) => p.id));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, projetosEmAnalise]);

  async function criarProjeto() {
    if (!db) return;
    setSalvando(true);
    try {
      const id = criarProjetoExpansao(db, {
        imovelId: form.imovelId ? Number(form.imovelId) : null,
        descricao: form.descricao,
        custoObraEstimado: parseNumero(form.custoObraEstimado),
        receitaAdicionalMensalEstimada: parseNumero(form.receitaAdicionalMensalEstimada),
        despesaAdicionalMensalEstimada: form.despesaAdicionalMensalEstimada.trim() === "" ? 0 : parseNumero(form.despesaAdicionalMensalEstimada),
        dataEstimativa: form.dataEstimativa,
        observacoes: form.observacoes.trim() || null,
      });
      await persistir();
      setForm(formVazio());
      setProjetoSelecionadoId(id);
      avisar("good", "Projeto de expansão criado em rascunho.");
    } catch (erro) {
      avisar("critical", `Não foi possível criar o projeto: ${(erro as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: number, novoStatus: StatusProjetoExpansao) {
    if (!db) return;
    setStatusOcupado(id);
    try {
      atualizarStatusProjeto(db, id, novoStatus);
      await persistir();
      avisar("good", `Status atualizado para "${LABEL_STATUS[novoStatus]}".`);
    } catch (erro) {
      avisar("critical", `Não foi possível mudar o status: ${(erro as Error).message}`);
    } finally {
      setStatusOcupado(null);
    }
  }

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Building2 size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Projetos de expansão — calculadora de viabilidade
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Calculator size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>Calculadora de viabilidade</strong> — os valores de custo/receita são estimativas fornecidas por
          você, não dados oficiais de mercado. Reavalie antes de decidir.
        </span>
      </div>

      {/* Formulário: novo projeto */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 10, fontWeight: 600 }}>
          Novo projeto de expansão
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", gridColumn: "1 / -1" }}>
            Descrição
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              placeholder="ex: construir 2 kitnets no fundo do lote"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Imóvel associado (opcional)
            <select
              className="btn"
              style={{ width: "100%", marginTop: 4 }}
              value={form.imovelId}
              onChange={(e) => setForm({ ...form, imovelId: e.target.value })}
            >
              <option value="">— unidade nova hipotética —</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.apelido}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Custo de obra estimado (R$)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={form.custoObraEstimado}
              onChange={(e) => setForm({ ...form, custoObraEstimado: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Receita adicional mensal estimada (R$)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={form.receitaAdicionalMensalEstimada}
              onChange={(e) => setForm({ ...form, receitaAdicionalMensalEstimada: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Despesa adicional mensal estimada (R$)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              placeholder="0"
              value={form.despesaAdicionalMensalEstimada}
              onChange={(e) => setForm({ ...form, despesaAdicionalMensalEstimada: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Data da estimativa
            <input
              type="date"
              className="btn"
              style={{ width: "100%", marginTop: 4 }}
              value={form.dataEstimativa}
              onChange={(e) => setForm({ ...form, dataEstimativa: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", gridColumn: "1 / -1" }}>
            Observações (opcional)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </label>
        </div>
        <button className="btn primary" disabled={salvando} onClick={criarProjeto}>
          {salvando ? <Loader2 size={13} className="spin" /> : <Building2 size={13} />} Criar projeto
        </button>
      </div>

      {/* Lista de projetos */}
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Imóvel</th>
              <th>Status</th>
              <th className="num">Custo de obra</th>
              <th className="num">Payback</th>
              <th className="num">Yield anual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projetos.map((p) => {
              let payback: number | null = null;
              let yieldAnual: number | null = null;
              try {
                const v = calcularViabilidadeProjeto(db, p.id);
                payback = v.paybackSimplesAnos.valor;
                yieldAnual = v.yieldAnual.valor;
              } catch {
                /* linha some da lista de indicadores se o cálculo falhar; a linha da tabela continua */
              }
              return (
                <tr
                  key={p.id}
                  style={{ cursor: "pointer", background: projetoSelecionado === p.id ? "var(--surface-2)" : undefined }}
                  onClick={() => setProjetoSelecionadoId(p.id)}
                >
                  <td>{p.descricao}</td>
                  <td>{p.imovel_id !== null ? imoveisPorId.get(p.imovel_id)?.apelido ?? `#${p.imovel_id}` : "— unidade nova —"}</td>
                  <td>
                    <span className={`pill ${VARIANT_STATUS[p.status] ?? ""}`}>{LABEL_STATUS[p.status]}</span>
                  </td>
                  <td className="num">{formatarMoeda(p.custo_obra_estimado)}</td>
                  <td className="num">{formatarAnos(payback)}</td>
                  <td className="num">{formatarPercentual(yieldAnual)}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjetoSelecionadoId(p.id);
                      }}
                    >
                      Ver detalhe
                    </button>
                  </td>
                </tr>
              );
            })}
            {projetos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum projeto de expansão cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detalhe do projeto selecionado */}
      {viabilidadeSelecionada && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 600 }}>
                Detalhe do projeto
              </div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{viabilidadeSelecionada.descricao}</div>
              <span className={`pill ${VARIANT_STATUS[viabilidadeSelecionada.status] ?? ""}`}>
                {LABEL_STATUS[viabilidadeSelecionada.status]}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {viabilidadeSelecionada.status === "rascunho" && (
                <button
                  className="btn primary"
                  style={{ padding: "6px 10px", fontSize: 12.5 }}
                  disabled={statusOcupado === viabilidadeSelecionada.projetoId}
                  onClick={() => mudarStatus(viabilidadeSelecionada.projetoId, "em_analise")}
                >
                  Enviar para análise
                </button>
              )}
              {viabilidadeSelecionada.status === "em_analise" && (
                <button
                  className="btn primary"
                  style={{ padding: "6px 10px", fontSize: 12.5 }}
                  disabled={statusOcupado === viabilidadeSelecionada.projetoId}
                  onClick={() => mudarStatus(viabilidadeSelecionada.projetoId, "aprovado")}
                >
                  Aprovar
                </button>
              )}
              {(viabilidadeSelecionada.status === "rascunho" || viabilidadeSelecionada.status === "em_analise") && (
                <button
                  className="btn"
                  style={{ padding: "6px 10px", fontSize: 12.5 }}
                  disabled={statusOcupado === viabilidadeSelecionada.projetoId}
                  onClick={() => mudarStatus(viabilidadeSelecionada.projetoId, "descartado")}
                >
                  Descartar
                </button>
              )}
              {(viabilidadeSelecionada.status === "aprovado" || viabilidadeSelecionada.status === "descartado") && (
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Status terminal — sem novas transições.</span>
              )}
            </div>
          </div>

          <div className="kpi-grid" style={{ marginBottom: 4 }}>
            <KpiTile label="Custo de obra estimado" value={formatarMoeda(viabilidadeSelecionada.custoObraEstimado)} />
            <KpiTile label="Receita adicional mensal" value={formatarMoeda(viabilidadeSelecionada.receitaAdicionalMensalEstimada)} />
            <KpiTile label="Despesa adicional mensal" value={formatarMoeda(viabilidadeSelecionada.despesaAdicionalMensalEstimada)} />
            <KpiTile
              label="Fluxo de caixa líquido mensal"
              value={formatarMoeda(viabilidadeSelecionada.fluxoCaixaLiquidoMensal.valor ?? 0)}
              variant={
                viabilidadeSelecionada.fluxoCaixaLiquidoMensal.valor !== null
                  ? viabilidadeSelecionada.fluxoCaixaLiquidoMensal.valor > 0
                    ? "good"
                    : "critical"
                  : undefined
              }
            />
          </div>
          <LegendaFormula
            formula={viabilidadeSelecionada.fluxoCaixaLiquidoMensal.formula}
            fonte={viabilidadeSelecionada.fluxoCaixaLiquidoMensal.fonteDados}
          />

          <div className="kpi-grid" style={{ marginBottom: 4 }}>
            <KpiTile
              label="Payback simples"
              value={formatarAnos(viabilidadeSelecionada.paybackSimplesAnos.valor)}
              variant={viabilidadeSelecionada.paybackSimplesAnos.valor !== null ? "good" : "critical"}
            />
            <KpiTile
              label="Yield anual do investimento"
              value={formatarPercentual(viabilidadeSelecionada.yieldAnual.valor)}
              variant={
                viabilidadeSelecionada.yieldAnual.valor !== null
                  ? viabilidadeSelecionada.yieldAnual.valor >= 0
                    ? "good"
                    : "critical"
                  : undefined
              }
            />
            <KpiTile label="ROI acumulado em 5 anos" value={formatarPercentual(viabilidadeSelecionada.roiAcumulado5Anos.valor)} />
            <KpiTile label="ROI acumulado em 10 anos" value={formatarPercentual(viabilidadeSelecionada.roiAcumulado10Anos.valor)} />
          </div>
          {viabilidadeSelecionada.paybackSimplesAnos.motivoNulo && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-10px 0 14px" }}>
              Payback indefinido: {viabilidadeSelecionada.paybackSimplesAnos.motivoNulo}
            </p>
          )}
          <LegendaFormula formula={viabilidadeSelecionada.paybackSimplesAnos.formula} fonte={viabilidadeSelecionada.paybackSimplesAnos.fonteDados} />
          <LegendaFormula formula={viabilidadeSelecionada.yieldAnual.formula} fonte={viabilidadeSelecionada.yieldAnual.fonteDados} />
          <LegendaFormula formula={viabilidadeSelecionada.roiAcumulado5Anos.formula} fonte={viabilidadeSelecionada.roiAcumulado5Anos.fonteDados} />
          <LegendaFormula formula={viabilidadeSelecionada.roiAcumulado10Anos.formula} fonte={viabilidadeSelecionada.roiAcumulado10Anos.fonteDados} />

          {viabilidadeSelecionada.comparacaoComImovelExistente && (
            <>
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 600, margin: "16px 0 8px" }}>
                <TrendingUp size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Comparação com o imóvel existente ({viabilidadeSelecionada.comparacaoComImovelExistente.apelido})
              </div>
              {viabilidadeSelecionada.comparacaoComImovelExistente.avaliacao ? (
                <div className="kpi-grid" style={{ marginBottom: 4 }}>
                  <KpiTile
                    label="Yield líquido do imóvel existente"
                    value={formatarPercentual(viabilidadeSelecionada.comparacaoComImovelExistente.yieldLiquidoImovelExistente.valor)}
                  />
                  <KpiTile label="Yield anual do projeto" value={formatarPercentual(viabilidadeSelecionada.yieldAnual.valor)} />
                  <KpiTile
                    label="Diferença (p.p.)"
                    value={
                      viabilidadeSelecionada.comparacaoComImovelExistente.diferencaPontosPercentuais !== null
                        ? `${viabilidadeSelecionada.comparacaoComImovelExistente.diferencaPontosPercentuais > 0 ? "+" : ""}${viabilidadeSelecionada.comparacaoComImovelExistente.diferencaPontosPercentuais.toFixed(1)} p.p.`
                        : "—"
                    }
                  />
                  <KpiTile
                    label="Avaliação"
                    value={
                      viabilidadeSelecionada.comparacaoComImovelExistente.avaliacao === "melhor"
                        ? "Retorno melhor"
                        : viabilidadeSelecionada.comparacaoComImovelExistente.avaliacao === "pior"
                        ? "Retorno pior"
                        : "Retorno parecido"
                    }
                    variant={
                      viabilidadeSelecionada.comparacaoComImovelExistente.avaliacao === "melhor"
                        ? "good"
                        : viabilidadeSelecionada.comparacaoComImovelExistente.avaliacao === "pior"
                        ? "critical"
                        : undefined
                    }
                  />
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                  Comparação indisponível: {viabilidadeSelecionada.comparacaoComImovelExistente.motivoNulo}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Comparação entre projetos em análise (priorização) */}
      {comparacao.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>
            Priorização — projetos em análise, ordenados por payback (menor primeiro)
          </h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descrição</th>
                  <th className="num">Custo de obra</th>
                  <th className="num">Fluxo mensal</th>
                  <th className="num">Payback</th>
                  <th className="num">Yield anual</th>
                  <th className="num">ROI 5a</th>
                  <th className="num">ROI 10a</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((v, indice) => (
                  <tr key={v.projetoId}>
                    <td>{indice + 1}º</td>
                    <td>{v.descricao}</td>
                    <td className="num">{formatarMoeda(v.custoObraEstimado)}</td>
                    <td className="num">{formatarMoeda(v.fluxoCaixaLiquidoMensal.valor ?? 0)}</td>
                    <td className="num">{formatarAnos(v.paybackSimplesAnos.valor)}</td>
                    <td className="num">{formatarPercentual(v.yieldAnual.valor)}</td>
                    <td className="num">{formatarPercentual(v.roiAcumulado5Anos.valor)}</td>
                    <td className="num">{formatarPercentual(v.roiAcumulado10Anos.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
