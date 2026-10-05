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
import { logger } from './services/logger-service.js';
import { LembretesAgendadosServiceDB, type LembreteAgendado } from "./domain/notificacoes/lembretes-agendados-db.js";
import { enviarEmail } from "./notificacoes/email.js";
import { enviarWhatsapp, type OpcoesEnviarWhatsapp } from "./notificacoes/whatsapp.js";
import { enviarTelegram } from "./notificacoes/telegram-sender.js";
import { calcularDREPeriodo, gravarDREPeriodo } from "./domain/relatorios/dre.js";
import { sincronizarStatusTaxaAsaas } from "./domain/integracoes/pagamentos-reconciliador.js";
import { conciliarPixOFX } from "./domain/integracoes/conciliacao-pix-ofx.js";
import { enviarRelatorioEmailMensal } from "./domain/relatorios/relatorio-executivo.js";
import { sincronizarPagamentosPendentes } from "./domain/integracoes/asaas-pagamentos-pix.js";
import { backupSQLiteToGoogleDrive } from "./utils/googleDriveBackup.js";

export interface SendersLembretesAgendados {
  enviarEmail: (opcoes: { destinatario: string; assunto: string; corpo: string }) => Promise<void>;
  enviarWhatsapp: (opcoes: OpcoesEnviarWhatsapp) => Promise<void>;
  enviarTelegram: (opcoes: { chatId: string; mensagem: string }) => Promise<void>;
}

const sendersPadrao: SendersLembretesAgendados = { enviarEmail, enviarWhatsapp, enviarTelegram };

const INTERVALO_MS = 60 * 60 * 1000; // 1 hora — ver justificativa no cabeçalho do arquivo.
const INTERVALO_PIX_OFX_MS = 3 * 60 * 60 * 1000; // 3 horas — menos frequente que sync taxa
const INTERVALO_PIX_PROATIVO_MS = 2 * 60 * 60 * 1000; // 2 horas — sincronização de pagamentos outgoing

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
 * Sincronização diária de DRE (Opção B: Histórico, gravado 1x/dia).
 * Chamada a cada dia (no boot com horário ajustado para 23:55, depois daily via cron).
 * Calcula o DRE do mês anterior (já fechado) e grava em dre_periodos.
 *
 * Não lança: qualquer erro é só logado.
 */
export function sincronizarDREDiario(db: Database.Database): void {
  try {
    const agora = new Date();
    const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const anoAnterior = mesAnterior.getFullYear();
    const mesAnteriorNum = mesAnterior.getMonth() + 1;

    // Calcula DRE do mês anterior (período completo)
    const dataInicio = `${anoAnterior}-${String(mesAnteriorNum).padStart(2, "0")}-01`;
    const ultimoDiaDoMes = new Date(anoAnterior, mesAnteriorNum, 0).getDate();
    const dataFim = `${anoAnterior}-${String(mesAnteriorNum).padStart(2, "0")}-${String(ultimoDiaDoMes).padStart(2, "0")}`;

    const dre = calcularDREPeriodo(db, dataInicio, dataFim);
    gravarDREPeriodo(db, anoAnterior, mesAnteriorNum, dre);

    logger.info(
      `[DRE] Sincronização diária: DRE ${anoAnterior}-${String(mesAnteriorNum).padStart(2, "0")} calculado e gravado (Opção B).`
    );
  } catch (erro) {
    logger.error(
      "[DRE] Erro ao sincronizar DRE diário:",
      erro instanceof Error ? erro.message : erro
    );
  }
}

/**
 * Sincronização horária de cobranças Asaas (status e taxas).
 * Chamada a cada 1 hora via loop background.
 * Consulta a API da Asaas para cada cobrança ativa e atualiza o banco local.
 *
 * Não lança: qualquer erro (rede, API) é só logado. Mantém o loop rodando
 * mesmo com falhas isoladas (ex: uma cobrança com erro não deruba o resto).
 */
export async function sincronizarCobrancasAsaas(db: Database.Database): Promise<void> {
  try {
    const resultado = await sincronizarStatusTaxaAsaas(db);

    if (resultado.atualizadas > 0 || resultado.discrepancias > 0 || resultado.erros > 0) {
      logger.info(
        `[Asaas] Reconciliação: ${resultado.atualizadas} atualizadas, ${resultado.discrepancias} discrepâncias, ${resultado.erros} erro(s)`
      );
    }

    if (resultado.discrepancias > 0) {
      logger.warn(
        `[Asaas] ${resultado.discrepancias} discrepância(s) detectada(s) — verificar audit_reconciliacao_asaas`
      );
    }
  } catch (erro) {
    logger.error(
      "[Asaas] Erro ao sincronizar cobranças:",
      erro instanceof Error ? erro.message : erro
    );
  }
}

