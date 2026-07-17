# 📡 API REST - Documentação do Módulo BI

## Base URL
```
http://localhost:3000/api/bi
```

## Autenticação
Todos os endpoints requerem token JWT no header:
```
Authorization: Bearer <token_jwt>
```

---

## 📊 Endpoints

### 1. POST `/bi/kpis`
**Busca KPIs principais para um período**

#### Request
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "propertyIds": ["prop-123", "prop-456"]
}
```

#### Response (200 OK)
```json
{
  "data": {
    "grossRevenue": {
      "id": "gross_revenue",
      "name": "Faturamento Bruto",
      "value": 250000,
      "previousValue": 220000,
      "unit": "currency",
      "trend": "up",
      "trendPercentage": 13.6,
      "status": "success",
      "lastUpdated": "2024-01-31T23:59:59Z"
    },
    "ebitda": {
      "id": "ebitda",
      "name": "EBITDA",
      "value": 150000,
      "previousValue": 120000,
      "unit": "currency",
      "trend": "up",
      "trendPercentage": 25,
      "status": "success",
      "lastUpdated": "2024-01-31T23:59:59Z"
    },
    "profitMargin": {
      "id": "profit_margin",
      "name": "Margem de Lucro",
      "value": 63.8,
      "previousValue": 57.1,
      "unit": "percentage",
      "trend": "up",
      "trendPercentage": 11.7,
      "status": "success",
      "lastUpdated": "2024-01-31T23:59:59Z"
    }
  },
  "meta": {
    "timestamp": "2024-01-31T23:59:59Z",
    "executionTime": 245,
    "source": "calculated"
  }
}
```

#### Status Codes
- `200 OK` - KPIs retornados com sucesso
- `400 Bad Request` - Parâmetros obrigatórios faltando
- `500 Internal Server Error` - Erro ao calcular KPIs

---

### 2. GET `/bi/movements`
**Lista movimentações financeiras com filtros**

#### Query Parameters
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-----------|-----------|
| `startDate` | string | ✅ | Data inicial (YYYY-MM-DD) |
| `endDate` | string | ✅ | Data final (YYYY-MM-DD) |
| `propertyId` | string | ❌ | ID da propriedade |
| `platform` | string | ❌ | booking, hospeda, tripadvisor |
| `limit` | number | ❌ | Registros por página (default: 100) |
| `offset` | number | ❌ | Página (default: 0) |

#### Request
```
GET /api/bi/movements?startDate=2024-01-01&endDate=2024-01-31&propertyId=prop-123&limit=50&offset=0
```

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "move-001",
      "propertyId": "prop-123",
      "amount": 5000,
      "movementType": "revenue",
      "platform": "booking",
      "date": "2024-01-15",
      "description": "Reserva #BR-12345"
    },
    {
      "id": "move-002",
      "propertyId": "prop-123",
      "amount": -1200,
      "movementType": "expense",
      "platform": "internal",
      "date": "2024-01-16",
      "description": "Limpeza"
    }
  ],
  "pagination": {
    "total": 124,
    "limit": 50,
    "offset": 0,
    "pages": 3
  },
  "meta": {
    "timestamp": "2024-01-31T23:59:59Z"
  }
}
```

---

### 3. POST `/bi/reports/waterfall`
**Gera dados para Gráfico de Cascata (DRE)**

