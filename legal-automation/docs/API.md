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

---

## Phase 3: Business Intelligence Avançado

### Analytics Endpoints

#### Dashboard Metrics

```
GET /analytics/dashboard
```

Retorna métricas agregadas do dashboard para análise de performance geral.

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `30d`)
  - `d` - dias (ex: `30d`, `90d`)
  - `w` - semanas (ex: `1w`, `4w`)
  - `m` - meses (ex: `1m`, `3m`)
  - `y` - anos (ex: `1y`)
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "period": {
      "startDate": "2024-11-05T00:00:00.000Z",
      "endDate": "2024-12-04T23:59:59.999Z"
    },
    "totalCases": 245,
    "successRate": {
      "value": 68.57,
      "trend": 5.2
    },
    "avgTimeToResolution": {
      "value": 32,
      "trend": -2.1
    },
    "costPerCase": {
      "value": 1250.50,
      "trend": 3.7
    },
    "tribunalComparison": [
      {
        "tribunal": "TJSC",
        "cases": 85,
        "successRate": 72.94,
        "avgTime": 28
      },
      {
        "tribunal": "TJPR",
        "cases": 160,
        "successRate": 66.25,
        "avgTime": 34
      }
    ],
    "casesByStatus": {
      "open": 120,
      "closed": 125,
      "pending": 0
    },
    "casesByType": {
      "civil": 150,
      "criminal": 60,
      "labor": 35
    },
    "monthlyTrend": [
      {
        "month": "2024-11",
        "cases": 245,
        "successes": 168,
        "rate": 68.57
      }
    ],
    "generatedAt": "2024-12-04T10:30:00.000Z"
  }
}
```

#### Lawyer Performance

```
GET /analytics/lawyer-performance/:lawyerId
```

Analisa performance de um advogado específico.

**Path Parameters:**
- `lawyerId`: ID do advogado

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `90d`)
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "lawyerId": "lawyer-123",
    "period": {
      "startDate": "2024-09-04T00:00:00.000Z",
      "endDate": "2024-12-04T23:59:59.999Z"
    },
    "totalCases": 42,
    "successRate": 78.57,
    "avgTimeToResolution": 24,
    "clientSatisfaction": 4.6,
    "costPerCase": 980.00,
    "ranking": 3,
    "casesTimeline": [
      {
        "date": "2024-11-01T00:00:00.000Z",
        "cases": 3,
        "successes": 2
      }
    ]
  }
}
```

#### Predict Case Outcome

```
POST /analytics/predict-outcome
```

Prediz o resultado provável de um caso usando ML.

**Body:**
```json
{
  "caseId": "case-456"
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "caseId": "case-456",
    "predictedOutcome": "ganho",
    "confidence": 0.76,
    "contributingFactors": {
      "tribunalHistoricSuccessRate": 0.72,
      "lawyerWinRate": 0.85,
      "caseAgeFactor": 0.5
    },
    "generatedAt": "2024-12-04T10:30:00.000Z"
  }
}
```

#### Jurisprudence Insights

```
GET /analytics/jurisprudence-insights/:caseId
```

Análise de jurisprudência similar para um caso.

**Path Parameters:**
- `caseId`: ID do caso

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "outcome": "ganho",
      "percentage": 68.5,
      "count": 37,
      "relatedCases": [
        {
          "numero": "0000001-12.2024.5.04.3800",
          "outcome": "ganho",
          "similarity": 0.92
        }
      ],
      "recommendation": "Forte probabilidade de ganho (68.5%). Recomenda-se proceder com confiança."
    },
    {
      "outcome": "perda",
      "percentage": 31.5,
      "count": 17,
      "relatedCases": [],
      "recommendation": "Probabilidade baixa de perda (31.5%). Recomenda-se análise cuidadosa."
    }
  ]
}
```

#### Tribunal Comparison

```
GET /analytics/tribunal-comparison
```

Compara performance entre tribunais.

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `90d`)
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "tribunal": "TJSC",
      "cases": 85,
      "successRate": 72.94,
      "avgTime": 28
    },
    {
      "tribunal": "TJPR",
      "cases": 160,
      "successRate": 66.25,
      "avgTime": 34
    }
  ]
}
```

#### Success Rate by Tribunal

```
GET /analytics/success-rate-by-tribunal
```

