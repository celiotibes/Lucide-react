# API REST - Legal Automation Tool

Documentação completa dos endpoints da API REST.

## Base URL

```
http://localhost:3000/api/v1
```

## Autenticação

Todos os endpoints (exceto `/health`) requerem autenticação via JWT:

```bash
Authorization: Bearer <jwt_token>
```

## Status Codes

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 201 | Criado |
| 400 | Erro de validação |
| 401 | Não autenticado |
| 403 | Não autorizado |
| 404 | Não encontrado |
| 429 | Rate limit excedido |
| 500 | Erro interno do servidor |

## Endpoints

### Health Check

```
GET /health
```

Retorna status de saúde do servidor.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "environment": "development"
}
```

---

### Autenticação

#### Login

```
POST /auth/login
```

**Body:**
```json
{
  "email": "advogado@example.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "userId": "user-123",
  "email": "advogado@example.com",
  "oabNumber": "123456",
  "oabState": "PR",
  "nextStep": "2fa_required"
}
```

#### Criar Desafio 2FA

```
POST /auth/2fa/challenge
```

**Body:**
```json
{
  "method": "totp"
}
```

**Resposta:**
```json
{
  "challengeId": "challenge-456",
  "method": "totp",
  "qrCode": "data:image/png;base64,...",
  "expiresIn": 300
}
```

#### Verificar 2FA

```
POST /auth/2fa/verify
```

**Body:**
```json
{
  "challengeId": "challenge-456",
  "code": "123456"
}
```

**Resposta:**
```json
{
  "sessionId": "sess-789",
  "token": "eyJhbGc...",
  "expiresIn": 86400,
  "refreshToken": "ref-token-123"
}
```

#### Upload de Certificado

```
POST /auth/certificate/upload
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: Arquivo .pfx
- `password`: Senha do certificado

**Resposta:**
```json
{
  "fingerprint": "a1b2c3...",
  "subject": "CN=Nome",
  "validFrom": "2023-01-01T00:00:00Z",
  "validTo": "2026-01-01T00:00:00Z",
  "uploadedAt": "2024-01-15T10:30:00Z"
}
```

#### Listar Certificados

```
GET /auth/certificates
```

**Resposta:**
```json
[
  {
    "fingerprint": "a1b2c3...",
    "subject": "CN=Nome",
    "validFrom": "2023-01-01T00:00:00Z",
    "validTo": "2026-01-01T00:00:00Z",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
]
```

#### Deletar Certificado

```
DELETE /auth/certificates/{fingerprint}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Certificado removido"
}
```

---

### Processos

#### Buscar Processo

```
GET /processes/:number
```

**Resposta:**
```json
{
  "number": "0000001-12.2023.8.26.0100",
  "cnj": "0000001-12.2023.8.26.0100",
  "tribunal": "TJSP",
  "status": "Em tramitação",
  "subject": "Ação Ordinária",
  "parties": [...],
  "filingDate": "2023-01-15T00:00:00Z",
  "lastUpdate": "2024-01-15T10:30:00Z"
}
```

#### Pesquisar Processos

```
GET /processes/search?partyName=João Silva&limit=10
```

**Parâmetros:**
- `partyName`: Nome da parte
- `subject`: Assunto
- `startDate`: Data início (YYYY-MM-DD)
- `endDate`: Data fim (YYYY-MM-DD)
- `limit`: Limite de resultados
- `offset`: Paginação

**Resposta:**
```json
{
  "total": 25,
  "limit": 10,
  "offset": 0,
  "results": [...]
}
```

#### Obter Movimentações

```
GET /processes/:number/movements
```

**Resposta:**
```json
[
  {
    "date": "2024-01-15T10:30:00Z",
    "description": "Petição recebida",
    "status": "Concluída"
  }
]
```

#### Download de Documentos

```
GET /processes/:number/documents/:documentId/download
```

**Resposta:** Arquivo binário com headers apropriados

---

### Projudi

#### Obter Dados do Processo

```
GET /projudi/processes/:number
```

#### Buscar Processos

```
GET /projudi/search?query=João Silva
```

#### Download de Documento

```
GET /projudi/processes/:number/documents/:docId/download
```

#### Enviar Petição

```
POST /projudi/petitions
Content-Type: multipart/form-data
```

**Form Data:**
- `processNumber`: Número do processo
- `documentType`: Tipo de documento
- `description`: Descrição
- `content`: Arquivo RTF com conteúdo
- `attachments`: Múltiplos anexos (opcional)

**Resposta:**
```json
{
  "protocolo": "2024011500001",
  "dataProtocolo": "2024-01-15",
  "sucesso": true,
  "mensagem": "Petição enviada"
}
```

---

### eProc

#### Obter Dados do Processo

```
GET /eproc/processes/:number
```

#### Buscar Processos

```
GET /eproc/search?query=João Silva
```

#### Download de Documento

```
GET /eproc/processes/:number/documents/:docId/download
```

#### Enviar Petição

```
POST /eproc/petitions
Content-Type: multipart/form-data
```

---

### Peticionar (Genérico)

#### Listar Petições

```
GET /petitions
```

