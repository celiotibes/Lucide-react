import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Info, Send, UploadCloud } from "lucide-react";
import { useDb } from "../../db/useDb";
import { useToast } from "../../ui/useToast";
import { formatarMoeda } from "../../domain/formatarMoeda";
import {
  identificarLembretesPendentes,
  dispararLembretesPendentes,
  sincronizarLembretesFuturos,
  criarLembretesAgendadosApiClientHttp,
  type LembretePendente,
  type ResultadoLembrete,
} from "../../domain/notificacoes/lembretesVencimento";
import { listarRecentes, type NotificacaoEnviada, type StatusNotificacao } from "../../domain/notificacoes/notificacoes-db";
import type { NotificacoesApiClient } from "../../domain/notificacoes/despachoCliente";

/**
 * Lembretes de vencimento de aluguel/honorário ("2 dias antes" e "no dia").
 *
 * ATUALIZAÇÃO (fase 5 — `lembretes_agendados`): o disparo já não depende só do app estar
 * aberto no dia exato. Esta tela continua calculando e disparando, na hora, os lembretes
 * que estão NO PONTO de disparo agora (`identificarLembretesPendentes`/
 * `dispararLembretesPendentes` — ver detalhe completo em `lembretesVencimento.ts`), mas
 * agora TAMBÉM sincroniza com o servidor (`sincronizarLembretesFuturos`) todos os lembretes
 * FUTUROS dentro de um horizonte (`DIAS_HORIZONTE_SINCRONIZACAO` dias) — já com
 * destinatário/mensagem prontos. O servidor guarda essa agenda (`lembretes_agendados`) e,
 * de hora em hora, dispara sozinho (loop em segundo plano, ver
 * `server/src/lembretes-dispatcher.ts`) o que já estiver no dia certo, SEM depender do app
 * estar aberto naquele momento específico.
 *
 * Isso não elimina por completo a necessidade de abrir o app: a sincronização só manda o
 * que o cliente consegue calcular agora (precisa do banco local, que só existe no
 * navegador) — se o app ficar fechado por mais tempo que `DIAS_HORIZONTE_SINCRONIZACAO`
 * dias SEM NUNCA sincronizar, o horizonte sincronizado anteriormente pode não cobrir um
 * vencimento mais distante. Na prática, abrir esta tela de vez em quando (ela sincroniza
 * sozinha, automaticamente, uma vez por abertura — ver o `useEffect` com
 * `sincronizacaoAutomaticaFeita` abaixo) já garante uma margem confortável.
 *
 * Mesmo padrão de configuração (endereço do backend + token de sessão em localStorage) de
 * `CobrancasAsaasView.tsx` — cada tela que precisa chamar o backend gerencia sua própria
 * configuração, por convenção já estabelecida neste domínio (ver o comentário equivalente
 * lá). Mesmo padrão visual de histórico de `NotificacoesView.tsx` (card + tabela), aqui
 * filtrado só para `origem_tipo IN ('lembrete_aluguel', 'lembrete_honorario')`.
 */

/** Horizonte de sincronização dos lembretes futuros — ver `sincronizarLembretesFuturos`.
 * 45 dias cobre tranquilamente o ciclo comum de "abrir esta tela de vez em quando" sem
 * forçar uma sincronização diária: mesmo que o usuário não abra o app por algumas semanas,
 * os lembretes do período seguinte já estariam agendados no servidor da última
 * sincronização. */
const DIAS_HORIZONTE_SINCRONIZACAO = 45;

// ============================================================================
// Configuração local (backend + token de sessão) — mesmo padrão de CobrancasAsaasView.tsx
// ============================================================================

interface ConfiguracaoLembretesView {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE = "integracoes-lembretes-vencimento:config:v1";
const CONFIG_PADRAO: ConfiguracaoLembretesView = { enderecoBackend: "", tokenSessao: "" };

function carregarConfig(): ConfiguracaoLembretesView {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return { ...CONFIG_PADRAO };
    return { ...CONFIG_PADRAO, ...(JSON.parse(bruto) as Partial<ConfiguracaoLembretesView>) };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

function salvarConfig(config: ConfiguracaoLembretesView): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta
    // sessão, só não sobrevive a um reload (mesmo princípio de CobrancasAsaasView.tsx).
  }
}

function backendConfigurado(config: ConfiguracaoLembretesView): boolean {
  return config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;
}

async function mensagemErroResposta(resposta: Response, acaoDescricao: string): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.erro === "string") return corpo.erro;
  } catch {
    /* corpo não é JSON — segue para a mensagem genérica abaixo */
  }
  return `${acaoDescricao} (HTTP ${resposta.status})`;
}