/**
 * Reconciliação PIX↔OFX a cada 3 horas.
 * Casa transações Asaas PIX com extratos Pluggy OFX, detecta discrepâncias e
 * gera lançamentos contábeis automaticamente.
 *
 * Não lança: qualquer erro é logado. Mantém o loop rodando mesmo com falhas.
 */
export function sincronizarConciliacaoPixOFX(db: Database.Database): void {
  try {
    const resultado = conciliarPixOFX(db);

    if (resultado.conciliadas > 0 || resultado.discrepancias > 0 || resultado.pendentes > 0 || resultado.expiradas > 0) {
      logger.info(
        `[PIX↔OFX] Reconciliação: ${resultado.conciliadas} reconciliadas, ${resultado.discrepancias} discrepâncias, ${resultado.pendentes} pendentes, ${resultado.expiradas} expiradas`
      );
    }

    if (resultado.discrepancias > 0) {
      logger.warn(
        `[PIX↔OFX] ${resultado.discrepancias} discrepância(s) detectada(s) — verificar audit_conciliacao_discrepancias`
      );
    }
  } catch (erro) {
    logger.error(
      "[PIX↔OFX] Erro ao reconciliar:",
      erro instanceof Error ? erro.message : erro
    );
  }
}

/**
 * Sincronização de pagamentos PIX PROATIVOS (outgoing) a cada 2 horas.
 * Poolea a Asaas para atualizar status de pagamentos pendentes/em processamento.
 * Grava histórico de atualizações em pagamentos_pix_historico.
 *
 * Não lança: qualquer erro (rede, API) é só logado. Mantém o loop rodando
 * mesmo com falhas isoladas (ex: um pagamento com erro não deruba o resto).
 */
export async function sincronizarPagamentosPixProativos(db: Database.Database): Promise<void> {
  try {
    const resultado = await sincronizarPagamentosPendentes(db);

    if (resultado.atualizados > 0 || resultado.erros > 0) {
      logger.info(
        `[PIX Proativo] Sincronização: ${resultado.atualizados} atualizados, ${resultado.erros} erro(s)`
      );
    }

    if (resultado.erros > 0) {
      logger.warn(
        `[PIX Proativo] ${resultado.erros} erro(s) durante sincronização — verificar histórico`
      );
    }
  } catch (erro) {
    logger.error(
      "[PIX Proativo] Erro ao sincronizar pagamentos:",
      erro instanceof Error ? erro.message : erro
    );
  }
}

/**
 * Envio mensal de Relatório Executivo (1º dia útil de cada mês, 8:00 AM).
 * Não lança: qualquer erro é logado e retry é tentado na próxima rodada.
 */
export async function enviarRelatorioExecutivoMensal(
  db: Database.Database,
  email: string | null = null,
): Promise<void> {
  try {
    // Email padrão: tira de env var ou config (por enquanto, usa null para skip se não configurado)
    const emailDestino = email || process.env.RELATORIO_EXECUTIVO_EMAIL;

    if (!emailDestino) {
      logger.warn(
        "[RelatorioExecutivo] RELATORIO_EXECUTIVO_EMAIL não configurada — pulando envio mensal",
      );
      return;
    }

    const agora = new Date();
    const mesAtual = agora.getMonth() + 1;
    const anoAtual = agora.getFullYear();

    // Envia relatório do mês anterior (já fechado)
    const mesPrecedente = mesAtual === 1 ? 12 : mesAtual - 1;
    const anoPrecedente = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    const resultado = await enviarRelatorioEmailMensal(db, emailDestino, mesPrecedente, anoPrecedente);

    if (resultado.sucesso) {
      logger.info(
        `[RelatorioExecutivo] Relatório mensal ${anoPrecedente}-${String(mesPrecedente).padStart(2, "0")} enviado para ${emailDestino}`,
      );
    } else {
      logger.error(
        `[RelatorioExecutivo] Erro ao enviar relatório mensal: ${resultado.erro}`,
      );
    }
  } catch (erro) {
    logger.error(
      "[RelatorioExecutivo] Erro inesperado ao enviar relatório executivo:",
      erro instanceof Error ? erro.message : erro,
    );
  }
}

/**
 * Calcula próximo 1º dia útil (segunda a sexta) do mês seguinte às 8:00 AM.
 * Se hoje é 1º dia útil, próxima rodada será no mês seguinte.
 */
