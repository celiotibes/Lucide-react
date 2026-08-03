/**
 * Petition Polling Service
 * Monitors tribunal status after petition submission
 * Confirms when petition has been "juntada" (filed/accepted)
 */

import { logger } from '@utils/logger';
import { projudiSoapClient } from '@projudi/soapClient';
import { eventService, EVENTS } from '@services/EventEmitterService';
import { auditLogService } from '@services/AuditLogService';
import { redisCacheService } from '@services/RedisCacheService';
import db from '@db/connection';

export interface PetitionPoll {
  id: string;
  petitionId: string;
  caseId: string;
  processNumber: string;
  tribunalCode: string;
  protocolNumber: string;
  submittedAt: Date;
  lastPolledAt?: Date;
  status: 'pending' | 'juntada' | 'failed' | 'timeout';
  pollCount: number;
  maxPolls: number;
  pollIntervalSeconds: number;
  notifiedAt?: Date;
}

export interface PollingResult {
  petitionId: string;
  processNumber: string;
  protocolNumber: string;
  status: 'juntada' | 'pending' | 'error';
  movements?: Array<{
    date: string;
    description: string;
    status: string;
  }>;
  error?: string;
}

export class PetitionPollingService {
  private activePolls = new Map<string, NodeJS.Timer>();
  private readonly MAX_POLLS = 12; // 1 hour with 5-minute intervals
  private readonly POLL_INTERVAL_SECONDS = 300; // 5 minutes
  private readonly JUNTADA_KEYWORDS = [
    'juntada',
    'juntado',
    'protocolo',
    'protocolado',
    'recebido',
    'aceito',
    'accepted',
  ];

  /**
   * Registrar petição para monitoramento pós-envio
   */
  async registerPetitionForPolling(
    petitionId: string,
    caseId: string,
    processNumber: string,
    tribunalCode: string,
    protocolNumber: string,
    lawyerId: string,
  ): Promise<PetitionPoll> {
    try {
      const poll: PetitionPoll = {
        id: `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        petitionId,
        caseId,
        processNumber,
        tribunalCode,
        protocolNumber,
        submittedAt: new Date(),
        status: 'pending',
        pollCount: 0,
        maxPolls: this.MAX_POLLS,
        pollIntervalSeconds: this.POLL_INTERVAL_SECONDS,
      };

      // Salvar em Redis com TTL de 2 horas (tempo limite para confirmar)
      await redisCacheService.set(
        `petition:poll:${petitionId}`,
        JSON.stringify(poll),
        7200,
      );

      // Salvar em banco para histórico
      await db.query(
        `INSERT INTO petition_polls
        (petition_id, case_id, process_number, tribunal_code, protocol_number, lawyer_id, status, poll_count, max_polls, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          petitionId,
          caseId,
          processNumber,
          tribunalCode,
          protocolNumber,
          lawyerId,
          'pending',
          0,
          this.MAX_POLLS,
          poll.submittedAt,
        ],
      );

      logger.info(
        {
          petitionId,
          processNumber,
          protocolNumber,
          tribunalCode,
        },
        'Petição registrada para monitoramento pós-envio',
      );

      // Registrar no audit log
      await auditLogService.log({
        action: 'PETITION_POLLING_REGISTERED',
        entityType: 'Petition',
        entityId: petitionId,
        userId: lawyerId,
        ipAddress: 'system',
        changes: { after: { status: 'pending', processNumber, protocolNumber } },
        status: 'success',
      });

      return poll;
    } catch (error) {
      logger.error({ error, petitionId }, 'Erro ao registrar petição para polling');
      throw error;
    }
  }

