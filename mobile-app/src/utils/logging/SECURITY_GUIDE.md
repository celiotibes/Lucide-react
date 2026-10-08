# Security Guide - Secure Logging System

Guia completo de segurança para o sistema de logging seguro.

## Dados NÃO Logados

O sistema está configurado para **NUNCA** logar:

### ✅ Sempre Mascarado

- ✅ Senhas completas
- ✅ Tokens de autenticação completos
- ✅ Chaves privadas (RSA, OpenSSH)
- ✅ Números de cartão de crédito (apenas últimos 4 dígitos)
- ✅ Social Security Numbers (SSN)
- ✅ Endereços de email (parcialmente mascarados)
- ✅ Números de telefone (parcialmente mascarados)
- ✅ Credenciais AWS (Access Keys & Secret Keys)
- ✅ Connection strings de banco de dados
- ✅ URLs com parâmetros sensíveis
- ✅ API Keys e secrets
- ✅ Refresh tokens
- ✅ Authorization headers completos

### ⚠️ Cuidado Necessário

Alguns dados podem exigir atenção especial:

- ⚠️ **Endereços IP**: Podem ser considerados PII em alguns contextos. Considere usar hashmaps em produção.
- ⚠️ **User IDs**: Peuvent révéler l'identité. Use IDs anônimos quando possível.
- ⚠️ **Timestamps**: Podem revelar padrões de comportamento.
- ⚠️ **Nomes de recursos**: Podem revelar estrutura de dados.

## Padrões de Segurança

### 1. Mínimo Privilégio de Informação

```typescript
// ❌ NÃO FAÇA ISTO
secureLogger.info('User data', {
  name: 'John Doe',
  email: 'john@example.com', // PII exposto
  ssn: '123-45-6789', // PII exposto
  balance: 5000, // Informação sensível
});

// ✅ FAÇA ISTO
secureLogger.logUserAction('data_viewed', 'user-profile', {
  resourceId: 'user-123-hash', // Use hash/ID ao invés de nome
  dataCategory: 'profile', // Tipo genérico
  timestamp: new Date().toISOString(),
});
```

### 2. Auditoria Segura

```typescript
// ✅ BOM - Log de segurança adequado
await auditLogger.logDataAccess(
  'user-id-hash',
  'record-id-hash',
  'HealthRecord',
  { duration: '5 minutes', action: 'viewed' },
);

// ❌ RUIM - Exposição de detalhes
await auditLogger.logEvent(
  AuditEventType.DATA_ACCESSED,
  'User john@example.com viewed medical records',
  { // Expõe email e tipo de dado!
    email: 'john@example.com',
    recordType: 'medical',
    SSN: '123-45-6789',
  },
);
```

### 3. Contexto de Usuário

```typescript
// ❌ NÃO FAÇA ISTO
secureLogger.info('Login successful', {
  userId: 'john@example.com',
  password: 'secret123', // Nunca log password
  token: 'bearereye...', // Nunca log token
});

// ✅ FAÇA ISTO
secureLogger.info('Login successful', {
  userId: 'user-123-hash', // Use hash/ID
  method: 'email',
  mfaUsed: true,
}, 'AuthService');
```

### 4. Dados de Pagamento

```typescript
// ❌ NÃO FAÇA ISTO
secureLogger.info('Payment', {
  cardNumber: '4532-1234-5678-9010',
  cvv: '123',
  expiryDate: '12/25',
  amount: 99.99,
});

// ✅ FAÇA ISTO
secureLogger.info('Payment processed', {
  cardLast4: '9010', // Sistema mascara automaticamente
  amount: 99.99,
  currency: 'USD',
  status: 'success',
}, 'PaymentService');
```

### 5. Dados de Saúde/Sensíveis

```typescript
// ❌ NÃO FAÇA ISTO
secureLogger.info('Health record accessed', {
  patientName: 'John Doe',
  diagnosis: 'Diabetes Type 2',
  medications: ['Metformin', 'Lisinopril'],
  labResults: { glucose: 145, creatinine: 1.2 },
});

// ✅ FAÇA ISTO
await auditLogger.logDataAccess(
  'user-hash',
  'record-id-hash',
  'HealthRecord',
  {
    recordType: 'clinical',
    category: 'lab_results',
    timestamp: new Date().toISOString(),
  },
);
```

## Conformidade GDPR

### 1. Direito ao Esquecimento

```typescript
// Limpar dados de um usuário
async function deleteUserData(userId: string) {
  // Remover eventos de auditoria (se legal)
  const userEvents = auditLogger.getEvents(undefined, userId);
  
  // Exportar para backup de compliance
  const backup = await auditLogger.exportAsJSON();
  
  // Limpar logs
  await secureLogger.clearLogs();
  
  secureLogger.info('User data deleted', {
    userId: hashUserId(userId),
  }, 'DataProtection');
}
```

### 2. Portabilidade de Dados

```typescript
// Exportar dados do usuário (sem PII sensível)
async function exportUserData(userId: string) {
  // Exportar audit trail
  const auditTrail = await auditLogger.exportAsJSON();
  
  // Filtrar eventos do usuário
  const userEvents = auditLogger.getEvents(undefined, userId);
  
  // Remover dados sensíveis
  const sanitized = userEvents.map(e => ({
    timestamp: e.timestamp,
    action: e.action,
    status: e.status,
    // Não incluir dados pessoais
  }));
  
  return sanitized;
}
```

### 3. Retenção de Dados

```typescript
// Configuração padrão: 30 dias de logs, 365 dias de audit
const config = {
  logger: new SecureLogger({
    retentionDays: 30, // GDPR compliant
  }),
  auditLogger: new AuditLogger({
    retentionDays: 365, // 1 ano para compliance
  }),
};

// Limpeza automática acontece quando dados expiram
```

