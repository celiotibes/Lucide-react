import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ItemRemunerable } from "../../domain/types";

interface Props {
  entrada: string;
  saidaFinal: string;
  saidaIntervalo?: string;
  retornoIntervalo?: string;
  atividades: ItemRemunerable[];
  totalRemuneracao: number;
}

export function MemoriaCalculo({
  entrada,
  saidaFinal,
  saidaIntervalo,
  retornoIntervalo,
  atividades,
  totalRemuneracao,
}: Props) {
  const [expandido, setExpandido] = useState(true);

  const calcularHoras = (entrada: string, saida: string): number => {
    const [hE, mE] = entrada.split(":").map(Number);
    const [hS, mS] = saida.split(":").map(Number);
    const minutos = (hS * 60 + mS) - (hE * 60 + mE);
    return Math.round((minutos / 60) * 4) / 4; // Arredonda para 0.25h
  };

  const calcularIntervalo = (): number => {
    if (!saidaIntervalo || !retornoIntervalo) return 0;
    return calcularHoras(saidaIntervalo, retornoIntervalo);
  };

  const horasTrabalho = calcularHoras(entrada, saidaFinal);
  const intervaloMinutos = calcularIntervalo() * 60;
  const horasEfetivas = horasTrabalho - calcularIntervalo();

  const agrupadosPorTipo = atividades.reduce(
    (acc, a) => {
      if (!acc[a.tipo]) acc[a.tipo] = [];
      acc[a.tipo].push(a);
      return acc;
    },
    {} as Record<string, ItemRemunerable[]>
  );

  const rotilosRubricas = {
    diaria: "Diária",
    airbnb: "Airbnb",
    urgencia: "Urgência",
    deslocamento: "Deslocamento",
    materiais: "Materiais",
    extra: "Extras",
  };

  return (
    <div className="card" style={{ marginBottom: 16, padding: 14, backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
      <button
        onClick={() => setExpandido(!expandido)}
        style={{
          width: "100%",
          padding: "12px 0",
          border: "none",
          background: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink-base)",
        }}
      >
        <span>Memória de Cálculo</span>
        {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expandido && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--ink-lighter)", paddingTop: 12 }}>
          {/* Horários */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Entrada</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{entrada}</div>
            </div>
            {saidaIntervalo && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Saída intervalo</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{saidaIntervalo}</div>
              </div>
            )}
            {retornoIntervalo && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Retorno intervalo</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{retornoIntervalo}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Saída</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{saidaFinal}</div>
            </div>
          </div>

          {/* Cálculo de horas */}
          <div
            style={{
              padding: 12,
              backgroundColor: "white",
              borderRadius: "4px",
              marginBottom: 12,
              border: "1px solid var(--ink-lighter)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--ink-soft)",
                marginBottom: 4,
              }}
            >
              Horas trabalhadas
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-base)" }}>{horasTrabalho.toFixed(2)}h</div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>({entrada} → {saidaFinal})</div>
            </div>

            {intervaloMinutos > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--ink-softer)", marginBottom: 4 }}>
                  Menos: intervalo de {Math.round(intervaloMinutos)} minutos
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-softer)", marginBottom: 8 }}>
                  = <strong>{horasEfetivas.toFixed(2)}h efetivas</strong>
                </div>
              </>
            )}
          </div>

          {/* Rubricas */}
          {Object.keys(agrupadosPorTipo).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>Rubricas aplicadas</div>
              {Object.entries(agrupadosPorTipo).map(([tipo, itens]) => {
                const subtotal = itens.reduce((s, a) => s + a.valor_final, 0);
                return (
                  <div key={tipo} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--ink-lighter)",
                      }}
                    >
                      <span>{rotilosRubricas[tipo as keyof typeof rotilosRubricas]}</span>
                      <div style={{ textAlign: "right" }}>
                        <div>{itens.length} item(ns)</div>
                        <div style={{ fontWeight: 600 }}>R$ {subtotal.toFixed(2)}</div>
                      </div>
                    </div>
                    {itens.map((item) => (
                      <div key={item.id} style={{ fontSize: 11, color: "var(--ink-soft)", paddingLeft: 12, marginTop: 4 }}>
                        <div>{item.rubrica}</div>
                        <div style={{ color: "var(--ink-softer)" }}>
                          R$ {item.valor_base.toFixed(2)}
                          {item.adicional_percentual > 0 && ` × (1 + ${item.adicional_percentual}%)`} = R$ {item.valor_final.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Total */}
          <div
            style={{
              padding: 12,
              backgroundColor: "#f0f8ff",
              borderRadius: "4px",
              border: "2px solid var(--ink-base)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-base)" }}>Valor total da diária</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-base)" }}>R$ {totalRemuneracao.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