Taxa de sucesso agregada por tribunal.

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `90d`)
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "tribunal": "TJSC",
      "successRate": 72.94
    },
    {
      "tribunal": "TJPR",
      "successRate": 66.25
    },
    {
      "tribunal": "TJAL",
      "successRate": 58.33
    }
  ]
}
```

#### Trends Analysis

```
GET /analytics/trends
```

Análise de tendências temporais com granularidade configurável.

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `90d`)
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601
- `granularity` (opcional): Nível de detalhe (padrão: `daily`)
  - `daily` - Um ponto de dados por dia
  - `weekly` - Um ponto de dados por semana
  - `monthly` - Um ponto de dados por mês

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "period": "2024-11-01",
      "totalCases": 12,
      "successfulCases": 8,
      "successRate": 66.67,
      "avgResolutionTime": 28
    },
    {
      "period": "2024-11-02",
      "totalCases": 10,
      "successfulCases": 7,
      "successRate": 70.0,
      "avgResolutionTime": 32
    }
  ]
}
```

### ML Prediction Model

O modelo de predição utiliza uma abordagem weighted baseada em histórico:

```
confidence = (tribunal_rate * 0.4 + lawyer_rate * 0.4 + case_age_factor * 0.2)
outcome = "ganho" if confidence > 0.5 else "perda"
```

**Pesos:**
- `tribunalHistoricSuccessRate`: 40% - Taxa de sucesso histórica do tribunal
- `lawyerWinRate`: 40% - Taxa de vitória do advogado
- `caseAgeFactor`: 20% - Fator relacionado à idade do caso (0.6 para casos > 365 dias, 0.5 caso contrário)

### Analytics Data Integration

Os dados de análise são agregados a partir de múltiplas fontes:

1. **Phase 1 Data** - Petições eletrônicas e submissões
2. **Phase 2 Data** - Enriquecimento de processos via APIs
3. **Database** - Histórico de casos e outcomes

### Error Handling

**Erros comuns:**

| Erro | HTTP | Solução |
|------|------|--------|
| Período inválido | 400 | Use formato: 30d, 90d, 1y |
| Data inválida | 400 | Use formato ISO 8601 |
| Lawyer ID inválido | 400 | Verifique ID do advogado |
| Case ID não encontrado | 404 | Verifique ID do caso |
| Granularidade inválida | 400 | Use: daily, weekly, monthly |

### Performance Considerations

- Dashboard metrics são calculados sob demanda com caching implícito
- Tendências de longo prazo podem levar até 5 segundos para calcular
- Recomenda-se usar `granularity=monthly` para períodos > 1 ano
- ML predictions são executados em tempo real sem cache

---

## Phase 4: Produtividade & UX (Kanban + Timesheet)

### Kanban Board Endpoints

#### Obter Kanban Board

```
GET /kanban/board
```

Retorna o Kanban board com todos as tarefas organizadas em colunas.

