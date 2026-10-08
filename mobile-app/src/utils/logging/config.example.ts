/**
 * Logging Configuration Examples
 *
 * Exemplos de configuração para diferentes ambientes
 */

import { SecureLogger, LogLevel } from './logger';
import { AuditLogger } from './auditLog';
import { createRemoteLogger, RemoteLoggerProvider } from './remoteLogger';
import { LogMasker } from './logMasking';

/**
 * Configuração para Desenvolvimento
 */
export const developmentConfig = {
  logger: new SecureLogger({
    minLevel: LogLevel.DEBUG,
    enableConsole: true,
    enableFileLogging: true,
    enableRemoteLogging: false, // Desabilitar em desenvolvimento
    environment: 'development',
    maxLogsInMemory: 500,
    maxLogsInStorage: 1000,
    retentionDays: 7, // Curto em desenvolvimento
  }),

  auditLogger: new AuditLogger({
    enabled: true,
    maxEventsInStorage: 500,
    retentionDays: 7,
    encryptionEnabled: false,
    remoteEndpoint: undefined,
  }),

  masker: new LogMasker({
    maskTokens: true,
    maskPasswords: true,
    maskEmails: false, // Menos restritivo em dev
    maskPhoneNumbers: false,
    maskCreditCards: true,
    maskSSN: true,
    maskURLParams: true,
    maskAPIKeys: true,
  }),
};

/**
 * Configuração para Staging/QA
 */
export const stagingConfig = {
  logger: new SecureLogger({
    minLevel: LogLevel.INFO,
    enableConsole: true,
    enableFileLogging: true,
    enableRemoteLogging: true,
    environment: 'staging',
    maxLogsInMemory: 200,
    maxLogsInStorage: 500,
    retentionDays: 30,
    remoteEndpoint: 'https://staging-logs.example.com/api/logs',
    remoteApiKey: process.env.REACT_APP_LOG_API_KEY_STAGING,
    batchSize: 25,
    flushInterval: 10000,
  }),

  auditLogger: new AuditLogger({
    enabled: true,
    maxEventsInStorage: 1000,
    retentionDays: 90,
    encryptionEnabled: false,
    remoteEndpoint: 'https://staging-audit.example.com/api/events',
    remoteApiKey: process.env.REACT_APP_LOG_API_KEY_STAGING,
  }),

  masker: new LogMasker({
    maskTokens: true,
    maskPasswords: true,
    maskEmails: true,
    maskPhoneNumbers: true,
    maskCreditCards: true,
    maskSSN: true,
    maskURLParams: true,
    maskAPIKeys: true,
  }),
};

/**
 * Configuração para Produção
 */
export const productionConfig = {
  logger: new SecureLogger({
    minLevel: LogLevel.WARN, // Apenas WARN e acima
    enableConsole: false, // Desabilitar console logging
    enableFileLogging: true,
    enableRemoteLogging: true,
    environment: 'production',
    maxLogsInMemory: 100, // Menor para economizar memória
    maxLogsInStorage: 500,
    retentionDays: 30, // GDPR compliant
    remoteEndpoint: 'https://logs.example.com/api/logs',
    remoteApiKey: process.env.REACT_APP_LOG_API_KEY_PROD,
    batchSize: 50,
    flushInterval: 5000,
  }),

  auditLogger: new AuditLogger({
    enabled: true,
    maxEventsInStorage: 1000,
    retentionDays: 365, // 1 ano para compliance
    encryptionEnabled: true, // Habilitar encriptação
    remoteEndpoint: 'https://audit.example.com/api/events',
    remoteApiKey: process.env.REACT_APP_LOG_API_KEY_PROD,
  }),

  remoteLogger: createRemoteLogger(RemoteLoggerProvider.SENTRY, {
    enabled: true,
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: 'production',
    release: process.env.REACT_APP_VERSION,
    sampleRate: 1.0, // Log 100% de eventos
    tracesSampleRate: 0.1, // Log 10% das traces
  }),

  masker: new LogMasker({
    maskTokens: true,
    maskPasswords: true,
    maskEmails: true,
    maskPhoneNumbers: true,
    maskCreditCards: true,
    maskSSN: true,
    maskURLParams: true,
    maskAPIKeys: true,
  }),
};

