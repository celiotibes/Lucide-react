# Secure Logging System

Um sistema de logging seguro e completo para aplicações mobile, com masking automático de dados sensíveis, conformidade com GDPR, e integração com serviços remotos.

## Features

- ✅ **Masking Automático de Dados Sensíveis**
  - Tokens de autenticação (Bearer, JWT)
  - Senhas e secrets
  - Números de cartão de crédito
  - Social Security Numbers (SSN)
  - Endereços de email
  - Números de telefone
  - URLs com parâmetros sensíveis
  - Chaves privadas (RSA, OpenSSH)
  - Credenciais AWS
  - Connection strings de banco de dados

- ✅ **Múltiplos Níveis de Log**
  - DEBUG, INFO, WARN, ERROR, CRITICAL

- ✅ **Logging Estruturado**
  - Formato JSON
  - Timestamps ISO 8601
  - IDs de sessão e módulo
  - Rastreamento de contexto

- ✅ **Armazenamento**
  - Em memória (rápido)
  - AsyncStorage (persistente)
  - Limpeza automática por data de retenção

- ✅ **Logging Remoto**
  - Integração com Sentry
  - Integração com Crashlytics
  - Suporte para endpoint customizado
  - Batch de logs com retry automático

- ✅ **Audit Trail**
  - Rastreamento de eventos de segurança
  - Conformidade GDPR (retenção de 1 ano padrão)
  - Exportação de logs para compliance
  - Classificação por severidade

- ✅ **Ações de Usuário**
  - Rastreamento sem PII
  - Analytics seguro
  - Categorização de eventos

- ✅ **Exportação**
  - JSON
  - CSV
  - Relatórios de compliance

## Instalação

```bash
# Os arquivos já estão em mobile-app/src/utils/logging/
```

## Uso Básico

### 1. Logging Simples

```typescript
import { secureLogger } from './utils/logging/logger';

// Dados sensíveis são automaticamente mascarados
secureLogger.info('User login', {
  userId: 'user@example.com',
  token: 'Bearer eyJhbGciOiJIUzI1NiJ9...',
  password: 'secret123', // Será mascarado automaticamente
});

secureLogger.warn('API rate limit approaching', { remaining: 95 });
secureLogger.error('Database error', new Error('Connection failed'));
```

### 2. Logging com Módulo

```typescript
secureLogger.info('Payment processed', 
  { amount: 99.99, orderId: 'ORD-123' }, 
  'PaymentService'
);
```

### 3. Rastreamento de Ações de Usuário

```typescript
// Sem expor dados pessoais
secureLogger.logUserAction('login', 'authentication', {
  method: 'email',
  deviceType: 'mobile',
  appVersion: '1.0.0',
});

secureLogger.logUserAction('purchase', 'commerce', {
  productCount: 3,
  category: 'electronics',
  totalValue: 99.99,
});
```

### 4. Logging de Auditoria (Segurança)

```typescript
import { auditLogger, AuditEventType } from './utils/logging/auditLog';

// Log de autenticação
await auditLogger.logAuthEvent(
  AuditEventType.AUTH_LOGIN,
  'user123',
  true, // sucesso
  { ipAddress: '192.168.1.1' },
);

// Log de acesso a dados
await auditLogger.logDataAccess(
  'user123',
  'record-456',
  'HealthRecord',
  { duration: '5 minutes' },
);

// Log de mudança de permissão
await auditLogger.logPermissionChange(
  'admin-user',
  'Document-123',
  { permission: 'view' },
  { permission: 'edit' },
  'User requested write access',
);

// Alerta de segurança
await auditLogger.logSecurityAlert(
  'Suspicious activity detected',
  'high',
  { failedAttempts: 5, pattern: 'brute_force' },
  'user123',
);
```

## Masking de Dados

### Masking Automático

O sistema mascara automaticamente dados sensíveis em qualquer string ou objeto:

```typescript
import { logMasker } from './utils/logging/logMasking';

// String
const masked = logMasker.mask('Email: john@example.com, Token: Bearer abc123');
// Resultado: 'Email: j****@example.com, Token: Bearer [REDACTED-TOKEN]'

// Objeto
const data = {
  user: {
    email: 'john@example.com',
    password: 'secret123',
    creditCard: '4532-1234-5678-9010',
  },
};

const maskedData = logMasker.maskObject(data);
// Resultado: { user: { email: 'j****@example.com', password: '[REDACTED]', creditCard: '[REDACTED]' } }
```

### Padrões Suportados

