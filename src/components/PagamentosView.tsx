import { useMemo, useState } from "react";
import { Ban, Check, Clock, Link2, Plus, Send, X } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { listarContasBancarias } from "../domain/conciliacao/conciliacao";
import { listarContasAPagar } from "../domain/contasAPagar/contasAPagar";
import {
  solicitarPagamento,
  confirmarPagamento,
  registrarFalhaPagamento,
  conciliarPagamentoComTransacao,
  relatorioPagamentosPendentes,
  type PagamentoIniciado,
  type StatusPagamento,
  type TipoPagamento,
} from "../domain/pagamentos/pagamentosIniciados";
import type { Transacao } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";

const ROTULO_TIPO: Record<TipoPagamento, string> = {
  pix: "PIX",
  ted: "TED",
  doc: "DOC",
};

const ROTULO_STATUS: Record<StatusPagamento, string> = {
  solicitado: "Solicitado",
  confirmado: "Confirmado",
  falhou: "Falhou",
  conciliado: "Conciliado",
};

const PILL_STATUS: Record<StatusPagamento, string> = {
  solicitado: "",
  confirmado: "warning",
  falhou: "critical",
  conciliado: "good",
};

interface RascunhoNovoPagamento {
  tipo: TipoPagamento;
  valor: string;
  destinatarioNome: string;
  destinatarioDocumento: string;
  destinatarioChavePix: string;
  contaBancariaId: string;
  dataSolicitacao: string;
  contasAPagarId: string;
}

