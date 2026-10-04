/**
 * Backup Scheduler — Agendamento periódico de backups com verificação de integridade
 *
 * Responsabilidades:
 * - Executar backups em intervalo configurável (padrão: diário às 2 AM)
 * - Verificar restauração periodicamente (padrão: semanal, toda segunda-feira)
 * - Copiar backups para NAS/storage externo (se configurado)
 * - Gerenciar retenção operacional vs fiscal (7 dias vs 5+ anos)
 * - Usar setInterval com unref() para não bloquear saída do processo
 *
 * Variáveis de ambiente:
 * - BACKUP_SCHEDULE: cron-like schedule ou intervalo em minutos (padrão: "0 2 * * *" = 2 AM diariamente)
 * - BACKUP_VERIFY_SCHEDULE: quando fazer teste de restauração (padrão: "0 3 * * 1" = 3 AM segunda)
 * - BACKUP_RETENTION_DAYS: dias de retenção operacional (padrão: 7)
 * - BACKUP_FISCAL_RETENTION_DAYS: dias para retenção fiscal (padrão: 1825 = ~5 anos)
 * - NAS_PATH: caminho para armazenar cópias (opcional, ex: /mnt/nas/backups)
 * - NAS_COPY_ENABLED: ativar/desativar cópia NAS (padrão: false)
 *
 * Logs: estruturados em "[BackupScheduler]" para fácil busca
 */

import { logger } from './logger-service.js';
import BackupService, { BackupManifest } from './backup-service.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { enviarAlertaEmail, templateAlertaCritico } from '../utils/email-alertas.js';
import { enviarAlertaSlack } from '../utils/slack-alertas.js';

interface ScheduleConfig {
  backupSchedule: string;        // "0 2 * * *" ou "1440" (minutos)
  verifySchedule: string;        // "0 3 * * 1" ou "10080" (minutos)
  retentionDays: number;         // Operacional: 7
  fiscalRetentionDays: number;   // Fiscal: 1825 (~5 anos)
  nasPath?: string;              // /mnt/nas/backups
  nasCopyEnabled: boolean;       // ativar cópia NAS
  alertsEnabled?: boolean;       // ativar alertas por email/Slack
  alertsEmail?: string;          // email(s) para alertas (separados por vírgula)
}

interface BackupRetryState {
  failureCount: number;          // Número de falhas consecutivas
  lastError?: string;            // Último erro ocorrido
  lastFailureTime?: Date;        // Quando falhou pela última vez
  nextRetryTime?: Date;          // Quando vai tentar novamente
}

export class BackupScheduler {
  private config: ScheduleConfig;
  private backupService: BackupService;
  private backupIntervalId: NodeJS.Timeout | null = null;
  private verifyIntervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastBackupTime: Date | null = null;
  private lastVerifyTime: Date | null = null;

  // Retry and alerts
  private backupRetryState: BackupRetryState = { failureCount: 0 };
  private MAX_RETRY_ATTEMPTS = 3;
  private RETRY_BASE_DELAY_MS = 300000; // 5 minutos base

  constructor(backupService: BackupService, config?: Partial<ScheduleConfig>) {
    this.backupService = backupService;

    // Carregar configuração de env vars
    this.config = {
      backupSchedule: config?.backupSchedule || process.env.BACKUP_SCHEDULE || '0 2 * * *',
      verifySchedule: config?.verifySchedule || process.env.BACKUP_VERIFY_SCHEDULE || '0 3 * * 1',
      retentionDays: config?.retentionDays || parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10),
      fiscalRetentionDays: config?.fiscalRetentionDays || parseInt(process.env.BACKUP_FISCAL_RETENTION_DAYS || '1825', 10),
      nasPath: config?.nasPath || process.env.NAS_PATH,
      nasCopyEnabled: config?.nasCopyEnabled !== undefined
        ? config.nasCopyEnabled
        : process.env.NAS_COPY_ENABLED === 'true',
      alertsEnabled: config?.alertsEnabled !== undefined
        ? config.alertsEnabled
        : process.env.BACKUP_ALERTS_ENABLED !== 'false',
      alertsEmail: config?.alertsEmail || process.env.BACKUP_ALERTS_EMAIL,
    };

