import { Fragment, useMemo, useState, type FormEvent } from "react";
import {
  ShieldCheck, ShieldAlert, KeyRound, FileJson, UserCheck, Trash2, Pencil, ClipboardList, Eye, Download, Clock,
} from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import {
  registrarSolicitacao, atenderAcesso, atenderPortabilidade, atenderExclusao, atenderCorrecao,
  type SolicitacaoLGPD, type TipoSolicitacaoLGPD, type RegistroPessoalEncontrado, type ResultadoExclusaoLGPD,
} from "../domain/lgpd/direitosTitular";
import { registrarRotacao, listarRotacoes, proximaRotacaoDevida } from "../domain/lgpd/rotacaoChave";
import { useToast } from "../ui/useToast";

const ROTULO_TIPO: Record<TipoSolicitacaoLGPD, string> = {
  acesso: "Acesso", portabilidade: "Portabilidade", exclusao: "Exclusão", correcao: "Correção",
};
const ICONE_TIPO: Record<TipoSolicitacaoLGPD, typeof Eye> = {
  acesso: Eye, portabilidade: Download, exclusao: Trash2, correcao: Pencil,
};
const PILL_STATUS: Record<SolicitacaoLGPD["status"], string> = {
  pendente: "warning", atendida: "good", recusada: "critical",
};
const ROTULO_STATUS: Record<SolicitacaoLGPD["status"], string> = {
  pendente: "Pendente", atendida: "Atendida", recusada: "Recusada",
};

interface FormCorrecao {
  campo: string;
  valor_novo: string;
}

function formatarData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