  /**
   * Iniciar polling automático para uma petição
   */
  async startPolling(petitionId: string): Promise<void> {
    try {
      if (this.activePolls.has(petitionId)) {
        logger.warn(`Polling já ativo para petição ${petitionId}`);
        return;
      }

      const pollData = await redisCacheService.get(`petition:poll:${petitionId}`);
      if (!pollData) {
        logger.error(`Dados de polling não encontrados para ${petitionId}`);
        return;
      }

      const poll: PetitionPoll = JSON.parse(pollData);

      logger.info(
        {
          petitionId,
          processNumber: poll.processNumber,
          intervalSeconds: this.POLL_INTERVAL_SECONDS,
        },
        'Iniciando polling para petição',
      );

      // Executar primeira verificação imediatamente
      this.executePolling(petitionId).catch((error) => {
        logger.error({ error, petitionId }, 'Erro ao executar polling');
      });

      // Agendar verificações periódicas
      const interval = setInterval(() => {
        this.executePolling(petitionId).catch((error) => {
          logger.error({ error, petitionId }, 'Erro ao executar polling');
        });
      }, this.POLL_INTERVAL_SECONDS * 1000);

      this.activePolls.set(petitionId, interval);
    } catch (error) {
      logger.error({ error, petitionId }, 'Erro ao iniciar polling');
    }
  }

  /**
   * Executar verificação de status do tribunal
   */
  private async executePolling(petitionId: string): Promise<void> {
    try {
      const pollData = await redisCacheService.get(`petition:poll:${petitionId}`);
      if (!pollData) {
        this.stopPolling(petitionId);
        return;
      }

      const poll: PetitionPoll = JSON.parse(pollData);

      // Verificar se atingiu limite de tentativas
      if (poll.pollCount >= poll.maxPolls) {
        logger.warn(
          {
            petitionId,
            processNumber: poll.processNumber,
            pollCount: poll.pollCount,
          },
          'Limite de polling atingido sem confirmação de "juntada"',
        );

        poll.status = 'timeout';
        await this.handlePollingTimeout(poll);
        this.stopPolling(petitionId);
        return;
      }

      // Verificar status no tribunal
      const result = await this.checkTribunalStatus(
        poll.processNumber,
        poll.tribunalCode,
        poll.protocolNumber,
      );

      poll.pollCount++;
      poll.lastPolledAt = new Date();

      if (result.status === 'juntada') {
        poll.status = 'juntada';
        await this.handlePetitionJuntada(poll, result);
        this.stopPolling(petitionId);
      } else {
        // Atualizar Redis com próxima tentativa
        await redisCacheService.set(
          `petition:poll:${petitionId}`,
          JSON.stringify(poll),
          7200,
        );

        logger.debug(
          {
            petitionId,
            processNumber: poll.processNumber,
            pollCount: poll.pollCount,
          },
          `Verificação ${poll.pollCount}/${poll.maxPolls}: petição ainda não confirmada`,
        );
      }
    } catch (error) {
      logger.error({ error, petitionId }, 'Erro durante polling de petição');
    }
  }

