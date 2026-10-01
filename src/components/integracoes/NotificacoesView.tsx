import { useMemo, useState } from "react";
import { Bell, Info } from "lucide-react";
import { useDb } from "../../db/useDb";
import {
  listarPorOrigem,
  listarRecentes,
  type CanalNotificacao,
  type NotificacaoEnviada,
  type OrigemNotificacao,
  type StatusNotificacao,
} from "../../domain/notificacoes/notificacoes-db";

/**
 * Histórico de notificações (e-mail/WhatsApp/Telegram) disparadas para cobrança Asaas ou
 * comunicado genérico — consulta DIRETO o banco local (sql.js), sem chamada HTTP nenhuma:
 * `notificacoes_enviadas` já é dado do cliente (ver `src/domain/notificacoes/
 * notificacoes-db.ts` para a decisão de arquitetura completa — por isso não existe uma
 * rota GET de histórico no servidor). Mesmo padrão visual de `HistoricoJurosView.tsx`
 * (card + filtros + tabela), sem precisar de nenhuma configuração de backend/token para
 * só VER o histórico — isso só é necessário para efetivamente DISPARAR, o que esta tela
 * não faz (ver `src/domain/notificacoes/despachoCliente.ts` para quem dispara).
 */

const CANAL_LABEL: Record<CanalNotificacao, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
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

// 'pulado' não é um status gravado em notificacoes_enviadas (canal sem destinatário nunca
// chega a registrar tentativa — ver despachoCliente.ts) — listado aqui só para documentar
// por que a legenda abaixo fala dele sem que ele apareça nunca nesta tabela.
const ORIGEM_LABEL: Record<OrigemNotificacao, string> = {
  cobranca_asaas: "Cobrança Asaas",
  comunicado_generico: "Comunicado genérico",
};

function PillStatus({ status }: { status: StatusNotificacao }) {
  const variante = STATUS_VARIANTE[status];
  return <span className={`pill ${variante ?? ""}`}>{STATUS_LABEL[status]}</span>;
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  // Timestamps do SQLite vêm como 'YYYY-MM-DD HH:MM:SS' (UTC, sem 'T') — new Date() do
  // navegador entende o formato com espaço como hora local, então normaliza para ISO com
  // 'T' + 'Z' antes de formatar, para não exibir a hora errada (deslocada do fuso).
  const normalizado = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const data = new Date(normalizado);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function NotificacoesView() {
  const { db, versao } = useDb();

  const [origemTipo, setOrigemTipo] = useState<OrigemNotificacao | "">("");
  const [origemIdTexto, setOrigemIdTexto] = useState("");
  const [filtroCanal, setFiltroCanal] = useState<CanalNotificacao | "">("");
  const [filtroStatus, setFiltroStatus] = useState<StatusNotificacao | "">("");

  const origemIdNumero = origemIdTexto.trim() === "" ? null : Number(origemIdTexto);
  const origemIdValido = origemIdTexto.trim() === "" || (Number.isFinite(origemIdNumero) && origemIdNumero !== null);

  const notificacoes = useMemo<NotificacaoEnviada[]>(() => {
    if (!db) return [];
    try {
      const base: NotificacaoEnviada[] =
        origemTipo && origemIdValido
          ? listarPorOrigem(db, origemTipo, origemIdTexto.trim() === "" ? null : (origemIdNumero as number))
          : listarRecentes(db, 200);
      return base.filter((n) => (filtroCanal ? n.canal === filtroCanal : true) && (filtroStatus ? n.status === filtroStatus : true));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao, origemTipo, origemIdTexto, origemIdValido, filtroCanal, filtroStatus]);

  const resumo = useMemo(() => {
    const total = notificacoes.length;
    const enviados = notificacoes.filter((n) => n.status === "enviado").length;
    const falhas = notificacoes.filter((n) => n.status === "falha").length;
    const pendentes = notificacoes.filter((n) => n.status === "pendente").length;
    return { total, enviados, falhas, pendentes };
  }, [notificacoes]);

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Bell size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Notificações disparadas — e-mail, WhatsApp e Telegram
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Toda cobrança/boleto emitido (Asaas) e todo comunicado genérico disparado pelo sistema é enviado também por e-mail e
          WhatsApp/Telegram ao destinatário cadastrado — não fica só visível dentro do sistema. <strong>E-mail e WhatsApp usam o
          contato cadastrado no locatário/cliente.</strong> <strong>Telegram só funciona se você tiver vinculado uma conta</strong> — ver
          tela de captura rápida. Locatários e clientes da advocacia ainda não têm um jeito próprio de vincular um chat_id do Telegram;
          por isso, para eles, o canal Telegram aparece como "pulado" no momento do disparo (nunca como falha).
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Origem
            <select
              className="btn"
              style={{ width: 200, marginTop: 4 }}
              value={origemTipo}
              onChange={(e) => setOrigemTipo(e.target.value as OrigemNotificacao | "")}
            >
              <option value="">— todas —</option>
              <option value="cobranca_asaas">{ORIGEM_LABEL.cobranca_asaas}</option>
              <option value="comunicado_generico">{ORIGEM_LABEL.comunicado_generico}</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Id da origem {origemTipo === "comunicado_generico" ? "(vazio = sem origem ligada)" : ""}
            <input
              className="btn"
              style={{ width: 160, marginTop: 4, cursor: "text" }}
              placeholder="ex: 42"
              value={origemIdTexto}
              onChange={(e) => setOrigemIdTexto(e.target.value)}
              disabled={!origemTipo}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Canal
            <select className="btn" style={{ width: 150, marginTop: 4 }} value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value as CanalNotificacao | "")}>
              <option value="">— todos —</option>
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Status
            <select className="btn" style={{ width: 150, marginTop: 4 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusNotificacao | "")}>
              <option value="">— todos —</option>
              <option value="enviado">Enviado</option>
              <option value="falha">Falha</option>
              <option value="pendente">Pendente</option>
            </select>
          </label>
        </div>
        {!origemIdValido && <p style={{ color: "var(--viz-critical)", fontSize: 12, marginTop: 10 }}>Id da origem precisa ser numérico.</p>}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          {resumo.total} notificação(ões) no recorte — <strong>{resumo.enviados}</strong> enviada(s), <strong>{resumo.falhas}</strong>{" "}
          falha(s), <strong>{resumo.pendentes}</strong> pendente(s).
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Origem</th>
                <th>Canal</th>
                <th>Destinatário</th>
                <th>Assunto / mensagem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {notificacoes.map((n) => (
                <tr key={n.id}>
                  <td>{formatarDataHora(n.criadoEm)}</td>
                  <td>
                    {ORIGEM_LABEL[n.origemTipo]}
                    {n.origemId !== null ? ` #${n.origemId}` : ""}
                  </td>
                  <td>{CANAL_LABEL[n.canal]}</td>
                  <td>{n.destinatario}</td>
                  <td title={n.mensagem} style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.assunto ? <strong>{n.assunto}: </strong> : null}
                    {n.mensagem}
                  </td>
                  <td>
                    <PillStatus status={n.status} />
                    {n.status === "falha" && n.erroMensagem && (
                      <div style={{ fontSize: 11, color: "var(--viz-critical)", marginTop: 4 }} title={n.erroMensagem}>
                        {n.erroMensagem}
                      </div>
                    )}
                    {n.status === "enviado" && n.enviadoEm && (
                      <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>em {formatarDataHora(n.enviadoEm)}</div>
                    )}
                  </td>
                </tr>
              ))}
              {notificacoes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhuma notificação encontrada neste recorte.
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
