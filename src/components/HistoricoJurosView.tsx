import { useMemo, useState } from "react";
import { AlertTriangle, Info, Landmark } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useDb } from "../db/useDb";
import { formatarMoeda } from "../domain/formatarMoeda";
import {
  relatorioJurosMensal,
  relatorioJurosAnual,
  type EventoJuros,
  type FonteJuros,
  type RelatorioJurosAnual,
} from "../domain/dividas/historicoJuros";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const NAO_CLASSIFICADO = "não classificado";

const FONTE_LABEL: Record<FonteJuros, string> = {
  exato: "Exato (cronograma)",
  confirmado: "Confirmado (usuário)",
  estimado: "Estimado (taxa × saldo)",
  mora: "Mora (atraso)",
};

const FONTE_VARIANTE: Record<FonteJuros, "good" | "warning" | "critical"> = {
  exato: "good",
  confirmado: "good",
  estimado: "warning",
  mora: "critical",
};

// Paleta de cores para destino no gráfico empilhado — cíclica porque `destino` é texto livre
// (rateioDividas.ts), não um enum fechado; "não classificado" sempre recebe a cor crítica,
// fora da paleta cíclica, para chamar atenção visualmente em vez de se camuflar entre as
// outras fatias (mesmo objetivo do "Destaque visual" pedido para a tela).
const PALETA_DESTINO = ["var(--viz-receita)", "var(--viz-resultado)", "var(--viz-warning)", "var(--viz-serious)", "var(--viz-good)"];

function corDestino(destino: string, indice: number): string {
  return destino === NAO_CLASSIFICADO ? "var(--viz-critical)" : PALETA_DESTINO[indice % PALETA_DESTINO.length];
}

/** Mesmo padrão de legenda explicativa de fórmula/fonte visível de `IndicadoresGestaoView.tsx`
 * / `ProjetosExpansaoView.tsx` (componente local replicado, mesmo visual). */
function LegendaFormula({ formula, fonte }: { formula: string; fonte: string }) {
  return (
    <p
      title={`Fórmula: ${formula}\n\nFonte dos dados: ${fonte}`}
      style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "-4px 0 10px", lineHeight: 1.5 }}
    >
      <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      <strong>Fórmula:</strong> {formula}
      <br />
      <strong>Fonte:</strong> {fonte}
    </p>
  );
}

function ChipsDestino({ quebra }: { quebra: EventoJuros["quebraPorDestino"] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {quebra.map((fatia) => (
        <span
          key={fatia.destino}
          className={`pill ${fatia.destino === NAO_CLASSIFICADO ? "critical" : ""}`}
          title={fatia.destino === NAO_CLASSIFICADO ? "Sem rateio de destino cadastrado — classifique esta dívida." : undefined}
        >
          {fatia.destino}: {formatarMoeda(fatia.valor)}
        </span>
      ))}
    </div>
  );
}

