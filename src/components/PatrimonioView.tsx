import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDb } from "../db/DbContext";
import {
  calcularPatrimonioLiquido,
  calcularAlavancagemPorImovel,
  calcularComprometimentoRenda,
  calcularLiquidezCorrente,
  calcularVPLDoEndividamento,
} from "../domain/patrimonio/balancoPatrimonial";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function PatrimonioView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const [salarioMensal, setSalarioMensal] = useState("23000");
  const [taxaDesconto, setTaxaDesconto] = useState("1");

  const patrimonioLiquido = useMemo(() => (db ? calcularPatrimonioLiquido(db, hoje) : null), [db, versao, hoje]);
  const alavancagem = useMemo(() => (db ? calcularAlavancagemPorImovel(db, hoje) : []), [db, versao, hoje]);
  const liquidez = useMemo(() => (db ? calcularLiquidezCorrente(db, hoje) : null), [db, versao, hoje]);
  const taxaDescontoNumero = Number.parseFloat(taxaDesconto.replace(",", ".")) || 0;
  const endividamento = useMemo(
    () => (db ? calcularVPLDoEndividamento(db, hoje, taxaDescontoNumero) : []),
    [db, versao, hoje, taxaDescontoNumero],
  );
  const somaSaldoDevedor = endividamento.reduce((acc, l) => acc + l.saldoDevedor, 0);
  const somaVpl = endividamento.reduce((acc, l) => acc + l.vpl, 0);
  const comprometimento = useMemo(
    () => (db ? calcularComprometimentoRenda(db, hoje, Number.parseFloat(salarioMensal.replace(",", ".")) || 0) : null),
    [db, versao, hoje, salarioMensal],
  );

  return (
    <div>
      <h2 className="section-title">Patrimônio e alavancagem</h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Balanço patrimonial (ativo − passivo), diferente do DRE — mostra que o número de imóveis não equivale a
        liquidez disponível: o capital pode estar "preso" em imóvel financiado e em dívida de consumo. Depende de
        você preencher valor venal (aba Imóveis) e dívidas de consumo/consignado (aba Cadastros) — sem isso, os
        números abaixo ficam incompletos, nunca estimados.
      </p>

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Patrimônio líquido imobiliário</h3>
      {patrimonioLiquido && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 10 }}>
            <KpiTile label="Ativo (valor venal, imóveis próprios)" value={formatarMoeda(patrimonioLiquido.ativoImobiliario)} />
            <KpiTile label="Passivo financiamentos" value={formatarMoeda(patrimonioLiquido.passivoFinanciamentos)} variant="critical" />
            <KpiTile label="Passivo dívidas de consumo" value={formatarMoeda(patrimonioLiquido.passivoConsumo)} variant="critical" />
            <KpiTile
              label="Patrimônio líquido"
              value={formatarMoeda(patrimonioLiquido.patrimonioLiquido)}
              variant={patrimonioLiquido.patrimonioLiquido >= 0 ? "good" : "critical"}
            />
          </div>
          {patrimonioLiquido.imoveisSemValorVenal.length > 0 && (
            <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Sem valor venal cadastrado, fora da soma do ativo: {patrimonioLiquido.imoveisSemValorVenal.join(", ")}.
                Cadastre em Imóveis → editar → "Valor venal atual" para incluir no cálculo.
              </span>
            </div>
          )}
        </>
      )}

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Alavancagem por imóvel</h3>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr><th>Imóvel</th><th className="num">Valor venal</th><th className="num">Saldo devedor</th><th className="num">% alavancagem</th></tr>
          </thead>
          <tbody>
            {alavancagem.map((l) => (
              <tr key={l.imovel.id}>
                <td>{l.imovel.apelido}</td>
                <td className="num">{l.valorVenal !== null ? formatarMoeda(l.valorVenal) : "—"}</td>
                <td className="num">{formatarMoeda(l.saldoDevedor)}</td>
                <td className="num">
                  {l.percentualAlavancagem !== null ? (
                    <span className={`pill ${l.percentualAlavancagem > 70 ? "critical" : l.percentualAlavancagem > 40 ? "warning" : "good"}`}>
                      {l.percentualAlavancagem.toFixed(1)}%
                    </span>
                  ) : (
                    "sem valor venal"
                  )}
                </td>
              </tr>
            ))}
            {alavancagem.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhum imóvel próprio cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Liquidez corrente</h3>
      {liquidez && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 10 }}>
            <KpiTile label="Caixa disponível hoje" value={formatarMoeda(liquidez.saldoCaixaAtual)} />
            <KpiTile label="Cauções a devolver" value={formatarMoeda(liquidez.cauçõesADevolverProximos12Meses)} />
            <KpiTile label="Parcelas de dívida (12 meses)" value={formatarMoeda(liquidez.parcelasDividaProximos12Meses)} />
            <KpiTile
              label="Índice de liquidez corrente"
              value={liquidez.indiceLiquidezCorrente !== null ? liquidez.indiceLiquidezCorrente.toFixed(2) : "—"}
              variant={liquidez.indiceLiquidezCorrente !== null && liquidez.indiceLiquidezCorrente < 1 ? "critical" : "good"}
            />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 24 }}>
            Abaixo de 1,00: o caixa disponível hoje não cobre as parcelas de dívida e cauções exigíveis nos próximos
            12 meses — evidência de que o dinheiro em conta é consumido por compromissos de curto prazo, mesmo com
            vários imóveis no ativo (ativo imobilizado não é liquidez imediata). "Caixa disponível hoje" é a soma de
            todas as transações lançadas — só é um proxy válido se o histórico importado cobrir o período inteiro
            desde a abertura das contas; um mês faltando no meio do histórico distorce este índice.
          </p>
        </>
      )}

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Comprometimento de renda</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <label htmlFor="salario-mensal" style={{ fontSize: 13, color: "var(--ink-soft)" }}>Salário/subsídio mensal (R$)</label>
        <input id="salario-mensal" className="btn" style={{ cursor: "text", width: 120 }} value={salarioMensal} onChange={(e) => setSalarioMensal(e.target.value)} />
      </div>
      {comprometimento && (
        <div className="kpi-grid" style={{ marginBottom: 28 }}>
          <KpiTile label="Parcelas financiamentos" value={formatarMoeda(comprometimento.parcelasFinanciamentos)} />
          <KpiTile label="Parcelas dívidas de consumo" value={formatarMoeda(comprometimento.parcelasConsumo)} />
          <KpiTile label="Total parcelas/mês" value={formatarMoeda(comprometimento.totalParcelas)} />
          <KpiTile
            label="% da renda comprometida"
            value={comprometimento.percentualComprometido !== null ? `${comprometimento.percentualComprometido.toFixed(1)}%` : "—"}
            variant={comprometimento.percentualComprometido !== null && comprometimento.percentualComprometido > 30 ? "critical" : "good"}
          />
        </div>
      )}

      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Demonstrativo de endividamento global</h3>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 12 }}>
        Consolida financiamentos imobiliários e dívidas de consumo (consignado, empréstimo, cartão parcelado) num
        único perfil de risco do CPF — inclua também o que estiver no seu relatório Registrato/SCR (Bacen), lançando
        cada dívida em Cadastros → Dívidas de consumo (não há API pública para buscar isso automaticamente). A
        coluna VPL desconta o fluxo de parcelas futuras pela taxa mensal informada abaixo — mostra que a soma
        nominal das parcelas "vale" menos hoje do que parece, mas ainda é exigibilidade presente sobre o
        patrimônio. Para dívida de consumo (sem prazo cadastrado, só saldo e parcela), o número de parcelas
        restantes é estimado por saldo ÷ parcela — aproximação simples, não o número oficial do contrato.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <label htmlFor="taxa-desconto" style={{ fontSize: 13, color: "var(--ink-soft)" }}>Taxa de desconto mensal (%)</label>
        <input id="taxa-desconto" className="btn" style={{ cursor: "text", width: 80 }} value={taxaDesconto} onChange={(e) => setTaxaDesconto(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Categoria</th><th>Descrição</th><th className="num">Saldo devedor</th><th className="num">Parcela mensal</th><th className="num">VPL</th></tr>
          </thead>
          <tbody>
            {endividamento.map((l, indice) => (
              <tr key={indice}>
                <td>{l.categoria === "financiamento" ? "Financiamento imobiliário" : "Dívida de consumo"}</td>
                <td>{l.descricao}</td>
                <td className="num">{formatarMoeda(l.saldoDevedor)}</td>
                <td className="num">{formatarMoeda(l.parcelaMensal)}</td>
                <td className="num">{formatarMoeda(l.vpl)}</td>
              </tr>
            ))}
            {endividamento.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>Nenhuma dívida cadastrada.</td></tr>
            )}
            {endividamento.length > 0 && (
              <tr>
                <td colSpan={2} style={{ fontWeight: 600 }}>Total</td>
                <td className="num" style={{ fontWeight: 600 }}>{formatarMoeda(somaSaldoDevedor)}</td>
                <td></td>
                <td className="num" style={{ fontWeight: 600 }}>{formatarMoeda(somaVpl)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
