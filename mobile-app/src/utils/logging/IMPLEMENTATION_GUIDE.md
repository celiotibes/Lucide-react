# Implementation Guide - Secure Logging System

Guia de implementação passo a passo para integrar o sistema de logging seguro na sua aplicação.

## Estrutura de Arquivos

```
mobile-app/src/utils/logging/
├── README.md                    # Documentação principal
├── SECURITY_GUIDE.md            # Guia de segurança
├── IMPLEMENTATION_GUIDE.md      # Este arquivo
├── logger.ts                    # Logger principal com masking
├── logMasking.ts                # Utilitário de masking de dados
├── remoteLogger.ts              # Integração com Sentry/Crashlytics
├── auditLog.ts                  # Audit trail e compliance
├── examples.ts                  # 12 exemplos de uso
├── config.example.ts            # Configurações por ambiente
├── index.ts                     # Exports principais
└── __tests__/
    └── logMasking.test.ts       # Testes unitários
```

## Passo 1: Setup Básico

### 1.1 Importar o Logger

```typescript
// app.tsx ou main.tsx
import { secureLogger, LogLevel } from './utils/logging';

// Configurar nível mínimo (opcional)
secureLogger.updateConfig({
  minLevel: LogLevel.INFO,
});
```

### 1.2 Inicializar na App

```typescript
// App.tsx
import { useEffect } from 'react';
import { secureLogger } from './utils/logging';

export function App() {
  useEffect(() => {
    // Log do start da aplicação
    secureLogger.info('App started', {
      version: '1.0.0',
      platform: 'mobile',
    });

    // Cleanup na desinicialização
    return () => {
      secureLogger.info('App shutting down');
    };
  }, []);

  return (
    // sua app
  );
}
```

## Passo 2: Logging em Componentes/Serviços

### 2.1 Logging Simples

```typescript
import { secureLogger } from '@utils/logging';

export function LoginComponent() {
  const handleLogin = async (email: string, password: string) => {
    try {
      secureLogger.info('Login attempt', { email }, 'LoginComponent');
      
      // seu código de login
      
      secureLogger.info('Login successful', { userId: 'user-123' }, 'LoginComponent');
    } catch (error) {
      secureLogger.error('Login failed', error, 'LoginComponent');
    }
  };

  return (
    // seu JSX
  );
}
```

### 2.2 Logging de Ações de Usuário

```typescript
import { secureLogger } from '@utils/logging';

export function CheckoutComponent() {
  const handlePurchase = async (cartData: any) => {
    try {
      // Log da ação (sem PII)
      secureLogger.logUserAction('purchase_initiated', 'commerce', {
        itemCount: cartData.items.length,
        totalValue: cartData.total,
        category: cartData.category,
      });

      // sua lógica de compra

      secureLogger.logUserAction('purchase_completed', 'commerce', {
        itemCount: cartData.items.length,
        totalValue: cartData.total,
      });
    } catch (error) {
      secureLogger.error('Purchase failed', error, 'CheckoutComponent');
    }
  };

  return (
    // seu JSX
  );
}
```

## Passo 3: Audit Logging para Segurança

### 3.1 Setup do Audit Logger

```typescript
import { auditLogger, AuditEventType } from '@utils/logging';

// No seu auth service
export async function loginUser(email: string, password: string) {
  try {
    const user = await authenticateUser(email, password);
    
    // Log de segurança
    await auditLogger.logAuthEvent(
      AuditEventType.AUTH_LOGIN,
      user.id,
      true, // success
      { ipAddress: getClientIP(), deviceId: getDeviceId() },
    );

    return user;
  } catch (error) {
    // Log de falha
    await auditLogger.logAuthEvent(
      AuditEventType.AUTH_FAILED,
      email, // ou user id se disponível
      false, // failure
      { error: (error as Error).message },
    );

    throw error;
  }
}
```

### 3.2 Logging de Acesso a Dados

```typescript
import { auditLogger } from '@utils/logging';

export async function fetchUserData(userId: string) {
  try {
    const data = await api.getUserData(userId);

    // Log de acesso
    await auditLogger.logDataAccess(
      getCurrentUserId(),
      userId,
      'UserProfile',
      { method: 'fetch' },
    );

    return data;
  } catch (error) {
    throw error;
  }
}
```

## Passo 4: Integração com Sentry (Produção)

### 4.1 Configurar Sentry

