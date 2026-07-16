# Quick Start: Novas Plataformas de Sincronização

## 🚀 Primeiros Passos

### 1. Configurar Environment

```bash
# .env (adionar as novas variáveis)
HOSPEDA_API_KEY=xxx
HOSPEDA_WEBHOOK_SECRET=yyy
HOSPEDA_WEBHOOK_URL=https://seu-dominio/webhooks/hospeda

TRIPADVISOR_API_KEY=zzz

# Workers
ENABLE_HOSPEDA_SYNC=true
ENABLE_BOOKING_APARTMENTS_SYNC=true
ENABLE_TRIPADVISOR_RATINGS_SYNC=true

SYNC_HOSPEDA_SCHEDULE=0 */6 * * *  # A cada 6h
SYNC_TRIPADVISOR_SCHEDULE=0 0 * * * # Daily
```

### 2. Aplicar Migrations

```bash
# Criar nova estrutura de database
npm run migrate up

# Ou manualmente com ts-node
npx ts-node backend/db/migrations/02_add_multi_platform_support.ts
```

### 3. Iniciar Workers

```bash
# Em desenvolvimento (watch mode)
npm run dev

# Em produção (separado)
npm run worker:start sync-hospeda-listings
npm run worker:start sync-booking-apartments
npm run worker:start sync-tripadvisor-ratings
```

---

## 🧪 Testando Localmente

### Testar Hospeda Client

```typescript
import HospedaClient from './src/integrations/hospeda/hospeda-client';

const hospeda = new HospedaClient(process.env.HOSPEDA_API_KEY!);

// Criar propriedade
const result = await hospeda.createProperty({
  id: '',
  title: 'Apartamento Teste',
  description: 'Descrição teste',
  address: 'Rua Teste 123',
  city: 'Rio de Janeiro',
  state: 'RJ',
  zipcode: '20000-000',
  bedrooms: 2,
  bathrooms: 1,
  capacity: 4,
  amenities: ['WiFi', 'TV'],
  price_per_night: 450,
  currency: 'BRL',
  images: [],
});

console.log('✅ Propriedade criada:', result.id);
```

### Testar Booking Apartments Client

```typescript
import { BookingApartmentsClient } from './src/integrations/booking/booking-apartments-client';

const booking = new BookingApartmentsClient(process.env.BOOKING_API_KEY!);

// Criar apartamento
const result = await booking.createApartment({
  id: '',
  name: 'Studio Teste',
  description: 'Studio moderno',
  address: 'Av Paulista 1000',
  city: 'São Paulo',
  country: 'Brazil',
  zipcode: '01000-000',
  type: 'studio',
  bedrooms: 0,
  bathrooms: 1,
  max_guests: 2,
  amenities: [],
  price_per_night: 300,
  currency: 'BRL',
  minimum_stay: 1,
  cancellation_policy: 'moderate',
  images: [],
});

console.log('✅ Apartamento criado:', result.id);
```

### Testar TripAdvisor Client

```typescript
import { TripAdvisorClient } from './src/integrations/tripadvisor/tripadvisor-client';

const tripadvisor = new TripAdvisorClient(process.env.TRIPADVISOR_API_KEY!);

// Buscar ratings
const ratings = await tripadvisor.getPropertyRatings('tap_123456');

console.log('✅ Rating:', ratings.overall_rating);
console.log('✅ Reviews:', ratings.review_count);
```

### Testar Webhook

```bash
# Simular webhook do Hospeda
curl -X POST http://localhost:3000/webhooks/hospeda \
  -H "Content-Type: application/json" \
  -H "X-Hospeda-Signature: xxx" \
  -d '{
    "type": "booking.created",
    "user_id": "user_123",
    "property_id": "prop_456",
    "booking": {
      "id": "booking_789",
      "guest_name": "João Silva",
      "guest_email": "joao@example.com",
      "guest_phone": "+55 21 9999-8888",
      "check_in": "2026-08-15",
      "check_out": "2026-08-22",
      "guests": 2,
      "total_price": 3150
    }
  }'
```

---

## 📊 Monitorando Sincronizações

### Logs

```bash
# Ver logs de sincronização
npm run logs:workers

# Ou manualmente
tail -f logs/sync-hospeda-listings.log
tail -f logs/sync-booking-apartments.log
tail -f logs/sync-tripadvisor-ratings.log
```

### Database Queries

