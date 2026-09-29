import { useMemo, useState } from "react";
import { TrendingUp, Plus } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "../ui/useToast";
import {
  registrarAvaliacaoMercado,
  listarAvaliacoesMercado,
  relatorioPatrimonioMercado,
  calcularIndicadoresViabilidade,
} from "../domain/patrimonio/avaliacaoMercado";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

function formatarPercentual(valor: number | null, casasDecimais = 1): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(casasDecimais)}%`;
}

function formatarData(data: string | null): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

interface RascunhoAvaliacao {
  valorAvaliado: string;
  dataAvaliacao: string;
  metodologia: string;
  fonte: string;
  observacoes: string;
}

function rascunhoVazio(): RascunhoAvaliacao {
  return {
    valorAvaliado: "",
    dataAvaliacao: new Date().toISOString().slice(0, 10),
    metodologia: "",
    fonte: "",
    observacoes: "",
  };
}

export function AvaliacaoMercadoView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [imovelSelecionadoId, setImovelSelecionadoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoAvaliacao>(rascunhoVazio());

  const relatorio = useMemo(() => (db ? relatorioPatrimonioMercado(db) : null), [db, versao]);
  const indicadores = useMemo(() => (db ? calcularIndicadoresViabilidade(db) : null), [db, versao]);

  const indicadoresPorImovel = useMemo(() => {
    const mapa = new Map<number, { noiAnual: number; capRatePercentual: number | null; roiPercentual: number | null }>();
    indicadores?.imoveis.forEach((i) =>
      mapa.set(i.imovelId, { noiAnual: i.noiAnual, capRatePercentual: i.capRatePercentual, roiPercentual: i.roiPercentual }),
    );
    return mapa;
  }, [indicadores]);

  const historicoSelecionado = useMemo(
    () => (db && imovelSelecionadoId !== null ? listarAvaliacoesMercado(db, imovelSelecionadoId) : []),
    [db, versao, imovelSelecionadoId],
  );

  const linhaSelecionada = useMemo(
    () => relatorio?.linhas.find((l) => l.imovelId === imovelSelecionadoId) ?? null,
    [relatorio, imovelSelecionadoId],
  );

  function atualizarRascunho(campos: Partial<RascunhoAvaliacao>) {
    setRascunho((atual) => ({ ...atual, ...campos }));
  }

  function selecionarImovel(id: number) {
    setImovelSelecionadoId((atual) => (atual === id ? null : id));
    setMostrarForm(false);
    setRascunho(rascunhoVazio());
  }

  async function registrarNovaAvaliacao() {
    if (!db || imovelSelecionadoId === null) return;
    try {
      const valorAvaliado = Number.parseFloat(rascunho.valorAvaliado.replace(",", "."));
      registrarAvaliacaoMercado(db, {
        imovelId: imovelSelecionadoId,
        valorAvaliado,
        dataAvaliacao: rascunho.dataAvaliacao,
        metodologia: rascunho.metodologia.trim() || undefined,
        fonte: rascunho.fonte.trim() || undefined,
        observacoes: rascunho.observacoes.trim() || undefined,
      });
      await persistir();
      setRascunho(rascunhoVazio());
      setMostrarForm(false);
      avisar("good", "Avaliação de mercado registrada.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao registrar avaliação.");
    }
  }

  if (!db || !relatorio || !indicadores) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <TrendingUp size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Avaliação a valor de mercado ({relatorio.linhas.length} imóveis)
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20 }}>
        <strong>Esta tela é gerencial</strong> — usa valor de mercado para análise de negócio (viabilidade, ROI,
        indicadores). Os relatórios oficiais (DRE, Balanço) continuam a valor histórico, para fins fiscais/periciais,
        e <strong>não são afetados por nada aqui</strong>.
      </div>

      {/* Consolidado do portfólio */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KpiTile label="Valor histórico (portfólio)" value={formatarMoeda(relatorio.totalHistorico)} />
        <KpiTile label="Valor de mercado (portfólio)" value={formatarMoeda(relatorio.totalMercado)} />
        <KpiTile
          label="Diferença"
          value={`${formatarMoeda(relatorio.diferencaTotalAbsoluta)} (${formatarPercentual(relatorio.diferencaTotalPercentual)})`}
          variant={relatorio.diferencaTotalAbsoluta >= 0 ? "good" : "critical"}
        />
        <KpiTile label="NOI anual (imóveis com avaliação)" value={formatarMoeda(indicadores.noiAnualTotalConsiderado)} />
        <KpiTile
          label="Cap Rate consolidado"
          value={formatarPercentual(indicadores.capRateConsolidadoPercentual, 2)}
          variant={
            indicadores.capRateConsolidadoPercentual !== null
              ? indicadores.capRateConsolidadoPercentual >= 0
                ? "good"
                : "critical"
              : undefined
          }
        />
        <KpiTile label="ROI simples consolidado" value={formatarPercentual(indicadores.roiConsolidadoPercentual, 2)} />
      </div>
      {indicadores.imoveisSemAvaliacaoMercado > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-12px 0 16px" }}>
          {indicadores.imoveisSemAvaliacaoMercado} imóvel(is) sem nenhuma avaliação de mercado cadastrada — excluído(s)
          do NOI/Cap Rate/ROI consolidados acima (mas listado(s) abaixo).
        </p>
      )}

      {/* Lista: histórico x mercado, lado a lado */}
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Cidade</th>
              <th>Valor histórico</th>
              <th>Valor de mercado</th>
              <th>Diferença</th>
              <th>Última avaliação</th>
              <th>NOI anual</th>
              <th>Cap Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {relatorio.linhas.map((linha) => {
              const indicador = indicadoresPorImovel.get(linha.imovelId);
              return (
                <tr key={linha.imovelId} onClick={() => selecionarImovel(linha.imovelId)} style={{ cursor: "pointer" }}>
                  <td>{linha.apelido}</td>
                  <td>{linha.cidade ?? "—"}</td>
                  <td>{formatarMoeda(linha.valorHistorico)}</td>
                  <td>{linha.valorMercado !== null ? formatarMoeda(linha.valorMercado) : "sem avaliação"}</td>
                  <td>
                    {linha.diferencaAbsoluta !== null ? (
                      <span className={`pill ${linha.diferencaAbsoluta >= 0 ? "good" : "critical"}`}>
                        {formatarMoeda(linha.diferencaAbsoluta)} ({formatarPercentual(linha.diferencaPercentual)})
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatarData(linha.dataUltimaAvaliacao)}</td>
                  <td>{formatarMoeda(indicador?.noiAnual ?? 0)}</td>
                  <td>{formatarPercentual(indicador?.capRatePercentual ?? null, 2)}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selecionarImovel(linha.imovelId);
                      }}
                    >
                      {imovelSelecionadoId === linha.imovelId ? "Fechar" : "Ver histórico"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detalhe do imóvel selecionado */}
      {linhaSelecionada && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "block", marginBottom: 12 }}>
            Histórico de avaliações — {linhaSelecionada.apelido}
          </strong>

          {historicoSelecionado.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
              Nenhuma avaliação registrada ainda para este imóvel
              {linhaSelecionada.origemValorMercado === "cache_imoveis"
                ? " (o valor de mercado mostrado acima veio do cadastro do imóvel, não desta série histórica)."
                : "."}
            </p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor avaliado</th>
                    <th>Metodologia</th>
                    <th>Fonte</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoSelecionado.map((a) => (
                    <tr key={a.id}>
                      <td>{formatarData(a.data_avaliacao)}</td>
                      <td>{formatarMoeda(a.valor_avaliado)}</td>
                      <td>{a.metodologia ?? "—"}</td>
                      <td>{a.fonte ?? "—"}</td>
                      <td>{a.observacoes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn primary" onClick={() => setMostrarForm((v) => !v)}>
            <Plus size={14} /> {mostrarForm ? "Fechar formulário" : "Registrar nova avaliação"}
          </button>

          {mostrarForm && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Valor avaliado
                  <input
                    className="btn"
                    style={{ cursor: "text", width: "100%", marginTop: 4 }}
                    value={rascunho.valorAvaliado}
                    onChange={(e) => atualizarRascunho({ valorAvaliado: e.target.value })}
                    placeholder="ex: 320000"
                  />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Data da avaliação
                  <input
                    type="date"
                    className="btn"
                    style={{ width: "100%", marginTop: 4 }}
                    value={rascunho.dataAvaliacao}
                    onChange={(e) => atualizarRascunho({ dataAvaliacao: e.target.value })}
                  />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Metodologia (opcional)
                  <input
                    className="btn"
                    style={{ cursor: "text", width: "100%", marginTop: 4 }}
                    value={rascunho.metodologia}
                    onChange={(e) => atualizarRascunho({ metodologia: e.target.value })}
                    placeholder="comparativo de mercado, IPTU/venal…"
                  />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Fonte (opcional)
                  <input
                    className="btn"
                    style={{ cursor: "text", width: "100%", marginTop: 4 }}
                    value={rascunho.fonte}
                    onChange={(e) => atualizarRascunho({ fonte: e.target.value })}
                    placeholder="corretor, estimativa própria…"
                  />
                </label>
              </div>
              <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
                Observações (opcional)
                <input
                  className="btn"
                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                  value={rascunho.observacoes}
                  onChange={(e) => atualizarRascunho({ observacoes: e.target.value })}
                />
              </label>
              <button
                className="btn primary"
                onClick={registrarNovaAvaliacao}
                disabled={!rascunho.valorAvaliado.trim() || !rascunho.dataAvaliacao}
              >
                Salvar avaliação
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
