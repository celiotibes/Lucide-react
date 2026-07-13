# Phase 7: Security Hardening - Complete Guide

## Overview

Phase 7 implementa camadas avançadas de segurança para a plataforma de automação jurídica, incluindo gerenciamento de chaves de API, criptografia de dados sensíveis, autenticação robusta e auditoria de compliance.

## Core Components

### 1. API Key Service

Gerenciamento centralizado de chaves de API com suporte a:
- Geração segura de chaves (SHA256 hashing)
- Validação com verificação de hash
- Rate limiting por chave
- Expiração automática de chaves
- Armazenamento em Redis com TTL de 1 ano

#### Características

```typescript
// Gerar nova chave de API
const { key, keyInfo } = await apiKeyService.generateApiKey(
  'Production API', // name
  ['read:cases', 'write:clients'], // scopes
  1000, // rateLimitPerHour
  90 // expiresInDays (opcional)
);

// Validar chave
const keyInfo = await apiKeyService.validateApiKey(rawKey);

// Verificar escopo
const hasScope = await apiKeyService.hasScope(rawKey, 'write:cases');

// Verificar rate limit
const withinLimit = await apiKeyService.checkRateLimit(keyInfo.id);

// Revogar chave
await apiKeyService.revokeApiKey(keyId);
```

#### Scopes Disponíveis

- `read:cases` - Ler casos jurídicos
- `write:cases` - Criar/atualizar casos
- `read:clients` - Ler dados de clientes
- `write:clients` - Criar/atualizar clientes
- `read:contracts` - Ler contratos
- `write:contracts` - Criar/atualizar contratos
- `read:invoices` - Ler faturas
- `write:invoices` - Criar/atualizar faturas
- `read:analytics` - Ler analytics
- `write:analytics` - Modificar analytics
- `admin:keys` - Gerenciar chaves de API
- `admin:audit` - Acessar logs de auditoria

### 2. Encryption Service

Criptografia AES-256-GCM para dados sensíveis:
- CPF (Cadastro de Pessoas Físicas)
- CNPJ (Cadastro Nacional da Pessoa Jurídica)
- Dados bancários
- Qualquer dado sensível

#### Características

```typescript
// Encriptar CPF
const encrypted = encryptionService.encryptCPF('123.456.789-00');
// Result: { encrypted: "...:...", iv: "...", algorithm: "aes-256-gcm" }

// Decriptar CPF
const decrypted = encryptionService.decryptCPF(encrypted);
// Result: "123.456.789-00"

// Encriptar dados bancários
const bankData = {
  accountNumber: '12345678',
  bankCode: '001',
  routingNumber: '0001'
};
const encrypted = encryptionService.encryptBankData(bankData);

// Decriptar dados bancários
const decrypted = encryptionService.decryptBankData(encrypted);

// Gerar e verificar hash
const hash = encryptionService.generateHash('data');
const isValid = encryptionService.verifyIntegrity('data', hash);
```

#### Configuração

```bash
# .env
CERT_ENCRYPTION_KEY=seu-segredo-de-256-bits-ou-mais
DATABASE_URL=postgres://...
```

**Nota:** A chave mestra é derivada do `CERT_ENCRYPTION_KEY` usando scrypt com salt do `DATABASE_URL`.

### 3. API Key Middleware

Middleware Express para autenticação de chaves de API:

```typescript
import { verifyApiKey, requireScope } from '@middlewares/apiKeyMiddleware';

// Validar API key
app.use('/api/protected', verifyApiKey);

// Validar escopo específico
app.get('/api/cases', requireScope('read:cases'), handler);

// Suportar JWT ou API Key
app.use('/api/flexible', verifyJwtOrApiKey);
```

#### Validação

A middleware valida:
1. Presença de header `X-API-Key`
2. Validade da chave (não expirada)
3. Status ativo da chave
4. Taxa de requisições (rate limit)
5. Hash da chave

### 4. Audit Log Service

Logging centralizado de todas as ações sensíveis:

```typescript
// Log genérico
await auditLogService.log({
  action: 'UPDATE_CASE',
  entityType: 'Case',
  entityId: caseId,
  userId: user.id,
  ipAddress: req.ip,
  changes: { before, after },
  status: 'success'
});

// Log de criação
await auditLogService.logCreate(
  'Client',
  clientId,
  clientData,
  userId,
  ipAddress
);

// Log de erro
await auditLogService.logError(
  'PAYMENT_PROCESSING',
  'Invoice',
  invoiceId,
  error.message,
  userId,
  ipAddress
);

// Obter logs de entidade
const logs = await auditLogService.getEntityLogs(entityId, 50);

// Gerar relatório de compliance
const report = await auditLogService.generateComplianceReport(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);
```

#### Retenção de Dados

- Logs armazenados em Redis com TTL de 90 dias
- Backup local em arquivos de log
- Conformidade com LGPD (Lei Geral de Proteção de Dados)

