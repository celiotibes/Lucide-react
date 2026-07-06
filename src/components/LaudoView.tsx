import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useDb } from "../db/DbContext";
import { gerarDre } from "../domain/reports/dre";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia } from "../domain/reconcile/inadimplencia";
import { detectarDuplicatas, detectarOutliers, detectarLacunasMensais } from "../domain/auditoria/auditoriaForense";
import { baixarLaudoPdf } from "../domain/laudo/gerarLaudoPdf";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LaudoView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const [periodoInicio, setPeriodoInicio] = useState(new Date(new Date(hoje).setFullYear(new Date(hoje).getFullYear() - 3)).toISOString().slice(0, 10));
  const [periodoFim, setPeriodoFim] = useState(hoje);

  const linhasDre = useMemo(() => (db ? gerarDre(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const statusInadimplencia = useMemo(() => {
    if (!db) return [];
    const competencias = gerarCompetencias(db, periodoFim);
    const excecoes = conciliar(db, competencias);
    return calcularInadimplencia(db, excecoes, periodoFim);
  }, [db, versao, periodoFim]);
  const duplicatas = useMemo(() => (db ? detectarDuplicatas(db) : []), [db, versao]);
  const outliers = useMemo(() => (db ? detectarOutliers(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const lacunas = useMemo(
    () => (db ? detectarLacunasMensais(db, ["2.1.01", "2.1.05", "2.1.06"], periodoInicio, periodoFim) : []),
    [db, versao, periodoInicio, periodoFim],
  );

  function gerar() {
    baixarLaudoPdf(
      { periodoInicio, periodoFim, linhasDre, statusInadimplencia, duplicatas, outliers, lacunas },
      `laudo-reconstituicao-${periodoInicio}-a-${periodoFim}.pdf`,
    );
  }

  return (
    <div>
      <h2 className="section-title">Laudo pericial</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Reúne DRE, inadimplência e achados de auditoria forense do período num PDF único, pronto para revisão de um
        contador/perito antes de anexar ao processo. Gerado localmente — nenhum dado sai do navegador.
      </p>

      <div className="form-grid" style={{ maxWidth: 420 }}>
        <label>
          Período — início
          <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
        </label>
        <label>
          Período — fim
          <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
        </label>
      </div>

      <div className="kpi-grid">
        <div className="kpi-tile">
          <div className="label">Linhas de DRE</div>
          <div className="value">{linhasDre.length}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">Competências em aberto</div>
          <div className="value">{statusInadimplencia.filter((s) => s.diasAtraso > 0).length}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">Duplicidades</div>
          <div className="value">{duplicatas.length}</div>
        </div>
        <div className="kpi-tile">
          <div className="label">Outliers / lacunas</div>
          <div className="value">{outliers.length} / {lacunas.length}</div>
        </div>
      </div>

      <button className="btn primary" onClick={gerar}>
        <FileDown size={15} /> Gerar PDF do laudo
      </button>
    </div>
  );
}