```typescript
// config.ts ou utils/logging/config.ts
import { createRemoteLogger, RemoteLoggerProvider } from '@utils/logging';

const sentryLogger = createRemoteLogger(RemoteLoggerProvider.SENTRY, {
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.REACT_APP_VERSION,
  sampleRate: 1.0,
  tracesSampleRate: 0.1,
});

export default sentryLogger;
```

### 4.2 Usar Sentry para Exceções Críticas

```typescript
import sentryLogger from '@utils/logging/sentry-config';

export async function criticalOperation() {
  try {
    sentryLogger.setUserContext(getCurrentUserId(), {
      email: getCurrentUserEmail(),
    });

    // sua operação

    sentryLogger.addBreadcrumb(
      'critical-operation',
      'Critical operation completed',
      'info',
    );
  } catch (error) {
    sentryLogger.setUserContext(getCurrentUserId());
    await sentryLogger.captureException(error as Error, {
      context: 'critical_operation',
    });
    throw error;
  }
}
```

## Passo 5: Configuração por Ambiente

### 5.1 Environment Variables

```bash
# .env.development
NODE_ENV=development
REACT_APP_VERSION=1.0.0-dev
REACT_APP_LOG_LEVEL=DEBUG
REACT_APP_LOG_ENABLE_REMOTE=false

# .env.staging
NODE_ENV=staging
REACT_APP_VERSION=1.0.0-staging
REACT_APP_LOG_LEVEL=INFO
REACT_APP_LOG_ENABLE_REMOTE=true
REACT_APP_LOG_ENDPOINT=https://staging-logs.example.com
REACT_APP_LOG_API_KEY=your-staging-key

# .env.production
NODE_ENV=production
REACT_APP_VERSION=1.0.0
REACT_APP_LOG_LEVEL=WARN
REACT_APP_LOG_ENABLE_REMOTE=true
REACT_APP_LOG_ENDPOINT=https://logs.example.com
REACT_APP_LOG_API_KEY=your-prod-key
REACT_APP_SENTRY_DSN=https://key@sentry.io/project
```

### 5.2 Usar Configuração

```typescript
import { getLoggingConfig } from '@utils/logging/config.example';

const config = getLoggingConfig(process.env.NODE_ENV);

// config.logger - SecureLogger
// config.auditLogger - AuditLogger
// config.remoteLogger - Remote Logger (se aplicável)
// config.masker - LogMasker
```

## Passo 6: Tratamento de Erros

### 6.1 Global Error Handler

```typescript
// ErrorBoundary.tsx
import React from 'react';
import { secureLogger } from '@utils/logging';

export class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: any) {
    secureLogger.critical(
      'React Error Boundary caught error',
      error,
      'ErrorBoundary',
    );

    console.error('Error caught:', error, errorInfo);
  }

  render() {
    return <div>Something went wrong</div>;
  }
}
```

### 6.2 Global Promise Rejection Handler

```typescript
// App.tsx
useEffect(() => {
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    secureLogger.critical(
      'Unhandled promise rejection',
      new Error(event.reason),
      'UnhandledRejection',
    );
  };

  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}, []);
```

## Passo 7: Exportação de Logs

### 7.1 Debug Panel / Settings

```typescript
// DebugPanel.tsx
import { secureLogger, auditLogger } from '@utils/logging';

export function DebugPanel() {
  const handleExportLogs = async () => {
    const logs = await secureLogger.exportLogs();
    downloadFile('logs.json', logs);
  };

  const handleExportAudit = async () => {
    const audit = await auditLogger.exportAsJSON();
    downloadFile('audit.json', audit);
  };

  const handleClearLogs = async () => {
    if (confirm('Tem certeza que deseja limpar todos os logs?')) {
      await secureLogger.clearLogs();
    }
  };

  return (
    <div className="debug-panel">
      <button onClick={handleExportLogs}>Export Logs</button>
      <button onClick={handleExportAudit}>Export Audit Trail</button>
      <button onClick={handleClearLogs}>Clear Logs</button>
      {/* Stats */}
      {secureLogger.printSummary()}
    </div>
  );
}
```

### 7.2 Compliance Export

```typescript
// compliance.ts
import { auditLogger, secureLogger } from '@utils/logging';

export async function generateComplianceReport(year: number) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Compliance events
  const events = auditLogger.getComplianceEvents(startDate, endDate);

  // Statistics
  const stats = auditLogger.getStats();

  // Export
  const report = {
    year,
    generatedAt: new Date().toISOString(),
    statistics: stats,
    events: events,
    totalEvents: events.length,
    highSeverityEvents: events.filter(e => e.severity === 'high').length,
    criticalEvents: events.filter(e => e.severity === 'critical').length,
  };

  return report;
}
```