**Query Parameters:**
- `lawyerId` (opcional): Filtrar por advogado
- `tribunal` (opcional): Filtrar por tribunal
- `priority` (opcional): Filtrar por prioridade (low, medium, high, urgent)
- `clientId` (opcional): Filtrar por cliente

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "userId": "user-123",
    "columns": [
      {
        "id": "awaiting-docs",
        "name": "Aguardando Documentos",
        "order": 1
      },
      {
        "id": "under-review",
        "name": "Em Análise",
        "order": 2
      },
      {
        "id": "ready-to-file",
        "name": "Pronto para Protocolo",
        "order": 3
      },
      {
        "id": "filed",
        "name": "Protocolado",
        "order": 4
      },
      {
        "id": "completed",
        "name": "Concluído",
        "order": 5
      }
    ],
    "tasks": [
      {
        "id": "task-001",
        "caseId": "case-123",
        "title": "Preparar peça processual",
        "description": "Redigir contestação",
        "columnId": "under-review",
        "lawyerId": "lawyer-001",
        "clientId": "client-001",
        "priority": "high",
        "dueDate": "2024-12-10T23:59:59.000Z",
        "assignedTo": "lawyer-002",
        "tags": ["urgente", "tjsc"],
        "documentsNeeded": 3,
        "documentsReceived": 1,
        "tribunal": "TJSC",
        "position": 0,
        "createdAt": "2024-12-04T10:00:00.000Z",
        "updatedAt": "2024-12-04T15:30:00.000Z"
      }
    ]
  }
}
```

#### Criar Tarefa

```
POST /kanban/tasks
```

Cria uma nova tarefa no Kanban.

**Body:**
```json
{
  "caseId": "case-123",
  "title": "Preparar peça processual",
  "description": "Redigir contestação",
  "columnId": "under-review",
  "lawyerId": "lawyer-001",
  "clientId": "client-001",
  "priority": "high",
  "dueDate": "2024-12-10T23:59:59.000Z",
  "assignedTo": "lawyer-002",
  "tags": ["urgente"],
  "documentsNeeded": 3,
  "tribunal": "TJSC"
}
```

**Resposta:** Retorna a tarefa criada com ID

#### Mover Tarefa

```
PUT /kanban/tasks/:taskId/move
```

Move uma tarefa para outra coluna.

**Body:**
```json
{
  "columnId": "ready-to-file",
  "position": 2
}
```

#### Atualizar Tarefa

```
PUT /kanban/tasks/:taskId
```

Atualiza detalhes de uma tarefa.

**Body:**
```json
{
  "title": "Novo título",
  "priority": "urgent",
  "documentsReceived": 2,
  "dueDate": "2024-12-15T23:59:59.000Z"
}
```

#### Deletar Tarefa

```
DELETE /kanban/tasks/:taskId
```

Remove uma tarefa do Kanban.

---

### Timesheet Endpoints

#### Iniciar Timer

```
POST /timesheet/timer/start
```

Inicia um timer para rastreamento de horas em um caso.

**Body:**
```json
{
  "caseId": "case-123",
  "description": "Análise de documentação",
  "hourlyRate": 250.00,
  "tags": ["pesquisa", "análise"]
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "entry-001",
    "caseId": "case-123",
    "lawyerId": "lawyer-001",
    "description": "Análise de documentação",
    "startTime": "2024-12-04T14:30:00.000Z",
    "endTime": null,
    "durationMinutes": 0,
    "hourlyRate": 250.00,
    "amount": 0,
    "status": "running",
    "tags": ["pesquisa", "análise"],
    "createdAt": "2024-12-04T14:30:00.000Z",
    "updatedAt": "2024-12-04T14:30:00.000Z"
  }
}
```

#### Parar Timer

```
POST /timesheet/timer/:entryId/stop
```

Para um timer em execução e calcula a duração.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "entry-001",
    "caseId": "case-123",
    "lawyerId": "lawyer-001",
    "description": "Análise de documentação",
    "startTime": "2024-12-04T14:30:00.000Z",
    "endTime": "2024-12-04T15:45:00.000Z",
    "durationMinutes": 75,
    "hourlyRate": 250.00,
    "amount": 312.50,
    "status": "completed",
    "tags": ["pesquisa", "análise"],
    "createdAt": "2024-12-04T14:30:00.000Z",
    "updatedAt": "2024-12-04T15:45:00.000Z"
  }
}
```

#### Obter Timer Ativo

```
GET /timesheet/timer/active
```

Retorna o timer ativo do advogado (se houver).

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "entry-001",
    "caseId": "case-123",
    "status": "running",
    "startTime": "2024-12-04T14:30:00.000Z",
    "durationMinutes": 15,
    "hourlyRate": 250.00,
    "amount": 62.50
  }
}
```

#### Obter Timesheet Diário

```
GET /timesheet/daily/:date
```

Retorna todas as entradas de timesheet de um dia.

**Path Parameters:**
- `date`: Data em formato ISO 8601 (ex: 2024-12-04)

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "date": "2024-12-04T00:00:00.000Z",
    "lawyerId": "lawyer-001",
    "entries": [
      {
        "id": "entry-001",
        "caseId": "case-123",
        "description": "Análise de documentação",
        "durationMinutes": 75,
        "amount": 312.50
      }
    ],
    "totalHours": 1.25,
    "totalAmount": 312.50
  }
}
```

#### Obter Métricas de Timesheet

```
GET /timesheet/metrics
```

Retorna métricas agregadas de timesheet.

**Query Parameters:**
- `period` (opcional): Período em formato `<número><unidade>` (padrão: `30d`)
  - Suportados: `d`, `w`, `m`, `y`
