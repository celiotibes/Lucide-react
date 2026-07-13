# Busca Avançada com Elasticsearch - Fase 5

## Visão Geral

A Fase 5 implementa busca full-text avançada usando Elasticsearch, permitindo buscas rápidas, agregações e facetas em todos os dados da plataforma.

**Status:** ✅ Implementado e Integrado
**Endpoints:** `/api/v1/search/*`
**Documentação API:** `GET /api/v1/search/status` para verificar disponibilidade

## Recursos

### 1. Busca Full-Text
- Busca por múltiplos campos
- Suporte a caracteres especiais e acentos
- Fuzzy matching automático
- Análise de português brasileiro

### 2. Índices Suportados
- **clients** - Clientes com busca por nome, email, notas
- **cases** - Casos com busca por número, tribunal, juiz
- **contracts** - Contratos com busca por título, conteúdo
- **invoices** - Faturas com busca por número, descrição
- **intimations** - Intimações com busca por conteúdo, tipo

### 3. Filtros Avançados
- Status, tipo, cliente, tribunal
- Intervalo de datas
- Intervalo de valores monetários

### 4. Agregações (Facetas)
- Contagem por status
- Contagem por tipo/categoria
- Distribuição de valores
- Tendências temporais

### 5. Autocompletar
- Sugestões enquanto digita
- Baseado em resultados relevantes
- Limite de 2 caracteres mínimo

## Setup

### 1. Instalar Elasticsearch

#### Docker (Recomendado)
```bash
docker run -d \
  -e discovery.type=single-node \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  -p 9200:9200 \
  -p 9300:9300 \
  --name elasticsearch \
  docker.elastic.co/elasticsearch/elasticsearch:8.10.0
```

#### macOS (via Homebrew)
```bash
brew tap elastic/tap
brew install elastic-stack-full
elasticsearch
```

#### Linux (via Package Manager)
```bash
# Ubuntu/Debian
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee -a /etc/apt/sources.list.d/elastic-8.x.list
sudo apt update && sudo apt install elasticsearch

sudo systemctl start elasticsearch
```

### 2. Variáveis de Ambiente

```bash
# .env
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic  # opcional
ELASTICSEARCH_PASSWORD=changeme # opcional
```

### 3. Instalar Dependências

```bash
npm install @elastic/elasticsearch
```

### 4. Verificar Conexão

```bash
curl -X GET "localhost:9200/"

# Resposta esperada:
{
  "version": {
    "number": "8.10.0",
    "build_flavor": "default",
    ...
  }
}
```

## Uso da API

### Buscar Clientes
```bash
curl -X GET "http://localhost:3000/api/v1/search/clients?q=acme&status=CUSTOMER&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resposta:**
```json
{
  "success": true,
  "query": "acme",
  "data": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "results": [
      {
        "id": "client-123",
        "score": 2.5,
        "data": {
          "name": "Acme Corporation",
          "email": "contact@acme.com",
          "status": "CUSTOMER",
          "industry": "Technology"
        }
      }
    ]
  },
  "timestamp": "2026-07-13T10:30:00Z"
}
```

### Buscar Casos
```bash
curl -X GET "http://localhost:3000/api/v1/search/cases?q=TJ-SP&status=IN_PROGRESS&caseType=Civil&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Parâmetros:**
- `q` (obrigatório) - Termo de busca
- `status` (opcional) - Filtrar por status (REGISTERED, IN_PROGRESS, CLOSED, ARCHIVED)
- `clientId` (opcional) - Filtrar por cliente
- `caseType` (opcional) - Filtrar por tipo (Civil, Trabalhista, Penal, etc.)
- `page` (padrão: 1) - Número da página
- `limit` (padrão: 20, máx: 100) - Itens por página

### Buscar Contratos
```bash
curl -X GET "http://localhost:3000/api/v1/search/contracts?q=service&status=SIGNED&clientId=client-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Buscar Faturas
```bash
curl -X GET "http://localhost:3000/api/v1/search/invoices?q=2024&status=OVERDUE" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Buscar Intimações
```bash
curl -X GET "http://localhost:3000/api/v1/search/intimations?q=notificacao&caseId=case-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Busca Global
```bash
curl -X GET "http://localhost:3000/api/v1/search/global?q=termo&type=cases,clients,contracts" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Busca em múltiplos índices e retorna resultados ordenados por relevância.

