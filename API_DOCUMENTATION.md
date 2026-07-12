# 📚 Documentação de API - Sistema de Gerenciamento de Aluguéis

## 🌐 Base URL

```
Development:  http://localhost:3000/api
Staging:      https://api-staging.example.com/api
Production:   https://api.example.com/api
```

## 🔐 Autenticação

Todas as requests autenticadas devem incluir:

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Como obter o token**:
```bash
POST /auth/login
{
  "email": "user@example.com",
  "password": "password"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

---

## 📍 Endpoints - Properties (Propriedades)

### List Properties
```http
GET /properties?limit=50&offset=0&city=Florianópolis&type=kitnet
```

**Parameters**:
- `limit` (int): Itens por página (default: 50)
- `offset` (int): Offset para paginação (default: 0)
- `city` (string): Filtrar por cidade
- `state` (string): Filtrar por estado
- `type` (string): Filtrar por tipo (kitnet, apartment, house)
- `status` (string): Filtrar por status (active, inactive, archived)

**Response**:
```json
{
  "properties": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "owner_id": "uuid",
      "address": "Rua Teste, 100",
      "city": "Florianópolis",
      "state": "SC",
      "type": "kitnet",
      "area_m2": 25.0,
      "bedrooms": 1,
      "bathrooms": 1,
      "base_monthly_rent": 2000,
      "status": "active",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

**Status Codes**:
- `200 OK`: Sucesso
- `400 Bad Request`: Parâmetros inválidos
- `401 Unauthorized`: Token ausente ou inválido
- `500 Internal Server Error`: Erro do servidor

---

### Get Property Detail
```http
GET /properties/{propertyId}
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "uuid",
  "address": "Rua Teste, 100",
  "city": "Florianópolis",
  "state": "SC",
  "type": "kitnet",
  "area_m2": 25.0,
  "bedrooms": 1,
  "bathrooms": 1,
  "base_monthly_rent": 2000,
  "status": "active",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

### Create Property
```http
POST /properties
Content-Type: application/json

{
  "address": "Rua Nova, 200",
  "city": "Florianópolis",
  "state": "SC",
  "type": "kitnet",
  "area_m2": 30.0,
  "bedrooms": 1,
  "bathrooms": 1,
  "base_monthly_rent": 2500
}
```

**Response**: `201 Created` com objeto da propriedade

---

### Get Property Dashboard
```http
GET /properties/{propertyId}/dashboard
```

**Response**:
```json
{
  "id": "uuid",
  "address": "Rua Teste, 100",
  "stats": {
    "total_listings": 4,
    "active_listings": 3,
    "total_views": 1250,
    "total_clicks": 95,
    "total_bookings": 12,
    "avg_conversion_rate": 0.0096,
    "total_leads": 45,
    "closed_leads": 8
  },
  "revenue": {
    "monthly_rent": 2000,
    "expected_airbnb_revenue": 3500,
    "expected_booking_revenue": 2800,
    "total_expected_revenue": 6300
  },
  "performance": {
    "top_listing": "Airbnb Kitnet",
    "top_platform": "airbnb",
    "occupancy_rate": 0.75,
    "conversion_trend": "📈 +15%"
  }
}
```

---

## 📋 Endpoints - Listings (Anúncios)

### List Listings by Property
```http
GET /properties/{propertyId}/listings
```

**Response**:
```json
{
  "listings": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "platform": "airbnb",
      "title": "Kitnet moderna no Trindade",
      "description": "Descrição do anúncio...",
      "highlights": ["WiFi", "Ar condicionado"],
      "base_price": 50.00,
      "price_strategy": "dynamic",
      "sync_status": "synced",
      "is_active": true,
      "views_count": 320,
      "clicks_count": 24,
      "bookings_count": 3,
      "conversion_rate": 0.0094,
      "published_at": "2024-01-10T08:00:00Z",
      "synced_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 4
}
```

---

### Get Listing Performance
```http
GET /listings/{listingId}/performance
```

**Response**:
```json
{
  "id": "uuid",
  "views_count": 320,
  "clicks_count": 24,
  "bookings_count": 3,
  "ctr": 0.075,
  "conversion_rate": 0.0094,
  "booking_rate": 0.125,
  "metrics": {
    "avg_position": 5.2,
    "impressions": 420,
    "engagement_rate": 0.082
  },
  "performance_compared_to_avg": {
    "views": "+40%",
    "bookings": "+25%",
    "engagement": "=0%"
  }
}
```

---

### Update Listing Content
```http
PUT /listings/{listingId}/content
Content-Type: application/json

{
  "title": "Kitnet moderna com vista para o mar",
  "description": "Descrição atualizada com mais detalhes...",
  "highlights": ["WiFi", "Ar condicionado", "Cozinha equipada"],
  "amenities_text": "Plenamente equipada com eletrodomésticos"
}
```

**Response**: `200 OK` com objeto do anúncio atualizado

---

### Update Listing Price
```http
PUT /listings/{listingId}/price
Content-Type: application/json

{
  "base_price": 65.00,
  "strategy": "dynamic"
}
```

**Strategies disponíveis**:
- `static` - Preço fixo
- `dynamic` - Baseado em ocupação
- `seasonal` - Varia por época

---

### Publish/Unpublish Listing
```http
PATCH /listings/{listingId}/publish
PATCH /listings/{listingId}/unpublish
```

---

## 💰 Endpoints - Pricing (Preços)

### Get Pricing Analysis
```http
GET /pricing/{propertyId}/analysis
```

**Response**:
```json
{
  "property_id": "uuid",
  "base_nightly_rate": 50.00,
  "current_occupancy": 75.5,
  "recommendations": [
    {
      "platform": "airbnb",
      "current_price": 50.00,
      "recommended_price": 65.00,
      "price_change": 30.0,
      "occupancy_rate": 75.5,
      "views_to_bookings_rate": 9.4
    }
  ],
  "last_updated": "2024-01-15T10:30:00Z"
}
```

---

### Get Competitive Analysis
```http
GET /pricing/{propertyId}/competitive?city=Florianópolis
```

**Response**:
```json
{
  "property_id": "uuid",
  "city": "Florianópolis",
  "our_price": 50.00,
  "competitor_avg": 48.50,
  "competitor_min": 35.00,
  "competitor_max": 75.00,
  "competitor_count": 125,
  "price_position": "premium",
  "recommended_adjustment": "reduce by 3%"
}
```

---

## 👥 Endpoints - Leads (Leads)

### List Leads by Property
```http
GET /properties/{propertyId}/leads?limit=50&offset=0&stage=contacted
```

**Parameters**:
- `stage` (string): inquiry, contacted, tour_scheduled, touring, negotiation, closed, lost
- `source_channel` (string): whatsapp, facebook, website, booking, airbnb
- `limit`, `offset`: Para paginação

**Response**:
```json
{
  "leads": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "name": "João Silva",
      "email": "joao@example.com",
      "phone": "(48) 99999-9999",
      "stage": "contacted",
      "source_channel": "whatsapp",
      "source_campaign": "organic",
      "first_contact_at": "2024-01-12T14:00:00Z",
      "last_contact_at": "2024-01-15T09:30:00Z",
      "estimated_deal_value": 15000,
      "qualification_score": 85
    }
  ],
  "total": 45
}
```

---

### Get Lead Funnel Stats
```http
GET /leads/funnel?property_id={propertyId}
```

**Response**:
```json
{
  "total_leads": 125,
  "by_stage": {
    "inquiry": 45,
    "contacted": 28,
    "tour_scheduled": 18,
    "touring": 12,
    "negotiation": 8,
    "closed": 8,
    "lost": 6
  },
  "conversion_rate_inquiry_to_close": 17.78,
  "average_days_to_close": 14,
  "by_channel": {
    "whatsapp": 45,
    "facebook": 35,
    "website": 25,
    "booking": 15,
    "airbnb": 5
  }
}
```

---

### Update Lead Stage
```http
PATCH /leads/{leadId}
Content-Type: application/json