**Parâmetros:**
- `status`: draft, pending, submitted, rejected
- `tribunal`: projudi, eproc
- `limit`: Limite
- `offset`: Paginação

**Resposta:**
```json
{
  "total": 5,
  "results": [
    {
      "id": "pet-123",
      "processNumber": "0000001-12.2023.8.26.0100",
      "title": "Petição de Penhora",
      "type": "intermediate",
      "status": "draft",
      "tribunal": "projudi",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Obter Petição

```
GET /petitions/:id
```

#### Criar Petição (Rascunho)

```
POST /petitions
Content-Type: application/json
```

**Body:**
```json
{
  "processNumber": "0000001-12.2023.8.26.0100",
  "title": "Petição de Penhora",
  "type": "intermediate",
  "content": "Requerer a penhora de bens...",
  "tribunal": "projudi"
}
```

#### Atualizar Petição

```
PUT /petitions/:id
```

#### Deletar Petição

```
DELETE /petitions/:id
```

#### Enviar Petição

```
POST /petitions/:id/submit
Content-Type: multipart/form-data
```

**Form Data:**
- `certificateFingerprint`: Fingerprint do certificado
- `certificatePassword`: Senha do certificado
- `attachments`: Anexos (opcional)

**Resposta:**
```json
{
  "id": "pet-123",
  "status": "submitted",
  "result": {
    "protocolNumber": "2024011500001",
    "protocolDate": "2024-01-15T10:30:00Z",
    "status": "Enviada",
    "message": "Petição enviada com sucesso"
  }
}
```

---

## Erros

### Formato de Erro

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Email inválido",
  "details": {
    "field": "email",
    "issue": "formato"
  }
}
```

### Códigos de Erro Comuns

| Código | Mensagem | Solução |
|--------|----------|---------|
| VALIDATION_ERROR | Validação falhou | Verificar campos obrigatórios |
| AUTHENTICATION_ERROR | Token inválido | Fazer login novamente |
| AUTHORIZATION_ERROR | Acesso negado | Verificar permissões |
| CERTIFICATE_NOT_FOUND | Certificado não encontrado | Upload do certificado |
| RATE_LIMIT_EXCEEDED | Limite excedido | Aguardar e tentar de novo |
| PROJUDI_ERROR | Erro Projudi | Verificar log do servidor |
| EPROC_ERROR | Erro eProc | Verificar log do servidor |
| DATAJUD_ERROR | Erro DataJud | Verificar API key |

---

## Rate Limiting

