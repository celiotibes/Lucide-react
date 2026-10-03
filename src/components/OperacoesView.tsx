import { Fragment, useMemo, useState } from "react";
import {
  Wrench,
  Plus,
  UserPlus,
  Check,
  X,
  Play,
  RotateCcw,
  PauseCircle,
  ClipboardList,
  Star,
  BanknoteArrowDown,
  Send,
  Loader2,
} from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import {
  criarOrdemServico,
  atribuirPrestador,
  registrarEventoOS,
  solicitarDespesaOS,
  aprovarDespesaOS,
  rejeitarDespesaOS,
  avaliarPrestador,
  listarOrdensServico,
  obterOrdemServicoComHistorico,
  dispararNotificacaoPrestadorOS,
  LIMITE_APROVACAO_DUPLA,
  type StatusOS,
  type PrioridadeOS,
  type TipoEventoOS,
} from "../domain/operacoes/ordensServico";
import type { ResultadoDisparo } from "../domain/notificacoes/despachoCliente";
import { criarNotificacoesApiClientHttp } from "../domain/notificacoes/vinculosExternos";
import type { Imovel, Prestador } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";

/**
 * Configuração local (backend + token de sessão) para disparar a notificação ao prestador —
 * mesmo padrão de `CobrancasAsaasView.tsx` (chave própria em `localStorage`, por ser
 * conveniência de "para onde apontar", não dado de negócio).
 */
interface ConfiguracaoNotificarPrestador {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE_NOTIFICAR_PRESTADOR = "operacoes-notificar-prestador:config:v1";
const CONFIG_NOTIFICAR_PRESTADOR_PADRAO: ConfiguracaoNotificarPrestador = { enderecoBackend: "", tokenSessao: "" };

function carregarConfigNotificarPrestador(): ConfiguracaoNotificarPrestador {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE_NOTIFICAR_PRESTADOR);
    if (!bruto) return { ...CONFIG_NOTIFICAR_PRESTADOR_PADRAO };
    return { ...CONFIG_NOTIFICAR_PRESTADOR_PADRAO, ...(JSON.parse(bruto) as Partial<ConfiguracaoNotificarPrestador>) };
  } catch {
    return { ...CONFIG_NOTIFICAR_PRESTADOR_PADRAO };
  }
}

function salvarConfigNotificarPrestador(config: ConfiguracaoNotificarPrestador): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE_NOTIFICAR_PRESTADOR, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão.
  }
}

function notificarPrestadorConfigurado(config: ConfiguracaoNotificarPrestador): boolean {
  return config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;
}

const ROTULO_CANAL_NOTIFICACAO: Record<ResultadoDisparo["canal"], string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

/** Resume os resultados por canal em uma linha só, para o toast — ex.: "E-mail: enviado ·
 * WhatsApp: pulado (Nenhum telefone cadastrado...) · Telegram: pulado (...)". */
function resumoDisparoPrestador(resultados: ResultadoDisparo[]): string {
  return resultados
    .map((r) => {
      const rotulo = ROTULO_CANAL_NOTIFICACAO[r.canal] ?? r.canal;
      if (r.status === "enviado") return `${rotulo}: enviado`;
      if (r.status === "falha") return `${rotulo}: falha (${r.motivo ?? "erro desconhecido"})`;
      return `${rotulo}: pulado (${r.motivo ?? "sem destinatário"})`;
    })
    .join(" · ");
}

const STATUS_OS: StatusOS[] = ["aberta", "atribuida", "em_andamento", "concluida", "impedida", "cancelada"];

const ROTULO_STATUS_OS: Record<StatusOS, string> = {
  aberta: "Aberta",
  atribuida: "Atribuída",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  impedida: "Impedida",
  cancelada: "Cancelada",
};

const PILL_STATUS_OS: Record<StatusOS, string> = {
  aberta: "",
  atribuida: "warning",
  em_andamento: "warning",
  concluida: "good",
  impedida: "critical",
  cancelada: "",
};

const ROTULO_PRIORIDADE: Record<PrioridadeOS, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