{
  "stage": "contacted"
}
```

---

## 🔄 Endpoints - Sync (Sincronização)

### Get Sync Status
```http
GET /listings/{listingId}/sync-status
```

**Response**:
```json
{
  "id": "uuid",
  "sync_status": "synced",
  "sync_error_message": null,
  "synced_at": "2024-01-15T10:30:00Z",
  "last_sync_attempt": "2024-01-15T10:30:00Z",
  "sync_retries": 0
}
```

---

### Trigger Manual Sync
```http
POST /listings/{listingId}/sync
```

**Response**: `202 Accepted`
```json
{
  "id": "uuid",
  "sync_status": "pending",
  "message": "Sincronização em progresso"
}
```

---

## 📊 Status Codes

| Código | Significado |
|--------|------------|
| `200` | OK - Requisição bem-sucedida |
| `201` | Created - Recurso criado |
| `202` | Accepted - Requisição aceita mas ainda processando |
| `400` | Bad Request - Parâmetros inválidos |
| `401` | Unauthorized - Token ausente/inválido |
| `403` | Forbidden - Sem permissão |
| `404` | Not Found - Recurso não encontrado |
| `409` | Conflict - Conflito (ex: duplicata) |
| `429` | Too Many Requests - Rate limit atingido |
| `500` | Internal Server Error - Erro do servidor |
| `503` | Service Unavailable - Serviço indisponível |

---

## ⚡ Rate Limiting

```
Rate Limit: 100 requests / minute
Rate Limit Window: 60 segundos
Rate Limit Header: X-RateLimit-Remaining
```

Se atingido:
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Remaining: 0
Retry-After: 60
```

