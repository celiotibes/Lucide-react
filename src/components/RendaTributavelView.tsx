import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { gerarRendaTributavel, totalizarRendaTributavel } from "../domain/reports/rendaTributavel";
import { calcularCapacidadeContributiva, calcularCapacidadeContributivaMensal } from "../domain/reports/capacidadeContributiva";
import { calcularAnaliseVertical, calcularAnaliseHorizontal } from "../domain/reports/analiseVerticalHorizontal";
import { compararReceitaCaixaXCompetencia } from "../domain/reports/dreCompetencia";
import { calcularCarneLeaoPorImovel, CATEGORIAS_DEDUTIVEIS_CANDIDATAS } from "../domain/reports/irpfCarneLeao";
import { compararDeclaradoXReconstituido } from "../domain/reports/comparativoFiscal";
import { gerarDss } from "../domain/reports/dss";
import { sugerirAjusteRateio, aplicarAjusteRateio } from "../domain/rateio/ajusteAnual";
import type { ContratoLocacao, Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const CHAVE_CATEGORIAS_DEDUTIVEIS = "carne-leao-categorias-dedutiveis-v1";

/** Lê a seleção de categorias dedutíveis salva no navegador (localStorage) — sem isso, o
 * usuário perderia a escolha (ex: desmarcar condomínio/IPTU para evitar dupla dedução)
 * toda vez que recarregasse a página ou trocasse de aba. Cai no default de
 * CATEGORIAS_DEDUTIVEIS_CANDIDATAS se não houver nada salvo ou o valor salvo for
 * inválido (formato antigo, corrompido, ou código de categoria que não existe mais). */
function lerCategoriasDedutiveisSalvas(): string[] {
  const padrao = CATEGORIAS_DEDUTIVEIS_CANDIDATAS.filter((c) => c.padraoSelecionada).map((c) => c.codigo);
  try {
    const bruto = localStorage.getItem(CHAVE_CATEGORIAS_DEDUTIVEIS);
    if (!bruto) return padrao;
    const salvo = JSON.parse(bruto);
    if (!Array.isArray(salvo) || !salvo.every((c) => typeof c === "string")) return padrao;
    const codigosValidos = new Set(CATEGORIAS_DEDUTIVEIS_CANDIDATAS.map((c) => c.codigo));
    return salvo.filter((c) => codigosValidos.has(c));
  } catch {
    return padrao;
  }
}

export function RendaTributavelView() {
  const { db, versao, persistir } = useDb();
  const hoje = hojeIso();
  const inicio12m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10);
  // Comparativo declarado × reconstituído olha por ano-calendário, não pela janela rolante
  // de 12 meses usada no resto da tela — precisa cobrir vários anos inteiros de histórico.
  const inicioHistoricoFiscal = new Date(new Date(hoje).setFullYear(new Date(hoje).getFullYear() - 6, 0, 1)).toISOString().slice(0, 10);
  const comparativoFiscal = useMemo(
    () => (db ? compararDeclaradoXReconstituido(db, inicioHistoricoFiscal, hoje) : []),
    [db, versao, inicioHistoricoFiscal, hoje],
  );

  const linhas = useMemo(() => (db ? gerarRendaTributavel(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const totais = useMemo(() => totalizarRendaTributavel(linhas), [linhas]);
  const capacidade = useMemo(() => (db ? calcularCapacidadeContributiva(db, inicio12m, hoje) : null), [db, versao, inicio12m, hoje]);
  const capacidadeMensal = useMemo(() => (db ? calcularCapacidadeContributivaMensal(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const analiseVertical = useMemo(() => (db ? calcularAnaliseVertical(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const analiseHorizontal = useMemo(() => (db ? calcularAnaliseHorizontal(db, inicio12m, hoje) : []), [db, versao, inicio12m, hoje]);
  const analiseVerticalPorCodigo = useMemo(() => new Map(analiseVertical.map((v) => [v.codigo, v])), [analiseVertical]);
  const comparativoCaixaCompetencia = useMemo(
    () => (db ? compararReceitaCaixaXCompetencia(db, inicio12m, hoje) : []),
    [db, versao, inicio12m, hoje],
  );

  const [codigosDedutiveis, setCodigosDedutiveis] = useState<string[]>(lerCategoriasDedutiveisSalvas);
  useEffect(() => {
    localStorage.setItem(CHAVE_CATEGORIAS_DEDUTIVEIS, JSON.stringify(codigosDedutiveis));
  }, [codigosDedutiveis]);
  const carneLeao = useMemo(
    () => (db ? calcularCarneLeaoPorImovel(db, inicio12m, hoje, codigosDedutiveis) : null),
    [db, versao, inicio12m, hoje, codigosDedutiveis],
  );
  function alternarCategoriaDedutivel(codigo: string) {
    setCodigosDedutiveis((atual) => (atual.includes(codigo) ? atual.filter((c) => c !== codigo) : [...atual, codigo]));
  }

  const contratosComRateio = useMemo<ContratoLocacao[]>(
    () => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE percentual_aluguel_efetivo < 100 ORDER BY id") : []),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);
  const [contratoDssId, setContratoDssId] = useState<number | null>(null);
  const contratoDssAtivo = contratoDssId ?? contratosComRateio[0]?.id ?? null;
  const contratoAtivo = contratosComRateio.find((c) => c.id === contratoDssAtivo) ?? null;
  const dss = useMemo(
    () => (db && contratoDssAtivo ? gerarDss(db, contratoDssAtivo, inicio12m, hoje) : null),
    [db, versao, contratoDssAtivo, inicio12m, hoje],
  );
  const sugestaoRateio = useMemo(
    () => (db && contratoAtivo ? sugerirAjusteRateio(db, contratoAtivo, inicio12m, hoje) : null),
    [db, versao, contratoAtivo, inicio12m, hoje],
  );

  const aplicarSugestaoRateio = async () => {
    if (!db || !contratoAtivo || !sugestaoRateio) return;
    aplicarAjusteRateio(db, contratoAtivo.id, sugestaoRateio.percentualAluguelEfetivoSugerido);
    await persistir();
  };

  const percentualTributavel = totais.totalRecebido > 0 ? (totais.rendaTributavel / totais.totalRecebido) * 100 : 0;

  return (
    <div>
      <h2 className="section-title">Capacidade contributiva real</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        O número central para a Vara de Família: receita bruta alta não é capacidade contributiva alta. O total
        recebido bruto passa por duas reduções antes de virar dinheiro disponível — o reembolso de rateio (não é
        renda, é recomposição de custo repassado ao locatário) e a despesa operacional da atividade (condomínio,
        manutenção, prestadores, tarifas — já excluindo qualquer imóvel de uso pessoal).
      </p>

      {capacidade && (
        <div className="kpi-grid" style={{ marginBottom: 10 }}>
          <KpiTile label="Total recebido bruto (12m)" value={formatarMoeda(capacidade.totalRecebidoBruto)} />
          <KpiTile label="(−) Reembolso de rateio" value={formatarMoeda(capacidade.reembolsoNaoTributavel)} />
          <KpiTile label="(−) Despesa operacional" value={formatarMoeda(capacidade.despesaOperacionalTotal)} />
          <KpiTile
            label="= Resultado líquido real"
            value={formatarMoeda(capacidade.resultadoLiquidoReal)}
            variant={capacidade.resultadoLiquidoReal >= 0 ? "good" : "critical"}
          />
        </div>
      )}
      {capacidade && capacidade.percentualDisponivelSobreRecebido !== null && (
        <p style={{ fontSize: 13, marginBottom: 24 }}>
          Do total recebido bruto, apenas <strong>{capacidade.percentualDisponivelSobreRecebido.toFixed(1)}%</strong>{" "}
          é resultado líquido real disponível — o restante é reembolso de custo repassado ou despesa operacional da
          atividade.
        </p>
      )}

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr><th>Mês</th><th className="num">Recebido bruto</th><th className="num">Despesa operacional</th><th className="num">Resultado real</th></tr>
          </thead>
          <tbody>
            {capacidadeMensal.map((l) => (
              <tr key={l.mes}>
                <td>{l.mes}</td>
                <td className="num">{formatarMoeda(l.totalRecebidoBruto)}</td>
                <td className="num">{formatarMoeda(l.despesaOperacionalTotal)}</td>
                <td className="num">{formatarMoeda(l.resultadoLiquidoReal)}</td>
              </tr>
            ))}
            {capacidadeMensal.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum dado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Regime de caixa × regime de competência</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 16 }}>
        Compara, mês a mês, o aluguel devido pelos contratos residenciais fixos (regime de competência, mesmo
        cálculo usado no módulo de inadimplência) contra o que efetivamente entrou no caixa naquele mês (regime de
        caixa). Diferença positiva = parte do devido no mês ainda não entrou no caixa — é o caixa, não o devido, que
        determina capacidade de pagar de fato. Não cobre Airbnb/temporada (sem "mês devido" fixo por contrato).
      </p>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr><th>Mês</th><th className="num">Devido (competência)</th><th className="num">Recebido (caixa)</th><th className="num">Diferença</th></tr>
          </thead>
          <tbody>
            {comparativoCaixaCompetencia.map((l) => (
              <tr key={l.mes}>
                <td>{l.mes}</td>
                <td className="num">{formatarMoeda(l.receitaCompetencia)}</td>
                <td className="num">{formatarMoeda(l.receitaCaixa)}</td>
                <td className="num" style={{ color: l.diferenca > 0 ? "var(--viz-despesa)" : "var(--viz-good)" }}>{formatarMoeda(l.diferenca)}</td>
              </tr>
            ))}
            {comparativoCaixaCompetencia.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum contrato residencial fixo no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Análise vertical e horizontal do DRE</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 16 }}>
        Vertical: cada linha como % da receita total do período — mostra a proporção do custo, não só o valor
        absoluto. Horizontal: comparação com os 12 meses imediatamente anteriores — evidencia se despesa de
        manutenção/obra subiu na mesma proporção da receita (capacidade contributiva estável) ou ficou para trás.
      </p>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="num">Valor (12m)</th>
              <th className="num">% da receita (vertical)</th>
              <th className="num">Valor (12m anteriores)</th>
              <th className="num">Variação (horizontal)</th>
            </tr>
          </thead>
          <tbody>
            {analiseHorizontal.map((h) => {
              const vertical = analiseVerticalPorCodigo.get(h.codigo);
              return (
                <tr key={h.codigo}>
                  <td>{h.codigo} · {h.descricao}</td>
                  <td className="num">{formatarMoeda(Math.abs(h.totalAtual))}</td>
                  <td className="num">{vertical?.percentualSobreReceita !== null && vertical?.percentualSobreReceita !== undefined ? `${vertical.percentualSobreReceita.toFixed(1)}%` : "—"}</td>
                  <td className="num" style={{ color: "var(--ink-soft)" }}>{formatarMoeda(Math.abs(h.totalAnterior))}</td>
                  <td className="num">
                    {h.variacaoPercentual !== null ? (
                      <span className={`pill ${h.variacaoPercentual > 20 ? "warning" : h.variacaoPercentual < -20 ? "critical" : "good"}`}>
                        {h.variacaoPercentual > 0 ? "+" : ""}{h.variacaoPercentual.toFixed(1)}%
                      </span>
                    ) : (
                      "novo"
                    )}
                  </td>
                </tr>
              );
            })}
            {analiseHorizontal.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum dado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Renda tributável (Carnê-Leão)</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Separa, de cada recebimento de aluguel, o que é Aluguel Efetivo (base do IRPF) do que é reembolso de rateio
        de custeio coletivo (trânsito contábil, não tributável) — a distinção que contratos com "valor único mensal"
        fazem explicitamente.
      </p>

      <div className="kpi-grid">
        <KpiTile label="Total recebido (12m)" value={formatarMoeda(totais.totalRecebido)} />
        <KpiTile label="Renda tributável" value={formatarMoeda(totais.rendaTributavel)} />
        <KpiTile label="Reembolso não tributável" value={formatarMoeda(totais.reembolsoNaoTributavel)} />
        <KpiTile label="% do recebido que é renda" value={`${percentualTributavel.toFixed(1)}%`} />
      </div>

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Total recebido</th>
              <th className="num">Renda tributável</th>
              <th className="num">Reembolso não tributável</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td>{l.mes}</td>
                <td className="num">{formatarMoeda(l.totalRecebido)}</td>
                <td className="num">{formatarMoeda(l.rendaTributavel)}</td>
                <td className="num">{formatarMoeda(l.reembolsoNaoTributavel)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma receita no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Simulador de Carnê-Leão</h2>
      <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Simulação, não apuração oficial. Usa a tabela progressiva mensal do IRPF vigente desde 05/2024 (Lei nº
          14.848/2024) — pode ter mudado desde então; confira a tabela atual em gov.br/receitafederal antes de usar
          para qualquer finalidade oficial ou pericial. O imposto do Carnê-Leão é PESSOAL do contribuinte: é
          calculado uma única vez sobre a soma da base tributável de TODOS os imóveis (média mensal do período,
          multiplicada de volta pelos meses — não substitui a apuração mês a mês real), nunca imóvel por imóvel —
          um locador com muitas unidades pequenas pode ter cada uma isoladamente abaixo da faixa de isenção
          mensal enquanto a soma de todas cai numa faixa bem mais alta. A coluna "imposto" de cada imóvel abaixo é
          só a fatia desse imposto único alocada proporcionalmente, para leitura de quanto cada imóvel pesa — não
          um imposto calculado à parte para ele. Confirme com um contador as categorias de despesa realmente
          dedutíveis no seu caso antes de apresentar este número em juízo.
        </span>
      </div>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 10 }}>
        Despesas dedutíveis da base do Carnê-Leão (selecione as que se aplicam ao seu caso):
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        {CATEGORIAS_DEDUTIVEIS_CANDIDATAS.map((c) => (
          <label key={c.codigo} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={codigosDedutiveis.includes(c.codigo)} onChange={() => alternarCategoriaDedutivel(c.codigo)} />
            {c.codigo} · {c.descricao}
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "70ch", marginBottom: 18 }}>
        Condomínio e IPTU vêm desmarcados por padrão: quando o contrato tem rateio de custeio embutido, o reembolso
        recebido do locatário já foi excluído da renda tributável acima — deduzir a despesa bruta de novo duplicaria
        o benefício. Só marque se tiver certeza de que aquele condomínio/IPTU saiu do bolso do locador, sem repasse.
        Financiamento, obra/capex, inadimplência e despesas administrativas não aparecem como opção: são custo de
        aquisição, capital ou não classicamente dedutíveis no Carnê-Leão mensal.
      </p>

      {carneLeao && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <KpiTile label="Base tributável total (todos os imóveis)" value={formatarMoeda(carneLeao.baseTributavelTotal)} />
          <KpiTile label="Alíquota marginal do contribuinte" value={`${carneLeao.aliquotaMarginalConsolidada.toFixed(1)}%`} />
          <KpiTile label="Imposto estimado total" value={formatarMoeda(carneLeao.impostoEstimadoTotal)} variant="critical" />
          <KpiTile
            label="Resultado líquido pós-imposto"
            value={formatarMoeda(carneLeao.resultadoLiquidoPosImpostoTotal)}
            variant={carneLeao.resultadoLiquidoPosImpostoTotal >= 0 ? "good" : "critical"}
          />
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th className="num">Renda tributável bruta</th>
              <th className="num">Despesa dedutível</th>
              <th className="num">Base tributável</th>
              <th className="num">Imposto (fatia alocada)</th>
              <th className="num">Resultado pós-imposto</th>
            </tr>
          </thead>
          <tbody>
            {(carneLeao?.linhas ?? []).map((l) => (
              <tr key={l.imovel.id}>
                <td>{l.imovel.apelido}</td>
                <td className="num">{formatarMoeda(l.rendaTributavelBruta)}</td>
                <td className="num">{formatarMoeda(l.despesaDedutivel)}</td>
                <td className="num">{formatarMoeda(l.baseTributavel)}</td>
                <td className="num" style={{ color: "var(--viz-despesa)" }}>{formatarMoeda(l.impostoEstimado)}</td>
                <td className="num" style={{ color: l.resultadoLiquidoPosImposto >= 0 ? "var(--viz-good)" : "var(--viz-despesa)" }}>
                  {formatarMoeda(l.resultadoLiquidoPosImposto)}
                </td>
              </tr>
            ))}
            {(carneLeao?.linhas.length ?? 0) === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum imóvel cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Comparativo: declarado × reconstituído</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 14 }}>
        Cruza a renda tributável reconstituída acima (extratos bancários reais) contra o que foi de fato
        declarado/pago à Receita Federal — o mesmo tipo de auditoria que plataformas de conciliação fiscal fazem
        entre livros/extratos e obrigações declaradas. Lance a DIRPF anual ou os DARFs de Carnê-Leão mensal em
        Cadastros → Declarações fiscais; sem nada lançado, a coluna "declarado" fica em branco (nunca se assume
        zero nem "igual ao reconstituído").
      </p>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ano-calendário</th>
              <th className="num">Renda reconstituída</th>
              <th className="num">Renda declarada</th>
              <th>Origem do declarado</th>
              <th className="num">Diferença</th>
              <th className="num">% não declarado</th>
            </tr>
          </thead>
          <tbody>
            {comparativoFiscal.map((l) => (
              <tr key={l.anoCalendario}>
                <td>{l.anoCalendario}</td>
                <td className="num">{formatarMoeda(l.rendaReconstituida)}</td>
                <td className="num">{l.rendaDeclarada !== null ? formatarMoeda(l.rendaDeclarada) : "—"}</td>
                <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                  {l.origemDeclarado === "dirpf_anual" && "DIRPF anual"}
                  {l.origemDeclarado === "carne_leao_mensal" && `Carnê-Leão (${l.mesesComCarneLeaoLancado}/12 meses lançados)`}
                  {l.origemDeclarado === "nenhum" && "nada lançado"}
                </td>
                <td className="num" style={{ color: l.diferenca !== null && l.diferenca > 0.01 ? "var(--viz-despesa)" : undefined }}>
                  {l.diferenca !== null ? formatarMoeda(l.diferenca) : "—"}
                </td>
                <td className="num">
                  {l.percentualNaoDeclarado !== null ? (
                    <span className={`pill ${l.percentualNaoDeclarado > 20 ? "critical" : l.percentualNaoDeclarado > 0.5 ? "warning" : "good"}`}>
                      {l.percentualNaoDeclarado.toFixed(1)}%
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {comparativoFiscal.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Sem dados suficientes (renda reconstituída ou declaração lançada) para nenhum ano.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {contratosComRateio.length > 0 && (
        <>
          <h2 className="section-title">DSS — Demonstrativo Semestral Simplificado</h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
            Arrecadação do rateio × gasto real em custeio coletivo do imóvel — o relatório que contratos deste tipo
            obrigam o locador a enviar periodicamente ao locatário (últimos 12 meses).
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {contratosComRateio.map((c) => (
              <button
                key={c.id}
                className="btn"
                aria-current={contratoDssAtivo === c.id ? "page" : undefined}
                style={contratoDssAtivo === c.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                onClick={() => setContratoDssId(c.id)}
              >
                {imoveis.get(c.imovel_id)?.apelido ?? c.imovel_id} · {c.locatario}
              </button>
            ))}
          </div>

          {dss && (
            <div className="card">
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <KpiTile label="Arrecadado (rateio)" value={formatarMoeda(dss.totalArrecadadoRateio)} />
                <KpiTile label="Despendido (custeio coletivo)" value={formatarMoeda(dss.totalDespendido)} />
                <KpiTile
                  label="Saldo do período"
                  value={`${formatarMoeda(dss.saldoValor)} (${dss.saldo})`}
                  variant={dss.saldo === "deficit" ? "critical" : "good"}
                />
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Categoria</th><th className="num">Total gasto</th></tr>
                  </thead>
                  <tbody>
                    {dss.linhasDespesa.map((l) => (
                      <tr key={l.codigo}><td>{l.codigo} · {l.descricao}</td><td className="num">{formatarMoeda(l.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {dss.rubricasContratadas.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>
                    Composição contratada da Cota de Custeio (referência documental)
                  </h3>
                  <p style={{ fontSize: 11.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 8 }}>
                    Sub-rubricas itemizadas no próprio contrato assinado — mostra que o rateio é
                    documentado e legítimo. Não é o gasto real do período acima; são categorias
                    diferentes de granularidade (a conciliação bancária só existe no grão do
                    plano de contas).
                  </p>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th>Ref.</th><th>Descrição</th><th className="num">%</th><th className="num">Valor contratado</th></tr>
                      </thead>
                      <tbody>
                        {dss.rubricasContratadas.map((r) => (
                          <tr key={r.id}>
                            <td>{r.referencia ?? "—"}</td>
                            <td>{r.descricao}</td>
                            <td className="num">{r.percentual !== undefined && r.percentual !== null ? `${r.percentual}%` : "—"}</td>
                            <td className="num">{r.valor_base !== undefined && r.valor_base !== null ? formatarMoeda(r.valor_base) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {sugestaoRateio && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Ajuste de rateio sugerido (renovação anual)</h3>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 14 }}>
                Recalcula o percentual de rateio embutido no valor único para que a arrecadação do próximo ciclo
                cubra a despesa média do período acima e absorva o saldo ({formatarMoeda(sugestaoRateio.saldoAcumulado)}
                {" "}{dss?.saldo}) ao longo dos próximos {sugestaoRateio.mesesAmortizacao} meses — não altera nada
                sozinho, só sugere; aplicar é uma decisão sua.
              </p>
              <div className="kpi-grid" style={{ marginBottom: 14 }}>
                <KpiTile label="Rateio atual" value={`${sugestaoRateio.percentualRateioAtual.toFixed(1)}%`} />
                <KpiTile label="Rateio sugerido" value={`${sugestaoRateio.percentualRateioSugerido.toFixed(1)}%`} />
                <KpiTile label="Aluguel efetivo atual" value={`${sugestaoRateio.percentualAluguelEfetivoAtual.toFixed(1)}%`} />
                <KpiTile label="Aluguel efetivo sugerido" value={`${sugestaoRateio.percentualAluguelEfetivoSugerido.toFixed(1)}%`} />
              </div>
              <button
                className="btn"
                disabled={Math.abs(sugestaoRateio.percentualAluguelEfetivoSugerido - sugestaoRateio.percentualAluguelEfetivoAtual) < 0.05}
                onClick={aplicarSugestaoRateio}
              >
                Aplicar ajuste sugerido ao contrato
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
