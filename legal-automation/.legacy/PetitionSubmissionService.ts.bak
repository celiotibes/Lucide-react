import { logger } from '@utils/logger';
import { AdapterFactory } from '@adapters/AdapterFactory';
import { FormattedPetition } from './PetitionFormatterService';

export interface SubmissionResult {
  success: boolean;
  protocolo: string;
  error?: string;
  timestamp: Date;
  attempt: number;
  retryable: boolean;
  details?: Record<string, any>;
}

export interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  threshold: number;
  timeout: number;
}

const RETRIABLE_ERRORS = [
  'timeout',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '408',
  '429',
  '502',
  '503',
  '504',
  'temporary',
  'unavailable',
  'ERR_HTTP2_STREAM_CANCEL',
];

const NON_RETRIABLE_ERRORS = [
  '400',
  '401',
  '403',
  '404',
  '405',
  'invalid',
  'unauthorized',
  'forbidden',
  'not found',
];

export class PetitionSubmissionService {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  async submitPetitionWithRetry(
    petition: FormattedPetition,
    signedDocument: Buffer,
    maxRetries: number = 5,
  ): Promise<SubmissionResult> {
    logger.info(
      `Iniciando submissão de petição para ${petition.tribunal} (máx ${maxRetries} tentativas)`,
    );

    let lastError: Error | null = null;

    // Check circuit breaker
    const circuitState = this.getCircuitBreakerState(petition.tribunal);
    if (circuitState.status === 'open') {
      logger.warn(
        `Circuit breaker ABERTO para ${petition.tribunal}. Aguardando ${circuitState.timeout}ms`,
      );
      return {
        success: false,
        protocolo: '',
        error: `Tribunal ${petition.tribunal} temporariamente indisponível`,
        timestamp: new Date(),
        attempt: 0,
        retryable: true,
      };
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info(
          `Tentativa ${attempt + 1}/${maxRetries} de envio para ${petition.tribunal}`,
        );

        const result = await this.submitToPetition(petition, signedDocument);

        if (result.success) {
          logger.info(`✓ Sucesso no envio - Protocolo: ${result.protocolo}`);
          this.recordSuccess(petition.tribunal);
          return result;
        }

        // Check if error is retriable
        if (result.retryable && attempt < maxRetries - 1) {
          lastError = new Error(result.error);
          const delay = this.DEFAULT_RETRY_DELAYS[attempt];
          logger.warn(
            `Erro retriável na tentativa ${attempt + 1}: ${result.error}. Aguardando ${delay}ms...`,
          );
          await this.sleep(delay);
          continue;
        }

        // Non-retriable error or last attempt
        logger.error(`Erro não-retriável ou última tentativa: ${result.error}`);
        this.recordFailure(petition.tribunal);
        return {
          success: false,
          protocolo: '',
          error: result.error,
          timestamp: new Date(),
          attempt: attempt + 1,
          retryable: false,
          details: result.details,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;
        const isRetriable = this.isRetriableError(errorMessage);

        logger.error(
          `Erro na tentativa ${attempt + 1}: ${errorMessage} (Retriável: ${isRetriable})`,
        );

        if (isRetriable && attempt < maxRetries - 1) {
          const delay = this.DEFAULT_RETRY_DELAYS[attempt];
          logger.info(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await this.sleep(delay);
          continue;
        }

        if (!isRetriable) {
          this.recordFailure(petition.tribunal);
        }

        return {
          success: false,
          protocolo: '',
          error: errorMessage,
          timestamp: new Date(),
          attempt: attempt + 1,
          retryable: isRetriable,
        };
      }
    }

    logger.error(`✗ Todas as ${maxRetries} tentativas falharam`);
    this.recordFailure(petition.tribunal);

    return {
      success: false,
      protocolo: '',
      error:
        lastError?.message ||
        'Falha em todas as tentativas de envio. Verifique a conexão ou tente novamente mais tarde.',
      timestamp: new Date(),
      attempt: maxRetries,
      retryable: true,
    };
  }

  private async submitToPetition(
    petition: FormattedPetition,
    signedDocument: Buffer,
  ): Promise<SubmissionResult> {
    try {
      const adapter = AdapterFactory.getAdapter(petition.tribunal);

      logger.debug(`Enviando petição para ${petition.tribunal} via adapter`);

      const response = await Promise.race([
        adapter.submitPetition(
          {
            ...petition.originalPetition,
            signedDocument,
          },
          petition.metadata.certificatePath || '',
          petition.metadata.certificatePassword || '',
        ),
        this.createTimeout(30000), // 30 second timeout
      ]);

      // Normalize response
      const protocolo = response.protocolo || response.numero_protocolo || '';
      const success = response.sucesso || response.success || response.status === 'enviada';
      const error = response.mensagem || response.message || response.error || '';

      if (!protocolo && success) {
        logger.warn('Resposta sucesso mas sem protocolo');
        return {
          success: false,
          protocolo: '',
          error: 'Resposta do tribunal não contém protocolo',
          timestamp: new Date(),
          attempt: 0,
          retryable: true,
        };
      }

      return {
        success,
        protocolo,
        error: !success ? error : undefined,
        timestamp: new Date(response.dataProtocolo || new Date()),
        attempt: 0,
        retryable: !success && this.isRetriableError(error),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erro ao submeter petição: ${errorMessage}`);
    }
  }

  private isRetriableError(error: string): boolean {
    const lowerError = error.toLowerCase();

    // Check retriable errors first
    if (RETRIABLE_ERRORS.some((err) => lowerError.includes(err))) {
      return true;
    }

    // Check non-retriable errors
    if (NON_RETRIABLE_ERRORS.some((err) => lowerError.includes(err))) {
      return false;
    }

    // Default to retriable for unknown errors
    return true;
  }

  private getCircuitBreakerState(tribunal: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(tribunal)) {
      this.circuitBreakers.set(tribunal, {
        status: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        threshold: this.CIRCUIT_BREAKER_THRESHOLD,
        timeout: this.CIRCUIT_BREAKER_TIMEOUT,
      });
    }

    const state = this.circuitBreakers.get(tribunal)!;

    // Check if we should transition from open to half-open
    if (state.status === 'open') {
      const timeSinceLastFailure = Date.now() - state.lastFailureTime;
      if (timeSinceLastFailure > state.timeout) {
        logger.info(
          `Transicionando circuit breaker para HALF-OPEN para ${tribunal}`,
        );
        state.status = 'half-open';
        state.failureCount = 0;
      }
    }

    return state;
  }

  private recordSuccess(tribunal: string): void {
    const state = this.getCircuitBreakerState(tribunal);
    state.successCount++;
    state.failureCount = 0;

    if (state.status === 'half-open') {
      logger.info(`Circuit breaker FECHADO para ${tribunal}`);
      state.status = 'closed';
    }
  }

  private recordFailure(tribunal: string): void {
    const state = this.getCircuitBreakerState(tribunal);
    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.failureCount >= state.threshold && state.status !== 'open') {
      logger.warn(
        `Circuit breaker ABERTO para ${tribunal} após ${state.failureCount} falhas`,
      );
      state.status = 'open';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout após ${ms}ms`));
      }, ms);
    });
  }

  getCircuitBreakerStatus(tribunal: string): CircuitBreakerState {
    return this.getCircuitBreakerState(tribunal);
  }

  getAllCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    for (const [tribunal, state] of this.circuitBreakers.entries()) {
      status[tribunal] = { ...state };
    }
    return status;
  }

  resetCircuitBreaker(tribunal: string): void {
    logger.info(`Resetando circuit breaker para ${tribunal}`);
    this.circuitBreakers.set(tribunal, {
      status: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
      threshold: this.CIRCUIT_BREAKER_THRESHOLD,
      timeout: this.CIRCUIT_BREAKER_TIMEOUT,
    });
  }
}

export const petitionSubmissionService = new PetitionSubmissionService();