- 100 requisições por 15 minutos por IP
- Headers de resposta indicam limite:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890
```

---

## Paginação

```
GET /processes/search?limit=10&offset=0
```

**Resposta:**
```json
{
  "total": 250,
  "limit": 10,
  "offset": 0,
  "nextOffset": 10,
  "results": [...]
}
```

---

## Filtragem e Busca

### Operadores Suportados

```
?field=value           // Igualdade
?field=value1,value2   // OR
?field[gte]=2024-01-01 // Maior ou igual (datas)
?field[lte]=2024-01-31 // Menor ou igual (datas)
```

### Exemplo

```
GET /processes/search?status=active,inactive&startDate[gte]=2024-01-01
```

---

## Webhooks (Futuro)

```
POST /webhooks
```

Body:
```json
{
  "url": "https://seu-dominio.com/webhook",
  "events": ["petition.submitted", "process.updated"],
  "active": true
}
```

---

## FASE 1: Peticionamento Eletrônico Robusto (NEW)

### Validar Conformidade de Petição

```
POST /petitions/:id/validate-conformance
```

Valida a petição contra as regras de conformidade do tribunal, verificando:
- Estrutura (título, conteúdo obrigatório)
- Formato (caracteres válidos, tamanho)
- Requisitos específicos do tribunal
- Prazos
- Partes (autor e réu)
- Anexos

**Resposta (Sucesso - 200):**
```json
{
  "status": "success",
  "validation": {
    "valid": true,
    "score": 95,
    "errors": [],
    "warnings": [],
    "details": [
      {
        "check": "title_required",
        "status": "passed"
      },
      {
        "check": "content_minimum_length",
        "status": "passed"
      }
    ]
  }
}
```

**Resposta (Falha - 400):**
```json
{
  "status": "success",
  "validation": {
    "valid": false,
    "score": 45,
    "errors": [
      {
        "code": "content_required",
        "message": "Conteúdo da petição é obrigatório",
        "field": "content",
        "tribunal": "tjsc"
      }
    ],
    "warnings": [],
    "details": []
  }
}
```

### Formatar Petição para Tribunal

```
POST /petitions/:id/format
```

Converte a petição para o formato específico do tribunal:
- TJSC: RTF com cabeçalho obrigatório
- TJPR: XML estruturado
- TJAL: PDF padrão
- Outros: PDF com adaptação automática

**Resposta (200):**
```json
{
  "status": "success",
  "formatted": {
    "tribunal": "tjsc",
    "contentType": "rtf",
    "signatureFormat": "pades",
    "attachmentCount": 2,
    "metadata": {
      "processNumber": "0000001-00.2024.1.00.0000",
      "oabNumber": "123456/SP",
      "causeValue": 50000,
      "tribunal": "tjsc"
    }
  }
}
```

### Enviar Petição com Retry Automático

```
POST /petitions/:id/submit
```

Pipeline completo de submissão:
1. **Validação de conformidade** - Verifica regras do tribunal
2. **Formatação** - Converte para formato específico
3. **Assinatura digital** - Assina com certificado
4. **Submissão com retry** - Envia com exponential backoff
5. **Rastreamento** - Armazena protocolo e status

**Body:**
```json
{
  "certificatePassword": "senha-do-certificado"
}
```

**Resposta (Sucesso - 200):**
```json
{
  "status": "submitted",
  "result": {
    "success": true,
    "protocolo": "2024011500001",
    "error": null,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "attempt": 1,
    "retryable": false,
    "validationScore": 95
  }
}
```

**Resposta (Falha mas recuperável - 500):**
```json
{
  "status": "submission_failed",
  "result": {
    "success": false,
    "protocolo": "",
    "error": "Timeout após 30s",
    "timestamp": "2024-01-15T10:30:05.000Z",
    "attempt": 3,
    "retryable": true,
    "validationScore": 95
  }
}
```

**Resposta (Validação falhou - 400):**
```json
{
  "status": "validation_failed",
  "validation": {
    "valid": false,
    "errors": [
      {
        "code": "oab_number_required",
        "message": "OAB é obrigatória para este tribunal",
        "field": "oabNumber",
        "tribunal": "tjsc"
      }
    ],
    "warnings": [],
    "score": 60
  }
}
```

### Obter Status de Submissão e Circuit Breaker

```
GET /petitions/:id/submission-status
```

Retorna o status da petição e informações de circuit breaker do tribunal.

**Resposta (200):**
```json
{
  "status": "success",
  "petition": {
    "id": "petition-123",
    "status": "submitted",
    "protocolo": "2024011500001",
    "submittedAt": "2024-01-15T10:30:00.000Z",
    "lastError": null,
    "attempts": 1
  },
  "tribunal": "tjsc",
  "circuitBreaker": {
    "status": "closed",
    "failureCount": 0,
    "lastFailureTime": 0,
    "successCount": 5,
    "threshold": 5,
    "timeout": 60000
  }
}
```

### Tribunal Support Matrix

| Tribunal | Content Type | Signature | Max Attachments | Max Size |
|----------|--------------|-----------|-----------------|----------|
| TJSC | RTF | PAdES | 10 | 50MB |
| TJPR | XML | XAdES | 15 | 100MB |
| TJAL | PDF | PAdES | 8 | 25MB |
| TJSP | PDF | PAdES | 10 | 50MB |
| TJRS | PDF | PAdES | 10 | 50MB |
| TJMG | PDF | PAdES | 12 | 60MB |
| TRF4 | XML | XAdES | 10 | 50MB |
| JFPR | PDF | PAdES | 10 | 50MB |
| JFSC | PDF | PAdES | 10 | 50MB |

### Validation Rules

#### Obrigatório para todos os tribunais
- `title` - Título da petição (min 1 caractere)
- `content` - Conteúdo (min 100, max 1,000,000 caracteres)
- `processNumber` - Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
- `subject` - Assunto da petição
- `plaintiff` - Nome do autor
- `defendant` - Nome do réu
- `lawyerName` - Nome do advogado

#### Obrigatório por tribunal
| Tribunal | OAB | Cause Value | Priority |
|----------|-----|-------------|----------|
| TJSC | ✅ | ✅ | ❌ |
| TJPR | ✅ | ✅ | ✅ |
| TJAL | ❌ | ❌ | ❌ |
| Outros | ✅ | ✅ | ❌ |

### Circuit Breaker Behavior

O sistema monitora a disponibilidade de cada tribunal usando circuit breaker:

**Estados:**
- `closed` - Tribunal disponível, requisições normais
- `open` - Tribunal indisponível após 5 falhas consecutivas
- `half-open` - Testando se tribunal recuperou após timeout de 60s

**Comportamento:**
1. Primeira falha → failureCount = 1
2. Falha após timeout → failureCount = 2
3. 5 falhas consecutivas → estado = "open"
4. Após 60 segundos → estado = "half-open" (teste 1 requisição)
5. Sucesso em half-open → estado = "closed", failureCount = 0

### Error Codes

#### Retriable Errors (auto-retry)
- `timeout` - Timeout na requisição
- `ECONNREFUSED` - Conexão recusada
- `ECONNRESET` - Conexão resetada
- `429` - Rate limit (será retentado)
- `502` - Bad Gateway
- `503` - Service Unavailable
- `504` - Gateway Timeout

#### Non-Retriable Errors (fail immediately)
- `400` - Bad Request (validação)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `405` - Method Not Allowed

### Retry Strategy

Exponential backoff com jitter:
```
Tentativa 1: Imediato
Tentativa 2: Aguarda 1s
Tentativa 3: Aguarda 2s
Tentativa 4: Aguarda 4s
Tentativa 5: Aguarda 8s
Tentativa 6: Aguarda 16s
```

Máximo: 5 tentativas, timeout de 30s por requisição