export function LgpdView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  // --- Seção 1: solicitações de titular ---------------------------------------------
  const solicitacoes = useMemo(
    () => (db ? consultar<SolicitacaoLGPD>(db, "SELECT * FROM solicitacoes_lgpd ORDER BY data_solicitacao DESC") : []),
    [db, versao],
  );

  const [novoNome, setNovoNome] = useState("");
  const [novoCpf, setNovoCpf] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoSolicitacaoLGPD>("acesso");

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [formsCorrecao, setFormsCorrecao] = useState<Record<number, FormCorrecao>>({});

  // Resultados obtidos NESTA sessão de tela — só o resumo (contagem/motivo) fica gravado
  // permanentemente em solicitacoes_lgpd.detalhes/motivo_recusa; o conteúdo pessoal
  // completo (lista de registros, export JSON) não é reencontrado depois de recarregar a
  // página, por desenho: minimização de dado, o mesmo princípio de nunca duplicar dado
  // pessoal fora das tabelas de origem.
  const [resultadosAcesso, setResultadosAcesso] = useState<Record<number, RegistroPessoalEncontrado[]>>({});
  const [resultadosPortabilidade, setResultadosPortabilidade] = useState<Record<number, string>>({});
  const [resultadosExclusao, setResultadosExclusao] = useState<Record<number, ResultadoExclusaoLGPD>>({});
  const [resultadosCorrecao, setResultadosCorrecao] = useState<Record<number, { tabela: string; registro_id: number }[]>>({});

  async function registrarNovaSolicitacao(e: FormEvent) {
    e.preventDefault();
    if (!db) return;
    if (!novoNome.trim() || !novoCpf.trim()) {
      avisar("warning", "Preencha nome e CPF do titular.");
      return;
    }
    try {
      registrarSolicitacao(db, { titular_nome: novoNome.trim(), titular_cpf: novoCpf.trim(), tipo: novoTipo });
      await persistir();
      avisar("good", `Solicitação de ${ROTULO_TIPO[novoTipo].toLowerCase()} registrada como pendente.`);
      setNovoNome("");
      setNovoCpf("");
      setNovoTipo("acesso");
    } catch (erro) {
      avisar("critical", `Não foi possível registrar a solicitação: ${(erro as Error).message}`);
    }
  }

  function alternarExpandido(id: number) {
    setExpandidoId((atual) => (atual === id ? null : id));
  }

  async function atenderSolicitacaoAcesso(s: SolicitacaoLGPD) {
    if (!db) return;
    setProcessandoId(s.id);
    try {
      const resultado = atenderAcesso(db, s.id, s.titular_cpf);
      setResultadosAcesso((prev) => ({ ...prev, [s.id]: resultado.registros }));
      await persistir();
      avisar("good", `Acesso concedido: ${resultado.registros.length} registro(s) encontrado(s) para ${s.titular_nome}.`);
    } catch (erro) {
      avisar("critical", `Não foi possível atender o acesso: ${(erro as Error).message}`);
    } finally {
      setProcessandoId(null);
    }
  }

  async function atenderSolicitacaoPortabilidade(s: SolicitacaoLGPD) {
    if (!db) return;
    setProcessandoId(s.id);
    try {
      const resultado = atenderPortabilidade(db, s.id, s.titular_cpf);
      setResultadosPortabilidade((prev) => ({ ...prev, [s.id]: resultado.exportacaoJson }));
      await persistir();
      avisar("good", `Export de portabilidade gerado para ${s.titular_nome}.`);
    } catch (erro) {
      avisar("critical", `Não foi possível atender a portabilidade: ${(erro as Error).message}`);
    } finally {
      setProcessandoId(null);
    }
  }

  function baixarJsonPortabilidade(s: SolicitacaoLGPD) {
    const json = resultadosPortabilidade[s.id];
    if (!json) return;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portabilidade-lgpd_${s.titular_nome.replace(/[^\w-]+/g, "_")}_${s.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function atenderSolicitacaoExclusao(s: SolicitacaoLGPD) {
    if (!db) return;
    setProcessandoId(s.id);
    try {
      const resultado = atenderExclusao(db, s.id, s.titular_cpf);
      setResultadosExclusao((prev) => ({ ...prev, [s.id]: resultado }));
      await persistir();
      if (resultado.aceita) {
        avisar("good", `Exclusão atendida: identidade anonimizada em ${resultado.registros_anonimizados?.length ?? 0} registro(s).`);
      } else {
        avisar("warning", `Exclusão RECUSADA para ${s.titular_nome} — há registro(s) sob retenção legal ativa. Ver motivo no detalhe.`);
      }
    } catch (erro) {
      avisar("critical", `Não foi possível processar a exclusão: ${(erro as Error).message}`);
    } finally {
      setProcessandoId(null);
    }
  }

  async function atenderSolicitacaoCorrecao(s: SolicitacaoLGPD) {
    if (!db) return;
    const form = formsCorrecao[s.id];
    if (!form?.campo?.trim() || !form?.valor_novo?.trim()) {
      avisar("warning", "Preencha o campo a corrigir e o novo valor.");
      return;
    }
    setProcessandoId(s.id);
    try {
      const resultado = atenderCorrecao(db, s.id, s.titular_cpf, form.campo.trim(), form.valor_novo.trim());
      setResultadosCorrecao((prev) => ({ ...prev, [s.id]: resultado.registros_corrigidos }));
      await persistir();
      avisar("good", `Correção aplicada em ${resultado.registros_corrigidos.length} registro(s).`);
    } catch (erro) {
      avisar("critical", `Não foi possível aplicar a correção: ${(erro as Error).message}`);
    } finally {
      setProcessandoId(null);
    }
  }

  // --- Seção 2: rotação de chave -----------------------------------------------------
  const rotacoes = useMemo(() => (db ? listarRotacoes(db) : []), [db, versao]);
  const statusRotacao = useMemo(() => (db ? proximaRotacaoDevida(db) : null), [db, versao]);

  const [rotForm, setRotForm] = useState({ responsavel: "", motivo: "", chave_anterior_hash: "", observacoes: "" });

  async function registrarNovaRotacao(e: FormEvent) {
    e.preventDefault();
    if (!db) return;
    if (!rotForm.responsavel.trim() || !rotForm.motivo.trim() || !rotForm.chave_anterior_hash.trim()) {
      avisar("warning", "Preencha responsável, motivo e o hash de referência da chave anterior.");
      return;
    }
    try {
      registrarRotacao(db, {
        responsavel: rotForm.responsavel.trim(),
        motivo: rotForm.motivo.trim(),
        chave_anterior_hash: rotForm.chave_anterior_hash.trim(),
        observacoes: rotForm.observacoes.trim() || undefined,
      });
      await persistir();
      avisar("good", "Rotação de chave registrada no histórico de política/auditoria.");
      setRotForm({ responsavel: "", motivo: "", chave_anterior_hash: "", observacoes: "" });
    } catch (erro) {
      avisar("critical", `Não foi possível registrar a rotação: ${(erro as Error).message}`);
    }
  }

  return (
    <div>
      <h2 className="section-title"><ShieldCheck size={16} /> LGPD — direitos do titular e política de chave</h2>
      <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Registro e atendimento das solicitações do titular de dados (Lei 13.709/2018, art. 18) e histórico de política
        de rotação de chave. Toda busca por dado pessoal é feita ao vivo, no schema real do sistema — nunca um mock.
      </p>

      {/* ===================== SEÇÃO 1 — SOLICITAÇÕES DE TITULAR ===================== */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title"><ClipboardList size={14} /> Nova solicitação</div>
        <form onSubmit={registrarNovaSolicitacao}>
          <div className="form-grid" style={{ maxWidth: 640 }}>
            <label>
              Nome do titular
              <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo" />
            </label>
            <label>
              CPF do titular
              <input type="text" value={novoCpf} onChange={(e) => setNovoCpf(e.target.value)} placeholder="000.000.000-00" />
            </label>
            <label>
              Tipo de solicitação
              <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as TipoSolicitacaoLGPD)}>
                {(Object.keys(ROTULO_TIPO) as TipoSolicitacaoLGPD[]).map((t) => (
                  <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn primary" type="submit">Registrar solicitação</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Solicitações registradas ({solicitacoes.length})</div>
        {solicitacoes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma solicitação de titular registrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Titular</th><th>CPF</th><th>Tipo</th><th>Status</th><th>Solicitado em</th><th>Atendido em</th><th></th>
                </tr>
              </thead>
              <tbody>
                {solicitacoes.map((s) => {
                  const Icone = ICONE_TIPO[s.tipo];
                  const resultadoExclusao = resultadosExclusao[s.id];
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td>{s.titular_nome}</td>
                        <td>{s.titular_cpf}</td>
                        <td style={{ display: "flex", alignItems: "center", gap: 6 }}><Icone size={13} /> {ROTULO_TIPO[s.tipo]}</td>
                        <td><span className={`pill ${PILL_STATUS[s.status]}`}>{ROTULO_STATUS[s.status]}</span></td>
                        <td>{formatarData(s.data_solicitacao)}</td>
                        <td>{formatarData(s.data_atendimento)}</td>
                        <td>
                          <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => alternarExpandido(s.id)}>
                            {expandidoId === s.id ? "Fechar" : s.status === "pendente" ? "Atender" : "Detalhe"}
                          </button>
                        </td>
                      </tr>
                      {expandidoId === s.id && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--surface-soft, var(--surface))" }}>
                            {s.status !== "pendente" && (
                              <div style={{ fontSize: 13, marginBottom: 10 }}>
                                {s.status === "recusada" ? (
                                  <div className="aviso-caixa">
                                    <strong>Solicitação RECUSADA.</strong> Motivo: {s.motivo_recusa ?? "não registrado."}
                                  </div>
                                ) : (
                                  <p style={{ color: "var(--ink-soft)" }}>{s.detalhes ?? "Solicitação atendida."}</p>
                                )}
                              </div>
                            )}

                            {s.status === "pendente" && s.tipo === "acesso" && (
                              <div>
                                <button
                                  className="btn primary"
                                  disabled={processandoId === s.id}
                                  onClick={() => atenderSolicitacaoAcesso(s)}
                                >
                                  <UserCheck size={13} /> Buscar e conceder acesso
                                </button>
                              </div>
                            )}

                            {s.status === "pendente" && s.tipo === "portabilidade" && (
                              <div>
                                <button
                                  className="btn primary"
                                  disabled={processandoId === s.id}
                                  onClick={() => atenderSolicitacaoPortabilidade(s)}
                                >
                                  <Download size={13} /> Gerar export de portabilidade
                                </button>
                              </div>
                            )}

                            {s.status === "pendente" && s.tipo === "exclusao" && (
                              <div>
                                <button
                                  className="btn danger"
                                  disabled={processandoId === s.id}
                                  onClick={() => atenderSolicitacaoExclusao(s)}
                                >
                                  <Trash2 size={13} /> Processar exclusão
                                </button>
                              </div>
                            )}

                            {s.status === "pendente" && s.tipo === "correcao" && (
                              <div className="form-grid" style={{ maxWidth: 480, alignItems: "end" }}>
                                <label>
                                  Campo a corrigir
                                  <input
                                    type="text"
                                    placeholder="ex.: nome, telefone, email, endereco"
                                    value={formsCorrecao[s.id]?.campo ?? ""}
                                    onChange={(e) =>
                                      setFormsCorrecao((prev) => ({ ...prev, [s.id]: { campo: e.target.value, valor_novo: prev[s.id]?.valor_novo ?? "" } }))
                                    }
                                  />
                                </label>
                                <label>
                                  Novo valor
                                  <input
                                    type="text"
                                    value={formsCorrecao[s.id]?.valor_novo ?? ""}
                                    onChange={(e) =>
                                      setFormsCorrecao((prev) => ({ ...prev, [s.id]: { campo: prev[s.id]?.campo ?? "", valor_novo: e.target.value } }))
                                    }
                                  />
                                </label>
                                <button
                                  className="btn primary"
                                  disabled={processandoId === s.id}
                                  onClick={() => atenderSolicitacaoCorrecao(s)}
                                >
                                  <Pencil size={13} /> Aplicar correção
                                </button>
                              </div>
                            )}

                            {/* Resultado de ACESSO obtido nesta sessão */}
                            {resultadosAcesso[s.id] && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                                  {resultadosAcesso[s.id].length} registro(s) encontrado(s)
                                </div>
                                {resultadosAcesso[s.id].length === 0 ? (
                                  <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Nenhum dado pessoal encontrado para este CPF.</p>
                                ) : (
                                  <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
                                    <table className="data-table">
                                      <thead><tr><th>Tabela</th><th>Registro</th><th>Campos</th></tr></thead>
                                      <tbody>
                                        {resultadosAcesso[s.id].map((r, i) => (
                                          <tr key={i}>
                                            <td>{r.tabela}</td>
                                            <td>#{r.registro_id}</td>
                                            <td style={{ fontSize: 12, fontFamily: "monospace" }}>{JSON.stringify(r.campos)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Resultado de PORTABILIDADE obtido nesta sessão */}
                            {resultadosPortabilidade[s.id] && (
                              <div style={{ marginTop: 12 }}>
                                <button className="btn" onClick={() => baixarJsonPortabilidade(s)}>
                                  <FileJson size={13} /> Baixar JSON de portabilidade
                                </button>
                              </div>
                            )}

                            {/* Resultado de EXCLUSÃO obtido nesta sessão — recusa sempre em destaque */}
                            {resultadoExclusao && (
                              <div style={{ marginTop: 12 }}>
                                {resultadoExclusao.aceita ? (
                                  <div style={{ fontSize: 13 }}>
                                    <span className="pill good">Exclusão aceita</span>
                                    <p style={{ marginTop: 8, color: "var(--ink-soft)" }}>
                                      Identidade anonimizada em {resultadoExclusao.registros_anonimizados?.length ?? 0} registro(s):{" "}
                                      {resultadoExclusao.registros_anonimizados?.map((r) => `${r.tabela}#${r.registro_id}`).join(", ")}.
                                      Valores e lançamentos contábeis foram preservados.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="aviso-caixa">
                                    <span className="pill critical" style={{ marginRight: 8 }}>Exclusão RECUSADA</span>
                                    {resultadoExclusao.motivo_recusa}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Resultado de CORREÇÃO obtido nesta sessão */}
                            {resultadosCorrecao[s.id] && (
                              <p style={{ marginTop: 12, fontSize: 13, color: "var(--ink-soft)" }}>
                                Corrigido em {resultadosCorrecao[s.id].length} registro(s):{" "}
                                {resultadosCorrecao[s.id].map((r) => `${r.tabela}#${r.registro_id}`).join(", ")}.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================== SEÇÃO 2 — ROTAÇÃO DE CHAVE ===================== */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title"><KeyRound size={14} /> Rotação de chave de encriptação — registro de política</div>
        <div className="aviso-caixa" style={{ background: "var(--info-soft, var(--surface))", marginBottom: 14 }}>
          <strong>Isto NÃO executa criptografia real.</strong> Este app roda inteiramente no navegador (sem backend), e
          não há onde guardar uma chave de encriptação com segurança — quem abrir o DevTools lê qualquer valor que o
          próprio JavaScript do cliente precisasse carregar. Esta seção é só o <strong>registro de auditoria/política</strong>{" "}
          de que uma rotação de chave — de um sistema de criptografia real, do outro lado de um backend — aconteceu:
          quem, quando, por quê, e um hash de referência (nunca a chave em si). A criptografia de dados em repouso é
          responsabilidade da infraestrutura (ex.: Postgres/Supabase, KMS), não deste módulo.
        </div>

        {statusRotacao?.devida && (
          <div className="aviso-caixa" style={{ marginBottom: 14 }}>
            <ShieldAlert size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            <strong>Rotação de chave atrasada.</strong>{" "}
            {statusRotacao.ultima_rotacao
              ? `Última rotação há ${statusRotacao.meses_desde_ultima_rotacao?.toFixed(1)} mês(es) — limite de política é ${statusRotacao.meses_limite} meses.`
              : `Nenhuma rotação foi registrada ainda — limite de política é ${statusRotacao.meses_limite} meses.`}
          </div>
        )}

        <form onSubmit={registrarNovaRotacao}>
          <div className="form-grid" style={{ maxWidth: 720 }}>
            <label>
              Responsável
              <input type="text" value={rotForm.responsavel} onChange={(e) => setRotForm((f) => ({ ...f, responsavel: e.target.value }))} />
            </label>
            <label>
              Motivo
              <input type="text" value={rotForm.motivo} onChange={(e) => setRotForm((f) => ({ ...f, motivo: e.target.value }))} placeholder="ex.: rotação periódica, suspeita de vazamento" />
            </label>
            <label>
              Hash de referência da chave anterior
              <input
                type="text"
                value={rotForm.chave_anterior_hash}
                onChange={(e) => setRotForm((f) => ({ ...f, chave_anterior_hash: e.target.value }))}
                placeholder="ex.: SHA-256 do identificador da chave antiga no KMS"
              />
            </label>
            <label>
              Observações (opcional)
              <input type="text" value={rotForm.observacoes} onChange={(e) => setRotForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </label>
          </div>
          <button className="btn primary" type="submit">Registrar rotação</button>
        </form>
      </div>

      <div className="card">
        <div className="section-title"><Clock size={14} /> Histórico de rotações ({rotacoes.length})</div>
        {rotacoes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma rotação de chave registrada ainda.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Data</th><th>Responsável</th><th>Motivo</th><th>Hash da chave anterior</th><th>Observações</th></tr></thead>
              <tbody>
                {rotacoes.map((r) => (
                  <tr key={r.id}>
                    <td>{formatarData(r.data_rotacao)}</td>
                    <td>{r.responsavel}</td>
                    <td>{r.motivo}</td>
                    <td style={{ fontSize: 12, fontFamily: "monospace" }}>{r.chave_anterior_hash}</td>
                    <td style={{ fontSize: 12 }}>{r.observacoes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