function criarApiClienteHttp(backendUrl: string, token: string): NotificacoesApiClient {
  const base = backendUrl.replace(/\/+$/, "");
  const cabecalhos = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  return {
    async disparar(dados) {
      const resposta = await fetch(`${base}/api/notificacoes/disparar`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao disparar notificação"));
      return resposta.json();
    },
  };
}

// ============================================================================
// Componente
// ============================================================================

const TIPO_LEMBRETE_LABEL: Record<LembretePendente["tipoLembrete"], string> = {
  "2_dias_antes": "2 dias antes",
  no_dia: "No dia",
};

const STATUS_LABEL: Record<StatusNotificacao, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  falha: "Falha",
};

const STATUS_VARIANTE: Record<StatusNotificacao, "good" | "warning" | "critical" | null> = {
  enviado: "good",
  pendente: "warning",
  falha: "critical",
};

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  // Mesmo ajuste de fuso de NotificacoesView.tsx: timestamps do SQLite vêm sem 'T'/'Z'.
  const normalizado = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const data = new Date(normalizado);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDataBr(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return iso;
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

export function LembretesVencimentoView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [config, setConfig] = useState<ConfiguracaoLembretesView>(() => carregarConfig());
  const configurado = backendConfigurado(config);
  const [disparando, setDisparando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // Garante que o disparo/sincronização automáticos "ao abrir esta tela" acontecem no
  // máximo UMA VEZ por montagem do componente cada — sem estes refs, um re-render (ex.:
  // `versao` do banco mudando depois do próprio disparo persistir) chamaria o efeito de
  // novo e tentaria disparar/sincronizar em loop. `useRef` (não `useState`) de propósito:
  // mudar esta flag nunca deve causar um re-render por si só.
  const disparoAutomaticoFeito = useRef(false);
  const sincronizacaoAutomaticaFeita = useRef(false);

  function atualizarConfig(patch: Partial<ConfiguracaoLembretesView>) {
    setConfig((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfig(proximo);
      return proximo;
    });
  }

  const pendentes = useMemo<LembretePendente[]>(() => {
    if (!db) return [];
    try {
      return identificarLembretesPendentes(db);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db`.
  }, [db, versao]);

  const historico = useMemo<NotificacaoEnviada[]>(() => {
    if (!db) return [];
    return listarRecentes(db, 200).filter((n) => n.origemTipo === "lembrete_aluguel" || n.origemTipo === "lembrete_honorario");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao]);

  const dispararAgora = useCallback(
    async (mostrarAviso: boolean): Promise<ResultadoLembrete[]> => {
      if (!db) return [];
      if (!configurado) {
        if (mostrarAviso) avisar("critical", "Configure o endereço do backend e o token de sessão antes de disparar lembretes.");
        return [];
      }
      setDisparando(true);
      try {
        const apiClient = criarApiClienteHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
        const resultados = await dispararLembretesPendentes(db, apiClient);
        await persistir();
        if (mostrarAviso) {
          avisar(
            resultados.length > 0 ? "good" : "good",
            resultados.length > 0 ? `${resultados.length} lembrete(s) de vencimento disparado(s).` : "Nenhum lembrete pendente agora.",
          );
        }
        return resultados;
      } catch (erro) {
        if (mostrarAviso) avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao disparar lembretes.");
        return [];
      } finally {
        setDisparando(false);
      }
    },
    [db, configurado, config, persistir, avisar],
  );

  const sincronizarAgora = useCallback(
    async (mostrarAviso: boolean): Promise<void> => {
      if (!db) return;
      if (!configurado) {
        if (mostrarAviso) avisar("critical", "Configure o endereço do backend e o token de sessão antes de sincronizar lembretes futuros.");
        return;
      }
      setSincronizando(true);
      try {
        const apiClient = criarLembretesAgendadosApiClientHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
        const { aluguel, honorario } = await sincronizarLembretesFuturos(db, apiClient, { diasHorizonte: DIAS_HORIZONTE_SINCRONIZACAO });
        if (mostrarAviso) {
          avisar("good", `Agenda sincronizada com o servidor: ${aluguel} lembrete(s) de aluguel, ${honorario} de honorário.`);
        }
      } catch (erro) {
        if (mostrarAviso) avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao sincronizar lembretes futuros.");
      } finally {
        setSincronizando(false);
      }
    },
    [db, configurado, config, avisar],
  );

  // Disparo/sincronização automáticos "ao abrir o app" — na prática, "ao abrir esta tela",
  // já que a chamada vive aqui e não em App.tsx (ver nota no relatório da tarefa sobre essa
  // diferença). Só tenta quando o backend já está configurado — sem isso, forçar o aviso
  // de erro assim que a tela abre seria mais incômodo que útil; os botões manuais cobrem
  // esse caso enquanto o backend não estiver configurado. As duas chamadas (disparo dos
  // pendentes de agora + sincronização dos futuros) acontecem juntas, uma vez por
  // montagem — é exatamente essa combinação que faz "abrir esta tela de vez em quando" ser
  // suficiente para o disparo real (no servidor) continuar acontecendo em dia, mesmo nos
  // dias em que o app fica fechado (ver comentário no topo do arquivo).
  useEffect(() => {
    if (!db || !configurado) return;
    if (!disparoAutomaticoFeito.current) {
      disparoAutomaticoFeito.current = true;
      void dispararAgora(false);
    }
    if (!sincronizacaoAutomaticaFeita.current) {
      sincronizacaoAutomaticaFeita.current = true;
      void sincronizarAgora(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: só reage a `db`/`configurado` ficarem prontos, nunca a mudanças subsequentes de `dispararAgora`/`sincronizarAgora`.
  }, [db, configurado]);

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <BellRing size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Lembretes de vencimento — aluguel e honorário
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          O lembrete dispara 2 dias antes do vencimento e no dia do vencimento. Esta tela sincroniza automaticamente, a cada abertura, a
          agenda de lembretes futuros (próximos {DIAS_HORIZONTE_SINCRONIZACAO} dias) com o servidor — uma vez sincronizado, o disparo real
          acontece sozinho, de hora em hora, num processo em segundo plano do servidor, <strong>mesmo com o app fechado</strong> no dia
          exato do vencimento. Isso só funciona se você sincronizar de vez em quando (abrir esta tela já faz isso automaticamente, ou use o
          botão "Sincronizar lembretes futuros com o servidor" abaixo) — se o app ficar fechado por mais tempo que o horizonte de
          sincronização sem sincronizar nenhuma vez, um vencimento mais distante pode não ter sido agendado ainda. O botão "Disparar
          lembretes agora" continua disponível para o que já está no ponto de disparo hoje mesmo, sem esperar a próxima rodada do servidor.
          Cada contrato tem seu próprio dia de vencimento (não é sempre dia 10) — o que importa é o vencimento real de cada
          competência/honorário.
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Endereço do backend
          <input
            className="btn"
            style={{ width: 260, marginTop: 4, cursor: "text" }}
            placeholder="https://meu-backend.exemplo.com"
            value={config.enderecoBackend}
            onChange={(e) => atualizarConfig({ enderecoBackend: e.target.value })}
          />
        </label>
        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Token de sessão
          <input
            className="btn"
            type="password"
            style={{ width: 200, marginTop: 4, cursor: "text" }}
            value={config.tokenSessao}
            onChange={(e) => atualizarConfig({ tokenSessao: e.target.value })}
          />
        </label>
        <button className="btn primary" disabled={!configurado || disparando} onClick={() => dispararAgora(true)}>
          <Send size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          {disparando ? "Disparando…" : "Disparar lembretes agora"}
        </button>
        <button className="btn" disabled={!configurado || sincronizando} onClick={() => sincronizarAgora(true)}>
          <UploadCloud size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          {sincronizando ? "Sincronizando…" : "Sincronizar lembretes futuros com o servidor"}
        </button>
        {!configurado && (
          <span style={{ fontSize: 12, color: "var(--viz-critical)" }}>Configure o backend e o token para poder disparar/sincronizar.</span>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          {pendentes.length} lembrete(s) pendente(s) de disparo agora (vencendo hoje ou em 2 dias, ainda sem lembrete disparado hoje).
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Referência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={`${p.origemTipo}-${p.origemId}`}>
                  <td>{p.origemTipo === "lembrete_aluguel" ? "Aluguel" : "Honorário"}</td>
                  <td>{p.descricaoContexto}</td>
                  <td>{formatarDataBr(p.dataVencimento)}</td>
                  <td className="num">{formatarMoeda(p.valorDevido)}</td>
                  <td>
                    <span className={`pill ${p.tipoLembrete === "no_dia" ? "critical" : "warning"}`}>{TIPO_LEMBRETE_LABEL[p.tipoLembrete]}</span>
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhum lembrete pendente de disparo agora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Histórico de lembretes disparados</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Origem</th>
                <th>Canal</th>
                <th>Destinatário</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((n) => (
                <tr key={n.id}>
                  <td>{formatarDataHora(n.criadoEm)}</td>
                  <td>{n.origemTipo === "lembrete_aluguel" ? "Aluguel" : "Honorário"}</td>
                  <td>#{n.origemId}</td>
                  <td>{n.canal}</td>
                  <td>{n.destinatario}</td>
                  <td>
                    <span className={`pill ${STATUS_VARIANTE[n.status] ?? ""}`}>{STATUS_LABEL[n.status]}</span>
                    {n.status === "falha" && n.erroMensagem && (
                      <div style={{ fontSize: 11, color: "var(--viz-critical)", marginTop: 4 }} title={n.erroMensagem}>
                        {n.erroMensagem}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {historico.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhum lembrete disparado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