## Passo 8: Performance & Monitoramento

### 8.1 Monitorar Logs

```typescript
// useLogMonitoring hook
import { useEffect } from 'react';
import { secureLogger } from '@utils/logging';

export function useLogMonitoring() {
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = secureLogger.getStats();

      // Alertar se muitos erros
      if (stats.byLevel[LogLevel.ERROR] > 10) {
        console.warn('High error rate detected');
      }

      // Log de monitoramento
      console.log('Log statistics:', stats);
    }, 60000); // A cada minuto

    return () => clearInterval(interval);
  }, []);
}
```

### 8.2 Performance Tracking

```typescript
import { secureLogger } from '@utils/logging';

export function trackPerformance(operationName: string) {
  const startTime = performance.now();

  return () => {
    const duration = performance.now() - startTime;
    secureLogger.info('Operation completed', {
      operationName,
      durationMs: Math.round(duration),
    });
  };
}

// Uso
const stopTracking = trackPerformance('data_fetch');
await fetchData();
stopTracking();
```

## Passo 9: Teste de Masking

### 9.1 Testar Masking Localmente

```typescript
// Test masking before production
import { logMasker } from '@utils/logging';

const testData = {
  password: 'secret123',
  email: 'john@example.com',
  creditCard: '4532-1234-5678-9010',
  token: 'Bearer eyJhbGciOiJIUzI1NiJ9',
};

const masked = logMasker.maskObject(testData);
console.log(masked);
// Verificar que dados sensíveis foram mascarados
```

### 9.2 Teste de Configuração

```typescript
// Verificar que configuração está correta
import { getLoggingConfig } from '@utils/logging/config.example';

const config = getLoggingConfig('production');
console.log('Logger config:', config.logger['config']);
console.log('Masking enabled:', config.masker['config'].maskPasswords);
```

## Passo 10: Cleanup e Desinicialização

### 10.1 Cleanup na App

```typescript
// App.tsx
import { secureLogger } from '@utils/logging';

export function App() {
  useEffect(() => {
    return async () => {
      // Flush de logs pendentes
      await secureLogger.flushManually();
      
      // Limpeza
      await secureLogger.destroy();
    };
  }, []);

  return (
    // sua app
  );
}
```

## Checklist de Implementação

- [ ] Importar o logger
- [ ] Configurar nível mínimo
- [ ] Adicionar logging em componentes chave
- [ ] Implementar error boundaries
- [ ] Setup de audit logging
- [ ] Configurar Sentry (se produção)
- [ ] Adicionar environment variables
- [ ] Testar masking
- [ ] Implementar cleanup
- [ ] Testar exportação de logs
- [ ] Documentar padrões de log
- [ ] Treinar equipe
- [ ] Fazer review de segurança
- [ ] Deploy para staging
- [ ] Testar em staging
- [ ] Deploy para produção

## Troubleshooting

### Logs não aparecem

```typescript
// 1. Verificar nível de log
const level = secureLogger.getMinLevel();
console.log('Min level:', level);

// 2. Verificar console
secureLogger.updateConfig({ enableConsole: true });

// 3. Verificar storage
const logs = secureLogger.getLogs();
console.log('Total logs:', logs.length);
```

### Dados não estão sendo mascarados

```typescript
// 1. Verificar masker
import { logMasker } from '@utils/logging';
const result = logMasker.mask('password=secret');
console.log(result);

// 2. Verificar configuração
const config = logMasker.constructor;
console.log('Masking config:', config);
```

### Remote logging não funciona

```typescript
// 1. Verificar endpoint
const config = secureLogger['config'];
console.log('Remote endpoint:', config.remoteEndpoint);

// 2. Flush manual
await secureLogger.flushManually();

// 3. Verificar network
// Abra DevTools > Network para ver requisições
```

## Próximas Etapas

1. Ler [README.md](./README.md) para documentação completa
2. Ler [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) para guia de segurança
3. Ver [examples.ts](./examples.ts) para 12 exemplos práticos
4. Executar testes: `npm test -- __tests__/logMasking.test.ts`
5. Revisar [config.example.ts](./config.example.ts) para configurações

## Suporte

Para dúvidas ou problemas:
1. Verificar README.md
2. Ver exemplos em examples.ts
3. Executar testes
4. Contactar o time de desenvolvimento

---

**Criado**: 2024-01-15  
**Versão**: 1.0.0  
**Mantém**: Security & Compliance Team
