# Redis Caching - Fase 6

## Visão Geral

Phase 6 implementa cache distribuído com Redis, complementando o cache em-memória existente. A plataforma agora oferece uma solução de cache híbrida: memória para acesso rápido local + Redis para compartilhamento entre servidores.

**Status:** ✅ Implementado e Integrado  
**Endpoints:** 7 novos endpoints de gerenciamento  
**Cache Service:** Dual-layer (memória + Redis)

## Recursos

### 1. Cache Híbrido
- **Memória:** Cache rápido local (CacheService existente)
- **Redis:** Cache distribuído entre instâncias
- **Fallback:** Se Redis não disponível, usa apenas memória
- **Sync:** Invalidações propagadas via pub/sub

### 2. Tipos de Cache
- **HTTP Response Caching:** Caching automático de respostas GET
- **Query Caching:** Cache de operações de banco dados
- **Session Store:** Armazenamento de sessões de usuário
- **Counter Cache:** Contadores distribuídos
- **List/Set Cache:** Estruturas de dados Redis nativas

### 3. Invalidação Inteligente
- **Pattern-based:** Invalidar múltiplas chaves por padrão
- **Event-driven:** Pub/sub para sincronizar entre instâncias
- **TTL-based:** Expiração automática de dados
- **Manual:** API de controle via endpoints

### 4. Session Management
- Sessões distribuídas em Redis
- Refresh automático de expiração
- Permissões e metadata por sessão
- Multi-device/multi-session suporte

## Setup

### 1. Instalar Redis

#### Docker (Recomendado)
```bash
docker run -d \
  -p 6379:6379 \
  --name redis \
  redis:7-alpine \
  redis-server --appendonly yes
```

#### macOS (via Homebrew)
```bash
brew install redis
brew services start redis
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### 2. Configurar Variáveis de Ambiente

```bash
# .env
REDIS_URL=redis://localhost:6379
# ou com autenticação:
# REDIS_URL=redis://:password@localhost:6379
```

### 3. Instalar Dependências

```bash
npm install ioredis
```

### 4. Verificar Conexão

```bash
redis-cli
> ping
PONG
```

## Uso

### Cache Service (RedisCacheService)

#### Obter/Set valor
```typescript
import { redisCacheService } from '@services/RedisCacheService';

// Simples get/set
const value = await redisCacheService.get('chave', 'namespace');
await redisCacheService.set('chave', { data: 'valor' }, { ttl: 3600 });

// Get or Set (fetch se não existir)
const result = await redisCacheService.getOrSet(
  'chave',
  () => fetchDataFromDB(),
  { ttl: 3600, namespace: 'app' }
);
```

#### Invalidar Cache
```typescript
// Deletar chave específica
await redisCacheService.delete('chave', 'namespace');

// Invalidar padrão
await redisCacheService.invalidatePattern('usuario:*', 'namespace');

// Limpar namespace inteiro
await redisCacheService.flush('namespace');
```

#### Estruturas de Dados
```typescript
// Hash (objetos)
await redisCacheService.hset('user:123', { name: 'João', email: 'joao@ex.com' });
const user = await redisCacheService.hget('user:123');

// List (sequências)
await redisCacheService.lpush('eventos', { tipo: 'login', timestamp: Date.now() });
const eventos = await redisCacheService.lrange('eventos', 0, 10);

// Set (únicos)
await redisCacheService.sadd('tags', 'importante');
const tags = await redisCacheService.smembers('tags');

// Counters (inteiros)
await redisCacheService.increment('views:post:123');
await redisCacheService.decrement('inventory:item:456');
```

#### Inscrição para Invalidações
```typescript
// Receber notificações quando cache é invalidado
redisCacheService.subscribe('app', async (key) => {
  console.log(`Cache invalidado: ${key}`);
  // Recarregar dados se necessário
});
```

### Session Store

```typescript
import { sessionStore } from '@services/SessionStore';

// Criar sessão
const session: Session = {
  userId: 'user-123',
  email: 'user@example.com',
  username: 'username',
  roles: ['admin'],
  permissions: ['read', 'write'],
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86400000), // 24h
  lastActivityAt: new Date(),
};

await sessionStore.createSession(sessionId, session);

// Obter sessão
const userSession = await sessionStore.getSession(sessionId);

// Refresh sessão
await sessionStore.refreshSession(sessionId, 24);

// Gerenciar permissões
await sessionStore.addPermission(sessionId, 'delete');
const hasPermission = await sessionStore.hasPermission(sessionId, 'delete');

// Destroy
await sessionStore.destroySession(sessionId);
```

### HTTP Cache Middleware

```typescript
import { GET_CACHE, SEARCH_CACHE, invalidateCache } from '@middlewares/cacheMiddleware';

// Aplicar cache a endpoints GET
app.get('/api/v1/clients', GET_CACHE, clientController.list);

// Cache customizado para search
app.get('/api/v1/search', SEARCH_CACHE, searchController.search);