- `startDate` (opcional): Data inicial em ISO 8601
- `endDate` (opcional): Data final em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "period": {
      "startDate": "2024-11-04T00:00:00.000Z",
      "endDate": "2024-12-04T23:59:59.999Z"
    },
    "lawyerId": "lawyer-001",
    "totalHours": 160.5,
    "totalAmount": 40125.00,
    "entriesCount": 42,
    "averageHourlyRate": 250.00,
    "entriesByCase": [
      {
        "caseId": "case-123",
        "caseTitle": "Caso vs. Empresa XYZ",
        "hours": 45.5,
        "amount": 11375.00
      }
    ],
    "dailyProgress": [
      {
        "date": "2024-12-04T00:00:00.000Z",
        "hours": 8.25,
        "amount": 2062.50,
        "target": 8,
        "progress": 103
      }
    ]
  }
}
```

---

### Kanban Board Features

**Colunas Padrão:**
1. **Aguardando Documentos** - Aguardando envio de documentação do cliente
2. **Em Análise** - Análise jurídica em andamento
3. **Pronto para Protocolo** - Peça pronta, aguardando protocolo
4. **Protocolado** - Já enviado para o tribunal
5. **Concluído** - Caso encerrado

**Prioridades Suportadas:**
- `low` - Baixa
- `medium` - Normal
- `high` - Alta
- `urgent` - Urgente

**Recursos:**
- ✅ Drag-and-drop entre colunas
- ✅ Filtros por advogado, tribunal, prioridade, cliente
- ✅ Rastreamento de documentos (necessários vs. recebidos)
- ✅ Due dates com alertas
- ✅ Tags customizáveis
- ✅ Sincronização em tempo real via WebSocket
- ✅ Atualização automática quando timer parado

---

### Timesheet Features

**Recursos:**
- ✅ Timer com start/stop
- ✅ Cálculo automático de duração e valor
- ✅ Rastreamento por caso e advogado
- ✅ Métricas diárias e agregadas
- ✅ Meta diária de 8 horas
- ✅ Relatório de horas por caso
- ✅ Integração com faturamento (Phase posterior)
- ✅ Tags para categorização

**Cálculo de Valor:**
```
valor = (duração_minutos / 60) × hourly_rate
```

---

### Google Calendar Sync (Future)

Os recursos de sincronização com Google Calendar estarão disponíveis em uma versão futura:
- Sincronização 2-way com Google Calendar
- Alertas de conflito de agendamento
- Notificações de prazo próximo
- Integração com disponibilidade

---

### Error Handling

**Erros comuns:**

| Erro | HTTP | Solução |
|------|------|--------|
| Timer já ativo | 400 | Parar timer anterior |
| Data inválida | 400 | Use formato ISO 8601 |
| Case não encontrado | 404 | Verifique case ID |
| Autorização negada | 403 | Task de outro usuário |

---

## Phase 5: IA Triagem

### AI Triage Endpoints

#### Classificar Documento

```
POST /ai/triage/classify
```

Classifica automaticamente um documento enviado usando IA.

**Body (multipart/form-data):**
```
- document: arquivo PDF/texto
- caseId: ID do caso
- documentType: 'pdf' | 'email' | 'text' (padrão: 'pdf')
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "documentId": "doc-001",
    "classification": "sentenca",
    "confidence": 0.92,
    "extractedData": {
      "processoNumero": "0000001-12.2024.5.04.3800",
      "partes": ["Autor", "Réu"],
      "tribunal": "TRF4",
      "prazo": "2024-12-20",
      "assunto": "Cível",
      "juiz": "Desembargador Silva"
    },
    "createdAt": "2024-12-04T14:30:00.000Z"
  },
  "autoTaskCreated": true
}
```

#### Analisar Jurimetria

```
GET /ai/triage/jurimetry/:caseId
```

Análise estatística de sucesso de casos similares.

**Query Parameters:**
- `period` (opcional): `30d`, `90d`, `1y` (padrão: `90d`)
- `startDate`, `endDate` (opcional): datas em ISO 8601

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "periodo": {
      "startDate": "2024-09-04",
      "endDate": "2024-12-04"
    },
    "totalCasosAnalisados": 150,
    "successRate": 68.5,
    "casesByOutcome": {
      "ganho": 102,
      "perda": 48
    },
    "jurisprudenceMatches": 12,
    "recentCasesAnalysis": [
      {
        "caseId": "case-001",
        "outcome": "ganho",
        "similarity": 0.92,
        "tribunal": "TJSC"
      }
    ],
    "recommendations": [
      "Taxa de sucesso elevada. Prosseguir com confiança."
    ]
  }
}
```