---

## 🔄 Paginação

Endpoints que retornam listas suportam paginação:

```http
GET /properties?limit=50&offset=100
```

**Response inclui**:
```json
{
  "items": [...],
  "total": 250,
  "limit": 50,
  "offset": 100,
  "pages": 5,
  "current_page": 3
}
```

---

## ✔️ Validações

### Properties
- `address` - Mínimo 5 caracteres
- `city` - Obrigatório
- `state` - Código de 2 caracteres (SC, RJ, SP)
- `area_m2` - Maior que 0
- `base_monthly_rent` - Maior que 0

### Listings
- `title` - Mínimo 10 caracteres
- `description` - Mínimo 20 caracteres
- `base_price` - Maior que 0
- `platform` - Uma de: airbnb, booking, vrbo, direct

### Leads
- `name` - Obrigatório
- `email` ou `phone` - Pelo menos um obrigatório
- `stage` - Uma das etapas válidas

---

## 📡 Webhooks

### Eventos Disponíveis

```
listing.created
listing.updated
listing.synced
lead.created
lead.updated
lead.closed
property.created
property.updated
```

### Registrar Webhook
```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://seu-servidor.com/webhook",
  "events": ["listing.synced", "lead.created"],
  "secret": "seu-secret-key"
}
```

### Verificar Assinatura
```typescript
const signature = req.headers['x-webhook-signature'];
const timestamp = req.headers['x-webhook-timestamp'];
const body = req.rawBody;

const hash = crypto
  .createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${body}`)
  .digest('hex');

if (hash === signature) {
  // Webhook válido
}
```

---

## 🧪 Exemplos de Uso

### cURL - List Properties
```bash
curl -X GET \
  'http://localhost:3000/api/properties?limit=10' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'
```

### cURL - Create Listing
```bash
curl -X POST \
  'http://localhost:3000/api/listings' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "property_id": "550e8400-e29b-41d4-a716-446655440000",
    "platform": "airbnb",
    "title": "Kitnet moderna",
    "description": "Descrição...",
    "highlights": ["WiFi"],
    "base_price": 50.00,
    "price_strategy": "static"
  }'
```

### Node.js - Fetch Properties
```typescript
const response = await fetch(
  'http://localhost:3000/api/properties?city=Florianópolis',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);
const data = await response.json();
```

### Python - Get Pricing Analysis
```python
import requests

response = requests.get(
    f'http://localhost:3000/api/pricing/{property_id}/analysis',
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
)
data = response.json()
print(data['recommendations'])
```

---

## 🐛 Troubleshooting

### "401 Unauthorized"
- Token expirado: Gerar novo token com `/auth/login`
- Token inválido: Verificar formato Bearer
- Token ausente: Incluir header `Authorization: Bearer`

### "429 Too Many Requests"
- Implementar exponential backoff
- Verificar limite de 100 req/min
- Aguardar `Retry-After` segundos

### "404 Not Found"
- Verificar ID do recurso
- Verificar se resource foi deletado
- Verificar permissões de acesso

### "500 Internal Server Error"
- Verificar logs do servidor
- Contactar suporte
- Retry com exponential backoff

---

## 📞 Suporte

- **Email**: support@example.com
- **Slack**: #api-support
- **Docs**: https://docs.example.com
- **Status**: https://status.example.com

---

**Última atualização**: 2024-01-15  
**Versão de API**: v1.0  
**Status**: ✅ Estável