const PILL_PRIORIDADE: Record<PrioridadeOS, string> = {
  baixa: "",
  normal: "",
  alta: "warning",
  urgente: "critical",
};

/** Transições de estado válidas por status atual, espelhando `calcularTransicao()` em
 * domain/operacoes/ordensServico.ts — a única fonte de verdade sobre a máquina de estados.
 * 'atribuida' fica de fora (usa-se `atribuirPrestador`, nunca `registrarEventoOS`). Mantida
 * aqui só para decidir quais botões desenhar; a validação real continua no domínio. */
const TRANSICOES_POR_STATUS: Record<StatusOS, Exclude<TipoEventoOS, "atribuida">[]> = {
  aberta: ["cancelada"],
  atribuida: ["aceita", "iniciada", "cancelada"],
  em_andamento: ["progresso", "concluida", "impedida", "cancelada"],
  concluida: [],
  impedida: ["reaberta", "cancelada"],
  cancelada: ["reaberta"],
};

const ROTULO_EVENTO: Record<Exclude<TipoEventoOS, "atribuida">, string> = {
  aceita: "Confirmar aceite",
  iniciada: "Iniciar serviço",
  progresso: "Registrar progresso",
  concluida: "Concluir ordem",
  impedida: "Marcar impedida",
  cancelada: "Cancelar ordem",
  reaberta: "Reabrir",
};

const ICONE_EVENTO: Record<Exclude<TipoEventoOS, "atribuida">, typeof Check> = {
  aceita: Check,
  iniciada: Play,
  progresso: ClipboardList,
  concluida: Check,
  impedida: PauseCircle,
  cancelada: X,
  reaberta: RotateCcw,
};

const ROTULO_TIPO_EVENTO: Record<TipoEventoOS, string> = {
  atribuida: "Atribuída",
  aceita: "Aceite confirmado",
  iniciada: "Serviço iniciado",
  progresso: "Progresso",
  concluida: "Concluída",
  impedida: "Impedida",
  cancelada: "Cancelada",
  reaberta: "Reaberta",
};

interface RascunhoNovaOS {
  imovelId: string;
  titulo: string;
  descricao: string;
  prioridade: PrioridadeOS;
  slaDataLimite: string;
}

const RASCUNHO_OS_VAZIO: RascunhoNovaOS = {
  imovelId: "",
  titulo: "",
  descricao: "",
  prioridade: "normal",
  slaDataLimite: "",
};

interface RascunhoDespesa {
  valor: string;
  solicitante: string;
}

const RASCUNHO_DESPESA_VAZIO: RascunhoDespesa = { valor: "", solicitante: "" };