```sql
-- Ver últimas sincronizações
SELECT platform, status, duration_ms, error_message 
FROM sync_history 
WHERE platform IN ('hospeda', 'booking-apartments', 'tripadvisor')
ORDER BY created_at DESC 
LIMIT 20;

-- Ver status de integração
SELECT user_id, platform, last_sync_status, sync_count, error_count
FROM user_integrations
WHERE platform IN ('hospeda', 'booking', 'tripadvisor');

-- Ver propriedades sincronizadas
SELECT p.title, pl.platform, pl.status, pl.rating, pl.review_count
FROM properties p
JOIN property_listings pl ON p.id = pl.property_id
WHERE pl.platform IN ('hospeda', 'booking-apartments', 'tripadvisor')
ORDER BY pl.platform;

-- Ver leads recebidos
SELECT l.guest_name, l.platform, l.status, l.created_at
FROM leads l
WHERE l.platform IN ('hospeda', 'booking', 'tripadvisor')
ORDER BY l.created_at DESC
LIMIT 20;

-- Ver ratings por plataforma
SELECT property_id, platform, rating, review_count, synced_at
FROM platform_ratings
ORDER BY synced_at DESC
LIMIT 50;
```

---

## 🔍 Troubleshooting

### Hospeda não sincroniza

```bash
# 1. Verificar API key
echo $HOSPEDA_API_KEY  # Deve estar set

# 2. Testar conexão
curl -H "Authorization: Bearer $HOSPEDA_API_KEY" \
  https://www.hospeda.com/api/v2/properties

# 3. Ver logs
grep -i "hospeda" logs/*.log

# 4. Verificar database
SELECT * FROM user_integrations WHERE platform = 'hospeda';
SELECT * FROM sync_history WHERE platform = 'hospeda' ORDER BY created_at DESC LIMIT 5;
```

### Booking Apartments sem preços por data

```bash
# Verificar se tabela existe
SELECT * FROM platform_pricing_by_date;

# Se vazia, adicionar preços manualmente
INSERT INTO platform_pricing_by_date (listing_id, date, nightly_rate)
VALUES ('listing_uuid', '2026-08-15', 450.00);
```

### TripAdvisor não atualiza ratings

```bash
# Verificar status de sync
SELECT * FROM platform_ratings 
WHERE platform = 'tripadvisor'
ORDER BY synced_at DESC
LIMIT 10;

# Se vazio, enfileirar sync manual
INSERT INTO BullMQ queue:
{
  "jobName": "sync-tripadvisor-ratings",
  "data": {
    "propertyId": "prop_123",
    "userId": "user_456"
  }
}
```

---

## ✅ Checklist de Validação

### Antes de Deploy

- [ ] Migrations aplicadas com sucesso
- [ ] API keys validadas
- [ ] Workers iniciados e rodando
- [ ] Webhooks registrados
- [ ] Testes passando
- [ ] Logs sem errors
- [ ] Database queries funcionando
- [ ] Métricas visíveis no Grafana
- [ ] Alertas configurados

### Após Deploy

- [ ] Leads recebidos via Hospeda (1-2 booking/dia)
- [ ] Apartamentos criados em Booking
- [ ] Ratings sincronizados do TripAdvisor
- [ ] Pricing updates triggering corretamente
- [ ] Webhooks entregues (verifique em logs)
- [ ] Taxa sincronização > 95%
- [ ] Latência sync < 10s
- [ ] Zero erros críticos nos logs

---

## 📞 Support

### Problemas Comuns

**Q: Hospeda retorna 401 (Unauthorized)**
A: Verifique se a API key está correta e ainda é válida

**Q: Rate limit (429) frequente**
A: Aumentar delay entre sincronizações ou usar concorrência menor

**Q: Webhooks não chegam**
A: Verificar firewall, URL de webhook pública, signature secret

**Q: Preços não atualizam em Booking**
A: Verificar se table `platform_pricing_by_date` existe e tem dados

**Q: Ratings não afetam preço**
A: Verificar se rating factor está implementado no pricing calculator

---

## 🔗 Recursos

- Documentação completa: `PLATFORM_INTEGRATIONS.md`
- Clientes: `backend/src/integrations/`
- Workers: `backend/src/workers/`
- Webhooks: `backend/src/webhooks/`
- Tests: `backend/tests/integrations/`
- Migrations: `backend/db/migrations/02_add_multi_platform_support.ts`