#### Obter Status de Triagem

```
GET /ai/triage/triage-status
```

Status de documentos classificados e pendentes.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "totalClassified": 250,
    "totalPending": 12,
    "classificationBreakdown": {
      "sentenca": 85,
      "recurso": 120,
      "intimacao": 30,
      "outro": 15
    },
    "averageConfidence": 0.87
  }
}
```

---

## Phase 6: Diários Oficiais

### Official Diary Endpoints

#### Configurar Preferências de Alerta

```
POST /diaries/alert-preferences
```

Configura quais eventos monitorar nos diários oficiais.

**Body:**
```json
{
  "processNumbers": ["0000001-12.2024.5.04.3800"],
  "partyNames": ["Empresa XYZ S.A.", "João Silva"],
  "keywords": ["bancarrota", "liquidação"],
  "states": ["SC", "SP", "PR"],
  "emailNotification": true,
  "smsNotification": false,
  "pushNotification": true,
  "slackNotification": false
}
```

#### Obter Preferências de Alerta

```
GET /diaries/alert-preferences
```

Retorna as preferências configuradas.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "userId": "user-123",
    "processNumbers": ["0000001-12.2024.5.04.3800"],
    "partyNames": ["Empresa XYZ S.A."],
    "keywords": ["bancarrota"],
    "states": ["SC", "SP", "PR"],
    "emailNotification": true,
    "pushNotification": true
  }
}
```

#### Obter Alertas

```
GET /diaries/alerts
```

Lista de alertas sobre publicações em diários oficiais.

**Query Parameters:**
- `unread` (opcional): `true` para apenas não lidos (padrão: `false`)
- `limit` (opcional): número de resultados (padrão: `50`)
- `offset` (opcional): para paginação (padrão: `0`)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "alert-001",
      "userId": "user-123",
      "processNumber": "0000001-12.2024.5.04.3800",
      "partyName": "Empresa XYZ S.A.",
      "alertType": "processo",
      "foundIn": "SC",
      "foundDate": "2024-12-04T08:30:00.000Z",
      "read": false,
      "createdAt": "2024-12-04T08:35:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Marcar Alerta como Lido

```
POST /diaries/alerts/:alertId/read
```

Marca um alerta específico como lido.

**Resposta:**
```json
{
  "status": "success",
  "message": "Alerta marcado como lido"
}
```

#### Marcar Todos como Lidos

```
POST /diaries/alerts/mark-all-read
```

Marca todos os alertas do usuário como lidos.

**Resposta:**
```json
{
  "status": "success",
  "message": "Alertas marcados como lidos",
  "markedCount": 12
}
```

#### Buscar Diários

```
GET /diaries/search
```

Busca em todo o conteúdo dos diários oficiais.

**Query Parameters:**
- `query` (obrigatório): termo a buscar
- `state` (opcional): filtrar por estado (ex: "SC")
- `limit` (opcional): número de resultados (padrão: `20`)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "diary-001",
      "state": "SC",
      "title": "Diário Oficial de Santa Catarina",
      "publishedDate": "2024-12-04",
      "content": "...",
      "source": "doe.sc.gov.br",
      "processNumber": "0000001-12.2024.5.04.3800"
    }
  ],
  "count": 1
}
```

#### Obter Estatísticas

```
GET /diaries/stats
```

Estatísticas sobre cobertura de diários.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "totalEntries": 45000,
    "entriesByState": {
      "SC": 2500,
      "SP": 8000,
      "PR": 3200
    },
    "lastUpdate": "2024-12-04T18:00:00.000Z",
    "scrapeFrequency": "3 horas"
  }
}
```

---

### Official Diary Features

**Cobertura:**
- ✅ 27 estados do Brasil (all UFs)
- ✅ Scraping automático a cada 3 horas
- ✅ Indexação full-text em Português

**Monitoramento:**
- ✅ Por número de processo
- ✅ Por nome de parte
- ✅ Por palavras-chave customizadas
- ✅ Filtragem por estado

**Notificações:**
- ✅ Email
- ✅ SMS (Twilio)
- ✅ Push notifications
- ✅ Slack webhook

---

---

## Phase 7: Automatic Recommendations & Predictions

### Prediction Endpoints

#### Prever Resultado do Caso

```
POST /predictions/predict/outcome
```