/**
 * Seletor de configuração baseado no ambiente
 */
export function getLoggingConfig(environment?: string) {
  const env = environment || process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
    case 'prod':
      return productionConfig;

    case 'staging':
    case 'stage':
      return stagingConfig;

    case 'development':
    case 'dev':
    default:
      return developmentConfig;
  }
}

/**
 * Configuração de Variáveis de Ambiente
 *
 * Adicione ao seu .env:
 *
 * # Logging
 * NODE_ENV=production
 * REACT_APP_VERSION=1.0.0
 *
 * # Produção
 * REACT_APP_LOG_API_KEY_PROD=your-prod-api-key
 * REACT_APP_SENTRY_DSN=https://key@sentry.io/project
 *
 * # Staging
 * REACT_APP_LOG_API_KEY_STAGING=your-staging-api-key
 *
 * # Desenvolvimento
 * REACT_APP_LOG_API_KEY_DEV=your-dev-api-key
 */

/**
 * Inicialização da Logger
 *
 * Chame uma vez quando a aplicação inicia:
 *
 * ```typescript
 * import { initializeLogging } from './utils/logging/config.example';
 *
 * // No App.tsx ou main.tsx
 * useEffect(() => {
 *   initializeLogging();
 * }, []);
 * ```
 */
export async function initializeLogging() {
  const config = getLoggingConfig();

  // Set up user context para remote logger
  if (config.remoteLogger) {
    const userId = localStorage.getItem('userId'); // ou obter do seu estado
    if (userId) {
      config.remoteLogger.setUserContext(userId, {
        app: 'my-app',
        version: process.env.REACT_APP_VERSION,
      });
    }
  }

  // Log do start
  config.logger.info('Application started', {
    environment: config.logger['config'].environment,
    version: process.env.REACT_APP_VERSION,
  });
}

/**
 * Cleanup na desinicialização
 *
 * Chame quando a aplicação está fechando:
 *
 * ```typescript
 * import { cleanupLogging } from './utils/logging/config.example';
 *
 * // Ao desmontar a App
 * useEffect(() => {
 *   return () => {
 *     cleanupLogging();
 *   };
 * }, []);
 * ```
 */
export async function cleanupLogging() {
  const config = getLoggingConfig();

  config.logger.info('Application shutting down');
  await config.logger.flushManually();
  await config.logger.destroy();
}

/**
 * Configuração Alternativa com Factory
 *
 * Para mais controle, você pode criar uma factory:
 */
export class LoggingFactory {
  private static instance: {
    logger: SecureLogger;
    auditLogger: AuditLogger;
    remoteLogger?: ReturnType<typeof createRemoteLogger>;
    masker: LogMasker;
  };

  static initialize(environment?: string) {
    const config = getLoggingConfig(environment);

    this.instance = {
      logger: config.logger,
      auditLogger: config.auditLogger,
      remoteLogger: 'remoteLogger' in config ? config.remoteLogger : undefined,
      masker: config.masker,
    };

    this.instance.logger.info('LoggingFactory initialized', {
      environment: this.instance.logger['config'].environment,
    });

    return this.instance;
  }

  static getLogger() {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance.logger;
  }

  static getAuditLogger() {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance.auditLogger;
  }

  static getRemoteLogger() {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance.remoteLogger;
  }

  static getMasker() {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance.masker;
  }

  static getAll() {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance;
  }
}

/**
 * Uso da Factory:
 *
 * ```typescript
 * import { LoggingFactory } from './utils/logging/config.example';
 *
 * // Inicializar
 * LoggingFactory.initialize('production');
 *
 * // Usar
 * const logger = LoggingFactory.getLogger();
 * logger.info('Message');
 *
 * const auditLogger = LoggingFactory.getAuditLogger();
 * auditLogger.logAuthEvent(...);
 * ```
 */