### Busca com Facetas
```bash
curl -X GET "http://localhost:3000/api/v1/search/cases/facets?q=TJ-SP" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resposta:**
```json
{
  "success": true,
  "query": "TJ-SP",
  "data": {
    "total": 42,
    "facets": {
      "by_status": {
        "buckets": [
          { "key": "IN_PROGRESS", "doc_count": 25 },
          { "key": "CLOSED", "doc_count": 12 },
          { "key": "REGISTERED", "doc_count": 5 }
        ]
      },
      "by_case_type": {
        "buckets": [
          { "key": "Civil", "doc_count": 30 },
          { "key": "Trabalhista", "doc_count": 12 }
        ]
      },
      "by_court": { ... },
      "by_outcome": { ... },
      "amount_range": {
        "buckets": [
          { "key": "*-10000.0", "doc_count": 8 },
          { "key": "10000.0-50000.0", "doc_count": 15 }
        ]
      }
    }
  }
}
```

### Autocompletar
```bash
curl -X GET "http://localhost:3000/api/v1/search/suggest?q=acm&type=clients" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resposta:**
```json
{
  "success": true,
  "query": "acm",
  "suggestions": [
    {
      "id": "client-123",
      "title": "Acme Corporation",
      "type": "clients",
      "score": 2.5
    },
    {
      "id": "client-456",
      "title": "Acme Services Ltd",
      "type": "clients",
      "score": 1.8
    }
  ]
}
```

### Status do Elasticsearch
```bash
curl -X GET "http://localhost:3000/api/v1/search/status"
```

**Resposta:**
```json
{
  "success": true,
  "elasticsearch": {
    "connected": true,
    "status": "ready"
  },
  "timestamp": "2026-07-13T10:30:00Z"
}
```

## Integração com Mutations

A indexação automática ocorre quando entidades são criadas/atualizadas via GraphQL:

### Após criar cliente
```graphql
mutation {
  createClient(input: { name: "Acme" ... }) {
    client { id name }
  }
}
# Elasticsearch indexa automaticamente
```

### Após criar caso
```graphql
mutation {
  createCase(input: { clientId: "..." ... }) {
    case { id caseNumber }
  }
}
# Elasticsearch indexa automaticamente
```

## Manutenção

### Reindexar Todos os Dados
```bash
# Via API (não implementado ainda, usar curl)
# Ou via Kibana:
POST _reindex
{
  "source": { "index": "cases" },
  "dest": { "index": "cases_new" }
}
```

### Monitorar Índices
```bash
curl -X GET "localhost:9200/_cat/indices?v"
```

### Limpar Índice
```bash
curl -X DELETE "localhost:9200/cases"
```

## Desempenho

### Benchmarks (dados estimados)
- **Busca simples:** < 50ms
- **Busca com filtros:** < 100ms
- **Busca com agregações:** < 200ms
- **Autocompletar:** < 30ms

### Otimizações
- Índices com 1 shard (desenvolvimento) / 5 shards (produção)
- Análise Portuguese para melhor tokenização
- Fuzzy matching automático (2 edits distance)
- Cache de queries frequentes

## Troubleshooting

### Elasticsearch não conecta
```bash
# Verificar se está rodando
curl -X GET "localhost:9200/"

# Verificar logs
docker logs elasticsearch

# Verificar portas
netstat -an | grep 9200
```

### Buscas lentas
- Verificar tamanho do índice: `GET _cat/indices`
- Analisar query: `POST /cases/_explain`
- Aumentar JVM heap: `-Xmx2g`

### Memória insuficiente
```bash
# Aumentar limite de memória (Docker)
docker update --memory 2g elasticsearch

# Ou em .env
ES_JAVA_OPTS=-Xmx2g -Xms2g
```

## Próximas Melhorias

1. **Reindexação em Background**
   - Worker que sincroniza DB com Elasticsearch
   - Heartbeat para detectar falhas

2. **Busca Semântica**
   - Integração com modelos de embedding
   - Busca por similaridade

3. **Sugestões Inteligentes**
   - Autocomplete baseado em histórico
   - Busca fonética

4. **Análise de Busca**
   - Tracking de queries populares
   - Otimização de relevância

5. **Busca Geográfica**
   - Filtrar por coordenadas/distância
   - Visualização em mapa

## Recursos Adicionais

- [Documentação Elasticsearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Análise de Português](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html#portuguese-analyzer)
- [Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html)
- [Kibana Dev Tools](http://localhost:5601/app/dev_tools)