## REST API Endpoints

### API Key Management

#### Gerar Nova Chave
```
POST /api/v1/apikeys
Authorization: Bearer <jwt-token>

{
  "name": "Production API",
  "scopes": ["read:cases", "write:cases"],
  "rateLimitPerHour": 1000,
  "expiresInDays": 90
}

Response:
{
  "success": true,
  "data": {
    "id": "key_uuid",
    "name": "Production API",
    "key": "key_uuid_random-hex-string",
    "scopes": ["read:cases", "write:cases"],
    "rateLimitPerHour": 1000,
    "expiresAt": "2024-10-20T00:00:00Z",
    "createdAt": "2024-07-20T00:00:00Z"
  }
}
```

#### Obter Informações de Chave
```
GET /api/v1/apikeys/:keyId
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "data": {
    "id": "key_uuid",
    "name": "Production API",
    "scopes": ["read:cases", "write:cases"],
    "rateLimitPerHour": 1000,
    "isActive": true,
    "lastUsedAt": "2024-07-20T10:30:00Z",
    "expiresAt": "2024-10-20T00:00:00Z"
  }
}
```

#### Atualizar Scopes
```
PATCH /api/v1/apikeys/:keyId
Authorization: Bearer <jwt-token>

{
  "scopes": ["read:cases", "read:clients"]
}

Response:
{
  "success": true,
  "message": "Scopes atualizados com sucesso"
}
```

#### Revogar Chave
```
DELETE /api/v1/apikeys/:keyId
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "message": "Chave revogada com sucesso"
}
```

### Audit Logging

#### Obter Logs de Auditoria
```
GET /api/v1/audit-logs?entityId=client_123&limit=50
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "audit_1234567890_abc123",
      "timestamp": "2024-07-20T10:30:00Z",
      "action": "UPDATE_CLIENT",
      "entityType": "Client",
      "entityId": "client_123",
      "userId": "user_456",
      "ipAddress": "192.168.1.1",
      "changes": {
        "before": { "status": "active" },
        "after": { "status": "inactive" }
      },
      "status": "success"
    }
  ],
  "count": 1
}
```

#### Gerar Relatório de Compliance
```
GET /api/v1/compliance-report?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "data": {
    "totalLogs": 1250,
    "successCount": 1200,
    "failureCount": 50,
    "actions": {
      "CREATE_CLIENT": 100,
      "UPDATE_CLIENT": 500,
      "DELETE_CLIENT": 25
    },
    "users": {
      "user_123": 450,
      "user_456": 750
    }
  }
}
```

## Usage Examples

### Usando API Key para Requests

```bash
# Usando curl
curl -X GET https://api.example.com/api/v1/cases \
  -H "X-API-Key: key_uuid_random-hex-string"

# Usando fetch em JavaScript
const response = await fetch('https://api.example.com/api/v1/cases', {
  headers: {
    'X-API-Key': 'key_uuid_random-hex-string'
  }
});

const data = await response.json();
```

### Protegendo Dados Sensíveis

```typescript
import { encryptionService } from '@services/EncryptionService';

// Ao salvar dados no banco
const client = {
  name: 'John Doe',
  cpf: encryptionService.encryptCPF('123.456.789-00'),
  bankData: encryptionService.encryptBankData({
    accountNumber: '12345678',
    bankCode: '001'
  })
};

await clientRepository.save(client);

// Ao recuperar dados
const storedClient = await clientRepository.findById(clientId);
const decryptedCPF = encryptionService.decryptCPF(storedClient.cpf);
const decryptedBank = encryptionService.decryptBankData(storedClient.bankData);
```

## Security Best Practices

### 1. Gerenciamento de Chaves

- ✅ **Faça:** Regenere chaves periodicamente (a cada 90 dias)
- ✅ **Faça:** Use escopos específicos, nunca `*`
- ✅ **Faça:** Mantenha a chave secreta em variáveis de ambiente
- ❌ **Não faça:** Commitar chaves no repositório
- ❌ **Não faça:** Compartilhar chaves entre ambientes
- ❌ **Não faça:** Usar chaves padrão em produção

### 2. Criptografia

- ✅ **Faça:** Criptografar CPF, CNPJ, dados bancários
- ✅ **Faça:** Usar chave mestra forte (256+ bits)
- ✅ **Faça:** Rotacionar chaves anualmente
- ❌ **Não faça:** Armazenar chaves no banco de dados
- ❌ **Não faça:** Usar criptografia reversível para senhas
- ❌ **Não faça:** Logar dados criptografados em texto plano

### 3. Auditoria

- ✅ **Faça:** Logar todas as ações sensíveis
- ✅ **Faça:** Manter logs por 90+ dias
- ✅ **Faça:** Monitorar falhas de autenticação
- ✅ **Faça:** Gerar relatórios de compliance regularmente
- ❌ **Não faça:** Deletar logs antigos sem arquivo
- ❌ **Não faça:** Permitir acesso direto a logs sem autenticação
- ❌ **Não faça:** Ignorar falhas de validação

