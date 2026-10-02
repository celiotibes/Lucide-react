/**
 * Loop periódico de disparo dos lembretes agendados (`lembretes_agendados` — ver
 * `migrations-phase5-lembretes-agendados.sql` e `domain/notificacoes/lembretes-agendados-db.ts`).
 * É esta peça que faz "2 dias antes"/"no dia" acontecerem num horário real do servidor,
 * mesmo com o app (cliente) fechado no dia exato do vencimento — desde que o cliente tenha
 * sincronizado o lembrete com alguma antecedência (ver `identificarLembretesFuturos` no
 * cliente).
 *
 * Mesmo padrão de `setupSessionCleanup` (`database-init.ts`): roda uma vez imediatamente
 * (no boot) e depois periodicamente via `setInterval`, com `.unref()` para o processo
 * conseguir terminar normalmente mesmo com o timer pendente (ex: em testes, ou em
 * `SIGTERM`/`SIGINT` — ver `index.ts`).
 *
 * Intervalo escolhido: 1 HORA — mesmo valor de `setupSessionCleanup`. Não precisa ser mais
 * fino que isso: o requisito é "disparar no dia certo", não num minuto exato do dia; rodar
 * de hora em hora garante no máximo ~1h de atraso em relação ao instante em que
 * `data_disparo_prevista` vira "hoje" (ou um dia qualquer no passado, se o processo ficou
 * fora do ar), o que é mais que suficiente para um lembrete de vencimento.
 *
 * `senders` é injetável (mesmo padrão de `notificacoes-routes.ts`/`despacho.ts`) — default
 * são os 3 remetentes reais; os testes passam fakes, para nunca tocar rede real nem exigir
 * as env vars de produção (SMTP_, WHATSAPP_, TELEGRAM_BOT_TOKEN) configuradas.
 */
import type Database from "better-sqlite3";
import { LembretesAgendadosServiceDB, type LembreteAgendado } from "./domain/notificacoes/lembretes-agendados-db.js";
import { enviarEmail } from "./notificacoes/email.js";
import { enviarWhatsapp } from "./notificacoes/whatsapp.js";
import { enviarTelegram } from "./notificacoes/telegram-sender.js";

export interface SendersLembretesAgendados {
  enviarEmail: (opcoes: { destinatario: string; assunto: string; corpo: string }) => Promise<void>;
  enviarWhatsapp: (opcoes: { destinatarioE164: string; mensagem: string }) => Promise<void>;
  enviarTelegram: (opcoes: { chatId: string; mensagem: string }) => Promise<void>;
}

const sendersPadrao: SendersLembretesAgendados = { enviarEmail, enviarWhatsapp, enviarTelegram };

const INTERVALO_MS = 60 * 60 * 1000; // 1 hora — ver justificativa no cabeçalho do arquivo.

/** Dispara UM lembrete pelo canal certo e grava o resultado (`marcarEnviado`/`marcarFalha`).
 * Nunca lança: qualquer erro do sender vira `marcarFalha` com a mensagem do erro, para o
 * loop seguir processando os próximos lembretes independentemente desta falha (mesmo
 * princípio de `despacho.ts`, um canal por vez em vez de 3 por notificação). */
async function dispararUm(
  service: LembretesAgendadosServiceDB,
  senders: SendersLembretesAgendados,
  lembrete: LembreteAgendado,
): Promise<void> {
  try {
    if (lembrete.canal === "email") {
      await senders.enviarEmail({ destinatario: lembrete.destinatario, assunto: lembrete.assunto ?? "", corpo: lembrete.mensagem });
    } else if (lembrete.canal === "whatsapp") {
      await senders.enviarWhatsapp({ destinatarioE164: lembrete.destinatario, mensagem: lembrete.mensagem });
    } else {
      await senders.enviarTelegram({ chatId: lembrete.destinatario, mensagem: lembrete.mensagem });
    }
    service.marcarEnviado(lembrete.id);
  } catch (erro) {
    service.marcarFalha(lembrete.id, erro instanceof Error ? erro.message : `Erro desconhecido ao enviar por ${lembrete.canal}`);
  }
}

/**
 * Executa UMA rodada do disparo: lista tudo que está pendente e com `data_disparo_prevista`
 * já vencida (ver `listarPendentesParaDisparo`) e tenta enviar cada um, sequencialmente
 * (nunca em paralelo — evita saturar os 3 provedores externos num pico de lembretes do
 * mesmo dia; não é um caminho de alta frequência a ponto de justificar paralelismo).
 * Devolve quantos lembretes foram processados nesta rodada (enviados ou com falha).
 * Exportada separadamente de `iniciarDisparoLembretesAgendados` para poder ser chamada
 * isoladamente em teste, sem depender de `setInterval`/relógio.
 */
export async function executarRodadaDisparo(
  service: LembretesAgendadosServiceDB,
  senders: SendersLembretesAgendados = sendersPadrao,
): Promise<number> {
  const pendentes = service.listarPendentesParaDisparo();
  for (const lembrete of pendentes) {
    await dispararUm(service, senders, lembrete);
  }
  return pendentes.length;
}

/**
 * Inicia o loop: uma rodada imediata (boot) e depois uma rodada por hora. Nunca lança —
 * qualquer erro inesperado de uma rodada (ex: erro de banco) só é logado, para não derrubar
 * o processo do servidor por uma falha num loop de background.
 */
export function iniciarDisparoLembretesAgendados(db: Database.Database, senders: SendersLembretesAgendados = sendersPadrao): void {
  const service = new LembretesAgendadosServiceDB(db);

  function rodar(): void {
    executarRodadaDisparo(service, senders)
      .then((total) => {
        if (total > 0) {
          console.log(`[LembretesAgendados] ${total} lembrete(s) processado(s) nesta rodada`);
        }
      })
      .catch((erro) => {
        console.error("[LembretesAgendados] Erro ao processar rodada de disparo:", erro instanceof Error ? erro.message : erro);
      });
  }

  rodar(); // rodada imediata no boot — não espera a primeira hora para começar a disparar.

  const interval = setInterval(rodar, INTERVALO_MS);
  interval.unref(); // não impede o processo de terminar (mesmo padrão de setupSessionCleanup).

  console.log("[LembretesAgendados] Loop de disparo agendado (a cada 1h)");
}
