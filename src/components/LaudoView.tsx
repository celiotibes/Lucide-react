import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarDre } from "../domain/reports/dre";
import { gerarCompetencias, conciliar } from "../domain/reconcile/contratos";
import { calcularInadimplencia } from "../domain/reconcile/inadimplencia";
import {
  detectarDuplicatas, detectarOutliers, detectarLacunasMensais, testeBenford,
  detectarCaucoesSemTransacao, detectarTransacoesCaucaoSemRegistro, detectarFinanciamentosSemLancamento,
  CATEGORIAS_BENFORD_VARIAVEIS,
} from "../domain/auditoria/auditoriaForense";
import { baixarLaudoPdf, type DivergenciaAnatocismoComFinanciamento } from "../domain/laudo/gerarLaudoPdf";
import { calcularCapacidadeContributiva } from "../domain/reports/capacidadeContributiva";
import { calcularAnaliseVertical, calcularAnaliseHorizontal } from "../domain/reports/analiseVerticalHorizontal";
import { calcularPatrimonioLiquido, calcularLiquidezCorrente, calcularSaldoCaixaAtual } from "../domain/patrimonio/balancoPatrimonial";
import { calcularDesempenhoPorImovel } from "../domain/reports/desempenhoPorImovel";
import { calcularCaucao } from "../domain/caucao/calculoCaucao";
import { compararComTransacoes, type Financiamento } from "../domain/financiamento/amortizacao";
import { listarDocumentosGerados } from "../domain/laudo/historicoDocumentos";
import { KpiTile } from "./KpiTile";
import type { Caucao } from "../domain/types";

const ROTULO_TIPO_DOCUMENTO: Record<string, string> = { laudo_pericial: "Laudo pericial", rad: "RAD" };

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LaudoView() {
  const { db, versao, persistir } = useDb();
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

  // Os 3 achados abaixo já existem e são mostrados na aba Auditoria forense, mas até agora
  // nunca chegavam ao PDF protocolável — achado de auditoria de completude, corrigido aqui.
  const valoresBenford = useMemo(() => {
    if (!db) return [];
    return consultar<{ valor: number }>(
      db,
      `SELECT valor FROM transacoes WHERE plano_conta_codigo IN (${CATEGORIAS_BENFORD_VARIAVEIS.map(() => "?").join(",")}) OR plano_conta_codigo IS NULL`,
      CATEGORIAS_BENFORD_VARIAVEIS,
    ).map((r) => r.valor);
  }, [db, versao]);
  const amostraBenford = valoresBenford.length;
  const benford = useMemo(() => testeBenford(valoresBenford), [valoresBenford]);
  const divergenciasAnatocismo = useMemo<DivergenciaAnatocismoComFinanciamento[]>(() => {
    if (!db) return [];
    const financiamentos = consultar<Financiamento>(db, "SELECT * FROM financiamentos ORDER BY id");
    return financiamentos.flatMap((f) =>
      compararComTransacoes(db, f)
        .filter((d) => d.possivelAnatocismo)
        .map((d) => ({ ...d, financiamentoId: f.id, instituicao: f.instituicao })),
    );
  }, [db, versao]);
  const caucoesSemTransacao = useMemo(() => (db ? detectarCaucoesSemTransacao(db) : []), [db, versao]);
  const transacoesCaucaoSemRegistro = useMemo(() => (db ? detectarTransacoesCaucaoSemRegistro(db) : []), [db, versao]);
  const financiamentosSemLancamento = useMemo(() => (db ? detectarFinanciamentosSemLancamento(db, periodoFim) : []), [db, versao, periodoFim]);
  const documentosGerados = useMemo(() => (db ? listarDocumentosGerados(db) : []), [db, versao]);

  async function gerar() {
    if (!db || !capacidadeContributiva || !patrimonioLiquido || !liquidezCorrente) return;
    await baixarLaudoPdf(
      db,
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
        benford,
        amostraBenford,
        divergenciasAnatocismo,
        caucoesSemTransacao,
        transacoesCaucaoSemRegistro,
        financiamentosSemLancamento,
      },
      `laudo-reconstituicao-${periodoInicio}-a-${periodoFim}.pdf`,
    );
    await persistir();
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

      <h3 style={{ fontSize: 15, marginTop: 28, marginBottom: 8 }}>Histórico de documentos gerados ({documentosGerados.length})</h3>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 12.5, marginBottom: 12 }}>
        Todo Laudo pericial ou RAD gerado (nesta aba ou em Depósitos caução) fica registrado aqui com hash SHA-256
        do PDF exato — prova de qual foi o conteúdo entregue numa data específica, caso seja questionado depois.
      </p>
      {documentosGerados.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Nenhum documento gerado ainda nesta instalação.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Arquivo</th><th>Gerado em</th><th>Hash SHA-256</th></tr></thead>
            <tbody>
              {documentosGerados.map((d) => (
                <tr key={d.id}>
                  <td>{ROTULO_TIPO_DOCUMENTO[d.tipo] ?? d.tipo}</td>
                  <td>{d.nome_arquivo}</td>
                  <td>{new Date(d.gerado_em).toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{d.hash_sha256}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
