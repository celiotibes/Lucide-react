import { useMemo, useState } from "react";
import { AlertTriangle, FileDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { calcularCaucao } from "../domain/caucao/calculoCaucao";
import { calcularSaldoCaixaAtual } from "../domain/patrimonio/balancoPatrimonial";
import { baixarRadPdf } from "../domain/laudo/gerarRadPdf";
import type { Caucao, ContratoLocacao, Imovel, ItemInventarioBem } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function CaucaoView() {
  const { db, versao, persistir } = useDb();
  const hoje = hojeIso();
  const [gerandoRadId, setGerandoRadId] = useState<number | null>(null);

  const caucoes = useMemo<Caucao[]>(() => (db ? consultar<Caucao>(db, "SELECT * FROM caucoes ORDER BY data_deposito DESC") : []), [db, versao]);
  const contratos = useMemo(
    () => new Map((db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao") : []).map((c) => [c.id, c])),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);

  const calculos = useMemo(() => {
    if (!db) return [];
    return caucoes.map((c) => calcularCaucao(db, c.id, hoje));
  }, [db, caucoes, hoje]);

  const caucoesRetidas = caucoes.filter((c) => !c.data_devolucao);
  const passivoCaucaoRetido = caucoes.reduce((acc, c, indice) => (c.data_devolucao ? acc : acc + calculos[indice].valorADevolver), 0);
  const saldoCaixaAtual = useMemo(() => (db ? calcularSaldoCaixaAtual(db) : 0), [db, versao]);
  const caucaoCobertaPeloCaixa = saldoCaixaAtual >= passivoCaucaoRetido;

  async function gerarRad(caucao: Caucao, resultado: (typeof calculos)[number]) {
    if (!db) return;
    const contrato = contratos.get(caucao.contrato_id);
    if (!contrato) return;
    const imovel = imoveis.get(contrato.imovel_id);
    if (!imovel) return;
    setGerandoRadId(caucao.id);
    try {
      const itensInventario = consultar<ItemInventarioBem>(db, "SELECT * FROM imovel_inventario_bens WHERE imovel_id = ? ORDER BY id", [imovel.id]);
      await baixarRadPdf(
        db,
        { imovel, contrato, resultadoCaucao: resultado, itensInventario, dataEmissao: hoje },
        `RAD-${imovel.apelido.replace(/[^\w-]+/g, "_")}-${hoje}.pdf`,
      );
      await persistir();
    } finally {
      setGerandoRadId(null);
    }
  }

  return (
    <div>
      <h2 className="section-title">Depósitos caução ({caucoes.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Correção calculada mês a mês pela série cadastrada em <code>indices_economicos</code> (poupança/IGPM/IPCA). A série
        pré-carregada nos dados de demonstração é <strong>ilustrativa</strong> — substitua pelos valores reais do
        BACEN/IBGE antes de usar o cálculo para fins periciais. O botão <FileDown size={12} style={{ verticalAlign: -1 }} />
        {" "}em cada linha gera o Relatório de Apuração de Débitos (RAD) em PDF — inventário de bens do imóvel
        (cadastrado em Imóveis) + a dedução já registrada nesta tela, sem inventar nenhuma vistoria que não aconteceu.
      </p>

      {caucoesRetidas.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Passivo de caução — reserva ou fluxo de caixa?</h3>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", maxWidth: "68ch", marginBottom: 12 }}>
            Depósito caução não é receita — é obrigação de devolver. Este painel compara o total ainda retido
            (corrigido) contra o caixa disponível hoje, para mostrar se o dinheiro do caução ainda está de fato
            reservado ou já foi consumido no fluxo de caixa geral (o que gera um passivo descoberto). "Caixa
            disponível hoje" é a soma de todas as transações lançadas — só é um proxy válido do saldo real se o
            histórico importado cobrir o período inteiro desde a abertura das contas; se faltar algum mês no
            meio, a cobertura mostrada aqui pode estar errada.
          </p>
          <div className="kpi-grid" style={{ marginBottom: 10 }}>
            <KpiTile label="Passivo de caução retido (corrigido)" value={formatarMoeda(passivoCaucaoRetido)} />
            <KpiTile label="Caixa disponível hoje" value={formatarMoeda(saldoCaixaAtual)} />
            <KpiTile
              label="Cobertura"
              value={caucaoCobertaPeloCaixa ? "coberto" : "descoberto"}
              variant={caucaoCobertaPeloCaixa ? "good" : "critical"}
            />
          </div>
          {!caucaoCobertaPeloCaixa && (
            <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                O caixa disponível hoje não cobre o total de cauções ainda retidas — parte do dinheiro depositado
                pelos locatários já foi usada no fluxo de caixa geral em vez de mantida em reserva, gerando um
                passivo descoberto de {formatarMoeda(passivoCaucaoRetido - saldoCaixaAtual)}.
              </span>
            </div>
          )}
        </>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th className="num">Valor inicial</th>
              <th>Depósito</th>
              <th>Índice</th>
              <th>Situação</th>
              <th className="num">Saldo corrigido hoje</th>
              <th className="num">Deduções</th>
              <th className="num">A devolver</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {caucoes.map((c, indice) => {
              const contrato = contratos.get(c.contrato_id);
              const resultado = calculos[indice];
              return (
                <tr key={c.id}>
                  <td>{contrato ? imoveis.get(contrato.imovel_id)?.apelido : "—"}</td>
                  <td>{contrato?.locatario}</td>
                  <td className="num">{formatarMoeda(c.valor_inicial)}</td>
                  <td>{c.data_deposito}</td>
                  <td style={{ textTransform: "uppercase", fontSize: 12 }}>{c.indice_correcao}</td>
                  <td>
                    {c.data_devolucao ? <span className="pill good">devolvida em {c.data_devolucao}</span> : <span className="pill warning">retida</span>}
                  </td>
                  <td className="num">{formatarMoeda(resultado.saldoCorrigido)}</td>
                  <td className="num">{formatarMoeda(c.deducoes_valor ?? 0)}</td>
                  <td className="num">{formatarMoeda(resultado.valorADevolver)}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ padding: "4px 7px" }}
                      disabled={gerandoRadId === c.id}
                      title="Gerar Relatório de Apuração de Débitos (RAD) em PDF"
                      onClick={() => gerarRad(c, resultado)}
                    >
                      <FileDown size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {caucoes.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum depósito caução cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {calculos.some((r) => r.mesesSemIndiceDisponivel.length > 0) && (
        <div className="aviso-caixa">
          Meses sem taxa cadastrada em <code>indices_economicos</code> não foram compostos no cálculo acima — complete a
          série antes de fechar o valor para fins periciais.
        </div>
      )}
    </div>
  );
}