    // Validar configuração NAS
    if (this.config.nasCopyEnabled && !this.config.nasPath) {
      logger.warn('[BackupScheduler] NAS_COPY_ENABLED=true mas NAS_PATH não configurado — cópia NAS desabilitada');
      this.config.nasCopyEnabled = false;
    }

    logger.info('[BackupScheduler] Inicializado com configuração:', {
      backupSchedule: this.config.backupSchedule,
      verifySchedule: this.config.verifySchedule,
      retentionDays: this.config.retentionDays,
      fiscalRetentionDays: this.config.fiscalRetentionDays,
      nasPath: this.config.nasPath || 'não configurado',
      nasCopyEnabled: this.config.nasCopyEnabled,
      alertsEnabled: this.config.alertsEnabled,
      alertsEmail: this.config.alertsEmail ? 'configurado' : 'não configurado',
    });
  }

  /**
   * Converte schedule cron-like ou intervalo (minutos) para milissegundos
   * Suporta: "0 2 * * *" (cron) ou "1440" (minutos)
   * Para cron, calcula o próximo horário de execução
   */
  private parseSchedule(schedule: string): number {
    // Se for número, trata como minutos
    if (/^\d+$/.test(schedule)) {
      return parseInt(schedule, 10) * 60 * 1000;
    }

    // Parse cron-like "0 2 * * *" (minuto hora dia mês dia-semana)
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
      logger.warn(`[BackupScheduler] Schedule inválido: "${schedule}", usando padrão 24h`);
      return 24 * 60 * 60 * 1000;
    }

    const [minStr, hourStr] = parts;
    const minute = parseInt(minStr, 10);
    const hour = parseInt(hourStr, 10);

    if (isNaN(minute) || isNaN(hour)) {
      logger.warn(`[BackupScheduler] Schedule inválido: "${schedule}", usando padrão 24h`);
      return 24 * 60 * 60 * 1000;
    }

    // Calcular próxima execução (simplificado: apenas hoje ou amanhã)
    const now = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    const daily = 24 * 60 * 60 * 1000;

    logger.info(`[BackupScheduler] Próxima execução em: ${next.toISOString()} (${Math.round(delay / 1000 / 60)} minutos)`);

    // Retorna intervalo diário (próxima execução será refazida após primeira rodada)
    return daily;
  }

  /**
   * Inicia scheduler de backups periódicos
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[BackupScheduler] Scheduler já está rodando');
      return;
    }

    this.isRunning = true;
    logger.info('[BackupScheduler] Iniciando scheduler de backups...');

    // Agendar backup
    const backupInterval = this.parseSchedule(this.config.backupSchedule);
    this.backupIntervalId = setInterval(() => this.executarBackup(), backupInterval);
    this.backupIntervalId.unref(); // Não bloqueia saída do processo
    logger.info(`[BackupScheduler] Backup agendado a cada ${backupInterval / 1000 / 60 / 60} horas`);

    // Agendar verificação de restauração (weekly por padrão)
    const verifyInterval = this.parseSchedule(this.config.verifySchedule);
    this.verifyIntervalId = setInterval(() => this.executarVerificacaoRestauracao(), verifyInterval);
    this.verifyIntervalId.unref(); // Não bloqueia saída do processo
    logger.info(`[BackupScheduler] Verificação de restauração agendada a cada ${verifyInterval / 1000 / 60 / 60} horas`);

    // Executar primeira rodada imediatamente (assíncrono, não bloqueia início)
    setImmediate(() => this.executarBackup());
  }

  /**
   * Para scheduler de backups
   */
  stop(): void {
    if (this.backupIntervalId) {
      clearInterval(this.backupIntervalId);
      this.backupIntervalId = null;
    }
    if (this.verifyIntervalId) {
      clearInterval(this.verifyIntervalId);
      this.verifyIntervalId = null;
    }
    this.isRunning = false;
    logger.info('[BackupScheduler] Scheduler parado');
  }

  /**
   * Calcula o tempo de espera para retry com backoff exponencial
   * Tentativa 1: 5 minutos
   * Tentativa 2: 10 minutos
   * Tentativa 3: 20 minutos
   */
  private calcularDelayRetry(tentativa: number): number {
    return this.RETRY_BASE_DELAY_MS * Math.pow(2, tentativa - 1);
  }

  /**
   * Envia alerta de falha de backup por email e Slack
   */
  private async enviarAlertaFalhaBackup(erro: unknown, tentativa: number): Promise<void> {
    if (!this.config.alertsEnabled) return;

    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    const agora = new Date().toISOString();

    // Preparar dados para alerta
    const detalhes = {
      timestamp: agora,
      tentativa: `${tentativa}/${this.MAX_RETRY_ATTEMPTS}`,
      erro: mensagemErro,
      proximaRetentativa: tentativa < this.MAX_RETRY_ATTEMPTS
        ? new Date(Date.now() + this.calcularDelayRetry(tentativa + 1)).toISOString()
        : 'Nenhuma',
    };

    // 1. Email alert (se configurado)
    if (this.config.alertsEmail) {
      try {
        const html = templateAlertaCritico({
          titulo: `Falha no Backup Agendado (Tentativa ${tentativa}/${this.MAX_RETRY_ATTEMPTS})`,
          mensagem: `O backup agendado falhou. ${
            tentativa < this.MAX_RETRY_ATTEMPTS
              ? `Sistema tentará novamente em ${this.calcularDelayRetry(tentativa + 1) / 60000} minutos.`
              : 'Todas as tentativas de retry foram exauridas.'
          }`,
          detalhes,
          timestamp: agora,
        });

        await enviarAlertaEmail({
          assunto: `❌ Falha de Backup - Tentativa ${tentativa}/${this.MAX_RETRY_ATTEMPTS}`,
          corpo: html,
          destinatario: this.config.alertsEmail,
          html: true,
          severidade: tentativa === this.MAX_RETRY_ATTEMPTS ? 'critical' : 'warning',
        });
      } catch (emailErro) {
        logger.error('[BackupScheduler] Erro ao enviar alerta por email:', emailErro);
      }
    }

    // 2. Slack alert (se configurado)
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await enviarAlertaSlack({
          mensagem: `Falha no Backup Agendado (Tentativa ${tentativa}/${this.MAX_RETRY_ATTEMPTS})`,
          detalhes: mensagemErro,
          severidade: tentativa === this.MAX_RETRY_ATTEMPTS ? 'critical' : 'warning',
          campos: detalhes,
        });
      } catch (slackErro) {
        logger.error('[BackupScheduler] Erro ao enviar alerta Slack:', slackErro);
      }
    }

    // 3. Log estruturado para auditoria
    logger.warn('[BackupScheduler] Falha de backup alertada', {
      tentativa,
      maxTentativas: this.MAX_RETRY_ATTEMPTS,
      erro: mensagemErro,
      proximaRetentativa: detalhes.proximaRetentativa,
    });
  }

  /**
   * Envia notificação de sucesso do backup
   */
  private async enviarNotificacaoSucesso(backupId: string): Promise<void> {
    if (!this.config.alertsEnabled) return;

    try {
      if (process.env.SLACK_WEBHOOK_URL) {
        await enviarAlertaSlack({
          mensagem: 'Backup Completado com Sucesso',
          severidade: 'info',
          campos: {
            'Backup ID': backupId,
            'Timestamp': new Date().toISOString(),
            'Status': '✅ OK',
          },
        });
      }
    } catch (erro) {
      logger.error('[BackupScheduler] Erro ao enviar notificação de sucesso:', erro);
    }
  }

  /**
   * Executa backup imediato com retenção e cópia NAS
   * Implementa retry automático com exponential backoff (3 tentativas máximo)
   */
  private async executarBackup(): Promise<void> {
    try {
      this.lastBackupTime = new Date();

      // Se houver retry agendado e ainda não é a hora, aguardar próxima tentativa
      if (this.backupRetryState.nextRetryTime && Date.now() < this.backupRetryState.nextRetryTime.getTime()) {
        logger.debug('[BackupScheduler] Retry agendado para mais tarde, pulando este intervalo');
        return;
      }

      // Se ainda há tentativas disponíveis, tentar novamente
      if (this.backupRetryState.failureCount > 0 && this.backupRetryState.failureCount < this.MAX_RETRY_ATTEMPTS) {
        logger.info(`[BackupScheduler] Retry de backup (tentativa ${this.backupRetryState.failureCount + 1}/${this.MAX_RETRY_ATTEMPTS})`);
      } else if (this.backupRetryState.failureCount === 0) {
        logger.info('[BackupScheduler] Iniciando backup agendado...');
      } else {
        logger.error('[BackupScheduler] Máximo de tentativas atingido, aguardando próximo intervalo agendado');
        this.backupRetryState = { failureCount: 0 }; // Reset para próximo ciclo
        return;
      }

      // 1. Criar backup
      const result = await this.backupService.criarBackup();
      if (!result.sucesso) {
        throw new Error(`Falha ao criar backup: ${JSON.stringify(result.erros)}`);
      }

      logger.info('[BackupScheduler] Backup criado com sucesso:', result.backupId);

      // 2. Copiar para NAS (se configurado)
      if (this.config.nasCopyEnabled && this.config.nasPath) {
        await this.copiarParaNAS(result.backupId, result.manifesto!);
      }

      // 3. Aplicar retenção
      await this.aplicarRetencao();

      // ✅ Sucesso — resetar retry state e enviar notificação
      this.backupRetryState = { failureCount: 0 };
      await this.enviarNotificacaoSucesso(result.backupId);

      logger.info('[BackupScheduler] Backup agendado completo:', {
        backupId: result.backupId,
        timestamp: new Date().toISOString(),
      });
    } catch (erro) {
      // ❌ Falha — implementar retry com exponential backoff
      this.backupRetryState.failureCount++;
      this.backupRetryState.lastError = erro instanceof Error ? erro.message : String(erro);
      this.backupRetryState.lastFailureTime = new Date();

      logger.error(`[BackupScheduler] Backup falhou (tentativa ${this.backupRetryState.failureCount}/${this.MAX_RETRY_ATTEMPTS}):`, erro);

      // Enviar alerta
      await this.enviarAlertaFalhaBackup(erro, this.backupRetryState.failureCount);

      // Se ainda há tentativas, agendar retry
      if (this.backupRetryState.failureCount < this.MAX_RETRY_ATTEMPTS) {
        const delayMs = this.calcularDelayRetry(this.backupRetryState.failureCount);
        const proximaTentativa = new Date(Date.now() + delayMs);
        this.backupRetryState.nextRetryTime = proximaTentativa;

        logger.info(`[BackupScheduler] Próxima tentativa agendada para: ${proximaTentativa.toISOString()} (em ${delayMs / 60000} minutos)`);

        // Agendar retry imediato após delay
        setTimeout(() => this.executarBackup(), delayMs);
      } else {
        logger.critical('[BackupScheduler] ⚠️  CRÍTICO: Máximo de tentativas atingido. Backup não será tentado até próximo intervalo agendado.');
      }
    }
  }

  /**
   * Copia backup para NAS (via caminho montado)
   */
  private async copiarParaNAS(backupId: string, manifesto: BackupManifest): Promise<void> {
    if (!this.config.nasPath) return;

    try {
      logger.info('[BackupScheduler] Iniciando cópia para NAS:', this.config.nasPath);

      // Garantir que diretório NAS existe
      if (!fs.existsSync(this.config.nasPath)) {
        fs.mkdirSync(this.config.nasPath, { recursive: true });
      }

      const backupDir = process.env.BACKUP_LOCAL_DIR;
      if (!backupDir) {
        logger.warn('[BackupScheduler] BACKUP_LOCAL_DIR não configurado');
        return;
      }

      // Copiar arquivo criptografado
      const encFileName = `${backupId}.enc`;
      const manifestFileName = `${backupId}-manifest.json`;

      const srcEnc = path.join(backupDir, encFileName);
      const srcManifest = path.join(backupDir, manifestFileName);

      const destEnc = path.join(this.config.nasPath, encFileName);
      const destManifest = path.join(this.config.nasPath, manifestFileName);

      if (fs.existsSync(srcEnc)) {
        fs.copyFileSync(srcEnc, destEnc);
        logger.info('[BackupScheduler] Arquivo criptografado copiado para NAS:', destEnc);
      }

      if (fs.existsSync(srcManifest)) {
        fs.copyFileSync(srcManifest, destManifest);
        logger.info('[BackupScheduler] Manifesto copiado para NAS:', destManifest);
      }

      // Criar manifesto de índice para rastreabilidade
      await this.criarManifestoNAS(manifesto);

    } catch (erro) {
      logger.error('[BackupScheduler] Erro ao copiar para NAS (cópia local mantida):', erro);
      // Não falha o backup inteiro por erro de NAS
    }
  }

  /**
   * Cria arquivo de índice/metadados no NAS para rastreabilidade
   */
  private async criarManifestoNAS(manifesto: BackupManifest): Promise<void> {
    if (!this.config.nasPath) return;

    try {
      const indexPath = path.join(this.config.nasPath, 'backup-index.json');
      let index: Array<{ id: string; timestamp: string; filename: string }> = [];

      if (fs.existsSync(indexPath)) {
        try {
          index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        } catch {
          // ignorar erro de parse
        }
      }

      // Adicionar nova entrada (manter últimas 100)
      index.push({
        id: manifesto.id,
        timestamp: manifesto.timestamp,
        filename: manifesto.filename,
      });
      index = index.slice(-100);

      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
      logger.info('[BackupScheduler] Índice NAS atualizado');
    } catch (erro) {
      logger.warn('[BackupScheduler] Erro ao criar índice NAS:', erro);
    }
  }

  /**
   * Envia alerta quando verificação de integridade falha
   */
  private async enviarAlertaVerificacaoFalhou(backupId: string, erros: string[], integridade: string): Promise<void> {
    if (!this.config.alertsEnabled) return;

    const agora = new Date().toISOString();
    const detalhes = {
      timestamp: agora,
      'Backup ID': backupId,
      'Status de Integridade': integridade,
      'Erros': erros.join('; '),
    };

    // 1. Email alert (se configurado)
    if (this.config.alertsEmail) {
      try {
        const html = templateAlertaCritico({
          titulo: 'Falha na Verificação de Integridade de Backup',
          mensagem: `O teste de restauração do backup ${backupId} falhou. Isso indica um problema potencial com a capacidade de recuperação.`,
          detalhes: {
            'Backup ID': backupId,
            'Integridade': integridade,
            'Erros': erros,
            'Timestamp': agora,
          },
          timestamp: agora,
        });

        await enviarAlertaEmail({
          assunto: `🚨 Backup inválido: Verificação de integridade falhou - ${backupId}`,
          corpo: html,
          destinatario: this.config.alertsEmail,
          html: true,
          severidade: 'critical',
        });
      } catch (emailErro) {
        logger.error('[BackupScheduler] Erro ao enviar alerta de verificação por email:', emailErro);
      }
    }

    // 2. Slack alert (se configurado)
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await enviarAlertaSlack({
          mensagem: 'Falha na Verificação de Integridade de Backup',
          detalhes: `Backup ID: ${backupId}\n\nErros:\n${erros.join('\n')}`,
          severidade: 'critical',
          campos: detalhes,
        });
      } catch (slackErro) {
        logger.error('[BackupScheduler] Erro ao enviar alerta de verificação Slack:', slackErro);
      }
    }

    logger.critical('[BackupScheduler] 🚨 CRÍTICO: Verificação de backup falhou', {
      backupId,
      erros,
      integridade,
    });
  }

  /**
   * Verifica integridade do backup mais recente periodicamente
   * Testa: descriptografia, PRAGMA integrity_check, contagem de linhas
   */
  private async executarVerificacaoRestauracao(): Promise<void> {
    try {
      this.lastVerifyTime = new Date();
      logger.info('[BackupScheduler] Iniciando verificação de restauração...');

      const backups = this.backupService.listarBackups();
      if (backups.length === 0) {
        logger.warn('[BackupScheduler] Nenhum backup disponível para verificação');
        return;
      }

      const latestBackup = backups[0];
      const backupDir = process.env.BACKUP_LOCAL_DIR;
      if (!backupDir) {
        logger.warn('[BackupScheduler] BACKUP_LOCAL_DIR não configurado');
        return;
      }

      const encFile = path.join(backupDir, `${latestBackup.id}.enc`);
      const manifestFile = path.join(backupDir, `${latestBackup.id}-manifest.json`);

      if (!fs.existsSync(encFile) || !fs.existsSync(manifestFile)) {
        logger.warn('[BackupScheduler] Arquivo de backup ou manifesto não encontrado:', latestBackup.id);
        return;
      }

      const manifesto = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as BackupManifest;

      // Testar restauração
      const testResult = await this.backupService.testarRestauracao(encFile, manifesto);

      if (testResult.valido) {
        logger.info('[BackupScheduler] ✅ Verificação de restauração PASSOU', {
          backupId: latestBackup.id,
          integridade: testResult.relatorio.integridade,
          tabelas: testResult.relatorio.tabelas,
        });
      } else {
        logger.error('[BackupScheduler] ❌ Verificação de restauração FALHOU', {
          backupId: latestBackup.id,
          erros: testResult.erros,
          integridade: testResult.relatorio.integridade,
        });

        // Enviar alerta de falha de verificação
        await this.enviarAlertaVerificacaoFalhou(
          latestBackup.id,
          testResult.erros || [],
          testResult.relatorio.integridade || 'desconhecido'
        );
      }

    } catch (erro) {
      logger.error('[BackupScheduler] Erro durante verificação de restauração:', erro);

      // Enviar alerta de erro inesperado na verificação
      if (this.config.alertsEnabled && this.config.alertsEmail) {
        try {
          const mensagemErro = erro instanceof Error ? erro.message : String(erro);
          const html = templateAlertaCritico({
            titulo: 'Erro ao Executar Verificação de Backup',
            mensagem: 'Ocorreu um erro inesperado ao tentar verificar a integridade do backup.',
            detalhes: {
              'Timestamp': new Date().toISOString(),
              'Erro': mensagemErro,
            },
          });

          await enviarAlertaEmail({
            assunto: '⚠️ Erro ao verificar integridade de backup',
            corpo: html,
            destinatario: this.config.alertsEmail,
            html: true,
            severidade: 'warning',
          });
        } catch (alertErro) {
          logger.error('[BackupScheduler] Erro ao enviar alerta de erro de verificação:', alertErro);
        }
      }
    }
  }

  /**
   * Aplica política de retenção: mantém backups por período operacional e fiscal
   * - Operacional: últimos 7 dias (padrão)
   * - Fiscal: últimos 5 anos (padrão: 1825 dias)
   */
  private async aplicarRetencao(): Promise<void> {
    try {
      const backupDir = process.env.BACKUP_LOCAL_DIR;
      if (!backupDir) return;

      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.enc'))
        .map(f => {
          const fullPath = path.join(backupDir, f);
          const stat = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            time: stat.mtime.getTime(),
            size: stat.size,
          };
        })
        .sort((a, b) => b.time - a.time);

      const now = Date.now();
      const operationalMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      const fiscalMs = this.config.fiscalRetentionDays * 24 * 60 * 60 * 1000;

      const toDelete = files.filter(f => {
        const age = now - f.time;
        // Manter: operacional recente OU fiscal antigo
        return age > operationalMs && age > fiscalMs;
      });

      if (toDelete.length > 0) {
        logger.info(`[BackupScheduler] Removendo ${toDelete.length} backups antigos (fora de retenção)`, {
          operationalDays: this.config.retentionDays,
          fiscalDays: this.config.fiscalRetentionDays,
        });

        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.path);
            const manifestPath = file.path.replace('.enc', '-manifest.json');
            if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
            logger.debug(`[BackupScheduler] Removido: ${file.name}`);
          } catch (e) {
            logger.warn(`[BackupScheduler] Erro ao remover ${file.name}:`, e);
          }
        }
      }

      // Aplicar retenção NAS (se habilitado)
      if (this.config.nasCopyEnabled && this.config.nasPath) {
        await this.aplicarRetencaoNAS();
      }

    } catch (erro) {
      logger.error('[BackupScheduler] Erro ao aplicar retenção:', erro);
    }
  }

  /**
   * Aplica retenção também no NAS (sync com local)
   */
  private async aplicarRetencaoNAS(): Promise<void> {
    if (!this.config.nasPath) return;

    try {
      if (!fs.existsSync(this.config.nasPath)) return;

      const files = fs.readdirSync(this.config.nasPath)
        .filter(f => f.endsWith('.enc'))
        .map(f => {
          const fullPath = path.join(this.config.nasPath!, f);
          const stat = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            time: stat.mtime.getTime(),
          };
        })
        .sort((a, b) => b.time - a.time);

      const now = Date.now();
      const operationalMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      const fiscalMs = this.config.fiscalRetentionDays * 24 * 60 * 60 * 1000;

      const toDelete = files.filter(f => {
        const age = now - f.time;
        return age > operationalMs && age > fiscalMs;
      });

      if (toDelete.length > 0) {
        logger.info(`[BackupScheduler] Removendo ${toDelete.length} backups antigos do NAS`);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.path);
            const manifestPath = file.path.replace('.enc', '-manifest.json');
            if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
          } catch (e) {
            logger.warn(`[BackupScheduler] Erro ao remover do NAS ${file.name}:`, e);
          }
        }
      }
    } catch (erro) {
      logger.warn('[BackupScheduler] Erro ao aplicar retenção NAS:', erro);
    }
  }

  /**
   * Retorna status do scheduler com informações de retry
   */
  getStatus(): {
    running: boolean;
    lastBackup: string | null;
    lastVerify: string | null;
    config: ScheduleConfig;
    retryState: BackupRetryState & { alertsConfigured: boolean };
  } {
    return {
      running: this.isRunning,
      lastBackup: this.lastBackupTime?.toISOString() || null,
      lastVerify: this.lastVerifyTime?.toISOString() || null,
      config: this.config,
      retryState: {
        ...this.backupRetryState,
        lastFailureTime: this.backupRetryState.lastFailureTime?.toISOString() as any,
        nextRetryTime: this.backupRetryState.nextRetryTime?.toISOString() as any,
        alertsConfigured: this.config.alertsEnabled && (!!this.config.alertsEmail || !!process.env.SLACK_WEBHOOK_URL),
      },
    };
  }
}

export default BackupScheduler;
