import type { ReactNode } from "react";

export type VarianteKpi = "good" | "critical";

interface KpiTileProps {
  label: string;
  value: ReactNode;
  variant?: VarianteKpi;
}

/** Bloco de indicador padrão (rótulo + valor, com destaque opcional bom/ruim) — reusado
 * em toda tela que mostra KPIs dentro de um .kpi-grid (Painel, Patrimônio, Renda
 * tributável, Depósitos caução, Financiamentos, Reajustes/rescisão, Laudo pericial). */
export function KpiTile({ label, value, variant }: KpiTileProps) {
  return (
    <div className="kpi-tile">
      <div className="label">{label}</div>
      <div className={variant ? `value ${variant}` : "value"}>{value}</div>
    </div>
  );
}