Prediz o resultado esperado de um caso com base em dados históricos e análise de jurisprudência.

**Body:**
```json
{
  "caseId": "case-001",
  "caseType": "civel",
  "tribunal": "TJSP"
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "pred-001",
    "userId": "user-123",
    "caseId": "case-001",
    "predictionType": "outcome",
    "confidence": 0.85,
    "predictedOutcome": "favorable",
    "successProbability": 0.72,
    "riskLevel": "low",
    "predictionData": {
      "baseSuccessRate": 0.65,
      "similarCaseSuccessRate": 0.78,
      "similarCasesCount": 15
    },
    "createdAt": "2024-12-04T14:30:00.000Z"
  }
}
```

#### Prever Prazo do Caso

```
POST /predictions/predict/deadline
```

Calcula o prazo estimado para resolução do caso.

**Body:**
```json
{
  "caseId": "case-001",
  "caseType": "civel",
  "tribunal": "TJSP",
  "amount": 250000
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "pred-002",
    "predictionType": "deadline",
    "confidence": 0.80,
    "predictedDeadline": "2025-06-10",
    "riskLevel": "medium",
    "predictionData": {
      "baseDeadlineDays": 180,
      "complexityFactor": 1.05,
      "adjustedDeadlineDays": 189,
      "stateCode": "SP"
    }
  }
}
```

#### Calcular Taxa de Sucesso

```
POST /predictions/predict/success-rate
```

Calcula a probabilidade de sucesso com base em vários fatores.

**Body:**
```json
{
  "caseId": "case-001",
  "caseType": "trabalhista",
  "tribunal": "TJSC"
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "pred-003",
    "predictionType": "success_rate",
    "confidence": 0.88,
    "successProbability": 0.71,
    "riskLevel": "low",
    "predictionData": {
      "baseRate": 0.72,
      "historicalSuccessRate": 0.68,
      "userHistoricalRate": 0.75,
      "weights": {
        "caseType": 0.4,
        "tribunal": 0.4,
        "user": 0.2
      }
    }
  }
}
```

#### Obter Predições

```
GET /predictions/predictions
```

Retorna todas as predições de um caso ou usuário.

**Query Parameters:**
- `caseId` (opcional): Filtrar por ID do caso
- `limit` (opcional): Limite de resultados (padrão: 20)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "pred-001",
      "predictionType": "outcome",
      "confidence": 0.85,
      "successProbability": 0.72,
      "riskLevel": "low"
    }
  ],
  "count": 1
}
```

### Recommendation Endpoints

#### Gerar Recomendações

```
POST /predictions/recommendations/generate
```

Gera recomendações automáticas baseadas em predições.

**Body:**
```json
{
  "caseId": "case-001",
  "caseType": "civel",
  "tribunal": "TJSP",
  "currentStatus": "under_review",
  "daysUntilDeadline": 45
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "rec-001",
      "caseId": "case-001",
      "recommendationType": "high_risk_mitigation",
      "priority": "urgent",
      "actionText": "Fortalecer argumentação jurídica com jurisprudência recente",
      "confidence": 0.85,
      "basedOnPredictionId": "pred-001",
      "accepted": false,
      "implemented": false,
      "createdAt": "2024-12-04T14:30:00.000Z"
    }
  ],
  "count": 3
}
```

#### Obter Recomendações

```
GET /predictions/recommendations
```

Retorna recomendações para o usuário.

**Query Parameters:**
- `caseId` (opcional): Filtrar por ID do caso
- `implemented` (opcional): Filtrar por status (true/false)
- `limit` (opcional): Limite de resultados (padrão: 50)
- `offset` (opcional): Offset para paginação (padrão: 0)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "rec-001",
      "recommendationType": "high_risk_mitigation",
      "priority": "urgent",
      "actionText": "Fortalecer argumentação jurídica",
      "confidence": 0.85,
      "accepted": false,
      "implemented": false
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 5
  }
}
```

#### Aceitar Recomendação

```
POST /predictions/recommendations/:recommendationId/accept
```

Marca uma recomendação como aceita.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "rec-001",
    "accepted": true
  }
}
```

#### Implementar Recomendação

```
POST /predictions/recommendations/:recommendationId/implement
```

Marca uma recomendação como implementada.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "rec-001",
    "implemented": true,
    "implementedAt": "2024-12-05T10:15:00.000Z"
  }
}
```

