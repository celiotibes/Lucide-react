import { Fragment, useMemo, useState } from "react";
import type { Database } from "sql.js";
import { AlertTriangle, ClipboardCheck, ClipboardList, FileDown, Loader2, Pencil, Wrench } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar, executar } from "../db/connection";
import { calcularCaucao } from "../domain/caucao/calculoCaucao";
import { calcularSaldoCaixaAtual } from "../domain/patrimonio/balancoPatrimonial";
import { baixarRadPdf } from "../domain/laudo/gerarRadPdf";
import type { Caucao, ContratoLocacao, Imovel, ItemInventarioBem } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { registrarLog, resumirDiferenca } from "../domain/auditoria/logAlteracoes";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { finalizarVistoriaContabil, relatorioVistoriasComProvisionamento } from "../domain/erp/integracao-vistorias";
import { sincronizarVistoriaConcluidaParaProvisionamento } from "../domain/erp/integracao-vistorias-provisionamento";
import { useToast } from "../ui/useToast";
import { KpiTile } from "./KpiTile";

interface ItemVistoriaDanoRow {
  item_id: number;
  vistoria_id: number;
  descricao: string;
  severidade: string | null;
  valor_estimado: number | null;
  contrato_id: number;
  vistoria_status: string;
  data_realizada: string | null;
}

interface VistoriaAgrupada {
  vistoria_id: number;
  status: string;
  data_realizada: string | null;
  itens: ItemVistoriaDanoRow[];
  valorTotalDano: number;
}

/** Período aberto mais recente da entidade para lançar a provisão de dano agora, criando
 * um para o mês corrente se nenhum estiver aberto — mesmo padrão de periodoAbertoAtual()
 * em reclassificarTransacao.ts. Duplicado aqui (não importado de lá) porque aquela função
 * não é exportada e esta tarefa só pode tocar este arquivo. */
function periodoAbertoParaProvisionamento(db: Database, entidade_id: number): { id: number } {
  const [periodo] = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND status = 'aberto' ORDER BY ano DESC, mes DESC LIMIT 1`,
    [entidade_id],
  );
  if (periodo) return periodo;

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  executar(db, `INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')`, [
    entidade_id,
    ano,
    mes,
  ]);
  return consultar<{ id: number }>(db, `SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?`, [
    entidade_id,
    ano,
    mes,
  ])[0];
}

interface FormEdicaoCaucao {
  id: number;
  data_devolucao: string;
  valor_devolvido: string;
  deducoes_descricao: string;
  deducoes_valor: string;
}

