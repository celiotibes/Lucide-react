# Guia de Segurança do Sistema de Gerenciamento de Aluguéis

## Visão Geral de Segurança

Este documento descreve as práticas de segurança implementadas no sistema de sincronização de listagens e gerenciamento de aluguéis. Segue os melhores práticas de OWASP Top 10 e conformidade com GDPR.

## 1. Autenticação e Autorização

### 1.1 JWT (JSON Web Tokens)

**Implementação:**
- Tokens JWT com algoritmo HS256 (HMAC-SHA256)
- Secret key: mínimo 32 caracteres aleatórios
- Expiração: 24 horas para tokens de acesso
- Refresh tokens: 7 dias para renovação

**Código de Exemplo:**
```typescript
const token = jwt.sign(
  {
    userId: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 // 24h
  },
  process.env.JWT_SECRET,
  { algorithm: 'HS256' }
);
```

**Validação:**
- Verificar assinatura do token
- Validar expiração (exp claim)
- Validar issuer (iss) se necessário
- Verificar revogação em blacklist (para logout)

### 1.2 RBAC (Role-Based Access Control)

**Roles Implementados:**
- `admin`: acesso total a todas as funcionalidades
- `property_manager`: gerencia suas próprias propriedades e listagens
- `support_agent`: acesso a leads e tickets de suporte
- `viewer`: apenas leitura de dados públicos

**Middleware de Autorização:**
```typescript
function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

router.get('/admin/users', requireRole(['admin']), usersController);
```

### 1.3 Multi-Factor Authentication (MFA)

**TOTP (Time-based One-Time Password):**
- Implementar opcional com Google Authenticator/Authy
- Backup codes para recuperação (10 códigos)
- Armazenar secret no banco de dados (criptografado)

**Procedimento:**
1. Usuário ativa MFA no dashboard
2. Sistema gera secret QR code
3. Usuário escaneia com app autenticador
4. Validar 3 códigos consecutivos antes de ativar
5. Fornecer backup codes armazenados com segurança

## 2. Prevenção de Ataques

### 2.1 Injeção SQL

**Prevenção:**
- Usar prepared statements (parameterized queries)
- Nunca concatenar strings em queries

**Correto:**
```typescript
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
```

**Incorreto (NUNCA fazer):**
```typescript
const result = await pool.query(`
  SELECT * FROM users WHERE email = '${email}'
`);
```

### 2.2 Cross-Site Scripting (XSS)

**Prevenção:**
- Sanitizar entrada de usuário
- Escapar output em templates
- Content-Security-Policy headers

**Biblioteca Recomendada:**
```typescript
import xss from 'xss';

const cleanInput = xss(userInput, {
  whiteList: {},
  stripIgnoredTag: true,
});
```

**CSP Header:**
```
Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data: https:;
```

### 2.3 Cross-Site Request Forgery (CSRF)

**Prevenção:**
- CSRF tokens em formulários
- SameSite cookie attribute
- Validar origin header

**Middleware:**
```typescript
import csrfProtection from 'csurf';

const csrf = csrfProtection({ cookie: true });

app.use(csrf);
app.post('/form', csrf, (req, res) => {
  // Token validado automaticamente
});
```

### 2.4 Rate Limiting

**Implementação com Redis:**
```typescript
async function rateLimit(ip: string, limit: number = 100, window: number = 60) {
  const key = `rate:${ip}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, window);
  }
  
  if (count > limit) {
    throw new Error('Rate limit exceeded');
  }
}
```

**Endpoints Críticos (10 req/min):**
- POST /auth/login
- POST /auth/register
- POST /auth/reset-password
- POST /api/sync/trigger

**Endpoints Normais (100 req/min):**
- GET /api/listings
- POST /api/leads

### 2.5 Validação de Entrada

**Regras Gerais:**
- Validar tipo de dados (string, number, array, object)
- Validar comprimento (min/max)
- Validar formato (email, URL, phone)
- Validar enumerações (status, role)
- Rejeitar null/undefined quando obrigatório

**Validação com Joi/Zod:**
```typescript
const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  title: z.string().min(5).max(255),
  description: z.string().min(20).max(5000),
  price: z.number().positive(),
  status: z.enum(['active', 'inactive', 'archived']),
});