| Tipo | Exemplo | Resultado |
|------|---------|-----------|
| Bearer Token | `Bearer abc123xyz` | `Bearer [REDACTED-TOKEN]` |
| JWT | `eyJhbGc...` | `[REDACTED-JWT]` |
| API Key | `api_key: sk_live_123` | `api_key: [REDACTED-API-KEY]` |
| Password | `password=secret` | `password=[REDACTED-PASSWORD]` |
| Credit Card | `4532-1234-5678-9010` | `****-****-****-9010` |
| Email | `john@example.com` | `j****@example.com` |
| Phone | `(555) 123-4567` | `***-***-4567` |
| SSN | `123-45-6789` | `[REDACTED-SSN]` |
| AWS Access Key | `AKIA2ZWYNX2VLQY7WKBJ` | `[REDACTED-AWS-ACCESS-KEY]` |
| Database URL | `postgres://user:pwd@host` | `postgres://[REDACTED-DATABASE-URL]` |
| URL Params | `?token=abc123` | `?token=[REDACTED-URL-PARAM]` |
| Private Keys | `-----BEGIN RSA PRIVATE KEY-----` | `[REDACTED-PRIVATE-KEY]` |

### Padrões Customizados

```typescript
const masker = new LogMasker();
masker.registerPattern('customSecret', /secret_[a-z0-9]+/gi);

const input = 'Custom: secret_abc123xyz';
const result = masker.mask(input);
// Resultado: 'Custom: [REDACTED-CUSTOMSECRET]'
```

## Configuração

### Configuração da Logger

```typescript
import { SecureLogger, LogLevel } from './utils/logging/logger';

const logger = new SecureLogger({
  minLevel: LogLevel.INFO,
  enableConsole: true,
  enableFileLogging: true,
  enableRemoteLogging: true,
  environment: 'production',
  maxLogsInMemory: 200,
  maxLogsInStorage: 500,
  retentionDays: 30,
  remoteEndpoint: 'https://logs.example.com/api/logs',
  remoteApiKey: 'your-api-key',
  batchSize: 50,
  flushInterval: 5000, // 5 segundos
});
```

### Configuração do Masking

```typescript
import { LogMasker } from './utils/logging/logMasking';

const masker = new LogMasker({
  maskTokens: true,
  maskPasswords: true,
  maskEmails: true,
  maskPhoneNumbers: true,
  maskCreditCards: true,
  maskSSN: true,
  maskURLParams: true,
  maskAPIKeys: true,
});
```

### Configuração do Audit Logger

```typescript
import { AuditLogger } from './utils/logging/auditLog';

const auditLogger = new AuditLogger({
  enabled: true,
  maxEventsInStorage: 1000,
  retentionDays: 365, // 1 ano (GDPR)
  autoExportDays: 90,
  encryptionEnabled: false,
  remoteEndpoint: 'https://audit.example.com/api/events',
  remoteApiKey: 'your-api-key',
});
```

## Logging Remoto

### Integração com Sentry

```typescript
import { createRemoteLogger, RemoteLoggerProvider } from './utils/logging/remoteLogger';

const sentryLogger = createRemoteLogger(RemoteLoggerProvider.SENTRY, {
  enabled: true,
  dsn: 'https://your-key@sentry.io/project',
  environment: 'production',
  release: '1.0.0',
  sampleRate: 1.0,
  tracesSampleRate: 0.1,
});

// Set user context
sentryLogger.setUserContext('user123', {
  email: 'user@example.com',
  subscription: 'premium',
});

// Add breadcrumb
sentryLogger.addBreadcrumb('user-action', 'User clicked login', 'info');

// Capture exception
try {
  // seu código
} catch (error) {
  await sentryLogger.captureException(error as Error, {
    context: 'login-flow',
  });
}
```

### Integração com Endpoint Customizado

```typescript
const remoteLogger = createRemoteLogger(RemoteLoggerProvider.CUSTOM, {
  enabled: true,
  endpoint: 'https://logs.example.com/api/logs',
  apiKey: 'your-api-key',
  environment: 'production',
});
```

## Exportação de Logs

### Exportar como JSON

```typescript
const jsonExport = await secureLogger.exportLogs();
console.log(jsonExport);
```

### Exportar como CSV

```typescript
const csvExport = await secureLogger.exportLogsAsCSV();
console.log(csvExport);
```

### Audit Trail

```typescript
// Estatísticas
const stats = auditLogger.getStats();
console.log(stats);

// Eventos de compliance
const complianceEvents = auditLogger.getComplianceEvents(
  new Date('2024-01-01'),
  new Date('2024-12-31')
);

// Exportar
const csvAudit = await auditLogger.exportAsCSV();
const jsonAudit = await auditLogger.exportAsJSON();
```

## Filtro de Sensibilidade

### Configuração Granular

