import { Fragment, useMemo, useState } from "react";
import { UserPlus, Plus, ArrowRight, Ban, Send, Check, X, FileText } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import {
  criarLead,
  moverEtapaLead,
  criarPropostaLead,
  enviarProposta,
  decidirProposta,
  listarLeads,
  obterLeadComHistorico,
  funilResumo,
  type EtapaLead,
  type StatusPropostaLead,
} from "../domain/crm/leads";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

const ETAPAS_FUNIL: EtapaLead[] = ["novo", "contatado", "visita_agendada", "proposta", "convertido", "perdido"];

const ROTULO_ETAPA: Record<EtapaLead, string> = {
  novo: "Novo",
  contatado: "Contatado",
  visita_agendada: "Visita agendada",
  proposta: "Proposta",
  convertido: "Convertido",
  perdido: "Perdido",
};

const PILL_ETAPA: Record<EtapaLead, string> = {
  novo: "",
  contatado: "",
  visita_agendada: "warning",
  proposta: "warning",
  convertido: "good",
  perdido: "critical",
};

const ROTULO_STATUS_PROPOSTA: Record<StatusPropostaLead, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

const PILL_STATUS_PROPOSTA: Record<StatusPropostaLead, string> = {
  rascunho: "",
  enviada: "warning",
  aceita: "good",
  recusada: "critical",
};

/** Espelha, só para fins de UI (não é fonte de verdade — essa é `moverEtapaLead` em
 * `domain/crm/leads.ts`), o único avanço válido de um passo no funil a partir de cada etapa
 * não-terminal. Serve para oferecer só os botões de transição que o domínio de fato aceita,
 * em vez de deixar o operador clicar e receber um erro. */
const PROXIMA_ETAPA_FUNIL: Partial<Record<EtapaLead, EtapaLead>> = {
  novo: "contatado",
  contatado: "visita_agendada",
  visita_agendada: "proposta",
  proposta: "convertido",
};

const ETAPAS_TERMINAIS: ReadonlySet<EtapaLead> = new Set(["convertido", "perdido"]);

interface ImovelOpcao {
  id: number;
  apelido: string;
}

interface RascunhoNovoLead {
  nome: string;
  imovelId: string;
  contato: string;
  fonte: string;
  interesse: string;
}

function rascunhoLeadVazio(): RascunhoNovoLead {
  return { nome: "", imovelId: "", contato: "", fonte: "", interesse: "" };
}

interface RascunhoNovaProposta {
  imovelId: string;
  valorProposto: string;
  condicoes: string;
}

function rascunhoPropostaVazio(imovelIdPadrao?: number | null): RascunhoNovaProposta {
  return { imovelId: imovelIdPadrao ? String(imovelIdPadrao) : "", valorProposto: "", condicoes: "" };
}

