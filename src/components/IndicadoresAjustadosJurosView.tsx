import { useMemo, useState } from "react";
import { AlertTriangle, Info, Scale } from "lucide-react";
import { useDb } from "../db/useDb";
import { formatarMoeda } from "../domain/formatarMoeda";
import {
  patrimonioLiquidoAjustadoPorJuros,
  impactoJurosNaLiquidezMensal,
  impactoJurosNoResultadoAnual,
  type PatrimonioLiquidoAjustadoPorJurosResultado,
  type ImpactoJurosNaLiquidezMensalResultado,
  type ImpactoJurosNoResultadoAnualResultado,
  type GanhoPatrimonioLiquidoBase,
} from "../domain/dividas/indicadoresAjustadosJuros";
import { KpiTile } from "./KpiTile";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarPercentual(valor: number | null, casasDecimais = 2): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(casasDecimais)}%`;
}

/** Mesmo padrão de legenda explicativa de fórmula/fonte de `HistoricoJurosView.tsx` /
 * `PriorizacaoQuitacaoView.tsx` / `IndicadoresGestaoView.tsx` (componente local replicado,
 * mesmo visual) — a fórmula e a fonte vêm do PRÓPRIO retorno do indicador (nunca hardcoded
 * aqui), porque é o módulo de domínio que sabe exatamente de onde veio cada número. */
function LegendaFormula({ formula, fonte }: { formula: string; fonte: string }) {
  return (
    <p
      title={`Fórmula: ${formula}\n\nFonte dos dados: ${fonte}`}
      style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "-4px 0 16px", lineHeight: 1.5 }}
    >
      <Info size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
      <strong>Fórmula:</strong> {formula}
      <br />
      <strong>Fonte:</strong> {fonte}
    </p>
  );
}

/** Segregação PF × empresa × advocacia dos juros considerados em cada indicador —
 * exigência recorrente do usuário em todo este módulo: deixar sempre visível o que foi
 * EXCLUÍDO do desconto (pessoal, advocacia) e o que foi incluído por precaução (sem rateio
 * ainda cadastrado), nunca só o número líquido final. */
function ChipsSegregacao({
  descontadoDaAtividade,
  excluidoPessoal,
  excluidoAdvocacia,
  incluidoNaoClassificado,
  aviso,
}: {
  descontadoDaAtividade: number;
  excluidoPessoal: number;
  excluidoAdvocacia: number;
  incluidoNaoClassificado: number;
  aviso: string | null;
}) {
  return (
    <div style={{ margin: "4px 0 16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span className="pill good" title="Descontado dos indicadores de retorno da atividade imobiliária (inclui 'não classificado', por precaução).">
          Empresa/atividade (descontado): {formatarMoeda(descontadoDaAtividade)}
        </span>
        <span className="pill" title="Dívida pessoal do titular — NUNCA entra no desconto da atividade de investimento imobiliário.">
          Pessoal (excluído): {formatarMoeda(excluidoPessoal)}
        </span>
        <span className="pill" title="Custo do escritório de advocacia — NUNCA entra no desconto da atividade de investimento imobiliário.">
          Advocacia (excluído): {formatarMoeda(excluidoAdvocacia)}
        </span>
        {incluidoNaoClassificado > 0.005 && (
          <span className="pill critical" title={aviso ?? undefined}>
            Sem rateio ainda (incluído por precaução): {formatarMoeda(incluidoNaoClassificado)}
          </span>
        )}
      </div>
      {aviso && (
        <p style={{ fontSize: 12, color: "var(--viz-critical)", margin: "6px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {aviso}
        </p>
      )}
    </div>
  );
}

function BlocoBase({ base }: { base: GanhoPatrimonioLiquidoBase }) {
  return (
    <div>
      <h4 style={{ fontSize: 13.5, marginBottom: 8, color: "var(--ink-soft)" }}>{base.rotulo}</h4>
      <div className="kpi-grid" style={{ marginBottom: 4 }}>
        <KpiTile label="Ganho bruto (antes dos juros)" value={formatarMoeda(base.ganhoPatrimonioLiquidoBruto)} />
        <KpiTile label="Juros descontados" value={formatarMoeda(base.jurosDescontados)} />
        <KpiTile
          label="Ganho líquido de juros"
          value={formatarMoeda(base.ganhoLiquidoDeJuros)}
          variant={base.ganhoLiquidoDeJuros >= 0 ? "good" : "critical"}
        />
        <KpiTile label={base.rotulo === "Ajustado a custo histórico" ? "Valor de aquisição total" : "Valor de mercado total"} value={formatarMoeda(base.denominadorReferencia)} />
        <KpiTile label="Retorno bruto" value={formatarPercentual(base.retornoBrutoPercentual)} />
        <KpiTile
          label="Retorno líquido de juros"
          value={formatarPercentual(base.retornoLiquidoDeJurosPercentual)}
          variant={base.retornoLiquidoDeJurosPercentual !== null ? (base.retornoLiquidoDeJurosPercentual >= 0 ? "good" : "critical") : undefined}
        />
      </div>
      {base.motivoRetornoIndisponivel && (
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
          Retorno percentual indisponível: {base.motivoRetornoIndisponivel}
        </p>
      )}
      <LegendaFormula formula={base.formula} fonte={base.fonteDados} />
    </div>
  );
}

export function IndicadoresAjustadosJurosView() {
  const { db, versao } = useDb();

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);

  const patrimonio: PatrimonioLiquidoAjustadoPorJurosResultado | null = useMemo(() => {
    if (!db) return null;
    try {
      return patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: ano, anoFim: ano });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, ano]);

  const liquidezMensal: ImpactoJurosNaLiquidezMensalResultado | null = useMemo(() => {
    if (!db) return null;
    try {
      return impactoJurosNaLiquidezMensal(db, ano, mes);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, ano, mes]);

  const resultadoAnual: ImpactoJurosNoResultadoAnualResultado | null = useMemo(() => {
    if (!db) return null;
    try {
      return impactoJurosNoResultadoAnual(db, ano);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, ano]);

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Scale size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Indicadores de retorno ajustados pelo custo de juros
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>Camada gerencial que MODULA os indicadores já existentes pelo custo de juros pagos</strong> — não
          recalcula NOI, valor de aquisição, valor de mercado, cashflow ou DRE do zero; só pega o que já existe
          (Yield/Cap Rate, liquidez mensal do portfólio, resultado da DRE) e mostra quanto sobra depois de excluir os
          juros reconstituídos em <em>Histórico de juros pagos</em>. Os juros considerados aqui são sempre
          filtrados por destino: dívida <strong>pessoal</strong> e de <strong>advocacia</strong> nunca entram no
          desconto da atividade de investimento imobiliário — só dívida da empresa/atividade (e, por precaução,
          juros ainda sem rateio de destino cadastrado).
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
            Mês (só para o impacto na liquidez mensal)
            <select className="btn" style={{ width: 160, marginTop: 4 }} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES_PT.map((nome, indice) => (
                <option key={nome} value={indice + 1}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 1) Patrimônio líquido ajustado por juros */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Patrimônio líquido ajustado por juros — {ano}</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          O que o investidor realmente ganhou de patrimônio líquido no ano, depois de excluir o custo de juros pagos
          — a custo histórico (valor de aquisição) e a valor de mercado mais recente, lado a lado.
        </p>
        {patrimonio ? (
          <>
            <ChipsSegregacao
              descontadoDaAtividade={patrimonio.custoHistorico.jurosDescontados}
              excluidoPessoal={patrimonio.jurosExcluidosPessoal}
              excluidoAdvocacia={patrimonio.jurosExcluidosAdvocacia}
              incluidoNaoClassificado={patrimonio.jurosIncluidosNaoClassificado}
              aviso={patrimonio.avisoJurosNaoClassificado}
            />
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 16px" }}>
              Juros totais reconstituídos no período (todos os destinos, só para auditoria):{" "}
              <strong>{formatarMoeda(patrimonio.jurosTotaisReconstituidos)}</strong>.
            </p>
            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
              <BlocoBase base={patrimonio.custoHistorico} />
              <BlocoBase base={patrimonio.valorMercado} />
            </div>
          </>
        ) : (
          <p style={{ color: "var(--ink-soft)" }}>Não foi possível calcular este indicador para o ano selecionado.</p>
        )}
      </div>

      {/* 2) Impacto dos juros na liquidez mensal */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>
          Impacto dos juros na liquidez mensal — {MESES_PT[mes - 1]}/{ano}
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Quanto do fluxo de caixa líquido do mês (aluguel vigente − despesas operacionais, antes do serviço da
          dívida) seria consumido só pelos juros do mês.
        </p>
        {liquidezMensal ? (
          <>
            <ChipsSegregacao
              descontadoDaAtividade={liquidezMensal.jurosDoMes}
              excluidoPessoal={liquidezMensal.jurosExcluidosPessoal}
              excluidoAdvocacia={liquidezMensal.jurosExcluidosAdvocacia}
              incluidoNaoClassificado={liquidezMensal.jurosIncluidosNaoClassificado}
              aviso={liquidezMensal.avisoJurosNaoClassificado}
            />
            <div className="kpi-grid" style={{ marginBottom: 4 }}>
              <KpiTile label="Juros do mês (atividade)" value={formatarMoeda(liquidezMensal.jurosDoMes)} />
              <KpiTile
                label="Fluxo de caixa líquido do mês"
                value={formatarMoeda(liquidezMensal.fluxoCaixaLiquidoDoMes)}
                variant={liquidezMensal.fluxoCaixaLiquidoDoMes >= 0 ? "good" : "critical"}
              />
              <KpiTile
                label="% do fluxo comprometido pelos juros"
                value={formatarPercentual(liquidezMensal.percentualComprometidoPorJuros)}
                variant={
                  liquidezMensal.percentualComprometidoPorJuros !== null
                    ? liquidezMensal.percentualComprometidoPorJuros <= 30
                      ? "good"
                      : "critical"
                    : undefined
                }
              />
            </div>
            {liquidezMensal.motivoPercentualIndisponivel && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                Percentual indisponível: {liquidezMensal.motivoPercentualIndisponivel}
              </p>
            )}
            <LegendaFormula formula={liquidezMensal.formula} fonte={liquidezMensal.fonteDados} />
          </>
        ) : (
          <p style={{ color: "var(--ink-soft)" }}>Não foi possível calcular este indicador para o mês selecionado.</p>
        )}
      </div>

      {/* 3) Impacto dos juros no resultado anual (DRE) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Impacto dos juros no resultado anual (DRE) — {ano}</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Quanto do resultado do ano (antes de qualquer juro de financiamento) foi consumido pelo custo real e
          completo de juros reconstituído — comparado com o resultado oficial já reportado pela DRE.
        </p>
        {resultadoAnual ? (
          <>
            <ChipsSegregacao
              descontadoDaAtividade={resultadoAnual.jurosDoAno}
              excluidoPessoal={resultadoAnual.jurosExcluidosPessoal}
              excluidoAdvocacia={resultadoAnual.jurosExcluidosAdvocacia}
              incluidoNaoClassificado={resultadoAnual.jurosIncluidosNaoClassificado}
              aviso={resultadoAnual.avisoJurosNaoClassificado}
            />
            <div className="kpi-grid" style={{ marginBottom: 4 }}>
              <KpiTile label="Juros do ano (atividade)" value={formatarMoeda(resultadoAnual.jurosDoAno)} />
              <KpiTile label="Resultado líquido anual (DRE oficial)" value={formatarMoeda(resultadoAnual.resultadoLiquidoAnual)} />
              <KpiTile
                label="Juros de financiamento já no razão"
                value={formatarMoeda(resultadoAnual.jurosJaContabilizadosNoDRE)}
                variant={resultadoAnual.jurosJaContabilizadosNoDRE > 0 ? "critical" : undefined}
              />
              <KpiTile label="Resultado antes de qualquer juro" value={formatarMoeda(resultadoAnual.resultadoLiquidoSemConsiderarJuros)} />
              <KpiTile
                label="% do resultado consumido pelos juros"
                value={formatarPercentual(resultadoAnual.percentualDoResultadoConsumidoPorJuros)}
                variant={
                  resultadoAnual.percentualDoResultadoConsumidoPorJuros !== null
                    ? resultadoAnual.percentualDoResultadoConsumidoPorJuros <= 30
                      ? "good"
                      : "critical"
                    : undefined
                }
              />
            </div>
            {resultadoAnual.motivoPercentualIndisponivel && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                Percentual indisponível: {resultadoAnual.motivoPercentualIndisponivel}
              </p>
            )}
            <p
              title={resultadoAnual.alertaDuplaContagem}
              style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 4px", lineHeight: 1.5, display: "flex", gap: 6, alignItems: "flex-start" }}
            >
              <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>Como a dupla contagem de juros é evitada:</strong> {resultadoAnual.alertaDuplaContagem}
              </span>
            </p>
            <LegendaFormula formula={resultadoAnual.formula} fonte={resultadoAnual.fonteDados} />
          </>
        ) : (
          <p style={{ color: "var(--ink-soft)" }}>Não foi possível calcular este indicador para o ano selecionado.</p>
        )}
      </div>

      {/* Nota sobre a função pura de classificação, para quem for estender este módulo. */}
      <p style={{ fontSize: 11, color: "var(--ink-soft)" }}>
        Classificação de destino usada nos três indicadores acima:{" "}
        <code>domain/dividas/indicadoresAjustadosJuros.ts::classificarJurosPorAtividade</code> — mesma função,
        aplicada à quebra por destino (<code>rateioDividas.ts</code>) de cada evento de juros reconstituído em{" "}
        <code>historicoJuros.ts</code>.
      </p>
    </div>
  );
}