### 4. Rate Limiting

- ✅ **Faça:** Definir limites apropriados por escopo
- ✅ **Faça:** Monitorar abusos
- ✅ **Faça:** Revogar chaves suspeitas
- ❌ **Não faça:** Limites muito altos (1000000+/hora)
- ❌ **Não faça:** Ignorar alertas de rate limit

## Troubleshooting

### Erro: "API key ausente"
**Causa:** Header `X-API-Key` não foi enviado  
**Solução:** Adicione o header nas suas requisições

```bash
curl -X GET https://api.example.com/api/v1/cases \
  -H "X-API-Key: sua-chave-aqui"
```

### Erro: "API key inválida ou expirada"
**Causa:** Chave expirou ou foi revogada  
**Solução:** Gere uma nova chave ou estenda a expiração

```bash
POST /api/v1/apikeys
{
  "name": "Nova Chave",
  "scopes": ["read:cases"],
  "expiresInDays": 180
}
```

### Erro: "Rate limit excedido"
**Causa:** Limite de requisições por hora foi atingido  
**Solução:** Aguarde uma hora ou solicite limite maior

### Erro: "Escopo insuficiente"
**Causa:** Chave não tem permissão para acessar recurso  
**Solução:** Atualize scopes da chave via PATCH

```bash
PATCH /api/v1/apikeys/key_uuid
{
  "scopes": ["read:cases", "write:cases"]
}
```

## Performance

### Cache

- API key info: Redis cache com TTL 1 ano
- Rate limit tracking: Redis counter com TTL 1 hora
- Audit logs: Redis com TTL 90 dias

### Latências Típicas

- Validação de chave: 0.5-1ms (Redis)
- Verificação de rate limit: 0.5-1ms
- Encriptação: 2-5ms (AES-256-GCM)
- Logging de auditoria: 1-2ms

## Monitoring

### Métricas Importantes

1. **Taxa de validação de chaves**
   - Sucesso: % de validações bem-sucedidas
   - Falha: % de chaves inválidas/expiradas

2. **Rate limit violations**
   - Chaves que excedem limite
   - Padrões de abuso

3. **Audit logs**
   - Volume diário de logs
   - Proporção sucesso/falha
   - Ações mais frequentes

### Alertas Recomendados

- ⚠️ Taxa de falha de validação > 5%
- ⚠️ Taxa de rate limit violations > 10
- ⚠️ Falhas de criptografia
- ⚠️ Chaves com acesso anormalmente frequente

## Configuration

```bash
# .env
CERT_ENCRYPTION_KEY=sua-chave-mestra-segura-256-bits
DATABASE_URL=postgres://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu-secret-jwt
LOG_LEVEL=info
AUDIT_LOG_RETENTION_DAYS=90
```

## Dependencies

```bash
npm install crypto uuid ioredis pino
```

## Files Created

- ✅ `src/services/ApiKeyService.ts` - Gerenciamento de chaves
- ✅ `src/services/EncryptionService.ts` - Criptografia de dados
- ✅ `src/middlewares/apiKeyMiddleware.ts` - Validação de autenticação
- ✅ `src/services/AuditLogService.ts` - Logging de auditoria
- ✅ `src/api/routes/apiKeyRouter.ts` - Endpoints REST
- ✅ `SECURITY_HARDENING.md` - Documentação completa

## Next Steps

1. **Implementar OAuth2/OIDC**
   - Suporte a provedores terceiros
   - Social login (Google, GitHub)

2. **Rate Limiting Avançado**
   - Limites por usuário
   - Limites por recurso
   - Adaptive rate limiting

3. **Multi-Factor Authentication**
   - TOTP (Time-based One-Time Password)
   - Email verification
   - Security keys

4. **Secret Rotation**
   - Automática de chaves mestres
   - Histórico de versões
   - Zero-downtime rotation

## Compliance

### LGPD (Lei Geral de Proteção de Dados)
- ✅ Criptografia de dados pessoais
- ✅ Direito de exclusão (soft delete)
- ✅ Auditoria de acessos
- ✅ Retenção de logs 90 dias

### ISO 27001
- ✅ Autenticação forte (API Key + escopo)
- ✅ Controle de acesso (RBAC via scopes)
- ✅ Criptografia em repouso (AES-256-GCM)
- ✅ Logging e monitoramento

### PCI-DSS (Pagamento)
- ✅ Sem armazenamento de dados brutos
- ✅ Criptografia de dados sensíveis
- ✅ Auditoria de acessos

## Support

Para issues ou perguntas:
1. Verificar logs em `/var/log/legal-automation/`
2. Consultar Redis stats via `/api/v1/cache/redis/status`
3. Revisar compliance report em `/api/v1/compliance-report`