export function HistoricoJurosView() {
  const { db, versao } = useDb();

  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | "">("");

  const relatorioAnoSelecionado = useMemo<RelatorioJurosAnual | null>(() => {
    if (!db) return null;
    try {
      return relatorioJurosAnual(db, ano);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, ano]);

  const eventosMesAMes: EventoJuros[] = useMemo(() => {
    if (!db) return [];
    if (mes === "") return relatorioAnoSelecionado?.eventos ?? [];
    try {
      return relatorioJurosMensal(db, ano, mes).eventos;
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, ano, mes, relatorioAnoSelecionado]);

  const totalMesAMes = useMemo(() => eventosMesAMes.reduce((acc, e) => acc + e.valorJuros, 0), [eventosMesAMes]);

  const naoClassificadoNoRecorte = useMemo(() => {
    const total = eventosMesAMes.reduce((acc, e) => acc + (e.quebraPorDestino.find((f) => f.destino === NAO_CLASSIFICADO)?.valor ?? 0), 0);
    const dividas = new Set(
      eventosMesAMes
        .filter((e) => e.quebraPorDestino.some((f) => f.destino === NAO_CLASSIFICADO && f.valor > 0))
        .map((e) => `${e.dividaTipo}:${e.dividaId}`),
    );
    return { total, quantidadeDividas: dividas.size };
  }, [eventosMesAMes]);

  // Janela de 5 anos terminando no ano selecionado, para o consolidado ano a ano.
  const anos = useMemo(() => Array.from({ length: 5 }, (_, i) => ano - 4 + i), [ano]);
  const relatoriosAnuais = useMemo<RelatorioJurosAnual[]>(() => {
    if (!db) return [];
    return anos
      .map((a) => {
        try {
          return relatorioJurosAnual(db, a);
        } catch {
          return null;
        }
      })
      .filter((r): r is RelatorioJurosAnual => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, anos]);

  const destinosOrdenados = useMemo(() => {
    const totais = new Map<string, number>();
    for (const r of relatoriosAnuais) {
      for (const f of r.totalPorDestino) totais.set(f.destino, (totais.get(f.destino) ?? 0) + f.valor);
    }
    // "não classificado" sempre por último, os demais do maior para o menor total.
    return [...totais.keys()].sort((a, b) => {
      if (a === NAO_CLASSIFICADO) return 1;
      if (b === NAO_CLASSIFICADO) return -1;
      return (totais.get(b) ?? 0) - (totais.get(a) ?? 0);
    });
  }, [relatoriosAnuais]);

  const dadosGraficoAnual = useMemo(
    () =>
      relatoriosAnuais.map((r) => {
        const linha: Record<string, string | number> = { ano: String(r.ano), total: r.totalGeral };
        for (const destino of destinosOrdenados) {
          linha[destino] = r.totalPorDestino.find((f) => f.destino === destino)?.valor ?? 0;
        }
        return linha;
      }),
    [relatoriosAnuais, destinosOrdenados],
  );

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Landmark size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Histórico de juros pagos — por contrato e destino
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>Quatro fontes de dado, nunca misturadas sem rótulo:</strong>
          <br />
          <span className="pill good" style={{ marginRight: 6 }}>Exato</span>
          financiamento SAC/PRICE — decomposto pelo cronograma de amortização, matematicamente exato a partir da taxa contratada.
          <br />
          <span className="pill good" style={{ marginRight: 6 }}>Confirmado</span>
          financiamento &apos;OUTRO&apos; ou dívida de consumo — valor de juros que você revisou e confirmou (extração por IA ou lançamento manual); a IA nunca lança sozinha.
          <br />
          <span className="pill warning" style={{ marginRight: 6 }}>Estimado</span>
          dívida de consumo sem nenhum pagamento confirmado — aproximação (saldo devedor × taxa mensal informada), repetida mês a mês; NUNCA um pagamento real confirmado.
          <br />
          <span className="pill critical" style={{ marginRight: 6 }}>Mora</span>
          juros, multa e correção monetária de contrato de locação em atraso, já reconhecidos no razão contábil (conta 1104/4201).
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Ano
            <input
              type="number"
              className="btn"
              style={{ width: 110, marginTop: 4, cursor: "text" }}
              value={ano}
              onChange={(e) => setAno(Number(e.target.value) || anoAtual)}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Mês
            <select className="btn" style={{ width: 160, marginTop: 4 }} value={mes} onChange={(e) => setMes(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— todos os meses do ano —</option>
              {MESES_PT.map((nome, indice) => (
                <option key={nome} value={indice + 1}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {naoClassificadoNoRecorte.total > 0.005 && (
        <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--viz-critical)" }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--viz-critical)" }} />
          <span>
            <strong>{formatarMoeda(naoClassificadoNoRecorte.total)}</strong> de juros neste recorte estão{" "}
            <strong>sem destino classificado</strong> ({naoClassificadoNoRecorte.quantidadeDividas} dívida(s)/contrato(s)). Um
            evento de mora (contrato de locação) é sempre não classificado — a classificação de destino ainda só existe para
            dívida de consumo e financiamento. Para os demais, cadastre o rateio de destino da dívida para sair desta lista.
          </span>
        </div>
      )}

      {/* Tabela mês a mês */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>
          Descrição mês a mês — {mes === "" ? `ano de ${ano}` : `${MESES_PT[mes - 1]}/${ano}`}
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Total do recorte: <strong>{formatarMoeda(totalMesAMes)}</strong> ({eventosMesAMes.length} evento(s) de juros)
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {mes === "" && <th>Mês</th>}
                <th>Dívida / contrato</th>
                <th>Fonte</th>
                <th className="num">Juros</th>
                <th>Destino</th>
              </tr>
            </thead>
            <tbody>
              {eventosMesAMes.map((evento, indice) => (
                <tr key={`${evento.dividaTipo}-${evento.dividaId}-${evento.data}-${indice}`}>
                  {mes === "" && <td>{MESES_PT[evento.mes - 1]}</td>}
                  <td>{evento.descricaoDivida}</td>
                  <td>
                    <span className={`pill ${FONTE_VARIANTE[evento.fonte]}`} title={`Fórmula: ${evento.formula}\n\nFonte dos dados: ${evento.fonteDados}`}>
                      {FONTE_LABEL[evento.fonte]}
                    </span>
                  </td>
                  <td className="num">{formatarMoeda(evento.valorJuros)}</td>
                  <td>
                    <ChipsDestino quebra={evento.quebraPorDestino} />
                  </td>
                </tr>
              ))}
              {eventosMesAMes.length === 0 && (
                <tr>
                  <td colSpan={mes === "" ? 5 : 4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhum evento de juros encontrado neste recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consolidado ano a ano */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Consolidado ano a ano ({anos[0]}–{anos[anos.length - 1]})</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Soma de todas as fontes (exato, confirmado, estimado e mora), empilhada por destino.
        </p>
        <div style={{ width: "100%", height: 300, background: "var(--viz-surface)", borderRadius: 6, marginBottom: 16 }}>
          <ResponsiveContainer>
            <BarChart data={dadosGraficoAnual} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11.5, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatarMoeda(v)} />
              <Tooltip formatter={(valor: number) => formatarMoeda(valor)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {destinosOrdenados.map((destino, indice) => (
                <Bar key={destino} dataKey={destino} name={destino} stackId="destino" fill={corDestino(destino, indice)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Total</th>
                {destinosOrdenados.map((destino) => (
                  <th key={destino} className="num">
                    {destino}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relatoriosAnuais.map((r) => (
                <tr key={r.ano} style={{ background: r.ano === ano ? "var(--surface-2)" : undefined }}>
                  <td>{r.ano}</td>
                  <td className="num">{formatarMoeda(r.totalGeral)}</td>
                  {destinosOrdenados.map((destino) => (
                    <td key={destino} className="num">
                      {formatarMoeda(r.totalPorDestino.find((f) => f.destino === destino)?.valor ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LegendaFormula
          formula="Soma de valorJuros de todos os eventos (exato + confirmado + estimado + mora) do ano, quebrado por destino via aplicarRateio"
          fonte="domain/dividas/historicoJuros.ts::relatorioJurosAnual"
        />
      </div>
    </div>
  );
}
