import { useMemo, useState } from "react";
import { Send, Loader2, CheckCircle2, Clock3, Link2Off } from "lucide-react";
import { useDb } from "../../db/useDb";
import { useToast } from "../../ui/useToast";
import {
  gerarCodigoVinculo,
  listarVinculosPendentesEAtivos,
  type ReferenciaVinculoExterno,
} from "../../domain/notificacoes/vinculosExternos";

/**
 * Vincular o Telegram de um CONTATO EXTERNO (locatário, cliente da advocacia, prestador de
 * serviço) ao sistema — para ele receber notificações (cobrança, lembrete de vencimento,
 * comunicado) direto no chat, do mesmo jeito que o titular/contador já vincula o próprio
 * (ver `CapturasTelegramView.tsx`).
 *
 * COMPONENTE REUTILIZÁVEL, sem rota própria no App.tsx — pensado para ser embutido na tela
 * de cadastro de cada tipo de contato (locatário, entidade legal/cliente da advocacia,
 * prestador), uma vez que cada uma dessas telas exista/seja ajustada (fora do escopo desta
 * rodada — ver props abaixo para a referência exata esperada por `vinculosExternos.ts`):
 *
 *   <VincularTelegramExterno referenciaTipo="contrato_locatario" referenciaId={contatoId} nomeExibicao={nome} />
 *   <VincularTelegramExterno referenciaTipo="entidade_legal" referenciaId={entidadeId} nomeExibicao={nome} />
 *   <VincularTelegramExterno referenciaTipo="prestador" referenciaId={prestadorId} nomeExibicao={nome} />
 *
 * Gerar o código é uma escrita 100% LOCAL (`gerarCodigoVinculo`, sobre `vinculos_telegram_
 * externos` — sql.js) — nenhuma chamada de rede aqui. A RESOLUÇÃO do vínculo (casar o
 * código que o contato mandou ao bot com esta referência) acontece em outro lugar
 * (`resolverVinculosExternosPendentes`, chamado pela seção "Vínculos de contatos externos
 * pendentes" de `CapturasTelegramView.tsx`) — por isso este componente não pede nem usa
 * backend/token: ele só lê e escreve no banco local, e reflete o estado mais recente
 * (`versao` do `useDb()`) sempre que a tela é revisitada depois de alguém verificar os
 * vínculos pendentes em qualquer lugar do app.
 */

export interface VincularTelegramExternoProps {
  referenciaTipo: ReferenciaVinculoExterno;
  referenciaId: number;
  /** Nome do contato, só para a mensagem da tela (ex: "Maria Locatária") — opcional, cai
   * para um texto genérico quando omitido. */
  nomeExibicao?: string;
}

const NOME_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "";

function formatarExpiracao(expiraEmSqlite: string): string {
  // 'YYYY-MM-DD HH:MM:SS' (UTC, ver vinculosExternos.ts) -> Date local para exibição.
  const data = new Date(`${expiraEmSqlite.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return expiraEmSqlite;
  return data.toLocaleString("pt-BR");
}

export function VincularTelegramExterno({ referenciaTipo, referenciaId, nomeExibicao }: VincularTelegramExternoProps) {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [gerando, setGerando] = useState(false);

  const estado = useMemo(() => {
    if (!db) return null;
    return listarVinculosPendentesEAtivos(db, referenciaTipo, referenciaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória (em qualquer tela, inclusive outra aba/view).
  }, [db, referenciaTipo, referenciaId, versao]);

  async function gerarCodigo() {
    if (!db) return;
    setGerando(true);
    try {
      gerarCodigoVinculo(db, referenciaTipo, referenciaId);
      await persistir();
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao gerar código de vínculo");
    } finally {
      setGerando(false);
    }
  }

  if (!db || !estado) {
    return null;
  }

  const quem = nomeExibicao ? ` de ${nomeExibicao}` : "";

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Send size={15} /> Telegram{quem}
      </div>

      {estado.vinculado ? (
        <div className="pill good" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 10px" }}>
          <CheckCircle2 size={14} /> Vinculado — vai receber notificações por aqui.
        </div>
      ) : estado.codigo ? (
        <>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            Peça para o contato mandar <code>/vincular {estado.codigo}</code>{" "}
            {NOME_BOT ? (
              <>
                para <strong>@{NOME_BOT}</strong> no Telegram.
              </>
            ) : (
              <>para o bot configurado no servidor (defina <code>VITE_TELEGRAM_BOT_USERNAME</code> para mostrar o nome dele aqui).</>
            )}
          </p>
          <div className="pill warning" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, padding: "6px 10px", marginBottom: 10 }}>
            <Clock3 size={14} /> /vincular {estado.codigo} — expira em {estado.expiraEm ? formatarExpiracao(estado.expiraEm) : "breve"}
          </div>
          <div>
            <button className="btn" onClick={gerarCodigo} disabled={gerando}>
              {gerando ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Gerar outro código
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8 }}>
            Depois de mandar a mensagem, o vínculo é confirmado quando alguém abrir a tela "Captura via Telegram" e clicar em
            "Verificar vínculos pendentes" — ainda não é instantâneo.
          </p>
        </>
      ) : (
        <>
          <div className="aviso-caixa" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <Link2Off size={15} /> Ainda não vinculado.
          </div>
          <button className="btn primary" onClick={gerarCodigo} disabled={gerando}>
            {gerando ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Gerar código de vínculo
          </button>
        </>
      )}
    </div>
  );
}