export function OperacoesView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [filtroImovelId, setFiltroImovelId] = useState<number | "todos">("todos");
  const [filtroStatus, setFiltroStatus] = useState<StatusOS | "todos">("todos");
  const [filtroPrestadorId, setFiltroPrestadorId] = useState<number | "todos">("todos");

  const [mostrarFormNovaOS, setMostrarFormNovaOS] = useState(false);
  const [rascunhoOS, setRascunhoOS] = useState<RascunhoNovaOS>(RASCUNHO_OS_VAZIO);

  const [ordemSelecionadaId, setOrdemSelecionadaId] = useState<number | null>(null);
  const [ator, setAtor] = useState("");
  const [detalhesEvento, setDetalhesEvento] = useState("");
  const [prestadorParaAtribuir, setPrestadorParaAtribuir] = useState<string>("");

  const [mostrarFormDespesa, setMostrarFormDespesa] = useState(false);
  const [rascunhoDespesa, setRascunhoDespesa] = useState<RascunhoDespesa>(RASCUNHO_DESPESA_VAZIO);
  const [aprovadorPorDespesa, setAprovadorPorDespesa] = useState<Record<number, string>>({});
  const [valorAprovadoPorDespesa, setValorAprovadoPorDespesa] = useState<Record<number, string>>({});
  const [motivoRejeicaoPorDespesa, setMotivoRejeicaoPorDespesa] = useState<Record<number, string>>({});

  const [notaAvaliacao, setNotaAvaliacao] = useState(5);
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState("");

  const [configNotificarPrestador, setConfigNotificarPrestador] = useState<ConfiguracaoNotificarPrestador>(() => carregarConfigNotificarPrestador());
  const notificarPrestadorConfiguradoAtual = notificarPrestadorConfigurado(configNotificarPrestador);
  const [notificandoOrdemId, setNotificandoOrdemId] = useState<number | null>(null);

  function atualizarConfigNotificarPrestador(patch: Partial<ConfiguracaoNotificarPrestador>) {
    setConfigNotificarPrestador((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfigNotificarPrestador(proximo);
      return proximo;
    });
  }

  const imoveis = useMemo<Imovel[]>(
    () => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []),
    [db, versao],
  );
  const prestadores = useMemo<Prestador[]>(
    () => (db ? consultar<Prestador>(db, "SELECT * FROM prestadores ORDER BY nome") : []),
    [db, versao],
  );

  function apelidoImovel(imovelId: number): string {
    return imoveis.find((i) => i.id === imovelId)?.apelido ?? `Imóvel #${imovelId}`;
  }
  function nomePrestador(prestadorId: number | null): string {
    if (prestadorId === null) return "—";
    return prestadores.find((p) => p.id === prestadorId)?.nome ?? `Prestador #${prestadorId}`;
  }

  const todasOrdens = useMemo(() => (db ? listarOrdensServico(db) : []), [db, versao]);

  const contagemPorStatus = useMemo(() => {
    const contagem: Record<StatusOS, number> = {
      aberta: 0,
      atribuida: 0,
      em_andamento: 0,
      concluida: 0,
      impedida: 0,
      cancelada: 0,
    };
    for (const o of todasOrdens) contagem[o.status]++;
    return contagem;
  }, [todasOrdens]);

  const ordensFiltradas = useMemo(() => {
    if (!db) return [];
    return listarOrdensServico(db, {
      imovelId: filtroImovelId === "todos" ? undefined : filtroImovelId,
      status: filtroStatus === "todos" ? undefined : filtroStatus,
      prestadorId: filtroPrestadorId === "todos" ? undefined : filtroPrestadorId,
    });
  }, [db, versao, filtroImovelId, filtroStatus, filtroPrestadorId]);

  const detalheOrdem = useMemo(
    () => (db && ordemSelecionadaId !== null ? obterOrdemServicoComHistorico(db, ordemSelecionadaId) : null),
    [db, versao, ordemSelecionadaId],
  );

  function atualizarRascunhoOS(campos: Partial<RascunhoNovaOS>) {
    setRascunhoOS((atual) => ({ ...atual, ...campos }));
  }

  async function registrarNovaOS() {
    if (!db) return;
    const imovelId = Number(rascunhoOS.imovelId);
    if (!rascunhoOS.imovelId || Number.isNaN(imovelId)) {
      avisar("critical", "Selecione o imóvel.");
      return;
    }
    try {
      const novaOrdemId = criarOrdemServico(db, {
        imovelId,
        titulo: rascunhoOS.titulo,
        descricao: rascunhoOS.descricao.trim() || undefined,
        prioridade: rascunhoOS.prioridade,
        slaDataLimite: rascunhoOS.slaDataLimite || undefined,
      });
      await persistir();
      setRascunhoOS(RASCUNHO_OS_VAZIO);
      setMostrarFormNovaOS(false);
      avisar("good", "Ordem de serviço criada.");
      setOrdemSelecionadaId(novaOrdemId);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao criar ordem de serviço.");
    }
  }

  function selecionarOrdem(id: number) {
    setOrdemSelecionadaId((atual) => (atual === id ? null : id));
    setAtor("");
    setDetalhesEvento("");
    setPrestadorParaAtribuir("");
    setMostrarFormDespesa(false);
    setRascunhoDespesa(RASCUNHO_DESPESA_VAZIO);
    setNotaAvaliacao(5);
    setComentarioAvaliacao("");
  }

  async function confirmarAtribuicao() {
    if (!db || ordemSelecionadaId === null) return;
    const prestadorId = Number(prestadorParaAtribuir);
    if (!prestadorParaAtribuir || Number.isNaN(prestadorId)) {
      avisar("critical", "Selecione o prestador.");
      return;
    }
    if (!ator.trim()) {
      avisar("critical", "Informe o ator responsável pela ação.");
      return;
    }
    try {
      atribuirPrestador(db, ordemSelecionadaId, prestadorId, ator);
      await persistir();
      setPrestadorParaAtribuir("");
      avisar("good", "Prestador atribuído.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao atribuir prestador.");
    }
  }

  async function disparaEvento(tipoEvento: Exclude<TipoEventoOS, "atribuida">) {
    if (!db || ordemSelecionadaId === null) return;
    if (!ator.trim()) {
      avisar("critical", "Informe o ator responsável pela ação.");
      return;
    }
    try {
      const novoStatus = registrarEventoOS(db, ordemSelecionadaId, tipoEvento, ator, detalhesEvento.trim() || undefined);
      await persistir();
      setDetalhesEvento("");
      avisar("good", `Evento '${ROTULO_EVENTO[tipoEvento]}' registrado — ordem agora '${ROTULO_STATUS_OS[novoStatus]}'.`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao registrar evento.");
    }
  }

  async function registrarNovaDespesa() {
    if (!db || ordemSelecionadaId === null) return;
    const valor = Number.parseFloat(rascunhoDespesa.valor.replace(",", "."));
    if (!rascunhoDespesa.solicitante.trim()) {
      avisar("critical", "Informe o solicitante da despesa.");
      return;
    }
    try {
      solicitarDespesaOS(db, ordemSelecionadaId, valor, rascunhoDespesa.solicitante);
      await persistir();
      setRascunhoDespesa(RASCUNHO_DESPESA_VAZIO);
      setMostrarFormDespesa(false);
      avisar("good", "Despesa solicitada.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao solicitar despesa.");
    }
  }

  async function aprovarDespesa(despesaId: number) {
    if (!db) return;
    const aprovador = (aprovadorPorDespesa[despesaId] ?? "").trim();
    if (!aprovador) {
      avisar("critical", "Informe o aprovador.");
      return;
    }
    const valorTexto = valorAprovadoPorDespesa[despesaId] ?? "";
    const valorAprovado = valorTexto.trim() === "" ? undefined : Number.parseFloat(valorTexto.replace(",", "."));
    try {
      const resultado = aprovarDespesaOS(db, despesaId, aprovador, valorAprovado);
      await persistir();
      setAprovadorPorDespesa((atual) => ({ ...atual, [despesaId]: "" }));
      setValorAprovadoPorDespesa((atual) => ({ ...atual, [despesaId]: "" }));
      avisar(
        "good",
        resultado.status === "pendente"
          ? "Primeira aprovação registrada — aguardando um segundo aprovador diferente (quórum duplo)."
          : resultado.contasAPagarId
            ? `Despesa aprovada — conta a pagar #${resultado.contasAPagarId} gerada.`
            : "Despesa aprovada, mas não foi possível gerar a conta a pagar (verifique se há entidade legal cadastrada).",
      );
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao aprovar despesa.");
    }
  }

  async function rejeitarDespesa(despesaId: number) {
    if (!db) return;
    const motivo = (motivoRejeicaoPorDespesa[despesaId] ?? "").trim();
    if (!motivo) {
      avisar("critical", "Informe o motivo da rejeição.");
      return;
    }
    try {
      rejeitarDespesaOS(db, despesaId, motivo);
      await persistir();
      setMotivoRejeicaoPorDespesa((atual) => ({ ...atual, [despesaId]: "" }));
      avisar("good", "Despesa rejeitada.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao rejeitar despesa.");
    }
  }

  async function registrarAvaliacao() {
    if (!db || ordemSelecionadaId === null || !detalheOrdem) return;
    const prestadorId = detalheOrdem.ordem.prestador_id;
    if (prestadorId === null) {
      avisar("critical", "Esta ordem não tem prestador atribuído — não é possível avaliar.");
      return;
    }
    try {
      avaliarPrestador(db, ordemSelecionadaId, prestadorId, notaAvaliacao, comentarioAvaliacao.trim() || undefined);
      await persistir();
      setComentarioAvaliacao("");
      avisar("good", "Avaliação registrada.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao registrar avaliação.");
    }
  }

  async function notificarPrestador(ordemServicoId: number) {
    if (!db) return;
    if (!notificarPrestadorConfiguradoAtual) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de notificar o prestador.");
      return;
    }
    setNotificandoOrdemId(ordemServicoId);
    try {
      const apiClient = criarNotificacoesApiClientHttp(configNotificarPrestador.enderecoBackend.trim(), configNotificarPrestador.tokenSessao.trim());
      const resultados = await dispararNotificacaoPrestadorOS(db, apiClient, ordemServicoId);
      await persistir();
      const algumaFalha = resultados.some((r) => r.status === "falha");
      const algumEnviado = resultados.some((r) => r.status === "enviado");
      const tipoToast = algumaFalha ? "critical" : algumEnviado ? "good" : "warning";
      avisar(tipoToast, `Notificação ao prestador — ${resumoDisparoPrestador(resultados)}`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro ao notificar o prestador.");
    } finally {
      setNotificandoOrdemId(null);
    }
  }

  if (!db) return null;

  return (
    <div>
      <h2 className="section-title">Operações — ordens de serviço ({todasOrdens.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Ordens de serviço de manutenção/reparo dos imóveis: atribuição de prestador, trilha de eventos, aprovação de
        despesa por alçada (acima de {formatarMoeda(LIMITE_APROVACAO_DUPLA)} exige dois aprovadores distintos) e
        avaliação do prestador ao concluir.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Notificar prestador — backend e sessão</h3>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Endereço do backend
            <input
              className="btn"
              style={{ width: 280, marginTop: 4, cursor: "text" }}
              placeholder="http://localhost:8787"
              value={configNotificarPrestador.enderecoBackend}
              onChange={(e) => atualizarConfigNotificarPrestador({ enderecoBackend: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Token de sessão (Bearer)
            <input
              className="btn"
              type="password"
              style={{ width: 280, marginTop: 4, cursor: "text" }}
              placeholder="obtido via POST /api/auth/login"
              value={configNotificarPrestador.tokenSessao}
              onChange={(e) => atualizarConfigNotificarPrestador({ tokenSessao: e.target.value })}
            />
          </label>
        </div>
        {!notificarPrestadorConfiguradoAtual && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
            Sem backend/token configurados, o botão "Notificar prestador" (nos detalhes de cada ordem) não dispara
            nada — nenhuma chamada de rede é feita sem essa configuração.
          </p>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {STATUS_OS.map((status) => (
          <KpiTile
            key={status}
            label={ROTULO_STATUS_OS[status]}
            value={contagemPorStatus[status]}
            variant={status === "impedida" && contagemPorStatus[status] > 0 ? "critical" : undefined}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Imóvel{" "}
          <select
            className="btn"
            value={filtroImovelId}
            onChange={(e) => setFiltroImovelId(e.target.value === "todos" ? "todos" : Number(e.target.value))}
          >
            <option value="todos">Todos</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>{i.apelido}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Status{" "}
          <select className="btn" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusOS | "todos")}>
            <option value="todos">Todos</option>
            {STATUS_OS.map((s) => (
              <option key={s} value={s}>{ROTULO_STATUS_OS[s]}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Prestador{" "}
          <select
            className="btn"
            value={filtroPrestadorId}
            onChange={(e) => setFiltroPrestadorId(e.target.value === "todos" ? "todos" : Number(e.target.value))}
          >
            <option value="todos">Todos</option>
            {prestadores.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() => {
            setMostrarFormNovaOS((v) => !v);
            setRascunhoOS(RASCUNHO_OS_VAZIO);
          }}
        >
          <Plus size={14} /> {mostrarFormNovaOS ? "Fechar formulário" : "Nova ordem de serviço"}
        </button>
      </div>

      {mostrarFormNovaOS && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Wrench size={16} /> Nova ordem de serviço
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel *
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoOS.imovelId}
                onChange={(e) => atualizarRascunhoOS({ imovelId: e.target.value })}
              >
                <option value="">Selecione…</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.apelido}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Título *
              <input
                className="btn"
                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                value={rascunhoOS.titulo}
                onChange={(e) => atualizarRascunhoOS({ titulo: e.target.value })}
                placeholder="ex: Vazamento no banheiro"
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Prioridade
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoOS.prioridade}
                onChange={(e) => atualizarRascunhoOS({ prioridade: e.target.value as PrioridadeOS })}
              >
                {(Object.keys(ROTULO_PRIORIDADE) as PrioridadeOS[]).map((p) => (
                  <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              SLA (data limite, opcional)
              <input
                type="date"
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={rascunhoOS.slaDataLimite}
                onChange={(e) => atualizarRascunhoOS({ slaDataLimite: e.target.value })}
              />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
            Descrição (opcional)
            <input
              className="btn"
              style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={rascunhoOS.descricao}
              onChange={(e) => atualizarRascunhoOS({ descricao: e.target.value })}
            />
          </label>
          <button className="btn primary" onClick={registrarNovaOS} disabled={!rascunhoOS.imovelId || !rascunhoOS.titulo.trim()}>
            Criar ordem de serviço
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Imóvel</th>
              <th>Prestador</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>SLA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordensFiltradas.map((o) => (
              <Fragment key={o.id}>
                <tr onClick={() => selecionarOrdem(o.id)} style={{ cursor: "pointer" }}>
                  <td>{o.titulo}</td>
                  <td>{apelidoImovel(o.imovel_id)}</td>
                  <td>{nomePrestador(o.prestador_id)}</td>
                  <td>
                    <span className={`pill ${PILL_PRIORIDADE[o.prioridade]}`}>{ROTULO_PRIORIDADE[o.prioridade]}</span>
                  </td>
                  <td>
                    <span className={`pill ${PILL_STATUS_OS[o.status]}`}>{ROTULO_STATUS_OS[o.status]}</span>
                  </td>
                  <td>{o.sla_data_limite ?? "—"}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); selecionarOrdem(o.id); }}>
                      {ordemSelecionadaId === o.id ? "Fechar" : "Ver detalhes"}
                    </button>
                  </td>
                </tr>
                {ordemSelecionadaId === o.id && detalheOrdem && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                      <div style={{ padding: "14px 4px" }}>
                        {detalheOrdem.ordem.descricao && (
                          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
                            {detalheOrdem.ordem.descricao}
                          </p>
                        )}

                        <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12, maxWidth: 320 }}>
                          Ator (quem está realizando a ação) *
                          <input
                            className="btn"
                            style={{ cursor: "text", width: "100%", marginTop: 4 }}
                            value={ator}
                            onChange={(e) => setAtor(e.target.value)}
                            placeholder="ex: síndico, gestor, prestador…"
                          />
                        </label>

                        {/* Atribuir / reatribuir prestador */}
                        {o.status !== "concluida" && o.status !== "cancelada" && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                              {o.prestador_id === null ? "Atribuir prestador" : "Reatribuir prestador"}
                              <select
                                className="btn"
                                style={{ marginTop: 4, minWidth: 200 }}
                                value={prestadorParaAtribuir}
                                onChange={(e) => setPrestadorParaAtribuir(e.target.value)}
                              >
                                <option value="">Selecione…</option>
                                {prestadores.map((p) => (
                                  <option key={p.id} value={p.id}>{p.nome}</option>
                                ))}
                              </select>
                            </label>
                            <button className="btn" onClick={confirmarAtribuicao} disabled={!prestadorParaAtribuir}>
                              <UserPlus size={13} /> Atribuir
                            </button>
                          </div>
                        )}

                        {/* Notificar o prestador já atribuído (e-mail/WhatsApp/Telegram) */}
                        {o.prestador_id !== null && (
                          <div style={{ marginBottom: 16 }}>
                            <button
                              className="btn"
                              onClick={() => notificarPrestador(o.id)}
                              disabled={notificandoOrdemId === o.id}
                            >
                              {notificandoOrdemId === o.id ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Notificar prestador
                            </button>
                          </div>
                        )}

                        {/* Transições de estado válidas a partir do status atual */}
                        {TRANSICOES_POR_STATUS[o.status].length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 6, maxWidth: 420 }}>
                              Detalhes/observação (opcional, vale para o botão clicado)
                              <input
                                className="btn"
                                style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                value={detalhesEvento}
                                onChange={(e) => setDetalhesEvento(e.target.value)}
                              />
                            </label>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {TRANSICOES_POR_STATUS[o.status].map((tipoEvento) => {
                                const Icone = ICONE_EVENTO[tipoEvento];
                                const perigoso = tipoEvento === "cancelada" || tipoEvento === "impedida";
                                return (
                                  <button
                                    key={tipoEvento}
                                    className={perigoso ? "btn danger" : "btn"}
                                    style={{ padding: "4px 8px", fontSize: 12 }}
                                    onClick={() => disparaEvento(tipoEvento)}
                                  >
                                    <Icone size={13} /> {ROTULO_EVENTO[tipoEvento]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Trilha de eventos */}
                        <strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Trilha de eventos</strong>
                        <div className="table-wrap" style={{ marginBottom: 16 }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Quando</th>
                                <th>Evento</th>
                                <th>Ator</th>
                                <th>Detalhes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detalheOrdem.eventos.map((ev) => (
                                <tr key={ev.id}>
                                  <td>{ev.criado_em}</td>
                                  <td>{ROTULO_TIPO_EVENTO[ev.tipo_evento]}</td>
                                  <td>{ev.ator}</td>
                                  <td>{ev.detalhes ?? "—"}</td>
                                </tr>
                              ))}
                              {detalheOrdem.eventos.length === 0 && (
                                <tr>
                                  <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                    Nenhum evento registrado ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Despesas */}
                        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13 }}>
                          Despesas
                          <button
                            className="btn"
                            style={{ padding: "3px 7px", fontSize: 11.5 }}
                            onClick={() => { setMostrarFormDespesa((v) => !v); setRascunhoDespesa(RASCUNHO_DESPESA_VAZIO); }}
                          >
                            <BanknoteArrowDown size={12} /> {mostrarFormDespesa ? "Fechar" : "Solicitar despesa"}
                          </button>
                        </strong>

                        {mostrarFormDespesa && (
                          <div className="card" style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Valor solicitado (R$)
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoDespesa.valor}
                                  onChange={(e) => setRascunhoDespesa((a) => ({ ...a, valor: e.target.value }))}
                                />
                              </label>
                              <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                Solicitante (1º aprovador)
                                <input
                                  className="btn"
                                  style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                  value={rascunhoDespesa.solicitante}
                                  onChange={(e) => setRascunhoDespesa((a) => ({ ...a, solicitante: e.target.value }))}
                                />
                              </label>
                            </div>
                            <button
                              className="btn primary"
                              onClick={registrarNovaDespesa}
                              disabled={!rascunhoDespesa.valor.trim() || !rascunhoDespesa.solicitante.trim()}
                            >
                              Solicitar despesa
                            </button>
                          </div>
                        )}

                        <div className="table-wrap" style={{ marginBottom: 16 }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Valor solicitado</th>
                                <th>Valor aprovado</th>
                                <th>Status</th>
                                <th>Aprovador 1</th>
                                <th>Aprovador 2</th>
                                <th>Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detalheOrdem.despesas.map((d) => {
                                const exigeQuorumDuplo = d.status === "pendente" && d.valor_solicitado >= LIMITE_APROVACAO_DUPLA;
                                return (
                                  <tr key={d.id}>
                                    <td className="num">{formatarMoeda(d.valor_solicitado)}</td>
                                    <td className="num">{d.valor_aprovado !== null ? formatarMoeda(d.valor_aprovado) : "—"}</td>
                                    <td>
                                      <span
                                        className={`pill ${d.status === "aprovada" ? "good" : d.status === "rejeitada" ? "critical" : ""}`}
                                      >
                                        {d.status === "pendente" ? "Pendente" : d.status === "aprovada" ? "Aprovada" : "Rejeitada"}
                                      </span>
                                      {exigeQuorumDuplo && (
                                        <div>
                                          <span className="pill warning" style={{ marginTop: 4, display: "inline-block" }}>
                                            Aguardando 2º aprovador (≠ {d.aprovador_1})
                                          </span>
                                        </div>
                                      )}
                                    </td>
                                    <td>{d.aprovador_1 ?? "—"}</td>
                                    <td>{d.aprovador_2 ?? "—"}</td>
                                    <td>
                                      {d.status === "pendente" && (
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                          <input
                                            className="btn"
                                            style={{ cursor: "text", width: 110, fontSize: 12 }}
                                            placeholder="aprovador"
                                            value={aprovadorPorDespesa[d.id] ?? ""}
                                            onChange={(e) => setAprovadorPorDespesa((a) => ({ ...a, [d.id]: e.target.value }))}
                                          />
                                          <input
                                            className="btn"
                                            style={{ cursor: "text", width: 90, fontSize: 12 }}
                                            placeholder="valor (opc.)"
                                            value={valorAprovadoPorDespesa[d.id] ?? ""}
                                            onChange={(e) => setValorAprovadoPorDespesa((a) => ({ ...a, [d.id]: e.target.value }))}
                                          />
                                          <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => aprovarDespesa(d.id)}>
                                            <Check size={12} /> Aprovar
                                          </button>
                                          <input
                                            className="btn"
                                            style={{ cursor: "text", width: 120, fontSize: 12 }}
                                            placeholder="motivo rejeição"
                                            value={motivoRejeicaoPorDespesa[d.id] ?? ""}
                                            onChange={(e) => setMotivoRejeicaoPorDespesa((a) => ({ ...a, [d.id]: e.target.value }))}
                                          />
                                          <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => rejeitarDespesa(d.id)}>
                                            <X size={12} /> Rejeitar
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {detalheOrdem.despesas.length === 0 && (
                                <tr>
                                  <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 16 }}>
                                    Nenhuma despesa solicitada ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Avaliação do prestador */}
                        {o.status === "concluida" && (
                          <>
                            <strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Avaliação do prestador</strong>
                            {detalheOrdem.avaliacao ? (
                              <p style={{ fontSize: 12.5 }}>
                                Nota: <strong>{detalheOrdem.avaliacao.nota}/5</strong>
                                {detalheOrdem.avaliacao.comentario ? ` — ${detalheOrdem.avaliacao.comentario}` : ""}
                              </p>
                            ) : o.prestador_id === null ? (
                              <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                                Sem prestador atribuído — não é possível avaliar.
                              </p>
                            ) : (
                              <div className="card" style={{ maxWidth: 420 }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                    Nota
                                    <select
                                      className="btn"
                                      style={{ marginTop: 4 }}
                                      value={notaAvaliacao}
                                      onChange={(e) => setNotaAvaliacao(Number(e.target.value))}
                                    >
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, minWidth: 200 }}>
                                    Comentário (opcional)
                                    <input
                                      className="btn"
                                      style={{ cursor: "text", width: "100%", marginTop: 4 }}
                                      value={comentarioAvaliacao}
                                      onChange={(e) => setComentarioAvaliacao(e.target.value)}
                                    />
                                  </label>
                                </div>
                                <button className="btn primary" onClick={registrarAvaliacao}>
                                  <Star size={13} /> Avaliar prestador
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {ordensFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma ordem de serviço encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