```typescript
// Desabilitar masking de emails
const masker = new LogMasker({ maskEmails: false });

// Desabilitar masking de tudo
const maskerDisabled = new LogMasker({
  maskTokens: false,
  maskPasswords: false,
  maskEmails: false,
  maskPhoneNumbers: false,
  maskCreditCards: false,
  maskSSN: false,
  maskURLParams: false,
  maskAPIKeys: false,
});
```

### Chaves Sensíveis Automáticas

O masker reconhece automaticamente chaves sensíveis:

```typescript
const data = {
  name: 'John',
  password: 'secret', // Será mascarado automaticamente
  apiKey: 'sk_live_123', // Será mascarado automaticamente
  creditCard: '4532-1234-5678-9010', // Será mascarado automaticamente
  ssn: '123-45-6789', // Será mascarado automaticamente
  email: 'john@example.com', // Será mascarado automaticamente
  phone: '555-123-4567', // Será mascarado automaticamente
};

const masked = logMasker.maskObject(data);
```

## Conformidade GDPR

O sistema está implementado com conformidade GDPR:

1. **Retenção de Dados**: Padrão de 30 dias para logs, 365 dias para audit trail
2. **Masking de PII**: Todos os dados pessoais são automaticamente mascarados
3. **Audit Trail**: Completo para rastreamento de acesso a dados
4. **Exportação**: Facilita direito de portabilidade de dados
5. **Limpeza**: Limpeza automática de logs antigos

## Estatísticas e Monitoramento

```typescript
// Estatísticas de logging
const stats = secureLogger.getStats();
console.log(`Total logs: ${stats.totalLogs}`);
console.log(`Logs mascarados: ${stats.maskedLogs}`);
console.log(`Ações de usuário: ${stats.userActions}`);

// Estatísticas de auditoria
const auditStats = auditLogger.getStats();
console.log(`Eventos de compliance: ${auditStats.complianceEvents}`);
console.log(`Severidade crítica: ${auditStats.bySeverity.critical}`);

// Resumo
secureLogger.printSummary();
```

## Segurança

### O que NÃO será logado

- Senhas completas
- Tokens completos
- Chaves privadas
- Números de cartão (apenas últimos 4 dígitos)
- SSN completo
- Email completo (apenas primeira letra + domínio)
- Números de telefone completos (apenas últimos 4 dígitos)

### Boas Práticas

1. **Sempre usar módulo para contexto**
   ```typescript
   secureLogger.info('Message', data, 'ModuleName');
   ```

2. **Usar níveis apropriados**
   - DEBUG: informações detalhadas de desenvolvimento
   - INFO: eventos normais
   - WARN: condições de aviso
   - ERROR: erros
   - CRITICAL: erros críticos do sistema

3. **Rastreamento de usuário sem PII**
   ```typescript
   secureLogger.logUserAction('login', 'auth', {
     method: 'email', // não inclua o email
     mfaUsed: true,
     deviceType: 'mobile',
   });
   ```

4. **Limpeza na desinicialização**
   ```typescript
   // Ao encerrar a app
   await secureLogger.destroy();
   ```

## Testes

```bash
# Executar testes
npm test -- __tests__/logMasking.test.ts
```

Testes incluem:
- Masking de tokens
- Masking de senhas
- Masking de emails
- Masking de números de cartão
- Masking de SSN
- Masking de URLs
- Masking de objetos
- Configuração granular
- Edge cases

## Exemplos Completos

Ver arquivo `examples.ts` para 12 exemplos completos incluindo:
1. Logging básico
2. Logging por módulo
3. Masking de objetos
4. Rastreamento de ações
5. Logging de segurança
6. Logging remoto (Sentry)
7. Masking de URLs
8. Logs e estatísticas
9. Estatísticas de masking
10. Exportação de audit trail
11. Flow de login
12. Flow de exportação de dados

## Troubleshooting

### Logs não estão sendo persistidos

```typescript
// Verificar se o logger foi inicializado
secureLogger.printSummary();

// Flush manual
await secureLogger.flushManually();
```

### Dados não estão sendo mascarados

```typescript
// Verificar configuração
const masker = new LogMasker({
  maskTokens: true,
  maskPasswords: true,
  // ... etc
});

// Testar masking
const result = masker.mask('Bearer token123');
console.log(result);
```

### Dados remotos não estão chegando

```typescript
// Verificar endpoint
const config = {
  remoteEndpoint: 'https://seu-endpoint.com/logs',
  remoteApiKey: 'sua-chave',
};

// Verificar conectividade
await secureLogger.flushManually();
```

## Referências

- [GDPR Compliance](https://gdpr-info.eu/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [PII Classification](https://www.nist.gov/publications/guide-protecting-confidentiality-personally-identifiable-information)

## Licença

MIT
