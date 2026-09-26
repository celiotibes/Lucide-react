import { useMemo, useState } from "react";
import { BanknoteArrowDown, Check, Plus, X } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { listarContasBancarias } from "../domain/conciliacao/conciliacao";
import { listarDocumentos } from "../domain/documentos/documentos";
import {
  registrarContaAPagar,
  baixarContaAPagar,
  cancelarContaAPagar,
  listarContasAPagar,
  gerarRelatorioAging,
  type StatusContaAPagar,
  type FaixaAging,
} from "../domain/contasAPagar/contasAPagar";
import type { Imovel, PlanoConta } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";

const ROTULO_STATUS: Record<StatusContaAPagar, string> = {
  pendente: "Pendente",
  atrasada: "Atrasada",
  paga: "Paga",
  cancelada: "Cancelada",
};

const PILL_STATUS: Record<StatusContaAPagar, string> = {
  pendente: "",
  atrasada: "warning",
  paga: "good",
  cancelada: "",
};

const ROTULO_FAIXA: Record<FaixaAging, string> = {
  a_vencer: "A vencer",
  "0-30": "0–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "90+": "90+ dias",
};

interface RascunhoNovaConta {
  fornecedorNome: string;
  fornecedorCnpjCpf: string;
  descricao: string;
  valor: string;
  dataVencimento: string;
  planoContaCodigo: string;
  imovelId: string;
  documentoId: string;
}

const RASCUNHO_VAZIO: RascunhoNovaConta = {
  fornecedorNome: "",
  fornecedorCnpjCpf: "",
  descricao: "",
  valor: "",
  dataVencimento: "",
  planoContaCodigo: "",
  imovelId: "",
  documentoId: "",
};