export function CrmLeadsView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [filtroEtapa, setFiltroEtapa] = useState<EtapaLead | "todas">("todas");
  const [filtroImovelId, setFiltroImovelId] = useState("");

  const [mostrarFormNovoLead, setMostrarFormNovoLead] = useState(false);
  const [rascunhoLead, setRascunhoLead] = useState<RascunhoNovoLead>(rascunhoLeadVazio());

  const [leadSelecionadoId, setLeadSelecionadoId] = useState<number | null>(null);
  const [ator, setAtor] = useState("Operador");

  const [mostrarFormProposta, setMostrarFormProposta] = useState(false);
  const [rascunhoProposta, setRascunhoProposta] = useState<RascunhoNovaProposta>(rascunhoPropostaVazio());

  const imoveis = useMemo<ImovelOpcao[]>(
    () => (db ? consultar<ImovelOpcao>(db, "SELECT id, apelido FROM imoveis ORDER BY apelido") : []),
    [db, versao],
  );
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  const funil = useMemo(() => (db ? funilResumo(db) : null), [db, versao]);

  const leads = useMemo(
    () =>
      db
        ? listarLeads(db, {
            etapa: filtroEtapa === "todas" ? undefined : filtroEtapa,
            imovelId: filtroImovelId ? Number(filtroImovelId) : undefined,
          })
        : [],
    [db, versao, filtroEtapa, filtroImovelId],
  );

  const leadSelecionado = useMemo(
    () => (db && leadSelecionadoId !== null ? obterLeadComHistorico(db, leadSelecionadoId) : null),
    [db, versao, leadSelecionadoId],
  );

  function atualizarRascunhoLead(campos: Partial<RascunhoNovoLead>) {
    setRascunhoLead((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovoLead() {
    if (!db) return;
    try {
      const resultado = criarLead(db, {
        nome: rascunhoLead.nome,
        imovelId: rascunhoLead.imovelId ? Number(rascunhoLead.imovelId) : undefined,
        contato: rascunhoLead.contato.trim() || undefined,
        fonte: rascunhoLead.fonte.trim() || undefined,
        interesse: rascunhoLead.interesse.trim() || undefined,
      });
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      setRascunhoLead(rascunhoLeadVazio());
      setMostrarFormNovoLead(false);
      avisar("good", resultado.mensagem);
      if (resultado.id !== undefined) setLeadSelecionadoId(resultado.id);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro inesperado ao criar lead.");
    }
  }

  function selecionarLead(id: number) {
    setLeadSelecionadoId((atual) => (atual === id ? null : id));
    setMostrarFormProposta(false);
  }

  async function moverEtapa(novaEtapa: EtapaLead) {
    if (!db || leadSelecionadoId === null) return;
    try {
      const resultado = moverEtapaLead(db, leadSelecionadoId, novaEtapa, ator);
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      avisar("good", resultado.mensagem);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro inesperado ao mover etapa do lead.");
    }
  }

  function abrirFormProposta() {
    setMostrarFormProposta((v) => !v);
    setRascunhoProposta(rascunhoPropostaVazio(leadSelecionado?.imovel_id ?? null));
  }

  function atualizarRascunhoProposta(campos: Partial<RascunhoNovaProposta>) {
    setRascunhoProposta((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovaProposta() {
    if (!db || leadSelecionadoId === null) return;
    try {
      const valorProposto = Number.parseFloat(rascunhoProposta.valorProposto.replace(",", "."));
      const resultado = criarPropostaLead(db, {
        leadId: leadSelecionadoId,
        imovelId: Number(rascunhoProposta.imovelId),
        valorProposto,
        condicoes: rascunhoProposta.condicoes.trim() || undefined,
      });
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      setRascunhoProposta(rascunhoPropostaVazio());
      setMostrarFormProposta(false);
      avisar("good", resultado.mensagem);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro inesperado ao criar proposta.");
    }
  }

  async function enviarPropostaAction(propostaId: number) {
    if (!db) return;
    try {
      const resultado = enviarProposta(db, propostaId);
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      avisar("good", resultado.mensagem);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro inesperado ao enviar proposta.");
    }
  }

  async function decidirPropostaAction(propostaId: number, aceita: boolean) {
    if (!db) return;
    try {
      const resultado = decidirProposta(db, propostaId, aceita, ator);
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      if (aceita) {
        avisar(
          "good",
          `${resultado.mensagem} Lead convertido — mas NENHUM contrato foi criado automaticamente. Se for seguir adiante, crie o contrato manualmente na tela de Contratos.`,
        );
      } else {
        avisar("good", resultado.mensagem);
      }
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro inesperado ao decidir proposta.");
    }
  }

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">CRM — leads e propostas ({leads.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Funil leve de captação (novo → contatado → visita agendada → proposta → convertido, ou perdido a qualquer
        momento). <strong>Regra de ouro:</strong> aceitar uma proposta converte o lead, mas nunca cria um contrato de
        locação automaticamente — isso continua sendo uma ação manual e separada do operador, feita na tela de
        Contratos quando ele decidir seguir adiante.
      </p>

      {funil && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {ETAPAS_FUNIL.map((etapa) => (
            <KpiTile
              key={etapa}
              label={ROTULO_ETAPA[etapa]}
              value={funil[etapa]}
              variant={etapa === "convertido" ? "good" : etapa === "perdido" && funil[etapa] > 0 ? "critical" : undefined}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por etapa{" "}
          <select className="btn" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value as EtapaLead | "todas")}>
            <option value="todas">Todas</option>
            {ETAPAS_FUNIL.map((etapa) => (
              <option key={etapa} value={etapa}>{ROTULO_ETAPA[etapa]}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Filtrar por imóvel{" "}
          <select className="btn" value={filtroImovelId} onChange={(e) => setFiltroImovelId(e.target.value)}>
            <option value="">Todos</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>{i.apelido}</option>
            ))}
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() => {
            setMostrarFormNovoLead((v) => !v);
            setRascunhoLead(rascunhoLeadVazio());
          }}
        >
          <Plus size={14} /> {mostrarFormNovoLead ? "Fechar formulário" : "Novo lead"}
        </button>
      </div>

      {mostrarFormNovoLead && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <UserPlus size={16} /> Registrar novo lead
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Nome
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoLead.nome}
                onChange={(e) => atualizarRascunhoLead({ nome: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel de interesse (opcional)
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoLead.imovelId}
                onChange={(e) => atualizarRascunhoLead({ imovelId: e.target.value })}
              >
                <option value="">— nenhum —</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.apelido}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Contato (opcional)
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoLead.contato}
                onChange={(e) => atualizarRascunhoLead({ contato: e.target.value })}
                placeholder="telefone, e-mail…"
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Fonte (opcional)
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoLead.fonte}
                onChange={(e) => atualizarRascunhoLead({ fonte: e.target.value })}
                placeholder="site, indicação, portal…"
              />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Interesse (opcional)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={rascunhoLead.interesse}
              onChange={(e) => atualizarRascunhoLead({ interesse: e.target.value })}
              placeholder="ex: quer alugar por até 6 meses, prefere mobiliado…"
            />
          </label>
          <button className="btn primary" onClick={registrarNovoLead} disabled={!rascunhoLead.nome.trim()}>
            Registrar lead
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Contato</th>
              <th>Fonte</th>
              <th>Interesse</th>
              <th>Imóvel</th>
              <th>Etapa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <Fragment key={lead.id}>
                <tr onClick={() => selecionarLead(lead.id)} style={{ cursor: "pointer" }}>
                  <td>{lead.nome}</td>
                  <td>{lead.contato ?? "—"}</td>
                  <td>{lead.fonte ?? "—"}</td>
                  <td>{lead.interesse ?? "—"}</td>
                  <td>{lead.imovel_id !== null ? imoveisPorId.get(lead.imovel_id)?.apelido ?? `#${lead.imovel_id}` : "—"}</td>
                  <td>
                    <span className={`pill ${PILL_ETAPA[lead.etapa]}`}>{ROTULO_ETAPA[lead.etapa]}</span>
                  </td>
                  <td>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); selecionarLead(lead.id); }}>
                      {leadSelecionadoId === lead.id ? "Fechar" : "Ver detalhes"}
                    </button>
                  </td>
                </tr>
                {leadSelecionadoId === lead.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                      <div style={{ padding: "14px 4px" }}>
                        <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 14, maxWidth: 260 }}>
                          Responsável pela ação (ator)
                          <input
                            className="btn"
                            style={{ cursor: "text", width: "100%", marginTop: 4 }}
                            value={ator}
                            onChange={(e) => setAtor(e.target.value)}
                          />
                        </label>

                        {/* Ações de etapa do funil */}
                        <strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Etapa do funil</strong>
                        {ETAPAS_TERMINAIS.has(lead.etapa) ? (
                          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>
                            Lead em etapa terminal ('{ROTULO_ETAPA[lead.etapa]}') — nenhuma transição nova é permitida.
                          </p>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                            {PROXIMA_ETAPA_FUNIL[lead.etapa] && (
                              <button
                                className="btn primary"
                                style={{ padding: "4px 8px", fontSize: 12 }}
                                onClick={() => moverEtapa(PROXIMA_ETAPA_FUNIL[lead.etapa] as EtapaLead)}
                              >
                                <ArrowRight size={13} /> Avançar para {ROTULO_ETAPA[PROXIMA_ETAPA_FUNIL[lead.etapa] as EtapaLead]}
                              </button>
                            )}
                            <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => moverEtapa("perdido")}>
                              <Ban size={13} /> Marcar perdido
                            </button>
                          </div>
                        )}

                        {/* Histórico de etapas */}
                        <strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Histórico de etapas</strong>
                        <div className="table-wrap" style={{ marginBottom: 16 }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>De</th>
                                <th>Para</th>
                                <th>Ator</th>
                                <th>Quando</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leadSelecionado?.eventos.map((evento) => (
                                <tr key={evento.id}>
                                  <td>{ROTULO_ETAPA[evento.etapa_anterior]}</td>
                                  <td>{ROTULO_ETAPA[evento.etapa_nova]}</td>
                                  <td>{evento.ator}</td>
                                  <td>{new Date(evento.criado_em).toLocaleString("pt-BR")}</td>
                                </tr>
                              ))}
                              {(!leadSelecionado || leadSelecionado.eventos.length === 0) && (
                                <tr>
                                  <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                    Nenhuma mudança de etapa registrada ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Propostas */}
                        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13 }}>
                          Propostas
                          {!ETAPAS_TERMINAIS.has(lead.etapa) && (
                            <button className="btn" style={{ padding: "3px 7px", fontSize: 11.5 }} onClick={abrirFormProposta}>
                              <FileText size={12} /> {mostrarFormProposta ? "Fechar" : "Nova proposta"}
                            </button>
                          )}
                        </strong>

                        {mostrarFormProposta && (
                          <div className="card" style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Imóvel
                                <select
                                  className="btn"
                                  style={{ width: "100%", marginTop: 4 }}
                                  value={rascunhoProposta.imovelId}
                                  onChange={(e) => atualizarRascunhoProposta({ imovelId: e.target.value })}
                                >
                                  <option value="">— selecione —</option>
                                  {imoveis.map((i) => (
                                    <option key={i.id} value={i.id}>{i.apelido}</option>
                                  ))}
                                </select>
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Valor proposto (R$)
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoProposta.valorProposto}
                                  onChange={(e) => atualizarRascunhoProposta({ valorProposto: e.target.value })}
                                />
                              </label>
                            </div>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
                              Condições (opcional)
                              <input
                                className="btn"
                                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                value={rascunhoProposta.condicoes}
                                onChange={(e) => atualizarRascunhoProposta({ condicoes: e.target.value })}
                                placeholder="ex: prazo de 30 meses, reajuste anual pelo IGP-M…"
                              />
                            </label>
                            <button
                              className="btn primary"
                              onClick={registrarNovaProposta}
                              disabled={!rascunhoProposta.imovelId || !rascunhoProposta.valorProposto.trim()}
                            >
                              Criar proposta (rascunho)
                            </button>
                          </div>
                        )}

                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Imóvel</th>
                                <th className="num">Valor</th>
                                <th>Condições</th>
                                <th>Status</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {leadSelecionado?.propostas.map((proposta) => (
                                <tr key={proposta.id}>
                                  <td>{imoveisPorId.get(proposta.imovel_id)?.apelido ?? `#${proposta.imovel_id}`}</td>
                                  <td className="num">{formatarMoeda(proposta.valor_proposto)}</td>
                                  <td>{proposta.condicoes ?? "—"}</td>
                                  <td>
                                    <span className={`pill ${PILL_STATUS_PROPOSTA[proposta.status]}`}>
                                      {ROTULO_STATUS_PROPOSTA[proposta.status]}
                                    </span>
                                  </td>
                                  <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {proposta.status === "rascunho" && (
                                      <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => enviarPropostaAction(proposta.id)}>
                                        <Send size={12} /> Enviar
                                      </button>
                                    )}
                                    {proposta.status === "enviada" && (
                                      <>
                                        <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => decidirPropostaAction(proposta.id, true)}>
                                          <Check size={12} /> Aceitar
                                        </button>
                                        <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => decidirPropostaAction(proposta.id, false)}>
                                          <X size={12} /> Recusar
                                        </button>
                                      </>
                                    )}
                                    {(proposta.status === "aceita" || proposta.status === "recusada") && proposta.decidido_em && (
                                      <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                                        Decidida em {new Date(proposta.decidido_em).toLocaleString("pt-BR")}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {(!leadSelecionado || leadSelecionado.propostas.length === 0) && (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                    Nenhuma proposta registrada para este lead ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum lead registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
