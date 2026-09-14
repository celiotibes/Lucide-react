import { Check, X, Clock } from "lucide-react";

interface Props {
  horario: string;
  onConfirmar: () => void;
  onRejeitar: () => void;
}

export function HorarioAutomatico({ horario, onConfirmar, onRejeitar }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 12,
        backgroundColor: "rgba(0, 0, 0, 0.02)",
        borderRadius: "6px",
        border: "1px solid var(--ink-lighter)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          padding: "12px",
          backgroundColor: "white",
          borderRadius: "4px",
          border: "2px solid var(--ink-base)",
        }}
      >
        <Clock size={18} color="var(--ink-base)" />
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Horário capturado</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-base)" }}>{horario}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="btn"
          onClick={onConfirmar}
          style={{
            padding: "10px 12px",
            borderRadius: "4px",
            border: "none",
            background: "var(--viz-good)",
            color: "white",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          title="Confirmar horário"
        >
          <Check size={14} />
          OK
        </button>
        <button
          className="btn"
          onClick={onRejeitar}
          style={{
            padding: "10px 12px",
            borderRadius: "4px",
            border: "1px solid var(--ink-lighter)",
            background: "white",
            color: "var(--ink-soft)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--ink-base)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--ink-lighter)";
          }}
          title="Rejeitar e tentar novamente"
        >
          <X size={14} />
          Rejeitar
        </button>
      </div>
    </div>
  );
}
