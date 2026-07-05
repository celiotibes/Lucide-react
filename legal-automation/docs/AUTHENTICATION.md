# Autenticação - Legal Automation Tool

## Fluxo de Autenticação Completo

```mermaid
sequenceDiagram
    Cliente->>API: 1. Login (email/senha)
    API->>API: Validar credenciais
    API->>API: Criar desafio 2FA
    API-->>Cliente: QR Code TOTP + ID Desafio
    Cliente->>App Mobile: Adicionar chave
    App Mobile->>Cliente: Gerar código 6 dígitos
    Cliente->>API: 2. Verificar 2FA (código)
    API->>API: Validar código
    API->>API: Criar sessão + JWT
    API-->>Cliente: Token + Certificado
    Cliente->>API: 3. Upload Certificado Digital
    API->>API: Armazenar (criptografado)
    API-->>Cliente: Fingerprint + Status
    Cliente->>API: 4. Requisições autenticadas
    API->>API: Verificar JWT + Sessão
    API-->>Cliente: Resposta
```

## 1. Login Básico (Email/Senha)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "advogado@example.com",
    "password": "senha_segura_123"
  }'
```

**Resposta:**
```json
{
  "userId": "user-123",
  "email": "advogado@example.com",
  "oabNumber": "123456",
  "oabState": "PR"
}
```

## 2. 2FA - Criar Desafio TOTP

```bash
curl -X POST http://localhost:3000/api/v1/auth/2fa/challenge \
  -H "Authorization: Bearer <temp_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "totp"
  }'
```

**Resposta:**
```json
{
  "challengeId": "challenge-456",
  "method": "totp",
  "qrCode": "data:image/png;base64,iVBORw0KG...",
  "expiresIn": 300
}
```

### Adicionando QR Code no Autenticador

1. Abrir aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy, etc.)
2. Fazer scan do QR Code
3. Salvar a chave de backup em local seguro
4. Aplicativo gerará códigos 6 dígitos que mudam a cada 30 segundos

## 3. Verificar 2FA

```bash
curl -X POST http://localhost:3000/api/v1/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{
    "challengeId": "challenge-456",
    "code": "123456"
  }'
```

**Resposta:**
```json
{
  "sessionId": "sess-789",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "refreshToken": "ref-token-123"
}
```

## 4. Upload de Certificado Digital

```bash
curl -X POST http://localhost:3000/api/v1/auth/certificate/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -F "file=@/path/to/certificado.pfx" \
  -F "password=senha_certificado"
```

**Resposta:**
```json
{
  "fingerprint": "a1b2c3d4e5f6...",
  "subject": "CN=Nome Advogado,O=Tribunal",
  "issuer": "CN=AC Raiz,O=ICP-Brasil",
  "validFrom": "2023-01-01T00:00:00Z",
  "validTo": "2026-01-01T00:00:00Z",
  "uploadedAt": "2024-01-15T10:30:00Z"
}
```

## 5. Usar Token em Requisições

Todas as requisições subsequentes devem incluir o JWT:

```bash
curl -X GET http://localhost:3000/api/v1/processes/1234567890123456789 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Estrutura do JWT

```json
{
  "userId": "user-123",
  "email": "advogado@example.com",
  "oabNumber": "123456",
  "oabState": "PR",
  "certificateFingerprint": "a1b2c3d4e5f6...",
  "iat": 1705318200,
  "exp": 1705404600,
  "iss": "legal-automation",
  "sub": "user-123"
}
```

## Certificado Digital - Segurança

### Armazenamento
- Certificado .pfx é criptografado com AES-256-CBC
- Chave de criptografia derivada de `CERT_ENCRYPTION_KEY` + SHA256
- Armazenado em `./certs/{fingerprint}.json`

### Uso
- Nunca exposto em logs ou respostas
- Acessado apenas quando necessário para assinatura
- Requer senha para descriptografar

### Validação
```typescript
const isValid = await certificateManager.isValidCertificate(cert);
// Verifica se está dentro da validade (validFrom <= now <= validTo)
```

## Erros de Autenticação

| Código | Mensagem | Ação |
|--------|----------|------|
| 401 | Token inválido ou expirado | Fazer login novamente |
| 401 | 2FA falhou | Verificar código no autenticador |
| 404 | Certificado não encontrado | Fazer upload de novo certificado |
| 429 | Muitas tentativas falhas | Aguardar 15 minutos |

## Boas Práticas

1. **Nunca expor senhas**
   - Sempre usar HTTPS em produção
   - Never log passwords/tokens

2. **Certificado Digital**
   - Fazer backup em local seguro
   - Não compartilhar arquivo .pfx
   - Lembrar senha em local seguro

3. **Token JWT**
   - Armazenar em memória ou sessionStorage (nunca localStorage se possível)
   - Enviar apenas via HTTPS
   - Fazer refresh antes de expirar

4. **2FA**
   - Usar autenticador ao invés de SMS quando possível
   - Guardar backup codes em local seguro
   - Testar antes de usar em produção