  /**
   * Verificar status no tribunal
   */
  private async checkTribunalStatus(
    processNumber: string,
    tribunalCode: string,
    protocolNumber: string,
  ): Promise<PollingResult> {
    try {
      // Obter dados do processo do tribunal
      const processData = await projudiSoapClient.getProcessData(
        processNumber,
        await projudiSoapClient.authenticate(
          process.env.PROJUDI_USERNAME || '',
          process.env.PROJUDI_PASSWORD || '',
        ),
      );

      // Buscar movimento que contenha o número do protocolo
      const movements = processData.movimentacoes || [];

      // Procurar por movimento que indique "juntada" do protocolo
      const juntadaMovement = movements.find((m) => {
        const description = m.descricao?.toLowerCase() || '';
        const hasProtocol = description.includes(protocolNumber);
        const hasJuntada = this.JUNTADA_KEYWORDS.some((kw) =>
          description.includes(kw),
        );

        return hasProtocol && hasJuntada;
      });

      if (juntadaMovement) {
        logger.info(
          {
            processNumber,
            protocolNumber,
            movement: juntadaMovement.descricao,
          },
          'Petição confirmada como "juntada" no tribunal',
        );

        return {
          petitionId: '',
          processNumber,
          protocolNumber,
          status: 'juntada',
          movements: movements.map((m) => ({
            date: m.dataMovimentacao,
            description: m.descricao,
            status: m.status,
          })),
        };
      }

      // Procurar por movimento geral de "juntada" (se protocolo não especificado)
      const generalJuntada = movements.find((m) => {
        const description = m.descricao?.toLowerCase() || '';
        return this.JUNTADA_KEYWORDS.some((kw) => description.includes(kw));
      });

      if (generalJuntada) {
        logger.info(
          {
            processNumber,
            movement: generalJuntada.descricao,
          },
          'Movimento de juntada detectado',
        );

        return {
          petitionId: '',
          processNumber,
          protocolNumber,
          status: 'juntada',
          movements: movements.map((m) => ({
            date: m.dataMovimentacao,
            description: m.descricao,
            status: m.status,
          })),
        };
      }

      return {
        petitionId: '',
        processNumber,
        protocolNumber,
        status: 'pending',
        movements: movements.map((m) => ({
          date: m.dataMovimentacao,
          description: m.descricao,
          status: m.status,
        })),
      };
    } catch (error) {
      logger.error(
        { error, processNumber, tribunalCode },
        'Erro ao verificar status no tribunal',
      );

      return {
        petitionId: '',
        processNumber,
        protocolNumber,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Manipular confirmação de "juntada"
   */
  private async handlePetitionJuntada(
    poll: PetitionPoll,
    result: PollingResult,
  ): Promise<void> {
    try {
      const now = new Date();
      poll.notifiedAt = now;

      // Atualizar status em Redis
      await redisCacheService.set(
        `petition:poll:${poll.petitionId}`,
        JSON.stringify(poll),
        7200,
      );

      // Atualizar banco de dados
      await db.query(
        `UPDATE petition_polls
         SET status = $1, poll_count = $2, last_polled_at = $3, notified_at = $4
         WHERE petition_id = $5`,
        ['juntada', poll.pollCount, now, now, poll.petitionId],
      );

      // Atualizar status da petição na tabela de petições
      await db.query(
        `UPDATE petitions
         SET status = $1, tribunal_confirmation_date = $2, updated_at = $3
         WHERE id = $4`,
        ['juntada', now, now, poll.petitionId],
      );

      // Emitir evento petition.juntada
      eventService.emit(
        'petition.juntada',
        'petition-polling',
        {
          petitionId: poll.petitionId,
          caseId: poll.caseId,
          processNumber: poll.processNumber,
          protocolNumber: poll.protocolNumber,
          tribunalCode: poll.tribunalCode,
          juntadaAt: now,
          pollCount: poll.pollCount,
          movements: result.movements,
        },
        'system',
      );

      // Registrar no audit log
      await auditLogService.log({
        action: 'PETITION_JUNTADA_CONFIRMED',
        entityType: 'Petition',
        entityId: poll.petitionId,
        userId: 'system',
        ipAddress: 'system',
        changes: {
          before: { status: 'pending' },
          after: { status: 'juntada', confirmedAt: now.toISOString() },
        },
        status: 'success',
        metadata: {
          pollCount: poll.pollCount,
          protocolNumber: poll.protocolNumber,
        },
      });

      logger.info(
        {
          petitionId: poll.petitionId,
          processNumber: poll.processNumber,
          protocolNumber: poll.protocolNumber,
          pollCount: poll.pollCount,
        },
        'Confirmação de juntada registrada com sucesso',
      );

      // Enviar notificação (será capturada por listeners do evento petition.juntada)
      // ver NotificationService para detalhes
    } catch (error) {
      logger.error(
        { error, petitionId: poll.petitionId },
        'Erro ao manipular confirmação de juntada',
      );
    }
  }

  /**
   * Manipular timeout de polling
   */
  private async handlePollingTimeout(poll: PetitionPoll): Promise<void> {
    try {
      const now = new Date();

      // Atualizar banco de dados
      await db.query(
        `UPDATE petition_polls
         SET status = $1, poll_count = $2, last_polled_at = $3
         WHERE petition_id = $4`,
        ['timeout', poll.pollCount, now, poll.petitionId],
      );

      // Atualizar status da petição
      await db.query(
        `UPDATE petitions
         SET status = $1, updated_at = $2
         WHERE id = $3`,
        ['pending_confirmation', now, poll.petitionId],
      );

      // Emitir evento de timeout
      eventService.emit(
        'petition.polling_timeout',
        'petition-polling',
        {
          petitionId: poll.petitionId,
          caseId: poll.caseId,
          processNumber: poll.processNumber,
          protocolNumber: poll.protocolNumber,
          tribunalCode: poll.tribunalCode,
          pollCount: poll.pollCount,
          maxPolls: poll.maxPolls,
          totalWaitTime: poll.pollCount * poll.pollIntervalSeconds,
        },
        'system',
      );

      // Registrar no audit log
      await auditLogService.log({
        action: 'PETITION_POLLING_TIMEOUT',
        entityType: 'Petition',
        entityId: poll.petitionId,
        userId: 'system',
        ipAddress: 'system',
        changes: {
          after: {
            status: 'pending_confirmation',
            timeoutAfterPolls: poll.pollCount,
          },
        },
        status: 'failure',
        metadata: {
          totalWaitTime: `${poll.pollCount * poll.pollIntervalSeconds}s`,
          tribunalCode: poll.tribunalCode,
        },
      });

      logger.warn(
        {
          petitionId: poll.petitionId,
          processNumber: poll.processNumber,
          pollCount: poll.pollCount,
        },
        'Timeout de polling: tribunal não confirmou juntada após 1 hora',
      );
    } catch (error) {
      logger.error({ error, petitionId: poll.petitionId }, 'Erro ao manipular timeout');
    }
  }

  /**
   * Parar polling para uma petição
   */
  stopPolling(petitionId: string): void {
    const interval = this.activePolls.get(petitionId);
    if (interval) {
      clearInterval(interval);
      this.activePolls.delete(petitionId);
      logger.info(`Polling parado para petição ${petitionId}`);
    }
  }

  /**
   * Obter status de polling de uma petição
   */
  async getPollStatus(petitionId: string): Promise<PetitionPoll | null> {
    try {
      const data = await redisCacheService.get(`petition:poll:${petitionId}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data);
    } catch (error) {
      logger.error({ error, petitionId }, 'Erro ao obter status de polling');
      return null;
    }
  }

  /**
   * Obter estatísticas de polling
   */
  async getPollingStatistics(): Promise<{
    activePollsCount: number;
    totalRegisteredPolls: number;
    successfulConfirmations: number;
    timeouts: number;
    averagePollsNeeded: number;
  }> {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'juntada' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeouts,
          AVG(poll_count) as avg_polls
        FROM petition_polls
      `);

      return {
        activePollsCount: this.activePolls.size,
        totalRegisteredPolls: stats.rows[0]?.total || 0,
        successfulConfirmations: stats.rows[0]?.successful || 0,
        timeouts: stats.rows[0]?.timeouts || 0,
        averagePollsNeeded: Math.round(stats.rows[0]?.avg_polls || 0),
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao obter estatísticas de polling');
      return {
        activePollsCount: 0,
        totalRegisteredPolls: 0,
        successfulConfirmations: 0,
        timeouts: 0,
        averagePollsNeeded: 0,
      };
    }
  }

  /**
   * Parar todos os pollings
   */
  stopAllPollings(): void {
    this.activePolls.forEach((interval) => clearInterval(interval));
    this.activePolls.clear();
    logger.info('Todos os pollings foram parados');
  }
}

export const petitionPollingService = new PetitionPollingService();