## Proteção Contra Vazamento

### 1. Prevenção de SQL Injection em Logs

```typescript
// ❌ RISCO
secureLogger.info(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ SEGURO
secureLogger.info('Database query executed', {
  table: 'users',
  operation: 'select',
  conditions: ['id'], // Sem valores reais
}, 'Database');
```

### 2. Prevenção de XSS em Logs

```typescript
// ❌ RISCO
const userInput = '<script>alert("xss")</script>';
secureLogger.info('User input', { value: userInput });

// ✅ SEGURO (Logger sanitiza automaticamente)
secureLogger.info('User input received', {
  inputType: 'text',
  length: userInput.length, // Log apenas metadata
});
```

### 3. Prevenção de Escalação de Privilégio

```typescript
// ❌ RISCO - Loga token que pode ser reutilizado
secureLogger.info('Token generated', { token: 'Bearer abc...' });

// ✅ SEGURO
secureLogger.info('Token generated', {
  tokenType: 'bearer',
  expiresIn: 3600,
  scope: 'read:user',
}, 'AuthService');
```

## Práticas Recomendadas

### 1. Use Módulos para Contexto

```typescript
// Melhor rastreabilidade
secureLogger.info('Operation', data, 'PaymentService');
secureLogger.info('Operation', data, 'AuthService');
secureLogger.info('Operation', data, 'DataAccessService');
```

### 2. Níveis Apropriados

```typescript
// DEBUG - Apenas desenvolvimento
secureLogger.debug('Cache hit', { key: 'user-123' });

// INFO - Eventos normais
secureLogger.info('User logged in');

// WARN - Condições anormais
secureLogger.warn('API rate limit approaching');

// ERROR - Erros
secureLogger.error('Database connection failed', error);

// CRITICAL - Erros críticos de segurança
secureLogger.critical('Unauthorized access attempt', error);
```

### 3. Ações de Usuário sem PII

```typescript
// ✅ BOM - Sem exposição de dados pessoais
secureLogger.logUserAction('purchase', 'commerce', {
  productCount: 1,
  category: 'electronics',
  totalValue: 99.99,
  paymentMethod: 'card', // Tipo genérico
  deviceType: 'mobile',
});

// ❌ RUIM - Expõe dados sensíveis
secureLogger.logUserAction('purchase', 'commerce', {
  email: 'john@example.com',
  productID: 'prod-123',
  creditCard: '4532-1234-5678-9010',
});
```

### 4. Tratamento de Erros

```typescript
// ✅ BOM
try {
  // operação
} catch (error) {
  secureLogger.error('Operation failed', error, 'OperationName');
  await auditLogger.logSecurityAlert(
    'Operation failed',
    'medium',
    { operation: 'payment_processing' },
  );
}

// ❌ RUIM - Expõe stack trace com PII
catch (error) {
  console.log(error); // Pode conter dados sensíveis
}
```

## Checklist de Segurança

Antes de fazer deploy, verifique:

- [ ] Nenhuma senha em logs
- [ ] Nenhum token completo em logs
- [ ] Nenhum número de cartão completo em logs
- [ ] Nenhum SSN em logs
- [ ] Nenhum email pessoal completo em logs
- [ ] Nenhum número de telefone completo em logs
- [ ] Nenhuma chave privada em logs
- [ ] Masking está habilitado em produção
- [ ] Retenção de dados configurada (30 dias default)
- [ ] Audit logging habilitado
- [ ] Remote logging seguro
- [ ] Exports são protegidos
- [ ] Limpeza automática funcionando
- [ ] Testes de segurança passando

## Incidentes de Segurança

Se dados sensíveis forem acidentalmente logados:

```typescript
// 1. Detectar
const logs = secureLogger.getLogs();
const suspicious = logs.filter(l => 
  l.message.includes('password') || 
  l.metadata?.toString().includes('token')
);

// 2. Alertar
if (suspicious.length > 0) {
  await auditLogger.logSecurityAlert(
    'Sensitive data detected in logs',
    'critical',
    { count: suspicious.length, logs: suspicious },
  );
}

// 3. Limpar
await secureLogger.clearLogs();

// 4. Rotacionar credenciais
// Rotacione todos os tokens/senhas/chaves
```

## Testes de Segurança

```typescript
// Testar masking
import { logMasker } from './logMasking';

const sensitiveData = 'password=secret, token=Bearer abc123';
const masked = logMasker.mask(sensitiveData);

console.assert(
  !masked.includes('secret'),
  'Password não foi mascarado!'
);
console.assert(
  !masked.includes('abc123'),
  'Token não foi mascarado!'
);

// Testar object masking
const obj = {
  password: 'secret',
  email: 'john@example.com',
  creditCard: '4532-1234-5678-9010',
};

const maskedObj = logMasker.maskObject(obj);
console.assert(
  maskedObj.password === '[REDACTED]',
  'Password em objeto não foi mascarado!'
);
```

## Recursos Adicionais

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [GDPR PII Guidelines](https://gdpr-info.eu/)
- [NIST PII Guidance](https://www.nist.gov/publications/guide-protecting-confidentiality-personally-identifiable-information)
- [CWE-532: Insertion of Sensitive Information into Log File](https://cwe.mitre.org/data/definitions/532.html)

## Contato de Segurança

Para reportar vulnerabilidades:
1. NÃO publique em issues públicas
2. Contate security@example.com
3. Descreva o problema em detalhes
4. Aguarde confirmação antes de divulgar

---

**Última atualização**: 2024-01-15  
**Versão**: 1.0.0