#### Request
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "propertyId": "prop-123"
}
```

#### Response (200 OK)
```json
{
  "data": {
    "stages": [
      {
        "name": "Faturamento Bruto",
        "value": 250000,
        "isTotal": true
      },
      {
        "name": "Deduções",
        "value": -50000,
        "color": "#ef4444"
      },
      {
        "name": "Faturamento Líquido",
        "value": 200000,
        "isTotal": true
      },
      {
        "name": "COGS",
        "value": -80000,
        "color": "#ef4444"
      },
      {
        "name": "Despesas Operacionais",
        "value": -40000,
        "color": "#ef4444"
      },
      {
        "name": "EBITDA",
        "value": 80000,
        "isTotal": true,
        "color": "#10b981"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-31T23:59:59Z"
  }
}
```

---

### 4. POST `/bi/reports/sankey`
**Gera dados para Diagrama Sankey (Fluxo de Caixa)**

#### Request
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "propertyId": "prop-123"
}
```

#### Response (200 OK)
```json
{
  "data": {
    "nodes": [
      {
        "name": "Receita Total",
        "category": "revenue"
      },
      {
        "name": "Despesas Operacionais",
        "category": "expense"
      },
      {
        "name": "Impostos",
        "category": "expense"
      },
      {
        "name": "Investimentos",
        "category": "investment"
      }
    ],
    "links": [
      {
        "source": 0,
        "target": 1,
        "value": 80000
      },
      {
        "source": 0,
        "target": 2,
        "value": 50000
      },
      {
        "source": 0,
        "target": 3,
        "value": 20000
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-31T23:59:59Z"
  }
}
```

---

### 5. POST `/bi/movements/sync`
**Enfileira sincronização de movimentações financeiras**

#### Request
```json
{
  "propertyId": "prop-123",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "platforms": ["booking", "hospeda", "tripadvisor"]
}
```

#### Response (200 OK)
```json
{
  "data": {
    "status": "enqueued",
    "jobId": "job-xyz-123",
    "propertyId": "prop-123"
  },
  "meta": {
    "timestamp": "2024-01-31T23:59:59Z"
  }
}
```

---

### 6. GET `/bi/health`
**Health check do módulo BI**

#### Request
```
GET /api/bi/health
```

#### Response (200 OK)
```json
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "cache": "ok"
  },
  "timestamp": "2024-01-31T23:59:59Z"
}
```

#### Response (503 Service Unavailable)
```json
{
  "status": "unhealthy",
  "error": "Connection refused",
  "timestamp": "2024-01-31T23:59:59Z"
}
```

---

## 🔄 Fluxo de Uso Típico

### 1. Buscar KPIs
```typescript
// Frontend
const kpis = await biApiClient.fetchKPIs({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  propertyIds: ['prop-123'],
});
```

### 2. Gerar Gráficos
```typescript
// Waterfall
const waterfallData = await biApiClient.generateWaterfallReport(
  '2024-01-01',
  '2024-01-31',
  'prop-123'
);

// Sankey
const sankeyData = await biApiClient.generateSankeyReport(
  '2024-01-01',
  '2024-01-31',
  'prop-123'
);
```

### 3. Sincronizar Dados
```typescript
// Enfileirar sincronização
await biApiClient.syncMovements(
  'prop-123',
  '2024-01-01',
  '2024-01-31',
  ['booking', 'hospeda', 'tripadvisor']
);
```

---

## ⚠️ Tratamento de Erros

### Resposta de Erro Padrão
```json
{
  "error": "Descrição do erro",
  "message": "Detalhes técnicos",
  "timestamp": "2024-01-31T23:59:59Z"
}
```

### Códigos de Erro Comuns
| Código | Mensagem | Solução |
|--------|----------|---------|
| 400 | Bad Request | Verifique os parâmetros obrigatórios |
| 401 | Unauthorized | Token JWT inválido ou expirado |
| 403 | Forbidden | Sem permissão para acessar recurso |
| 404 | Not Found | Recurso não encontrado |
| 500 | Internal Server Error | Erro no servidor - tente novamente |
| 503 | Service Unavailable | Serviço temporariamente indisponível |

---

## 🚀 Exemplos com cURL

### Buscar KPIs
```bash
curl -X POST http://localhost:3000/api/bi/kpis \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "propertyIds": ["prop-123"]
  }'
```

### Listar Movimentações
```bash
curl -X GET "http://localhost:3000/api/bi/movements?startDate=2024-01-01&endDate=2024-01-31&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Gerar Waterfall
```bash
curl -X POST http://localhost:3000/api/bi/reports/waterfall \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "propertyId": "prop-123"
  }'
```

---

## 📊 Caching

**Estratégia de Cache:**
- KPIs: 1 hora (3600s)
- Movimentações: 30 minutos (1800s)
- Relatórios: 2 horas (7200s)

**Headers de Cache:**
```
Cache-Control: max-age=3600, public
ETag: "abc123xyz"
```

---

## 🔐 Rate Limiting

- **Limite:** 1000 requisições por hora por IP
- **Header de Resposta:** `X-RateLimit-Remaining: 999`

---

## 📚 Referências Adicionais

- [Star Schema Design](./BI_MODULE_README.md#-arquitetura)
- [Frontend Integration](./frontend/src/services/bi/)
- [Type Definitions](./frontend/src/types/bi/)

---

**Última atualização:** 2026-07-17
**Versão da API:** 1.0.0