function calcularProximoDisparo1oDiaUtil(): Date {
  const agora = new Date();
  const data = new Date(agora.getFullYear(), agora.getMonth() + 1, 1, 8, 0, 0);

  // Verifica se é sábado (6) ou domingo (0)
  while (data.getDay() === 0 || data.getDay() === 6) {
    data.setDate(data.getDate() + 1);
  }

  // Se o próximo disparo é hoje e já passou das 8:00, agenda para próximo mês
  if (data.toDateString() === agora.toDateString() && agora.getHours() >= 8) {
    data.setMonth(data.getMonth() + 1);
    data.setDate(1);
    while (data.getDay() === 0 || data.getDay() === 6) {
      data.setDate(data.getDate() + 1);
    }
  }

  return data;
}

/**
 * Scanner diário de anomalias em fluxo de caixa (fase 4.1).
 * Analisa transações do último dia e registra alertas críticos.
 *
 * Roda uma vez ao boot e depois a cada 24 horas.
 * Não lança: qualquer erro é logado. Mantém o loop rodando mesmo com falhas.
 */
export function varrerAnomaliastransacoes(db: Database.Database): void {
  try {
    // Importa as funções de detecção apenas quando necessário (evita ciclo de imports)
    // para não quebrar o boot se a tabela ainda não existir (primeira vez)
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alertas_anomalias_registrados'")
      .get();

    if (!tableExists) {
      logger.info("[Anomalias] Tabelas ainda não existem (será criada na migração Phase 4.1)");
      return;
    }

    // Importa dinâmico para evitar ciclo
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { avaliarAnomaliaAgregada, registrarAlertaAnomalia } = require("./domain/anomalias/detectores-anomalias.js");

    // Busca transações do último dia sem análise
    const stmt = db.prepare(`
      SELECT id, valor, data, criado_em
      FROM conciliacao_ofx_cache
      WHERE datetime(criado_em) >= datetime('now', '-1 day')
        AND processado = 0
      ORDER BY criado_em DESC
      LIMIT 50
    `);

    const transacoes = stmt.all() as Array<{ id: string; valor: number; data: string; criado_em: string }>;

    if (transacoes.length === 0) {
      logger.info("[Anomalias] Nenhuma transação nova para análise");
      return;
    }

    let criticas = 0;
    for (const tx of transacoes) {
      if (tx.valor <= 0) continue;

      const resultado = avaliarAnomaliaAgregada(db, tx.valor, 90);

      if (resultado.severidade !== "baixa") {
        registrarAlertaAnomalia(db, tx.id, resultado, null);
        if (resultado.severidade === "critica") {
          criticas++;
        }
      }
    }

    logger.info(`[Anomalias] Scanner diário concluído: ${transacoes.length} analisadas, ${criticas} críticas`);

    if (criticas > 0) {
      logger.warn(`[Anomalias] ${criticas} alerta(s) crítico(s) gerado(s) — verificar alertas_anomalias_registrados`);
    }
  } catch (erro) {
    logger.error(
      "[Anomalias] Erro ao verificar anomalias:",
      erro instanceof Error ? erro.message : erro
    );
  }
}

const INTERVALO_ANOMALIAS_MS = 24 * 60 * 60 * 1000; // 24 horas
const INTERVALO_BACKUP_MS = 60 * 60 * 1000; // 1 hora

/**
 * Inicia o scanner de anomalias: uma rodada imediata (boot) e depois diariamente.
 * Nunca lança — qualquer erro é logado.
 */
export function iniciarScannerAnomaliasDiario(db: Database.Database): void {
  varrerAnomaliastransacoes(db); // rodada imediata no boot

  const interval = setInterval(() => varrerAnomaliastransacoes(db), INTERVALO_ANOMALIAS_MS);
  interval.unref(); // não impede o processo de terminar

  logger.info("[Anomalias] Scanner diário de anomalias agendado (a cada 24h)");
}

/**
 * Executa backup automático do banco SQLite para Google Drive a cada hora.
 * Registra resultado em log — não lança exceção.
 */