function paraFormEdicao(c: Caucao): FormEdicaoCaucao {
  return {
    id: c.id,
    data_devolucao: c.data_devolucao ?? "",
    valor_devolvido: c.valor_devolvido?.toString() ?? "",
    deducoes_descricao: c.deducoes_descricao ?? "",
    deducoes_valor: c.deducoes_valor?.toString() ?? "",
  };
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function CaucaoView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const hoje = hojeIso();
  const [gerandoRadId, setGerandoRadId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormEdicaoCaucao | null>(null);
  const [vistoriaExpandidaId, setVistoriaExpandidaId] = useState<number | null>(null);
  const [provisionandoVistoriaId, setProvisionandoVistoriaId] = useState<number | null>(null);

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);
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

  // Itens de vistoria com dano constatado ('dano' ou 'necessidade_reparo'), ligados ao
  // contrato de cada caução — mesmas tabelas reais (`vistoria_item`/`vistorias`) já lidas
  // por integracao-vistorias.ts, sem inventar coluna nem tabela nova.
  const itensVistoriaDano = useMemo<ItemVistoriaDanoRow[]>(
    () =>
      db
        ? consultar<ItemVistoriaDanoRow>(
            db,
            `SELECT vi.id AS item_id, vi.vistoria_id, vi.descricao, vi.severidade, vi.valor_estimado,
                    v.contrato_id AS contrato_id, v.status AS vistoria_status, v.data_realizada
             FROM vistoria_item vi
             JOIN vistorias v ON v.id = vi.vistoria_id
             WHERE vi.tipo IN ('dano', 'necessidade_reparo') AND v.contrato_id IS NOT NULL
             ORDER BY v.data_realizada DESC, vi.id`,
          )
        : [],
    [db, versao],
  );

  // Agrupado por contrato → por vistoria, para exibir uma linha por vistoria (com seus
  // itens de dano) dentro da seção expandida de cada caução.
  const vistoriasPorContrato = useMemo(() => {
    const porContrato = new Map<number, Map<number, VistoriaAgrupada>>();
    for (const item of itensVistoriaDano) {
      if (!porContrato.has(item.contrato_id)) porContrato.set(item.contrato_id, new Map());
      const porVistoria = porContrato.get(item.contrato_id)!;
      if (!porVistoria.has(item.vistoria_id)) {
        porVistoria.set(item.vistoria_id, {
          vistoria_id: item.vistoria_id,
          status: item.vistoria_status,
          data_realizada: item.data_realizada,
          itens: [],
          valorTotalDano: 0,
        });
      }
      const agrupado = porVistoria.get(item.vistoria_id)!;
      agrupado.itens.push(item);
      agrupado.valorTotalDano += item.valor_estimado ?? 0;
    }
    return porContrato;
  }, [itensVistoriaDano]);

  // Valor já provisionado no razão por vistoria — lido direto do razão (ledger_entries),
  // via o mesmo relatório de integracao-vistorias.ts, não recalculado aqui.
  const valorProvisionadoPorVistoria = useMemo(() => {
    const relatorio = db ? relatorioVistoriasComProvisionamento(db) : [];
    return new Map(relatorio.map((r) => [r.vistoria_id, r.valor_provisionado]));
  }, [db, versao]);

  async function provisionarDanoVistoria(vistoriaId: number, statusVistoria: string) {
    if (!db || !entidade) return;
    setProvisionandoVistoriaId(vistoriaId);
    try {
      const periodo = periodoAbertoParaProvisionamento(db, entidade.id);
      let sucesso = false;
      try {
        sucesso =
          statusVistoria === "aprovada"
            ? finalizarVistoriaContabil(db, vistoriaId, entidade.id, periodo.id).sucesso
            : sincronizarVistoriaConcluidaParaProvisionamento(db, vistoriaId, entidade.id, periodo.id);
      } catch (erro) {
        avisar("critical", `Não foi possível provisionar o dano da vistoria ${vistoriaId}: ${(erro as Error).message}`);
        return;
      }
      if (!sucesso) {
        avisar("critical", `Vistoria ${vistoriaId} não pôde ser provisionada (sem dano estimado, já provisionada ou período fechado).`);
        return;
      }
      await persistir();
      avisar("good", `Dano da vistoria ${vistoriaId} provisionado no razão.`);
    } finally {
      setProvisionandoVistoriaId(null);
    }
  }

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

  async function salvarEdicao() {
    if (!db || !formEdicao) return;
    const dadosAnteriores = (consultar<Caucao>(db, "SELECT * FROM caucoes WHERE id = ?", [formEdicao.id])[0] as unknown as Record<string, unknown>) ?? null;
    executar(
      db,
      `UPDATE caucoes SET data_devolucao = ?, valor_devolvido = ?, deducoes_descricao = ?, deducoes_valor = ? WHERE id = ?`,
      [
        formEdicao.data_devolucao || null,
        formEdicao.valor_devolvido.trim() === "" ? null : Number.parseFloat(formEdicao.valor_devolvido.replace(",", ".")),
        formEdicao.deducoes_descricao.trim() || null,
        formEdicao.deducoes_valor.trim() === "" ? 0 : Number.parseFloat(formEdicao.deducoes_valor.replace(",", ".")),
        formEdicao.id,
      ],
    );
    const dadosNovos = consultar<Caucao>(db, "SELECT * FROM caucoes WHERE id = ?", [formEdicao.id])[0] as unknown as Record<string, unknown>;
    registrarLog(db, "caucoes", formEdicao.id, "edicao", resumirDiferenca(dadosAnteriores, dadosNovos), dadosAnteriores, dadosNovos);
    await persistir();
    setFormEdicao(null);
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

      {formEdicao && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6, fontWeight: 600 }}>
            Registrar devolução / dedução
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data da devolução (vazio = ainda retida)
              <input
                type="date"
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={formEdicao.data_devolucao}
                onChange={(e) => setFormEdicao({ ...formEdicao, data_devolucao: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor devolvido (R$)
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={formEdicao.valor_devolvido}
                onChange={(e) => setFormEdicao({ ...formEdicao, valor_devolvido: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Descrição da dedução
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                placeholder="ex: reparo de pintura, aluguel em aberto"
                value={formEdicao.deducoes_descricao}
                onChange={(e) => setFormEdicao({ ...formEdicao, deducoes_descricao: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor da dedução (R$)
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={formEdicao.deducoes_valor}
                onChange={(e) => setFormEdicao({ ...formEdicao, deducoes_valor: e.target.value })}
              />
            </label>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
            A dedução registrada aqui é a mesma usada no cálculo de "A devolver" acima e no RAD gerado por esta
            tela — nunca é calculada automaticamente a partir de uma vistoria (o sistema não presume dano).
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={salvarEdicao}>Salvar</button>
            <button className="btn" onClick={() => setFormEdicao(null)}>Cancelar</button>
          </div>
        </div>
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
              const vistoriasDoContrato = Array.from(vistoriasPorContrato.get(c.contrato_id)?.values() ?? []);
              const temItensVistoria = vistoriasDoContrato.length > 0;
              return (
                <Fragment key={c.id}>
                  <tr>
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
                    <td style={{ display: "flex", gap: 4 }}>
                      <button className="btn" style={{ padding: "4px 7px" }} title="Registrar devolução/dedução" onClick={() => setFormEdicao(paraFormEdicao(c))}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "4px 7px" }}
                        disabled={gerandoRadId === c.id}
                        title="Gerar Relatório de Apuração de Débitos (RAD) em PDF"
                        onClick={() => gerarRad(c, resultado)}
                      >
                        <FileDown size={13} />
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "4px 7px", position: "relative" }}
                        title="Vistoria e provisionamento de dano"
                        onClick={() => setVistoriaExpandidaId((atual) => (atual === c.id ? null : c.id))}
                      >
                        <Wrench size={13} />
                        {temItensVistoria && (
                          <span
                            style={{
                              position: "absolute",
                              top: -3,
                              right: -3,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "var(--critical, #c0392b)",
                            }}
                          />
                        )}
                      </button>
                    </td>
                  </tr>
                  {vistoriaExpandidaId === c.id && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--surface-2)" }}>
                        <div style={{ padding: "12px 4px" }}>
                          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <ClipboardList size={15} /> Vistoria e provisionamento de dano
                            {contrato && <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>— {contrato.locatario}</span>}
                          </strong>
                          {!temItensVistoria ? (
                            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
                              Nenhum item de vistoria com dano constatado (tipo "dano" ou "necessidade_reparo") vinculado
                              ao contrato deste depósito.
                            </p>
                          ) : (
                            (() => {
                              const totalDanoConstatado = vistoriasDoContrato.reduce((acc, v) => acc + v.valorTotalDano, 0);
                              const totalProvisionado = vistoriasDoContrato.reduce(
                                (acc, v) => acc + (valorProvisionadoPorVistoria.get(v.vistoria_id) ?? 0),
                                0,
                              );
                              return (
                                <>
                                  <div className="table-wrap" style={{ marginBottom: 12 }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          <th>Vistoria</th>
                                          <th>Itens com dano</th>
                                          <th className="num">Valor estimado</th>
                                          <th className="num">Provisionado no razão</th>
                                          <th></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {vistoriasDoContrato.map((v) => {
                                          const provisionado = valorProvisionadoPorVistoria.get(v.vistoria_id) ?? 0;
                                          const elegivel = v.status === "concluida" || v.status === "aprovada";
                                          return (
                                            <tr key={v.vistoria_id}>
                                              <td>
                                                #{v.vistoria_id}
                                                {v.data_realizada ? ` — ${v.data_realizada.slice(0, 10)}` : ""}
                                                <div>
                                                  <span className={`pill ${elegivel ? "good" : "warning"}`}>{v.status}</span>
                                                </div>
                                              </td>
                                              <td style={{ fontSize: 12.5 }}>
                                                {v.itens.map((it) => (
                                                  <div key={it.item_id}>
                                                    {it.descricao}
                                                    {it.severidade ? ` (${it.severidade})` : ""} — {formatarMoeda(it.valor_estimado ?? 0)}
                                                  </div>
                                                ))}
                                              </td>
                                              <td className="num">{formatarMoeda(v.valorTotalDano)}</td>
                                              <td className="num">
                                                {provisionado > 0 ? (
                                                  <span className="pill good">
                                                    <ClipboardCheck size={11} style={{ verticalAlign: -1 }} /> {formatarMoeda(provisionado)}
                                                  </span>
                                                ) : (
                                                  "—"
                                                )}
                                              </td>
                                              <td>
                                                {provisionado <= 0 && elegivel && v.valorTotalDano > 0 && (
                                                  <button
                                                    className="btn primary"
                                                    style={{ padding: "4px 8px", fontSize: 12 }}
                                                    disabled={provisionandoVistoriaId === v.vistoria_id || !entidade}
                                                    title={!entidade ? "Cadastre a entidade titular antes de provisionar" : undefined}
                                                    onClick={() => provisionarDanoVistoria(v.vistoria_id, v.status)}
                                                  >
                                                    {provisionandoVistoriaId === v.vistoria_id ? (
                                                      <Loader2 size={12} className="spin" />
                                                    ) : (
                                                      <Wrench size={12} />
                                                    )}{" "}
                                                    Provisionar agora
                                                  </button>
                                                )}
                                                {provisionado <= 0 && !elegivel && (
                                                  <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>vistoria ainda não concluída</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="kpi-grid">
                                    <KpiTile label="Total de danos constatados em vistoria" value={formatarMoeda(totalDanoConstatado)} />
                                    <KpiTile label="Já provisionado no razão" value={formatarMoeda(totalProvisionado)} />
                                    <KpiTile label="Dedução registrada nesta caução" value={formatarMoeda(c.deducoes_valor ?? 0)} />
                                    <KpiTile label="A devolver (cálculo desta tela)" value={formatarMoeda(resultado.valorADevolver)} />
                                  </div>
                                  <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8, maxWidth: "68ch" }}>
                                    "A devolver" acima usa somente a dedução registrada manualmente nesta tela ("Registrar
                                    devolução/dedução") — ela não desconta automaticamente o dano de vistoria mostrado
                                    aqui. Compare os dois valores e, se o dano de vistoria ainda não estiver refletido na
                                    dedução, atualize a dedução manualmente antes de devolver a caução.
                                  </p>
                                </>
                              );
                            })()
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