const validated = schema.parse(req.body);
```

## 3. Criptografia

### 3.1 Dados em Repouso

**Senha do Usuário:**
```typescript
import bcrypt from 'bcrypt';

const hash = await bcrypt.hash(password, 10);
const match = await bcrypt.compare(password, hash);
```

**Dados Sensíveis (API Keys, Tokens):**
- Criptografar com AES-256-GCM
- Armazenar chave de criptografia em secret manager (AWS KMS, HashiCorp Vault)

```typescript
import crypto from 'crypto';

function encryptField(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
```

### 3.2 Dados em Trânsito

**HTTPS/TLS:**
- TLS 1.2+ obrigatório
- Ciphers forte (ECDHE com AES-GCM)
- HSTS header (Strict-Transport-Security)
- Certificate pinning (opcional)

**Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 3.3 Hash de Dados

**Usar para:** Verificação de integridade (webhooks)

```typescript
import crypto from 'crypto';

function createSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Webhook receiver
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = createSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## 4. Gerenciamento de Secrets

### 4.1 Variáveis de Ambiente

**NUNCA fazer:**
- Committed secrets no git
- Hardcoded API keys
- Logs de dados sensíveis

**Fazer:**
- Usar .env (git-ignored)
- Usar secret manager em produção
- Validar presença de secrets na startup

```typescript
// Validar secrets na inicialização
const requiredSecrets = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'AIRBNB_API_KEY',
];

requiredSecrets.forEach(secret => {
  if (!process.env[secret]) {
    throw new Error(`Missing required environment variable: ${secret}`);
  }
});
```

### 4.2 Secret Manager (Produção)

**AWS Secrets Manager:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string) {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return response.SecretString;
}
```

**HashiCorp Vault:**
```typescript
import * as Vault from 'node-vault';

const vault = new Vault({ endpoint: process.env.VAULT_ADDR });

async function getSecret(path: string) {
  const result = await vault.read(path);
  return result.data.data;
}
```

## 5. Logging e Auditoria

### 5.1 O que Logar

**Fazer:**
- Tentativas de login (sucesso e falha)
- Mudanças de dados sensíveis
- Acessos a dados restritos
- Erros de segurança
- Eventos de auditoria (criação/update/delete)

**NÃO fazer:**
- Senhas em plain text
- Tokens completos
- Números de cartão
- Chaves SSH privadas

### 5.2 Logging Estruturado

```typescript
logger.info('user_login', {
  userId: user.id,
  email: user.email,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  timestamp: new Date().toISOString(),
  success: true,
});

logger.warn('failed_login_attempt', {
  email: email,
  ipAddress: req.ip,
  reason: 'invalid_password',
  attempts: failedAttempts,
});

logger.error('security_event', {
  type: 'sql_injection_attempt',
  ipAddress: req.ip,
  path: req.path,
  query: req.query,
  timestamp: new Date().toISOString(),
});
```

### 5.3 Log Retention

- 30 dias em aplicação (CloudWatch, Elasticsearch)
- 90 dias em storage frio (S3, GCS)
- 1 ano para auditoria legal (archive)

## 6. Conformidade GDPR

### 6.1 Direito ao Esquecimento

**Implementar:**
```typescript
async function deleteUserData(userId: string) {
  // Anonimizar dados pessoais
  await db.query(
    'UPDATE users SET email = $1, name = $2 WHERE id = $3',
    [`deleted-${userId}@example.com`, 'Deleted User', userId]
  );
  
  // Deletar dados associados
  await db.query('DELETE FROM leads WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM properties WHERE user_id = $1', [userId]);
  
  // Log auditoria
  logger.info('gdpr_deletion', { userId, timestamp: new Date() });
}
```

### 6.2 Data Portability

```typescript
async function exportUserData(userId: string) {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const properties = await db.query('SELECT * FROM properties WHERE user_id = $1', [userId]);
  const leads = await db.query('SELECT * FROM leads WHERE user_id = $1', [userId]);
  
  return {
    user: user.rows[0],
    properties: properties.rows,
    leads: leads.rows,
    exportedAt: new Date().toISOString(),
  };
}
```

### 6.3 Consentimento

- Obter consentimento explícito antes de processar dados
- Armazenar versão da política de privacidade aceita
- Permitir revogar consentimento a qualquer hora
- Não condicionar serviço a consentimento opcional

## 7. Infraestrutura

### 7.1 Network Security

**Firewall Rules:**
- Porta 22 (SSH): apenas IPs internos
- Porta 5432 (PostgreSQL): apenas pods da app
- Porta 6379 (Redis): apenas pods da app
- Porta 443 (HTTPS): aberto ao público
- Porta 80 (HTTP): redirecionar para HTTPS

**Kubernetes NetworkPolicy:**
```yaml
kind: NetworkPolicy
metadata:
  name: api-network-policy