export async function executarBackupHorario(): Promise<void> {
  try {
    logger.info("[GoogleDriveBackup] Iniciando backup automático...");
    const resultado = await backupSQLiteToGoogleDrive();

    if (resultado.sucesso) {
      logger.info(`[GoogleDriveBackup] Backup concluído: ${resultado.arquivoZip}`);
    } else {
      logger.error(
        `[GoogleDriveBackup] Backup falhou: ${resultado.erros.join(", ")}`
      );
    }
  } catch (erro) {
    logger.error(
      "[GoogleDriveBackup] Erro inesperado ao fazer backup:",
      erro instanceof Error ? erro.message : erro
    );
  }
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
          logger.info(`[LembretesAgendados] ${total} lembrete(s) processado(s) nesta rodada`);
        }
      })
      .catch((erro) => {
        logger.error("[LembretesAgendados] Erro ao processar rodada de disparo:", erro instanceof Error ? erro.message : erro);
      });
  }

  rodar(); // rodada imediata no boot — não espera a primeira hora para começar a disparar.

  const interval = setInterval(rodar, INTERVALO_MS);
  interval.unref(); // não impede o processo de terminar (mesmo padrão de setupSessionCleanup).

  logger.info("[LembretesAgendados] Loop de disparo agendado (a cada 1h)");

  // Sincronização horária de cobranças Asaas
  function rodarAsaas(): void {
    sincronizarCobrancasAsaas(db).catch((erro) => {
      logger.error("[Asaas] Erro inesperado ao sincronizar cobranças:", erro instanceof Error ? erro.message : erro);
    });
  }

  rodarAsaas(); // rodada imediata no boot
  const intervalAsaas = setInterval(rodarAsaas, INTERVALO_MS);
  intervalAsaas.unref(); // não impede o processo de terminar
  logger.info("[Asaas] Loop de reconciliação agendado (a cada 1h)");

  // Sincronização diária de DRE (Opção B): chamada imediatamente, depois uma vez por dia às 23:55
  sincronizarDREDiario(db);

  // Agenda próxima sincronização de DRE para amanhã às 23:55
  const agora = new Date();
  const proximaSincDRE = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 23, 55, 0);
  const tempoAteSincDRE = proximaSincDRE.getTime() - agora.getTime();

  const timerDREinicial = setTimeout(() => {
    sincronizarDREDiario(db);
    // Após a primeira rodada, agenda para rodar todo dia às 23:55
    setInterval(() => sincronizarDREDiario(db), 24 * 60 * 60 * 1000).unref();
  }, tempoAteSincDRE);

  timerDREinicial.unref();
  logger.info(
    `[DRE] Sincronização diária agendada para ${proximaSincDRE.toLocaleString()}, depois daily às 23:55`
  );

  // Reconciliação PIX↔OFX a cada 3 horas
  function rodarPixOFX(): void {
    sincronizarConciliacaoPixOFX(db);
  }

  rodarPixOFX(); // rodada imediata no boot
  const intervalPixOFX = setInterval(rodarPixOFX, INTERVALO_PIX_OFX_MS);
  intervalPixOFX.unref(); // não impede o processo de terminar
  logger.info("[PIX↔OFX] Loop de reconciliação agendado (a cada 3h)");

  // Sincronização de pagamentos PIX PROATIVOS (outgoing) a cada 2 horas
  function rodarPixProativo(): void {
    sincronizarPagamentosPixProativos(db).catch((erro) => {
      logger.error(
        "[PIX Proativo] Erro inesperado ao sincronizar pagamentos:",
        erro instanceof Error ? erro.message : erro,
      );
    });
  }

  rodarPixProativo(); // rodada imediata no boot
  const intervalPixProativo = setInterval(rodarPixProativo, INTERVALO_PIX_PROATIVO_MS);
  intervalPixProativo.unref(); // não impede o processo de terminar
  logger.info("[PIX Proativo] Loop de sincronização agendado (a cada 2h)");

  // Envio de Relatório Executivo Mensal (1º dia útil de cada mês, 8:00 AM)
  function rodarRelatorioExecutivo(): void {
    enviarRelatorioExecutivoMensal(db).catch((erro) => {
      logger.error(
        "[RelatorioExecutivo] Erro inesperado ao enviar relatório:",
        erro instanceof Error ? erro.message : erro,
      );
    });
  }

  const proximoDisparo = calcularProximoDisparo1oDiaUtil();
  const tempoAteDisparo = proximoDisparo.getTime() - agora.getTime();

  const timerRelatorioInicial = setTimeout(() => {
    rodarRelatorioExecutivo();
    // Após a primeira rodada, agenda para rodar 1º dia útil de cada mês às 8:00 AM
    setInterval(() => rodarRelatorioExecutivo(), 24 * 60 * 60 * 1000).unref(); // Verifica diariamente
  }, tempoAteDisparo);

  timerRelatorioInicial.unref();
  logger.info(
    `[RelatorioExecutivo] Envio mensal agendado para ${proximoDisparo.toLocaleString()}, depois 1º dia útil de cada mês às 8:00 AM`,
  );

  // Backup automático do banco SQLite para Google Drive (a cada 1 hora)
  function rodarBackupGoogleDrive(): void {
    executarBackupHorario().catch((erro) => {
      logger.error(
        "[GoogleDriveBackup] Erro inesperado ao fazer backup:",
        erro instanceof Error ? erro.message : erro,
      );
    });
  }

  rodarBackupGoogleDrive(); // rodada imediata no boot
  const intervalBackup = setInterval(rodarBackupGoogleDrive, INTERVALO_BACKUP_MS);
  intervalBackup.unref(); // não impede o processo de terminar
  logger.info("[GoogleDriveBackup] Loop de backup automático agendado (a cada 1h)");
}
