import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarDre } from "../domain/reports/dre";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia } from "../domain/reconcile/inadimplencia";
import { detectarDuplicatas, detectarOutliers, detectarLacunasMensais } from "../domain/auditoria/auditoriaForense";
import { baixarLaudoPdf } from "../domain/laudo/gerarLaudoPdf";
import { calcularCapacidadeContributiva } from "../domain/reports/capacidadeContributiva";
import { calcularAnaliseVertical, calcularAnaliseHorizontal } from "../domain/reports/analiseVerticalHorizontal";
import { calcularPatrimonioLiquido, calcularLiquidezCorrente, calcularSaldoCaixaAtual } from "../domain/patrimonio/balancoPatrimonial";
import { calcularDesempenhoPorImovel } from "../domain/reports/desempenhoPorImovel";
import { calcularCaucao } from "../domain/caucao/calculoCaucao";
import { KpiTile } from "./KpiTile";
import type { Caucao } from "../domain/types";

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
  const capacidadeContributiva = useMemo(
    () => (db ? calcularCapacidadeContributiva(db, periodoInicio, periodoFim) : null),
    [db, versao, periodoInicio, periodoFim],
  );
  const analiseVertical = useMemo(() => (db ? calcularAnaliseVertical(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const analiseHorizontal = useMemo(() => (db ? calcularAnaliseHorizontal(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const patrimonioLiquido = useMemo(() => (db ? calcularPatrimonioLiquido(db, periodoFim) : null), [db, versao, periodoFim]);
  const liquidezCorrente = useMemo(() => (db ? calcularLiquidezCorrente(db, periodoFim) : null), [db, versao, periodoFim]);
  const desempenhoImoveis = useMemo(() => (db ? calcularDesempenhoPorImovel(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const saldoCaixaAtual = useMemo(() => (db ? calcularSaldoCaixaAtual(db) : 0), [db, versao]);
  const passivoCaucaoRetido = useMemo(() => {
    if (!db) return 0;
    const caucoesRetidas = consultar<Caucao>(db, "SELECT * FROM caucoes WHERE data_devolucao IS NULL");
    return caucoesRetidas.reduce((acc, c) => acc + calcularCaucao(db, c.id, periodoFim).valorADevolver, 0);
  }, [db, versao, periodoFim]);

  async function gerar() {
    if (!capacidadeContributiva || !patrimonioLiquido || !liquidezCorrente) return;
    await baixarLaudoPdf(
      {
        periodoInicio,
        periodoFim,
        linhasDre,
        statusInadimplencia,
        duplicatas,
        outliers,
        lacunas,
        capacidadeContributiva,
        analiseVertical,
        analiseHorizontal,
        patrimonioLiquido,
        liquidezCorrente,
        passivoCaucaoRetido,
        saldoCaixaAtual,
        desempenhoImoveis,
      },
      `laudo-reconstituicao-${periodoInicio}-a-${periodoFim}.pdf`,
    );
  }

  return (
    <div>
      <h2 className="section-title">Laudo pericial</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Reúne capacidade contributiva real, DRE com análise vertical/horizontal, patrimônio líquido e alavancagem,
        inadimplência, passivo de caução, desempenho por imóvel e achados de auditoria forense do período num PDF
        único, pronto para revisão de um contador/perito antes de anexar ao processo. Gerado localmente — nenhum
        dado sai do navegador.
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
        <KpiTile label="Linhas de DRE" value={linhasDre.length} />
        <KpiTile label="Competências em aberto" value={statusInadimplencia.filter((s) => s.diasAtraso > 0).length} />
        <KpiTile label="Duplicidades" value={duplicatas.length} />
        <KpiTile label="Outliers / lacunas" value={`${outliers.length} / ${lacunas.length}`} />
      </div>

      <button className="btn primary" onClick={gerar}>
        <FileDown size={15} /> Gerar PDF do laudo
      </button>
    </div>
  );
}
