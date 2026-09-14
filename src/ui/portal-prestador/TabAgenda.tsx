import { AlertCircle, Play } from "lucide-react";
import type { ApontamentoDiario } from "../../domain/types";

interface OS {
  id: number;
  titulo: string;
  imovel: string;
  unidade?: string;
  servico: string;
  prioridade: "alta" | "normal" | "baixa";
  data_agendada: string;
}

interface Props {
  prestadorId: number;
  dataSelecionada: string;
  apontamentoHoje: ApontamentoDiario | null;
  onSelecionarApontamento: (apontamento: ApontamentoDiario) => void;
}

export function TabAgenda({ prestadorId, dataSelecionada, apontamentoHoje, onSelecionarApontamento }: Props) {
  // Mock de dados de agenda (em produção, viriam do banco)
  const osDodia: OS[] = [
    {
      id: 1,
      titulo: "Limpeza regular - Unidade 302",
      imovel: "Edifício Aurora",
      unidade: "302",
      servico: "Limpeza residencial",
      prioridade: "normal",
      data_agendada: dataSelecionada,
    },
    {
      id: 2,
      titulo: "Manutenção de ar-condicionado",
      imovel: "Kitnet Florestal",
      unidade: "101",
      servico: "Ar-condicionado",
      prioridade: "alta",
      data_agendada: dataSelecionada,
    },
  ];

  const corPrioridade = (p: string) => {
    switch (p) {
      case "alta":
        return "var(--viz-critical)";
      case "normal":
        return "var(--viz-warn)";
      default:
        return "var(--viz-good)";
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Demandas agendadas para {new Date(dataSelecionada).toLocaleDateString("pt-BR", { weekday: "long", month: "short", day: "numeric" })}
        </h3>

        {osDodia.length === 0 ? (
          <div
            className="card"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: 16,
              backgroundColor: "rgba(0, 0, 0, 0.02)",
            }}
          >
            <AlertCircle size={18} color="var(--ink-soft)" />
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Nenhuma demanda agendada para este dia</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {osDodia.map((os) => (
              <div
                key={os.id}
                className="card"
                style={{
                  padding: 14,
                  borderLeft: `4px solid ${corPrioridade(os.prioridade)}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{os.titulo}</h4>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
                    <div>{os.imovel}</div>
                    {os.unidade && <div>Unidade {os.unidade}</div>}
                    <div style={{ marginTop: 4 }}>Tipo: {os.servico}</div>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: `rgba(${os.prioridade === "alta" ? "255,0,0" : "255,165,0"}, 0.1)`,
                      color: corPrioridade(os.prioridade),
                      fontWeight: 500,
                    }}
                  >
                    {os.prioridade === "alta" ? "Urgente" : os.prioridade === "normal" ? "Normal" : "Baixa"}
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (apontamentoHoje) {
                      onSelecionarApontamento(apontamentoHoje);
                    }
                  }}
                  disabled={!apontamentoHoje}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: "none",
                    background: apontamentoHoje ? "var(--ink-base)" : "var(--ink-lighter)",
                    color: apontamentoHoje ? "white" : "var(--ink-soft)",
                    cursor: apontamentoHoje ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (apontamentoHoje) {
                      e.currentTarget.style.background = "var(--ink-softer)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = apontamentoHoje ? "var(--ink-base)" : "var(--ink-lighter)";
                  }}
                >
                  <Play size={12} />
                  Registrar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="card"
        style={{
          padding: 12,
          backgroundColor: "rgba(0, 0, 0, 0.02)",
          borderRadius: "6px",
          fontSize: 12,
          lineHeight: "1.5",
          color: "var(--ink-soft)",
        }}
      >
        <strong>Dica:</strong> Clique em "Registrar" para vincular um apontamento a uma demanda e registrar horários de chegada, intervalo e saída.
      </div>
    </div>
  );
}