spec:
  podSelector:
    matchLabels:
      app: rental-sync-api
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
  egress:
  - to:
    - podSelector: {}
```

### 7.2 Container Security

- Usar images base mínimas (alpine, distroless)
- Não rodar como root (uid 1001)
- Read-only filesystem quando possível
- Scan com Trivy para vulnerabilidades

```dockerfile
USER 1001:1001
RUN chmod -R 555 /app
VOLUME /tmp
```

### 7.3 Database Security

**Backup:**
- Criptografado com KMS
- Testado regularmente (restore test)
- Armazenado em região diferente

**Replicação:**
- Read replica para analytics
- Cascading replication para DR
- SSL entre primária e replica

**Acesso:**
- Usuário PostgreSQL com privilégios mínimos
- Sem acesso ao superuser
- Audit logging habilitado

```sql
CREATE USER rental_app WITH ENCRYPTED PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE rental_sync TO rental_app;
GRANT USAGE ON SCHEMA public TO rental_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rental_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rental_app;
```

## 8. Testes de Segurança

### 8.1 Ferramentas

- **SAST:** SonarQube, Checkmarx
- **Dependency Scanning:** npm audit, Snyk
- **Container Scanning:** Trivy, Clair
- **DAST:** OWASP ZAP, Burp Suite
- **Secret Scanning:** git-secrets, Gitleaks

### 8.2 Pipeline de CI/CD

```yaml
security:
  stage: security
  script:
    - npm audit --audit-level=moderate
    - npm run lint:security
    - trivy image --severity HIGH,CRITICAL $IMAGE_NAME
    - sonarqube-scanner
  allow_failure: false
```

## 9. Resposta a Incidentes de Segurança

**Procedimento:**
1. Isolar sistema comprometido
2. Preservar logs e evidências
3. Notificar usuários afetados (within 72h GDPR)
4. Investigação forense
5. Patch e remediação
6. Post-mortem e melhorias
7. Atualizar documentação

**Contatos:**
- security@rental-sync.com
- PagerDuty escalation
- Legal team notification

## 10. Checklist de Deployment

Antes de deployar em produção:

- [ ] Todos os secrets em secret manager
- [ ] HTTPS/TLS configurado com certificado válido
- [ ] WAF (Web Application Firewall) ativo
- [ ] Rate limiting ativo
- [ ] Logging e monitoring ativo
- [ ] Backups automatizados testados
- [ ] Disaster recovery testado
- [ ] Permissions e RBAC configurados
- [ ] Security headers presentes
- [ ] Scan de vulnerabilidades limpo
- [ ] Testes de segurança passaram
- [ ] Documentação atualizada
- [ ] Equipe treinada em procedimentos de segurança

## Referências

- OWASP Top 10: https://owasp.org/Top10/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- GDPR Compliance: https://gdpr-info.eu/
- Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/
- PostgreSQL Security: https://www.postgresql.org/docs/current/sql-syntax.html

## Suporte

Para questões de segurança, entre em contato com security@rental-sync.com