interface RascunhoBuscaTransacao {
  valor: string;
  data: string;
  descricao: string;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function rascunhoVazio(): RascunhoNovoPagamento {
  return {
    tipo: "pix",
    valor: "",
    destinatarioNome: "",
    destinatarioDocumento: "",
    destinatarioChavePix: "",
    contaBancariaId: "",
    dataSolicitacao: hoje(),
    contasAPagarId: "",
  };
}

/** Dias corridos entre hoje e `data` (nunca negativo — um pagamento solicitado "no futuro"
 * não existe no fluxo, mas se acontecer não queremos um contador negativo confuso na tela). */
function diasDesde(data: string): number {
  const a = new Date(`${hoje()}T00:00:00Z`).getTime();
  const b = new Date(`${data}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((a - b) / (1000 * 60 * 60 * 24)));
}

/** Base do "tempo parado": para 'confirmado', conta a partir da confirmação (é dali que se
 * espera a conciliação); para 'solicitado', a partir da própria solicitação. */
function diasParado(p: PagamentoIniciado): number {
  const referencia = p.status === "confirmado" ? p.data_confirmacao ?? p.data_solicitacao : p.data_solicitacao;
  return diasDesde(referencia);
}

/** Limiares de destaque — não há SLA formal de provedor (não existe integração real), então
 * são um sinal relativo de "isso está esperando há tempo demais", não um prazo contratual. */
function classePendencia(dias: number): string {
  if (dias > 15) return "critical";
  if (dias > 5) return "warning";
  return "";
}

export function PagamentosView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [filtroStatus, setFiltroStatus] = useState<StatusPagamento | "todos">("todos");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoNovoPagamento>(rascunhoVazio());

  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [dataConfirmacao, setDataConfirmacao] = useState("");

  const [falhandoId, setFalhandoId] = useState<number | null>(null);
  const [motivoFalha, setMotivoFalha] = useState("");

  const [conciliandoId, setConciliandoId] = useState<number | null>(null);
  const [buscaTransacao, setBuscaTransacao] = useState<RascunhoBuscaTransacao>({ valor: "", data: "", descricao: "" });
  const [transacaoSelecionadaId, setTransacaoSelecionadaId] = useState("");

  const entidade = useMemo(() => {
    void versao;
    return db ? obterEntidadeAtiva(db) : null;
  }, [db, versao]);
  const contasBancarias = useMemo(() => {
    void versao;
    return db ? listarContasBancarias(db) : [];
  }, [db, versao]);

  const todasContasAPagar = useMemo(
    () => {
      void versao;
      return db && entidade ? listarContasAPagar(db, entidade.id, {}) : [];
    },
    [db, versao, entidade],
  );
  const obrigacoesAbertas = useMemo(
    () => todasContasAPagar.filter((c) => c.status_calculado === "pendente" || c.status_calculado === "atrasada"),
    [todasContasAPagar],
  );
  const obrigacoesPorId = useMemo(() => new Map(todasContasAPagar.map((c) => [c.id, c])), [todasContasAPagar]);

  const pagamentos = useMemo(
    () => {
      void versao;
      return db && entidade
        ? consultar<PagamentoIniciado>(
            db,
            "SELECT * FROM pagamentos_iniciados WHERE entidade_id = ? ORDER BY data_solicitacao DESC, id DESC",
            [entidade.id],
          )
        : [];
    },
    [db, versao, entidade],
  );
  const pagamentosFiltrados = useMemo(
    () => (filtroStatus === "todos" ? pagamentos : pagamentos.filter((p) => p.status === filtroStatus)),
    [pagamentos, filtroStatus],
  );

  const pendentes = useMemo(
    () => {
      void versao;
      return db && entidade ? relatorioPagamentosPendentes(db, entidade.id) : [];
    },
    [db, versao, entidade],
  );

  const transacoesJaVinculadas = useMemo(
    () => new Set(pagamentos.filter((p) => p.transacao_id !== null).map((p) => p.transacao_id as number)),
    [pagamentos],
  );
  const pagamentoEmConciliacao = useMemo(
    () => (conciliandoId !== null ? pagamentos.find((p) => p.id === conciliandoId) ?? null : null),
    [pagamentos, conciliandoId],
  );
  const candidatosTransacao = useMemo(() => {
    void versao;
    if (!db || !pagamentoEmConciliacao) return [];
    let sql = "SELECT * FROM transacoes WHERE conta_id = ?";
    const params: (string | number)[] = [pagamentoEmConciliacao.conta_bancaria_id];
    if (buscaTransacao.data) {
      sql += " AND data = ?";
      params.push(buscaTransacao.data);
    }
    if (buscaTransacao.descricao.trim()) {
      sql += " AND descricao_original LIKE ?";
      params.push(`%${buscaTransacao.descricao.trim()}%`);
    }
    sql += " ORDER BY data DESC, id DESC LIMIT 200";
    const candidatos = consultar<Transacao>(db, sql, params);

    const valorBusca = buscaTransacao.valor.trim() === "" ? null : Number.parseFloat(buscaTransacao.valor.replace(",", "."));
    return candidatos
      .filter((t) => !transacoesJaVinculadas.has(t.id))
      .filter((t) => valorBusca === null || Math.abs(Math.abs(t.valor) - valorBusca) <= 0.02);
  }, [db, versao, pagamentoEmConciliacao, buscaTransacao, transacoesJaVinculadas]);

  function atualizarRascunho(campos: Partial<RascunhoNovoPagamento>) {
    setRascunho((atual) => ({ ...atual, ...campos }));
  }

  function selecionarTipo(tipo: TipoPagamento) {
    // Chave PIX só é aceita quando tipo === 'pix' — limpa se o operador trocar de tipo com
    // uma chave já digitada, para não recusar o envio por um campo que ficou órfão.
    atualizarRascunho({ tipo, destinatarioChavePix: tipo === "pix" ? rascunho.destinatarioChavePix : "" });
  }

  function selecionarObrigacao(idTexto: string) {
    const obrigacao = obrigacoesAbertas.find((o) => String(o.id) === idTexto);
    setRascunho((atual) => ({
      ...atual,
      contasAPagarId: idTexto,
      destinatarioNome: obrigacao ? obrigacao.fornecedor_nome : atual.destinatarioNome,
      destinatarioDocumento: obrigacao?.fornecedor_cnpj_cpf ? obrigacao.fornecedor_cnpj_cpf : atual.destinatarioDocumento,
      valor: obrigacao ? String(obrigacao.valor) : atual.valor,
    }));
  }

  function abrirFormulario() {
    setMostrarFormulario((visivel) => !visivel);
    setRascunho({ ...rascunhoVazio(), contaBancariaId: contasBancarias[0] ? String(contasBancarias[0].id) : "" });
  }

  async function registrarNovoPagamento() {
    if (!db || !entidade) return;
    const valor = rascunho.valor.trim() === "" ? Number.NaN : Number.parseFloat(rascunho.valor.replace(",", "."));
    const resultado = solicitarPagamento(db, {
      entidade_id: entidade.id,
      conta_bancaria_id: Number(rascunho.contaBancariaId),
      tipo: rascunho.tipo,
      valor,
      destinatario_nome: rascunho.destinatarioNome.trim(),
      destinatario_documento: rascunho.destinatarioDocumento.trim(),
      destinatario_chave_pix: rascunho.destinatarioChavePix.trim() || undefined,
      contas_a_pagar_id: rascunho.contasAPagarId ? Number(rascunho.contasAPagarId) : undefined,
      data_solicitacao: rascunho.dataSolicitacao,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunho(rascunhoVazio());
    setMostrarFormulario(false);
    avisar("good", resultado.mensagem);
  }

  function abrirConfirmacao(id: number) {
    setFalhandoId(null);
    setConciliandoId(null);
    setConfirmandoId(id);
    setDataConfirmacao(hoje());
  }

  async function confirmarAcaoConfirmar() {
    if (!db || confirmandoId === null) return;
    const resultado = confirmarPagamento(db, confirmandoId, dataConfirmacao || undefined);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setConfirmandoId(null);
    avisar("good", resultado.mensagem);
  }

  function abrirFalha(id: number) {
    setConfirmandoId(null);
    setConciliandoId(null);
    setFalhandoId(id);
    setMotivoFalha("");
  }

  async function confirmarAcaoFalha() {
    if (!db || falhandoId === null) return;
    const resultado = registrarFalhaPagamento(db, falhandoId, motivoFalha);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setFalhandoId(null);
    avisar("good", resultado.mensagem);
  }

  function abrirConciliacao(pagamento: PagamentoIniciado) {
    setConfirmandoId(null);
    setFalhandoId(null);
    setConciliandoId(pagamento.id);
    setBuscaTransacao({ valor: String(pagamento.valor), data: "", descricao: "" });
    setTransacaoSelecionadaId("");
  }

  async function confirmarAcaoConciliacao() {
    if (!db || conciliandoId === null || !transacaoSelecionadaId) return;
    const resultado = conciliarPagamentoComTransacao(db, conciliandoId, Number(transacaoSelecionadaId));
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setConciliandoId(null);
    avisar("good", resultado.mensagem);
  }

  if (!entidade) {
    return <p style={{ color: "var(--ink-soft)" }}>Cadastre a entidade titular antes de solicitar pagamentos.</p>;
  }

  return (
    <div>
      <h2 className="section-title">Pagamentos ({pagamentos.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 10 }}>
        Pagamentos eletrônicos (PIX/TED/DOC) que o app pede para sair de uma conta bancária, opcionalmente para baixar
        uma conta a pagar já registrada. <strong>Não existe integração bancária real</strong> — nenhum PIX/TED/DOC é
        enviado de verdade a um provedor. "Confirmar" é o operador informando manualmente, ao ver o extrato ou o
        comprovante, que o pagamento realmente saiu do banco; quando uma integração real existir, será o
        webhook/callback do provedor a chamar esse mesmo passo. A conciliação com a transação bancária do extrato
        importado é o que prova que o dinheiro saiu — até lá, o pagamento fica pendente de atenção.
      </p>

      {pendentes.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Clock size={16} /> Pendentes de atenção ({pendentes.length})
          </strong>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "68ch" }}>
            Solicitados ou confirmados que ainda não foram conciliados com uma transação real do extrato — quanto
            mais tempo parado, mais provável que precise de atenção (o extrato ainda não chegou, ou ninguém ligou as
            duas pontas).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendentes.map((p) => {
              const dias = diasParado(p);
              return (
                <div
                  key={p.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, flexWrap: "wrap" }}
                >
                  <span>
                    {ROTULO_TIPO[p.tipo]} · {p.destinatario_nome} · {formatarMoeda(p.valor)}
                  </span>
                  <span className={`pill ${classePendencia(dias)}`}>
                    {ROTULO_STATUS[p.status]} há {dias} dia{dias === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por status{" "}
          <select className="btn" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusPagamento | "todos")}>
            <option value="todos">Todos</option>
            <option value="solicitado">Solicitado</option>
            <option value="confirmado">Confirmado</option>
            <option value="falhou">Falhou</option>
            <option value="conciliado">Conciliado</option>
          </select>
        </label>
        <button className="btn primary" onClick={abrirFormulario}>
          <Plus size={14} /> {mostrarFormulario ? "Fechar formulário" : "Nova solicitação de pagamento"}
        </button>
      </div>

      {mostrarFormulario && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Send size={16} /> Solicitar novo pagamento
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Obrigação vinculada (opcional)
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.contasAPagarId} onChange={(e) => selecionarObrigacao(e.target.value)}>
                <option value="">— preencher manualmente —</option>
                {obrigacoesAbertas.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.id} · {o.fornecedor_nome} · {formatarMoeda(o.valor)} · vence {o.data_vencimento}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.tipo} onChange={(e) => selecionarTipo(e.target.value as TipoPagamento)}>
                <option value="pix">PIX</option>
                <option value="ted">TED</option>
                <option value="doc">DOC</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor (R$)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.valor} onChange={(e) => atualizarRascunho({ valor: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Destinatário
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.destinatarioNome} onChange={(e) => atualizarRascunho({ destinatarioNome: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              CPF/CNPJ do destinatário
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.destinatarioDocumento} onChange={(e) => atualizarRascunho({ destinatarioDocumento: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Chave PIX {rascunho.tipo !== "pix" && <span>(só para tipo PIX)</span>}
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunho.destinatarioChavePix}
                onChange={(e) => atualizarRascunho({ destinatarioChavePix: e.target.value })}
                disabled={rascunho.tipo !== "pix"}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Conta bancária de origem
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.contaBancariaId} onChange={(e) => atualizarRascunho({ contaBancariaId: e.target.value })}>
                <option value="">— selecione —</option>
                {contasBancarias.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.banco} · {cb.numero}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data de solicitação
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.dataSolicitacao} onChange={(e) => atualizarRascunho({ dataSolicitacao: e.target.value })} />
            </label>
          </div>
          <button
            className="btn primary"
            onClick={registrarNovoPagamento}
            disabled={
              !rascunho.contaBancariaId ||
              !rascunho.valor.trim() ||
              !rascunho.destinatarioNome.trim() ||
              !rascunho.destinatarioDocumento.trim() ||
              !rascunho.dataSolicitacao
            }
          >
            <Send size={14} /> Solicitar pagamento
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Destinatário</th>
              <th className="num">Valor</th>
              <th>Vínculo</th>
              <th>Status</th>
              <th>Solicitado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pagamentosFiltrados.map((p) => {
              const obrigacao = p.contas_a_pagar_id ? obrigacoesPorId.get(p.contas_a_pagar_id) : undefined;
              return (
                <>
                  <tr key={p.id}>
                    <td>{ROTULO_TIPO[p.tipo]}</td>
                    <td>{p.destinatario_nome}</td>
                    <td className="num">{formatarMoeda(p.valor)}</td>
                    <td>
                      {p.contas_a_pagar_id ? (
                        <span style={{ fontSize: 12 }}>
                          Obrigação #{p.contas_a_pagar_id}
                          {obrigacao ? ` — ${obrigacao.fornecedor_nome}` : ""}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-soft)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${PILL_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                    </td>
                    <td>{p.data_solicitacao}</td>
                    <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.status === "solicitado" && (
                        <>
                          <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirConfirmacao(p.id)}>
                            <Check size={12} /> Confirmar
                          </button>
                          <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirFalha(p.id)}>
                            <Ban size={12} /> Registrar falha
                          </button>
                        </>
                      )}
                      {p.status === "confirmado" && (
                        <>
                          <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirConciliacao(p)}>
                            <Link2 size={12} /> Conciliar
                          </button>
                          <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirFalha(p.id)}>
                            <Ban size={12} /> Registrar falha
                          </button>
                        </>
                      )}
                      {p.status === "falhou" && <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{p.motivo_falha}</span>}
                      {p.status === "conciliado" && (
                        <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Transação #{p.transacao_id}</span>
                      )}
                    </td>
                  </tr>
                  {confirmandoId === p.id && (
                    <tr key={`${p.id}-confirmar`}>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "10px 4px", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                            Data em que o pagamento saiu (extrato/comprovante)
                            <input type="date" className="btn" style={{ marginTop: 4 }} value={dataConfirmacao} onChange={(e) => setDataConfirmacao(e.target.value)} />
                          </label>
                          <button className="btn primary" onClick={confirmarAcaoConfirmar}>
                            <Check size={13} /> Confirmar saída manualmente
                          </button>
                          <button className="btn" onClick={() => setConfirmandoId(null)}>
                            <X size={13} /> Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {falhandoId === p.id && (
                    <tr key={`${p.id}-falha`}>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "10px 4px", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, minWidth: 220 }}>
                            Motivo da falha
                            <input
                              className="btn"
                              style={{ cursor: "text", width: "100%", marginTop: 4 }}
                              value={motivoFalha}
                              onChange={(e) => setMotivoFalha(e.target.value)}
                              placeholder="ex: chave PIX inválida, saldo insuficiente, recusado pelo banco…"
                            />
                          </label>
                          <button className="btn danger" onClick={confirmarAcaoFalha} disabled={!motivoFalha.trim()}>
                            <Check size={13} /> Confirmar falha
                          </button>
                          <button className="btn" onClick={() => setFalhandoId(null)}>
                            <X size={13} /> Voltar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {conciliandoId === p.id && (
                    <tr key={`${p.id}-conciliar`}>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <div style={{ padding: "10px 4px" }}>
                          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "68ch" }}>
                            Escolha a transação bancária real (já importada do extrato) que corresponde a este
                            pagamento. Filtros abaixo restringem a busca só na conta bancária de origem.
                          </p>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                              Valor aproximado
                              <input
                                className="btn"
                                style={{ cursor: "text", width: 140, marginTop: 4 }}
                                value={buscaTransacao.valor}
                                onChange={(e) => setBuscaTransacao((a) => ({ ...a, valor: e.target.value }))}
                              />
                            </label>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                              Data
                              <input
                                type="date"
                                className="btn"
                                style={{ marginTop: 4 }}
                                value={buscaTransacao.data}
                                onChange={(e) => setBuscaTransacao((a) => ({ ...a, data: e.target.value }))}
                              />
                            </label>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, minWidth: 200 }}>
                              Descrição contém
                              <input
                                className="btn"
                                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                value={buscaTransacao.descricao}
                                onChange={(e) => setBuscaTransacao((a) => ({ ...a, descricao: e.target.value }))}
                                placeholder="ex: TED, nome do destinatário…"
                              />
                            </label>
                          </div>
                          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
                            Transação correspondente ({candidatosTransacao.length} encontrada{candidatosTransacao.length === 1 ? "" : "s"})
                            <select
                              className="btn"
                              style={{ width: "100%", marginTop: 4 }}
                              value={transacaoSelecionadaId}
                              onChange={(e) => setTransacaoSelecionadaId(e.target.value)}
                            >
                              <option value="">— selecione —</option>
                              {candidatosTransacao.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.data} · {formatarMoeda(t.valor)} · {t.descricao_original}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn primary" onClick={confirmarAcaoConciliacao} disabled={!transacaoSelecionadaId}>
                              <Link2 size={13} /> Conciliar com esta transação
                            </button>
                            <button className="btn" onClick={() => setConciliandoId(null)}>
                              <X size={13} /> Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {pagamentosFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum pagamento solicitado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
