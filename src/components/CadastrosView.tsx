import { useState } from "react";
import { ContasBancariasForm } from "./cadastros/ContasBancariasForm";
import { PrestadoresForm } from "./cadastros/PrestadoresForm";
import { FinanciamentosForm } from "./cadastros/FinanciamentosForm";
import { ObrasForm } from "./cadastros/ObrasForm";
import { ContratosForm } from "./cadastros/ContratosForm";

type SubAba = "contratos" | "contas" | "prestadores" | "financiamentos" | "obras";

const SUBABAS: { id: SubAba; rotulo: string }[] = [
  { id: "contratos", rotulo: "Contratos de locação" },
  { id: "contas", rotulo: "Contas bancárias" },
  { id: "prestadores", rotulo: "Prestadores de serviço" },
  { id: "financiamentos", rotulo: "Financiamentos" },
  { id: "obras", rotulo: "Obras" },
];

export function CadastrosView() {
  const [subAba, setSubAba] = useState<SubAba>("contratos");

  return (
    <div>
      <h2 className="section-title">Cadastros</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Contratos de locação (com locatários solidários e depósito caução), contas bancárias, prestadores de
        serviço, financiamentos e obras — a base que o resto do sistema (reajustes, inadimplência, DSS, caução,
        detector de anatocismo) usa para calcular a partir dos seus dados reais.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {SUBABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            className="btn"
            aria-current={subAba === id ? "page" : undefined}
            style={subAba === id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => setSubAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {subAba === "contratos" && <ContratosForm />}
      {subAba === "contas" && <ContasBancariasForm />}
      {subAba === "prestadores" && <PrestadoresForm />}
      {subAba === "financiamentos" && <FinanciamentosForm />}
      {subAba === "obras" && <ObrasForm />}
    </div>
  );
}