// Invalidar cache após mutação
app.post('/api/v1/clients', async (req, res) => {
  // Criar cliente
  const client = await clientService.create(req.body);
  
  // Invalidar cache
  await invalidateCache('clients:*');
  
  res.json(client);
});
```

## API Endpoints

### Cache Management

#### Limpar Cache
```bash
DELETE /api/v1/cache
DELETE /api/v1/cache?namespace=app
```

#### Invalidar Padrão
```bash
DELETE /api/v1/cache/pattern?pattern=client:*&namespace=app
```

#### Estatísticas
```bash
GET /api/v1/cache/stats

# Resposta:
{
  "success": true,
  "cache": {
    "redis": {
      "hits": 150,
      "misses": 45,
      "sets": 120,
      "deletes": 30,
      "hitRate": 76.92
    },
    "memory": {
      "totalKeys": 1230,
      "hits": 2045,
      "misses": 890,
      "hitRate": 69.65
    }
  },
  "combined": {
    "totalHits": 2195,
    "totalMisses": 935,
    "overallHitRate": 70.09
  }
}
```

#### Reset Estatísticas
```bash
POST /api/v1/cache/stats/reset
```

#### Status Redis
```bash
GET /api/v1/cache/redis/status

# Resposta:
{
  "success": true,
  "redis": {
    "connected": true,
    "status": "connected",
    "stats": { ... }
  }
}
```

#### Health Check
```bash
GET /api/v1/cache/health

# Resposta:
{
  "success": true,
  "status": "healthy", # healthy, degraded, unhealthy
  "cache": {
    "redis": { "ready": true, "stats": {...} },
    "memory": { "ready": true, "stats": {...} }
  }
}
```

#### Warm-up Cache
```bash
POST /api/v1/cache/warmup
{
  "namespace": "app"
}
```

#### Migrar para Redis
```bash
POST /api/v1/cache/migrate

# Move dados da memória para Redis (se Redis estiver disponível)
```

#### Listar Namespaces
```bash
GET /api/v1/cache/namespaces

# Resposta:
{
  "success": true,
  "namespaces": ["app", "http", "session", "search", "analytics", ...]
}
```

## Padrões de Uso

### Padrão 1: Cache de Queries
```typescript
class UserRepository {
  async getById(userId: string) {
    return redisCacheService.getOrSet(
      `user:${userId}`,
      () => db.users.findById(userId),
      { ttl: 3600, namespace: 'users' }
    );
  }
}
```

### Padrão 2: Cache com Invalidação
```typescript
class ClientService {
  async create(data: ClientData) {
    const client = await clientRepository.create(data);
    
    // Invalida cache de listagens
    await redisCacheService.invalidatePattern('clients:list:*', 'http');
    
    return client;
  }
}
```

### Padrão 3: Cache Distribuído
```typescript
// Server A
await redisCacheService.set('config:feature_x', { enabled: true });

// Server B (automaticamente sincronizado)
const config = await redisCacheService.get('config:feature_x');
// { enabled: true }
```

### Padrão 4: Contadores Distribuídos
```typescript
// Incrementar views
await redisCacheService.increment('views:post:123');

// Obter contagem
const views = await redisCacheService.get('views:post:123');
```

## Performance

### Benchmarks Típicos
| Operação | Latência | Cache Hit |
|----------|----------|-----------|
| Set | 0.5-1ms | N/A |
| Get | 0.3-0.7ms | 80-95% |
| Delete | 0.2-0.5ms | N/A |
| Pub/Sub | 1-2ms | N/A |

### Hit Rate Esperada
- **HTTP Responses:** 70-80%
- **Database Queries:** 75-85%
- **Analytics:** 85-90%
- **Session Data:** 95%+

## Troubleshooting

### Redis não conecta
```bash
# Verificar se está rodando
redis-cli ping

# Verificar logs
docker logs redis

# Verificar porta
netstat -an | grep 6379
```

### Cache não funciona
```bash
# Verificar status
curl http://localhost:3000/api/v1/cache/redis/status

# Verificar estatísticas
curl http://localhost:3000/api/v1/cache/stats
```

### Memória alta
```bash
# Limpar cache
curl -X DELETE http://localhost:3000/api/v1/cache

# Resetar stats
curl -X POST http://localhost:3000/api/v1/cache/stats/reset
```

## Próximas Melhorias

1. **Compression:**
   - Comprimir valores grandes antes de armazenar
   - Reduzir uso de memória

2. **Partitioning:**
   - Distribuir cache entre múltiplos Redis nodes
   - Scaling horizontal

3. **Replication:**
   - Redis Sentinel para alta disponibilidade
   - Master-slave replication

4. **Monitoring:**
   - Prometheus metrics
   - Real-time dashboard
   - Alertas de performance

5. **Advanced Patterns:**
   - Rate limiting com Redis
   - Locks distribuídos
   - Job queue

## Recursos Adicionais

- [Documentação Redis](https://redis.io/docs/)
- [ioredis Client](https://github.com/luin/ioredis)
- [Redis Commands](https://redis.io/commands/)
- [Redis Data Structures](https://redis.io/docs/manual/data-types/)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)