#### Enviar Feedback

```
POST /predictions/recommendations/:recommendationId/feedback
```

Submete feedback sobre a qualidade da recomendação.

**Body:**
```json
{
  "feedbackType": "helpful",
  "rating": 5,
  "comment": "Recomendação muito útil para o caso"
}
```

Tipos válidos: `helpful`, `not_helpful`, `incorrect`, `already_done`

**Resposta:**
```json
{
  "status": "success",
  "message": "Feedback enviado com sucesso"
}
```

#### Obter Estatísticas

```
GET /predictions/recommendations/stats
```

Retorna estatísticas sobre recomendações.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "summary": {
      "total_recommendations": 25,
      "accepted_count": 18,
      "implemented_count": 12
    },
    "byPriority": [
      {
        "priority": "urgent",
        "total_recommendations": 5,
        "accepted_count": 5,
        "recommendation_type": "high_risk_mitigation"
      }
    ]
  }
}
```

---

### Prediction & Recommendation Features

**Tipos de Predição:**
- ✅ Resultado do caso (favorable, uncertain, unfavorable)
- ✅ Prazo estimado (com ajuste por tribunal e complexidade)
- ✅ Taxa de sucesso (ponderada por tipo, tribunal e usuário)

**Factores Considerados:**
- ✅ Histórico de casos similares
- ✅ Taxa de sucesso por tipo de caso
- ✅ Taxa histórica por tribunal
- ✅ Taxa de sucesso do usuário
- ✅ Complexidade do caso

**Tipos de Recomendação:**
- ✅ `high_risk_mitigation`: Para casos de alto risco
- ✅ `medium_risk_action`: Para casos com risco médio
- ✅ `deadline_management`: Para prazos próximos
- ✅ `offensive_strategy`: Para predições favoráveis
- ✅ `precedent_leverage`: Quando casos similares tiveram sucesso

**Otimizações:**
- ✅ Cache de predições (24 horas)
- ✅ Índices em predicções_table para performance
- ✅ Paginação em recomendações
- ✅ Limpeza automática de cache expirado

---

---

## Phase 8: Transparent Client Portal

### Case Access & Overview

#### Obter Meus Casos

```
GET /client-portal/cases
```

Lista todos os casos aos quais o cliente tem acesso.

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "case-001",
      "case_number": "0000001-12.2024.5.04.3800",
      "status": "under_review",
      "created_at": "2024-09-01T10:00:00.000Z",
      "lawyer_id": "lawyer-456",
      "access_level": "view_only"
    }
  ],
  "count": 3
}
```

### Case Updates & Timeline

#### Obter Atualizações do Caso

```
GET /client-portal/cases/:caseId/updates
```

Histórico de atualizações do caso visíveis ao cliente.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 50)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "upd-001",
      "updateType": "status_change",
      "title": "Caso movido para análise",
      "description": "Petição enviada ao tribunal",
      "createdBy": "lawyer-456",
      "visibility": "client_visible",
      "createdAt": "2024-12-04T14:30:00.000Z"
    }
  ],
  "count": 5
}
```

#### Obter Cronograma Completo

```
GET /client-portal/cases/:caseId/timeline
```

Cronograma unificado com atualizações, marcos e documentos.

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "type": "update",
      "id": "upd-001",
      "description": "Petição enviada",
      "created_at": "2024-12-04T14:30:00.000Z"
    },
    {
      "type": "milestone",
      "id": "mil-001",
      "description": "Audiência agendada",
      "created_at": "2024-12-15T00:00:00.000Z"
    }
  ],
  "count": 12
}
```

### Documents

#### Obter Documentos Compartilhados

```
GET /client-portal/cases/:caseId/documents
```

Lista documentos acessíveis ao cliente.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 100)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "doc-001",
      "documentName": "Petição Inicial.pdf",
      "documentType": "petition",
      "sharedAt": "2024-12-01T10:00:00.000Z",
      "expiresAt": null,
      "accessibleToClient": true
    }
  ],
  "count": 8
}
```

### Case Milestones

#### Obter Marcos do Caso

```
GET /client-portal/cases/:caseId/milestones
```

Prazos e eventos importantes do caso.

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "mil-001",
      "milestoneType": "hearing",
      "title": "Audiência Inicial",
      "scheduledDate": "2024-12-15",
      "completedDate": null,
      "description": "Audiência de instrução",
      "isCritical": true,
      "createdAt": "2024-11-15T10:00:00.000Z"
    }
  ],
  "count": 4
}
```

