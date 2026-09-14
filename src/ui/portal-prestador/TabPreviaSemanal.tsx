import { useMemo, useState } from "react";
import type { Database } from "sql.js";
import { Calendar, Download, Send, AlertCircle } from "lucide-react";
import { consultar } from "../../db/connection";
import type { ApontamentoDiario, ItemRemunerable, FechamentoSemanal } from "../../domain/types";

interface Props {
  db: Database | null;
  prestadorId: number;
  dataSelecionada: string;
  versao: number;
}

export function TabPreviaSemanal({ db, prestadorId, dataSelecionada, versao }: Props) {
  const [mostrarmemoria, setMostraMemoria] = useState(false);

  const [inicioSemana, fimSemana] = useMemo(() => {
    const data = new Date(dataSelecionada);
    const dia = data.getDay();
    const diff = data.getDate() - dia + (dia === 0 ? -6 : 1); // Ajusta para segunda
    const segunda = new Date(data.setDate(diff));
    const domingo = new Date(segunda);
    domingo.setDate(domingo.getDate() + 6);

    return [
      segunda.toISOString().split("T")[0],
      domingo.toISOString().split("T")[0],
    ];
  }, [dataSelecionada]);

  const apontamentosSemana = useMemo<ApontamentoDiario[]>(
    () =>
      db
        ? consultar<ApontamentoDiario>(
            db,
            "SELECT * FROM apontamentos_diarios WHERE prestador_id = ? AND data BETWEEN ? AND ? ORDER BY data",
            [prestadorId, inicioSemana, fimSemana]
          )
        : [],
    [db, versao, prestadorId, inicioSemana, fimSemana]
  );

  const ativiadadesSemana = useMemo<ItemRemunerable[]>(() => {
    if (!db || apontamentosSemana.length === 0) return [];
    const ids = apontamentosSemana.map((a) => a.id);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    return consultar<ItemRemunerable>(
      db,
      `SELECT * FROM itens_remuneraveis WHERE apontamento_id IN (${placeholders}) ORDER BY criado_em`,
      ids
    );
  }, [db, versao, apontamentosSemana]);

  const calcularHoras = (entrada: string, saida: string, saidaIntervalo?: string, retornoIntervalo?: string): number => {
    const [hE, mE] = entrada.split(":").map(Number);
    const [hS, mS] = saida.split(":").map(Number);
    let minutos = (hS * 60 + mS) - (hE * 60 + mE);

    if (saidaIntervalo && retornoIntervalo) {
      const [hSI, mSI] = saidaIntervalo.split(":").map(Number);
      const [hRI, mRI] = retornoIntervalo.split(":").map(Number);
      const minutosIntervalo = (hRI * 60 + mRI) - (hSI * 60 + mSI);
      minutos -= minutosIntervalo;
    }

    return Math.round((minutos / 60) * 4) / 4; // Arredonda para 0.25h
  };

  const resumoSemana = useMemo(
    () => ({
      diasTrabalhados: apontamentosSemana.filter((a) => a.entrada && a.saida_final).length,
      totalHoras: apontamentosSemana.reduce(
        (sum, a) => sum + (a.entrada && a.saida_final ? calcularHoras(a.entrada, a.saida_final, a.saida_intervalo, a.retorno_intervalo) : 0),
        0
      ),
      totalRemuneracao: ativiadadesSemana.reduce((sum, a) => sum + a.valor_final, 0),
      apontamentosRascunho: apontamentosSemana.filter((a) => a.status === "rascunho").length,
      apontamentosEnviados: apontamentosSemana.filter((a) => a.status === "enviado").length,
    }),
    [apontamentosSemana, ativiadadesSemana]
  );

  const ePracSexta = () => {
    const hoje = new Date(dataSelecionada);
    return hoje.getDay() === 5; // Sexta-feira
  };

  const agrupadosPorTipo = useMemo(
    () =>
      ativiadadesSemana.reduce(
        (acc, a) => {
          if (!acc[a.tipo]) acc[a.tipo] = 0;
          acc[a.tipo] += a.valor_final;
          return acc;
        },
        {} as Record<string, number>
      ),
    [ativiadadesSemana]
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Semana de {new Date(inicioSemana).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a{" "}
          {new Date(fimSemana).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
        </h3>

        {resumoSemana.diasTrabalhados === 0 ? (
          <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", padding: 16, backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
            <AlertCircle size={18} color="var(--ink-soft)" />
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Nenhum apontamento registrado nesta semana</span>
          </div>
        ) : (
          <>
            {/* KPIs resumidos */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div className="card" style={{ padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Dias trabalhados</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-base)" }}>{resumoSemana.diasTrabalhados}</div>
              </div>
              <div className="card" style={{ padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Horas totais</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-base)" }}>{resumoSemana.totalHoras.toFixed(1)}h</div>
              </div>
              <div className="card" style={{ padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Faturamento</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--viz-good)" }}>
                  R$ {resumoSemana.totalRemuneracao.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Detalhe diário */}
            <div className="card" style={{ marginBottom: 20, padding: 14, backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={14} /> Detalhamento por dia
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {apontamentosSemana.map((apt) => {
                  const horas = apt.entrada && apt.saida_final ? calcularHoras(apt.entrada, apt.saida_final, apt.saida_intervalo, apt.retorno_intervalo) : 0;
                  const atividades = ativiadadesSemana.filter((a) => a.apontamento_id === apt.id);
                  const total = atividades.reduce((s, a) => s + a.valor_final, 0);

                  return (
                    <div key={apt.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px", borderBottom: "1px solid var(--ink-lighter)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(apt.data).toLocaleDateString("pt-BR", { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                          {apt.entrada} - {apt.saida_final} ({horas.toFixed(1)}h)
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>R$ {total.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                          {apt.status === "rascunho" ? "Rascunho" : apt.status === "enviado" ? "Enviado" : "Aprovado"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rubricas aplicadas */}
            {Object.keys(agrupadosPorTipo).length > 0 && (
              <div className="card" style={{ marginBottom: 20, padding: 14 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Rubricas aplicadas</h4>
                {Object.entries(agrupadosPorTipo).map(([tipo, valor]) => (
                  <div key={tipo} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--ink-lighter)" }}>
                    <span style={{ fontSize: 12, textTransform: "capitalize" }}>{tipo}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>R$ {valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Status e ações */}
            <div className="card" style={{ marginBottom: 20, padding: 14, backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600 }}>Status de envio</h4>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {resumoSemana.apontamentosRascunho} rascunho • {resumoSemana.apontamentosEnviados} enviado(s)
                </div>
              </div>

              {resumoSemana.apontamentosRascunho > 0 && (
                <div style={{ backgroundColor: "white", padding: 12, borderRadius: "4px", marginBottom: 12, fontSize: 12, color: "var(--ink-soft)" }}>
                  <strong>Atenção:</strong> Existem {resumoSemana.apontamentosRascunho} apontamento(s) em rascunho que não foram enviados para aprovação.
                </div>
              )}

              {ePracSexta() && (
                <button
                  className="btn primary"
                  style={{ width: "100%", padding: "12px 16px" }}
                  onClick={() => setMostraMemoria(!mostrarmemoria)}
                >
                  <Send size={14} />
                  Enviar prévia semanal
                </button>
              )}

              {!ePracSexta() && (
                <div style={{ padding: 12, backgroundColor: "white", borderRadius: "4px", fontSize: 12, color: "var(--ink-soft)", textAlign: "center" }}>
                  Envio liberado apenas às sextas-feiras
                </div>
              )}
            </div>

            {/* Memória de Cálculo */}
            {mostrarmemoria && (
              <div className="card" style={{ padding: 14, backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Memória de cálculo detalhada</h4>
                <div style={{ fontSize: 12, lineHeight: "1.6", color: "var(--ink-soft)" }}>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Total de horas trabalhadas:</strong> {resumoSemana.totalHoras.toFixed(2)}h
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Total de rubricas:</strong> R$ {resumoSemana.totalRemuneracao.toFixed(2)}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Descontos:</strong> R$ 0,00 (nenhum desconto registrado)
                  </div>
                  <div style={{ padding: 12, backgroundColor: "white", borderRadius: "4px", border: "2px solid var(--ink-base)" }}>
                    <strong style={{ color: "var(--ink-base)", fontSize: 14 }}>Valor total a receber: R$ {resumoSemana.totalRemuneracao.toFixed(2)}</strong>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  <button className="btn primary" style={{ flex: 1, padding: "10px 12px" }}>
                    <Download size={14} />
                    Exportar PDF
                  </button>
                  <button className="btn primary" style={{ flex: 1, padding: "10px 12px" }}>
                    <Send size={14} />
                    Confirmar envio
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