export function ContasAPagarView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [filtroStatus, setFiltroStatus] = useState<StatusContaAPagar | "todas">("todas");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoNovaConta>(RASCUNHO_VAZIO);
  const [baixandoId, setBaixandoId] = useState<number | null>(null);
  const [contaBancariaBaixa, setContaBancariaBaixa] = useState<string>("");
  const [dataPagamentoBaixa, setDataPagamentoBaixa] = useState<string>("");
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);
  const planoContas = useMemo<PlanoConta[]>(
    () => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []),
    [db, versao],
  );
  const imoveis = useMemo<Imovel[]>(
    () => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY COALESCE(cidade,'zzz'), apelido") : []),
    [db, versao],
  );
  const documentos = useMemo(() => (db ? listarDocumentos(db) : []), [db, versao]);
  const contasBancarias = useMemo(() => (db ? listarContasBancarias(db) : []), [db, versao]);

  const contas = useMemo(
    () =>
      db && entidade
        ? listarContasAPagar(db, entidade.id, filtroStatus === "todas" ? {} : { status: filtroStatus })
        : [],
    [db, versao, entidade, filtroStatus],
  );

  const aging = useMemo(() => (db && entidade ? gerarRelatorioAging(db, entidade.id) : null), [db, versao, entidade]);

  function atualizarRascunho(campos: Partial<RascunhoNovaConta>) {
    setRascunho((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovaConta() {
    if (!db || !entidade) return;
    const valor = rascunho.valor.trim() === "" ? undefined : Number.parseFloat(rascunho.valor.replace(",", "."));
    const resultado = registrarContaAPagar(db, {
      entidade_id: entidade.id,
      documento_id: rascunho.documentoId ? Number(rascunho.documentoId) : undefined,
      fornecedor_nome: rascunho.fornecedorNome.trim() || undefined,
      fornecedor_cnpj_cpf: rascunho.fornecedorCnpjCpf.trim() || undefined,
      descricao: rascunho.descricao.trim() || undefined,
      valor,
      data_vencimento: rascunho.dataVencimento,
      plano_conta_codigo: rascunho.planoContaCodigo || undefined,
      imovel_id: rascunho.imovelId ? Number(rascunho.imovelId) : undefined,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunho(RASCUNHO_VAZIO);
    setMostrarFormulario(false);
    avisar("good", resultado.mensagem);
  }

  function abrirBaixa(id: number) {
    setCancelandoId(null);
    setBaixandoId(id);
    setContaBancariaBaixa(contasBancarias[0] ? String(contasBancarias[0].id) : "");
    setDataPagamentoBaixa(new Date().toISOString().slice(0, 10));
  }

  async function confirmarBaixa() {
    if (!db || baixandoId === null || !contaBancariaBaixa) return;
    const resultado = baixarContaAPagar(db, baixandoId, Number(contaBancariaBaixa), dataPagamentoBaixa);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setBaixandoId(null);
    avisar("good", resultado.mensagem);
  }

  function abrirCancelamento(id: number) {
    setBaixandoId(null);
    setCancelandoId(id);
    setMotivoCancelamento("");
  }

  async function confirmarCancelamento() {
    if (!db || cancelandoId === null) return;
    const resultado = cancelarContaAPagar(db, cancelandoId, motivoCancelamento);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setCancelandoId(null);
    avisar("good", resultado.mensagem);
  }

  if (!entidade) {
    return <p style={{ color: "var(--ink-soft)" }}>Cadastre a entidade titular antes de registrar contas a pagar.</p>;
  }

  return (
    <div>
      <h2 className="section-title">Contas a pagar ({contas.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Obrigações de pagar um fornecedor, com vencimento e aging (a vencer / atrasada por faixa). A baixa gera a saída
        de caixa na conta bancária escolhida e os dois lançamentos correspondentes no razão — a mesma rota de uma
        transação bancária importada, então o pagamento nunca fica registrado só aqui.
      </p>

      {aging && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {aging.faixas.map((f) => (
            <div key={f.faixa} className="kpi-tile">
              <div className="label">{ROTULO_FAIXA[f.faixa]}</div>
              <div className={`value ${f.faixa !== "a_vencer" && f.total > 0 ? "critical" : ""}`}>{formatarMoeda(f.total)}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{f.itens.length} conta(s)</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por status{" "}
          <select className="btn" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusContaAPagar | "todas")}>
            <option value="todas">Todas</option>
            <option value="pendente">Pendente</option>
            <option value="atrasada">Atrasada</option>
            <option value="paga">Paga</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
        <button className="btn primary" onClick={() => { setMostrarFormulario((v) => !v); setRascunho(RASCUNHO_VAZIO); }}>
          <Plus size={14} /> {mostrarFormulario ? "Fechar formulário" : "Nova conta a pagar"}
        </button>
      </div>

      {mostrarFormulario && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <BanknoteArrowDown size={16} /> Registrar nova conta a pagar
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Documento vinculado (opcional)
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.documentoId} onChange={(e) => atualizarRascunho({ documentoId: e.target.value })}>
                <option value="">— nenhum —</option>
                {documentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.arquivo_nome}{d.nome_contraparte ? ` — ${d.nome_contraparte}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Fornecedor {rascunho.documentoId && <span style={{ color: "var(--ink-soft)" }}>(herda do documento se vazio)</span>}
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.fornecedorNome} onChange={(e) => atualizarRascunho({ fornecedorNome: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              CNPJ/CPF (opcional)
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.fornecedorCnpjCpf} onChange={(e) => atualizarRascunho({ fornecedorCnpjCpf: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor (R$) {rascunho.documentoId && <span style={{ color: "var(--ink-soft)" }}>(herda do documento se vazio)</span>}
              <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.valor} onChange={(e) => atualizarRascunho({ valor: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Vencimento
              <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.dataVencimento} onChange={(e) => atualizarRascunho({ dataVencimento: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Plano de contas
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.planoContaCodigo} onChange={(e) => atualizarRascunho({ planoContaCodigo: e.target.value })}>
                <option value="">— sem categoria —</option>
                {planoContas.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.descricao}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel (opcional)
              <select className="btn" style={{ width: "100%", marginTop: 4 }} value={rascunho.imovelId} onChange={(e) => atualizarRascunho({ imovelId: e.target.value })}>
                <option value="">— nenhum —</option>
                {imoveis.map((im) => <option key={im.id} value={im.id}>{im.apelido}{im.cidade ? ` (${im.cidade})` : ""}</option>)}
              </select>
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Descrição
            <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={rascunho.descricao} onChange={(e) => atualizarRascunho({ descricao: e.target.value })} placeholder="ex: manutenção elétrica, honorários…" />
          </label>
          <button className="btn primary" onClick={registrarNovaConta} disabled={!rascunho.dataVencimento}>
            Registrar
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Descrição</th>
              <th className="num">Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <>
                <tr key={c.id}>
                  <td>{c.fornecedor_nome}</td>
                  <td>{c.descricao ?? "—"}</td>
                  <td className="num">{formatarMoeda(c.valor)}</td>
                  <td>{c.data_vencimento}</td>
                  <td>
                    <span className={`pill ${PILL_STATUS[c.status_calculado]}`}>
                      {ROTULO_STATUS[c.status_calculado]}
                      {c.status_calculado === "atrasada" ? ` (${c.dias_atraso}d)` : ""}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    {(c.status_calculado === "pendente" || c.status_calculado === "atrasada") && (
                      <>
                        <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirBaixa(c.id)}>
                          Baixar
                        </button>
                        <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirCancelamento(c.id)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {baixandoId === c.id && (
                  <tr key={`${c.id}-baixa`}>
                    <td colSpan={6} style={{ background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "10px 4px", flexWrap: "wrap" }}>
                        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                          Conta bancária
                          <select className="btn" style={{ width: 220, marginTop: 4 }} value={contaBancariaBaixa} onChange={(e) => setContaBancariaBaixa(e.target.value)}>
                            {contasBancarias.map((cb) => (
                              <option key={cb.id} value={cb.id}>
                                {cb.banco} · {cb.numero}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                          Data de pagamento
                          <input type="date" className="btn" style={{ marginTop: 4 }} value={dataPagamentoBaixa} onChange={(e) => setDataPagamentoBaixa(e.target.value)} />
                        </label>
                        <button className="btn primary" onClick={confirmarBaixa} disabled={!contaBancariaBaixa || !dataPagamentoBaixa}>
                          <Check size={13} /> Confirmar baixa
                        </button>
                        <button className="btn" onClick={() => setBaixandoId(null)}>
                          <X size={13} /> Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {cancelandoId === c.id && (
                  <tr key={`${c.id}-cancel`}>
                    <td colSpan={6} style={{ background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "10px 4px", flexWrap: "wrap" }}>
                        <label style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, minWidth: 220 }}>
                          Motivo do cancelamento
                          <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="ex: duplicidade, boleto cancelado pelo fornecedor…" />
                        </label>
                        <button className="btn danger" onClick={confirmarCancelamento} disabled={!motivoCancelamento.trim()}>
                          <Check size={13} /> Confirmar cancelamento
                        </button>
                        <button className="btn" onClick={() => setCancelandoId(null)}>
                          <X size={13} /> Voltar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {contas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma conta a pagar registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