### Messaging

#### Obter Mensagens

```
GET /client-portal/cases/:caseId/messages
```

Histórico de comunicações sobre o caso.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 50)
- `offset` (opcional): Offset para paginação (padrão: 0)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "msg-001",
      "messageType": "status_update",
      "subject": "Atualização do Caso",
      "body": "Petição foi protocolar com sucesso",
      "read": true,
      "createdAt": "2024-12-04T14:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 15
  }
}
```

#### Enviar Mensagem

```
POST /client-portal/cases/:caseId/messages
```

Envia mensagem para o advogado.

**Body:**
```json
{
  "receiverId": "lawyer-456",
  "messageType": "question",
  "subject": "Dúvida sobre a petição",
  "body": "Gostaria de esclarecer um ponto da petição",
  "attachments": []
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "msg-002",
    "senderId": "client-123",
    "receiverId": "lawyer-456",
    "createdAt": "2024-12-05T10:00:00.000Z"
  }
}
```

#### Marcar Mensagem como Lida

```
POST /client-portal/messages/:messageId/read
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "msg-001",
    "read": true,
    "readAt": "2024-12-05T10:15:00.000Z"
  }
}
```

#### Contar Mensagens Não Lidas

```
GET /client-portal/messages/unread/count
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "unreadCount": 3
  }
}
```

### Billing & Costs

#### Obter Histórico de Cobrança

```
GET /client-portal/cases/:caseId/billing
```

Histórico de custos e cobrança do caso.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 100)

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "history": [
      {
        "id": "bill-001",
        "billingDate": "2024-12-01",
        "description": "Análise de documentos",
        "hours": 5,
        "hourlyRate": 350,
        "totalAmount": 1750,
        "billingType": "hourly",
        "status": "pending"
      }
    ],
    "total": 5250
  },
  "count": 3
}
```

### Case Status History

#### Obter Histórico de Status

```
GET /client-portal/cases/:caseId/status-history
```

Histórico de mudanças de status do caso.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 50)

**Resposta:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "stat-001",
      "statusType": "status",
      "statusValue": "under_review",
      "previousValue": "draft",
      "changedAt": "2024-12-04T14:30:00.000Z",
      "changedBy": "lawyer-456"
    }
  ],
  "count": 5
}
```

### Preferences

#### Obter Preferências

```
GET /client-portal/preferences
```

Preferências do cliente para o portal.

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "pref-001",
    "clientId": "client-123",
    "notificationFrequency": "daily",
    "digestEmailEnabled": true,
    "receiveDocumentNotifications": true,
    "receiveStatusUpdates": true,
    "receiveBillingUpdates": true,
    "themePreference": "light",
    "language": "pt-BR"
  }
}
```

#### Atualizar Preferências

```
PUT /client-portal/preferences
```

**Body:**
```json
{
  "notificationFrequency": "weekly",
  "digestEmailEnabled": false,
  "themePreference": "dark",
  "language": "en"
}
```

**Resposta:**
```json
{
  "status": "success",
  "data": {
    "id": "pref-001",
    "notificationFrequency": "weekly",
    "digestEmailEnabled": false,
    "themePreference": "dark"
  }
}
```

---

### Client Portal Features

**Acesso a Casos:**
- ✅ Lista de casos com acesso granular
- ✅ Histórico completo de ações
- ✅ Cronograma unificado
- ✅ Controle de visibilidade

**Documentos:**
- ✅ Compartilhamento seguro
- ✅ Versionamento
- ✅ Expiração automática
- ✅ Download com rastreamento

**Comunicação:**
- ✅ Mensagens bidirecionais
- ✅ Suporte a anexos
- ✅ Status de leitura
- ✅ Notificações

**Marcos e Prazos:**
- ✅ Calendário de eventos
- ✅ Alertas para prazos críticos
- ✅ Rastreamento de progresso
- ✅ Histórico de conclusão

**Transparência Financeira:**
- ✅ Histórico de cobrança
- ✅ Total de custos
- ✅ Detalhamento por serviço
- ✅ Status de pagamento

**Preferências:**
- ✅ Frequência de notificações
- ✅ Canais de notificação
- ✅ Preferências visuais
- ✅ Idioma

---
