import { Fragment, useMemo, useState } from "react";
import { Scale, Plus, UserPlus, Check, X, RotateCcw, PauseCircle, Archive, Gavel, BanknoteArrowDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import {
  criarProcesso,
  adicionarParteProcesso,
  listarProcessos,
  obterProcesso,
  atualizarStatusProcesso,
  encerrarProcesso,
  reabrirProcesso,
  arquivarProcesso,
  registrarDespesaProcesso,
  gerarRelatorioProcesso,
  gerarRelatorioAdvocacia,
  PLANO_CONTA_DESPESA_JURIDICA_PADRAO,
  type StatusProcesso,
  type TipoProcesso,
  type PapelParte,
} from "../domain/advocacia/advocacia";
import type { PlanoConta } from "../domain/types";
import type { StatusContaAPagar } from "../domain/contasAPagar/contasAPagar";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

const ROTULO_STATUS_PROCESSO: Record<StatusProcesso, string> = {
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  arquivado: "Arquivado",
};

const PILL_STATUS_PROCESSO: Record<StatusProcesso, string> = {
  ativo: "good",
  suspenso: "warning",
  encerrado: "",
  arquivado: "",
};

const ROTULO_TIPO: Record<TipoProcesso, string> = {
  civel: "Cível",
  trabalhista: "Trabalhista",
  tributario: "Tributário",
  outro: "Outro",
};

const ROTULO_PAPEL: Record<PapelParte, string> = {
  autor: "Autor",
  reu: "Réu",
  terceiro_interessado: "Terceiro interessado",
};

const ROTULO_STATUS_DESPESA: Record<StatusContaAPagar, string> = {
  pendente: "Pendente",
  atrasada: "Atrasada",
  paga: "Paga",
  cancelada: "Cancelada",
};

const PILL_STATUS_DESPESA: Record<StatusContaAPagar, string> = {
  pendente: "",
  atrasada: "warning",
  paga: "good",
  cancelada: "",
};

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RascunhoNovoProcesso {
  numeroProcesso: string;
  tipo: TipoProcesso;
  varaComarca: string;
  valorCausa: string;
  dataDistribuicao: string;
  observacoes: string;
}

const RASCUNHO_PROCESSO_VAZIO: RascunhoNovoProcesso = {
  numeroProcesso: "",
  tipo: "civel",
  varaComarca: "",
  valorCausa: "",
  dataDistribuicao: "",
  observacoes: "",
};

interface RascunhoParte {
  papel: PapelParte;
  nome: string;
  cpfCnpj: string;
  representadoPorNos: boolean;
}

const RASCUNHO_PARTE_VAZIO: RascunhoParte = {
  papel: "autor",
  nome: "",
  cpfCnpj: "",
  representadoPorNos: false,
};

interface RascunhoEncerramento {
  dataEncerramento: string;
  resultado: string;
}

const RASCUNHO_ENCERRAMENTO_VAZIO: RascunhoEncerramento = {
  dataEncerramento: hojeIso(),
  resultado: "",
};

interface RascunhoDespesa {
  fornecedorNome: string;
  fornecedorCnpjCpf: string;
  descricao: string;
  valor: string;
  dataVencimento: string;
  planoContaCodigo: string;
}

const RASCUNHO_DESPESA_VAZIO: RascunhoDespesa = {
  fornecedorNome: "",
  fornecedorCnpjCpf: "",
  descricao: "",
  valor: "",
  dataVencimento: "",
  planoContaCodigo: PLANO_CONTA_DESPESA_JURIDICA_PADRAO,
};

export function AdvocaciaView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const hoje = hojeIso();

  const [filtroStatus, setFiltroStatus] = useState<StatusProcesso | "todos">("todos");
  const [mostrarFormNovoProcesso, setMostrarFormNovoProcesso] = useState(false);
  const [rascunhoProcesso, setRascunhoProcesso] = useState<RascunhoNovoProcesso>(RASCUNHO_PROCESSO_VAZIO);

  const [processoSelecionadoId, setProcessoSelecionadoId] = useState<number | null>(null);

  const [mostrarFormParte, setMostrarFormParte] = useState(false);
  const [rascunhoParte, setRascunhoParte] = useState<RascunhoParte>(RASCUNHO_PARTE_VAZIO);

  const [encerrandoId, setEncerrandoId] = useState<number | null>(null);
  const [rascunhoEncerramento, setRascunhoEncerramento] = useState<RascunhoEncerramento>(RASCUNHO_ENCERRAMENTO_VAZIO);

  const [mostrarFormDespesa, setMostrarFormDespesa] = useState(false);
  const [rascunhoDespesa, setRascunhoDespesa] = useState<RascunhoDespesa>(RASCUNHO_DESPESA_VAZIO);

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);

  const planoContas = useMemo<PlanoConta[]>(
    () => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []),
    [db, versao],
  );

  const processos = useMemo(
    () =>
      db && entidade
        ? listarProcessos(db, entidade.id, filtroStatus === "todos" ? {} : { status: filtroStatus })
        : [],
    [db, versao, entidade, filtroStatus],
  );

  const relatorioGeral = useMemo(
    () => (db && entidade ? gerarRelatorioAdvocacia(db, entidade.id, hoje) : null),
    [db, versao, entidade, hoje],
  );

  const processoSelecionado = useMemo(
    () => (db && processoSelecionadoId !== null ? obterProcesso(db, processoSelecionadoId) : null),
    [db, versao, processoSelecionadoId],
  );

  const relatorioProcesso = useMemo(
    () => (db && processoSelecionadoId !== null ? gerarRelatorioProcesso(db, processoSelecionadoId, hoje) : null),
    [db, versao, processoSelecionadoId, hoje],
  );

  function atualizarRascunhoProcesso(campos: Partial<RascunhoNovoProcesso>) {
    setRascunhoProcesso((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovoProcesso() {
    if (!db || !entidade) return;
    const valorCausa = rascunhoProcesso.valorCausa.trim() === "" ? undefined : Number.parseFloat(rascunhoProcesso.valorCausa.replace(",", "."));
    const resultado = criarProcesso(db, {
      entidade_id: entidade.id,
      numero_processo: rascunhoProcesso.numeroProcesso.trim() || undefined,
      tipo: rascunhoProcesso.tipo,
      vara_comarca: rascunhoProcesso.varaComarca.trim() || undefined,
      valor_causa: valorCausa,
      data_distribuicao: rascunhoProcesso.dataDistribuicao || undefined,
      observacoes: rascunhoProcesso.observacoes.trim() || undefined,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunhoProcesso(RASCUNHO_PROCESSO_VAZIO);
    setMostrarFormNovoProcesso(false);
    avisar("good", resultado.mensagem);
    if (resultado.id !== undefined) setProcessoSelecionadoId(resultado.id);
  }

  function selecionarProcesso(id: number) {
    setProcessoSelecionadoId((atual) => (atual === id ? null : id));
    setMostrarFormParte(false);
    setMostrarFormDespesa(false);
    setEncerrandoId(null);
  }

  async function registrarNovaParte() {
    if (!db || processoSelecionadoId === null) return;
    if (!rascunhoParte.nome.trim()) {
      avisar("critical", "Informe o nome da parte.");
      return;
    }
    const resultado = adicionarParteProcesso(db, {
      processo_id: processoSelecionadoId,
      papel: rascunhoParte.papel,
      nome: rascunhoParte.nome,
      cpf_cnpj: rascunhoParte.cpfCnpj.trim() || undefined,
      representado_por_nos: rascunhoParte.representadoPorNos,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunhoParte(RASCUNHO_PARTE_VAZIO);
    setMostrarFormParte(false);
    avisar("good", resultado.mensagem);
  }

  async function suspenderOuReativar(processoId: number, novoStatus: "ativo" | "suspenso") {
    if (!db) return;
    const resultado = atualizarStatusProcesso(db, processoId, novoStatus);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    avisar("good", resultado.mensagem);
  }

  function abrirEncerramento(processoId: number) {
    setEncerrandoId(processoId);
    setRascunhoEncerramento(RASCUNHO_ENCERRAMENTO_VAZIO);
  }

  async function confirmarEncerramento() {
    if (!db || encerrandoId === null) return;
    const resultado = encerrarProcesso(db, encerrandoId, {
      data_encerramento: rascunhoEncerramento.dataEncerramento,
      resultado: rascunhoEncerramento.resultado,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setEncerrandoId(null);
    avisar("good", resultado.mensagem);
  }

  async function reabrir(processoId: number) {
    if (!db) return;
    const resultado = reabrirProcesso(db, processoId);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    avisar("good", resultado.mensagem);
  }

  async function arquivar(processoId: number) {
    if (!db) return;
    const resultado = arquivarProcesso(db, processoId);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    avisar("good", resultado.mensagem);
  }

  function atualizarRascunhoDespesa(campos: Partial<RascunhoDespesa>) {
    setRascunhoDespesa((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovaDespesa() {
    if (!db || !entidade || processoSelecionadoId === null) return;
    const valor = Number.parseFloat(rascunhoDespesa.valor.replace(",", "."));
    const resultado = registrarDespesaProcesso(db, {
      processo_id: processoSelecionadoId,
      entidade_id: entidade.id,
      valor,
      data_vencimento: rascunhoDespesa.dataVencimento,
      fornecedor_nome: rascunhoDespesa.fornecedorNome.trim(),
      fornecedor_cnpj_cpf: rascunhoDespesa.fornecedorCnpjCpf.trim() || undefined,
      descricao: rascunhoDespesa.descricao.trim() || undefined,
      plano_conta_codigo: rascunhoDespesa.planoContaCodigo || undefined,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunhoDespesa(RASCUNHO_DESPESA_VAZIO);
    setMostrarFormDespesa(false);
    avisar("good", resultado.mensagem);
  }

  if (!entidade) {
    return <p style={{ color: "var(--ink-soft)" }}>Cadastre a entidade titular antes de registrar processos jurídicos.</p>;
  }

  return (
    <div>
      <h2 className="section-title">Advocacia — processos judiciais ({processos.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Cadastro de processos judiciais, suas partes e o ciclo de vida (ativo, suspenso, encerrado, arquivado). Despesa
        jurídica (honorários, custas) é uma linha comum de <code>contas_a_pagar</code> vinculada ao processo — ganha de
        graça aging e baixa real no razão contábil, sem duplicar controle de vencimento.
      </p>

      {relatorioGeral && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <KpiTile label="Processos ativos" value={relatorioGeral.processos_ativos} />
          <KpiTile label="Processos encerrados" value={relatorioGeral.processos_encerrados} />
          <KpiTile label="Total gasto no período" value={formatarMoeda(relatorioGeral.total_geral_despesas)} />
          <KpiTile label="Total pago" value={formatarMoeda(relatorioGeral.total_geral_pago)} variant="good" />
          <KpiTile
            label="Total pendente"
            value={formatarMoeda(relatorioGeral.total_geral_pendente)}
            variant={relatorioGeral.total_geral_pendente > 0 ? "critical" : undefined}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por status{" "}
          <select className="btn" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusProcesso | "todos")}>
            <option value="todos">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="encerrado">Encerrado</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() => {
            setMostrarFormNovoProcesso((v) => !v);
            setRascunhoProcesso(RASCUNHO_PROCESSO_VAZIO);
          }}
        >
          <Plus size={14} /> {mostrarFormNovoProcesso ? "Fechar formulário" : "Novo processo"}
        </button>
      </div>

      {mostrarFormNovoProcesso && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Gavel size={16} /> Registrar novo processo
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Número do processo
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoProcesso.numeroProcesso}
                onChange={(e) => atualizarRascunhoProcesso({ numeroProcesso: e.target.value })}
                placeholder="ex: 0001234-56.2026.8.26.0100"
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoProcesso.tipo}
                onChange={(e) => atualizarRascunhoProcesso({ tipo: e.target.value as TipoProcesso })}
              >
                {(Object.keys(ROTULO_TIPO) as TipoProcesso[]).map((t) => (
                  <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Vara / comarca
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoProcesso.varaComarca}
                onChange={(e) => atualizarRascunhoProcesso({ varaComarca: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Valor da causa (R$)
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoProcesso.valorCausa}
                onChange={(e) => atualizarRascunhoProcesso({ valorCausa: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data de distribuição
              <input
                type="date"
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoProcesso.dataDistribuicao}
                onChange={(e) => atualizarRascunhoProcesso({ dataDistribuicao: e.target.value })}
              />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Observações
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={rascunhoProcesso.observacoes}
              onChange={(e) => atualizarRascunhoProcesso({ observacoes: e.target.value })}
            />
          </label>
          <button className="btn primary" onClick={registrarNovoProcesso}>
            Registrar processo
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Tipo</th>
              <th>Vara / comarca</th>
              <th>Status</th>
              <th className="num">Valor da causa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {processos.map((p) => (
              <Fragment key={p.id}>
                <tr onClick={() => selecionarProcesso(p.id)} style={{ cursor: "pointer" }}>
                  <td>{p.numero_processo ?? "—"}</td>
                  <td>{ROTULO_TIPO[p.tipo]}</td>
                  <td>{p.vara_comarca ?? "—"}</td>
                  <td>
                    <span className={`pill ${PILL_STATUS_PROCESSO[p.status]}`}>{ROTULO_STATUS_PROCESSO[p.status]}</span>
                  </td>
                  <td className="num">{p.valor_causa !== null ? formatarMoeda(p.valor_causa) : "—"}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); selecionarProcesso(p.id); }}>
                      {processoSelecionadoId === p.id ? "Fechar" : "Ver detalhes"}
                    </button>
                  </td>
                </tr>
                {processoSelecionadoId === p.id && (
                  <tr>
                    <td colSpan={6} style={{ background: "var(--surface-2)" }}>
                      <div style={{ padding: "14px 4px" }}>
                        {p.observacoes && (
                          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
                            {p.observacoes}
                          </p>
                        )}
                        {p.resultado && (
                          <p style={{ fontSize: 12.5, marginBottom: 12 }}>
                            <strong>Resultado:</strong> {p.resultado}
                            {p.data_encerramento ? ` (${p.data_encerramento})` : ""}
                          </p>
                        )}

                        {/* Ações de ciclo de vida */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                          {p.status === "ativo" && (
                            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => suspenderOuReativar(p.id, "suspenso")}>
                              <PauseCircle size={13} /> Suspender
                            </button>
                          )}
                          {p.status === "suspenso" && (
                            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => suspenderOuReativar(p.id, "ativo")}>
                              <RotateCcw size={13} /> Reativar
                            </button>
                          )}
                          {(p.status === "ativo" || p.status === "suspenso") && (
                            <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => abrirEncerramento(p.id)}>
                              <Scale size={13} /> Encerrar
                            </button>
                          )}
                          {(p.status === "encerrado" || p.status === "arquivado") && (
                            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => reabrir(p.id)}>
                              <RotateCcw size={13} /> Reabrir
                            </button>
                          )}
                          {p.status === "encerrado" && (
                            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => arquivar(p.id)}>
                              <Archive size={13} /> Arquivar
                            </button>
                          )}
                        </div>

                        {encerrandoId === p.id && (
                          <div className="card" style={{ marginBottom: 16 }}>
                            <strong style={{ display: "block", marginBottom: 10, fontSize: 13 }}>Encerrar processo</strong>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Data de encerramento
                                <input
                                  type="date"
                                  className="btn"
                                  style={{ marginTop: 4 }}
                                  value={rascunhoEncerramento.dataEncerramento}
                                  onChange={(e) => setRascunhoEncerramento((a) => ({ ...a, dataEncerramento: e.target.value }))}
                                />
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, minWidth: 220 }}>
                                Resultado
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoEncerramento.resultado}
                                  onChange={(e) => setRascunhoEncerramento((a) => ({ ...a, resultado: e.target.value }))}
                                  placeholder="ex: procedente, acordo homologado, extinto sem mérito…"
                                />
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn danger"
                                onClick={confirmarEncerramento}
                                disabled={!rascunhoEncerramento.dataEncerramento || !rascunhoEncerramento.resultado.trim()}
                              >
                                <Check size={13} /> Confirmar encerramento
                              </button>
                              <button className="btn" onClick={() => setEncerrandoId(null)}>
                                <X size={13} /> Voltar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Partes */}
                        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13 }}>
                          Partes
                          <button
                            className="btn"
                            style={{ padding: "3px 7px", fontSize: 11.5 }}
                            onClick={() => { setMostrarFormParte((v) => !v); setRascunhoParte(RASCUNHO_PARTE_VAZIO); }}
                          >
                            <UserPlus size={12} /> {mostrarFormParte ? "Fechar" : "Adicionar parte"}
                          </button>
                        </strong>

                        {mostrarFormParte && (
                          <div className="card" style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Papel
                                <select
                                  className="btn"
                                  style={{ width: "100%", marginTop: 4 }}
                                  value={rascunhoParte.papel}
                                  onChange={(e) => setRascunhoParte((a) => ({ ...a, papel: e.target.value as PapelParte }))}
                                >
                                  {(Object.keys(ROTULO_PAPEL) as PapelParte[]).map((papel) => (
                                    <option key={papel} value={papel}>{ROTULO_PAPEL[papel]}</option>
                                  ))}
                                </select>
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Nome
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoParte.nome}
                                  onChange={(e) => setRascunhoParte((a) => ({ ...a, nome: e.target.value }))}
                                />
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                CPF/CNPJ (opcional)
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoParte.cpfCnpj}
                                  onChange={(e) => setRascunhoParte((a) => ({ ...a, cpfCnpj: e.target.value }))}
                                />
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
                                <input
                                  type="checkbox"
                                  checked={rascunhoParte.representadoPorNos}
                                  onChange={(e) => setRascunhoParte((a) => ({ ...a, representadoPorNos: e.target.checked }))}
                                />
                                É nosso cliente (representado por nós)
                              </label>
                            </div>
                            <button className="btn primary" onClick={registrarNovaParte} disabled={!rascunhoParte.nome.trim()}>
                              Adicionar parte
                            </button>
                          </div>
                        )}

                        <div className="table-wrap" style={{ marginBottom: 16 }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Papel</th>
                                <th>Nome</th>
                                <th>CPF/CNPJ</th>
                                <th>Representação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {processoSelecionado?.partes.map((parte) => (
                                <tr key={parte.id}>
                                  <td>{ROTULO_PAPEL[parte.papel]}</td>
                                  <td>{parte.nome}</td>
                                  <td>{parte.cpf_cnpj ?? "—"}</td>
                                  <td>
                                    <span className={`pill ${parte.representado_por_nos ? "good" : ""}`}>
                                      {parte.representado_por_nos ? "Nosso cliente" : "Parte contrária"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {(!processoSelecionado || processoSelecionado.partes.length === 0) && (
                                <tr>
                                  <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                    Nenhuma parte cadastrada ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Relatório financeiro do processo */}
                        {relatorioProcesso && (
                          <>
                            <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13 }}>
                              Despesas do processo
                              {(p.status === "ativo" || p.status === "suspenso") && (
                                <button
                                  className="btn"
                                  style={{ padding: "3px 7px", fontSize: 11.5 }}
                                  onClick={() => { setMostrarFormDespesa((v) => !v); setRascunhoDespesa(RASCUNHO_DESPESA_VAZIO); }}
                                >
                                  <BanknoteArrowDown size={12} /> {mostrarFormDespesa ? "Fechar" : "Registrar despesa"}
                                </button>
                              )}
                            </strong>

                            <div className="kpi-grid" style={{ marginBottom: 12 }}>
                              <KpiTile label="Total gasto" value={formatarMoeda(relatorioProcesso.total_despesas)} />
                              <KpiTile label="Total pago" value={formatarMoeda(relatorioProcesso.total_pago)} variant="good" />
                              <KpiTile
                                label="Pendente / atrasado"
                                value={formatarMoeda(relatorioProcesso.total_pendente)}
                                variant={relatorioProcesso.total_pendente > 0 ? "critical" : undefined}
                              />
                            </div>

                            {mostrarFormDespesa && (
                              <div className="card" style={{ marginBottom: 12 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    Fornecedor
                                    <input
                                      className="btn"
                                      style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                      value={rascunhoDespesa.fornecedorNome}
                                      onChange={(e) => atualizarRascunhoDespesa({ fornecedorNome: e.target.value })}
                                      placeholder="ex: escritório, cartório, perito…"
                                    />
                                  </label>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    CNPJ/CPF (opcional)
                                    <input
                                      className="btn"
                                      style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                      value={rascunhoDespesa.fornecedorCnpjCpf}
                                      onChange={(e) => atualizarRascunhoDespesa({ fornecedorCnpjCpf: e.target.value })}
                                    />
                                  </label>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    Valor (R$)
                                    <input
                                      className="btn"
                                      style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                      value={rascunhoDespesa.valor}
                                      onChange={(e) => atualizarRascunhoDespesa({ valor: e.target.value })}
                                    />
                                  </label>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    Vencimento
                                    <input
                                      type="date"
                                      className="btn"
                                      style={{ width: "100%", marginTop: 4 }}
                                      value={rascunhoDespesa.dataVencimento}
                                      onChange={(e) => atualizarRascunhoDespesa({ dataVencimento: e.target.value })}
                                    />
                                  </label>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    Plano de contas
                                    <select
                                      className="btn"
                                      style={{ width: "100%", marginTop: 4 }}
                                      value={rascunhoDespesa.planoContaCodigo}
                                      onChange={(e) => atualizarRascunhoDespesa({ planoContaCodigo: e.target.value })}
                                    >
                                      {planoContas.map((pc) => (
                                        <option key={pc.codigo} value={pc.codigo}>{pc.codigo} · {pc.descricao}</option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
                                  Descrição
                                  <input
                                    className="btn"
                                    style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                    value={rascunhoDespesa.descricao}
                                    onChange={(e) => atualizarRascunhoDespesa({ descricao: e.target.value })}
                                  />
                                </label>
                                <button
                                  className="btn primary"
                                  onClick={registrarNovaDespesa}
                                  disabled={!rascunhoDespesa.fornecedorNome.trim() || !rascunhoDespesa.valor.trim() || !rascunhoDespesa.dataVencimento}
                                >
                                  Registrar despesa
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
                                  </tr>
                                </thead>
                                <tbody>
                                  {relatorioProcesso.despesas.map((d) => (
                                    <tr key={d.id}>
                                      <td>{d.fornecedor_nome}</td>
                                      <td>{d.descricao ?? "—"}</td>
                                      <td className="num">{formatarMoeda(d.valor)}</td>
                                      <td>{d.data_vencimento}</td>
                                      <td>
                                        <span className={`pill ${PILL_STATUS_DESPESA[d.status_calculado]}`}>
                                          {ROTULO_STATUS_DESPESA[d.status_calculado]}
                                          {d.status_calculado === "atrasada" ? ` (${d.dias_atraso}d)` : ""}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                  {relatorioProcesso.despesas.length === 0 && (
                                    <tr>
                                      <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                        Nenhuma despesa registrada para este processo ainda.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {processos.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum processo registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
