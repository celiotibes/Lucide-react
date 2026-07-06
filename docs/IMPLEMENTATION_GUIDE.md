# 🚀 AI Provider Integration - Implementation Guide

## Quick Start

### Para Desenvolvedores

#### 1. Usar o Hook em Componentes

```typescript
import { useAIProvider } from '@/hooks/useAIProvider'

export function MyComponent() {
  const { executeAI, response, loading, error, provider, costUSD } = useAIProvider()

  const handleAnalyze = async () => {
    await executeAI('legalAnalysis', 'Analise esta petição: ...')
  }

  return (
    <div>
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Processando...' : 'Analisar'}
      </button>

      {response && <div>Resposta: {response}</div>}
      {error && <div style={{ color: 'red' }}>Erro: {error}</div>}
      {provider && <div>Provider usado: {provider}</div>}
      {costUSD && <div>Custo: ${costUSD.toFixed(4)}</div>}
    </div>
  )
}
```

#### 2. Adicionar Novo Caso de Uso

```typescript
// 1. Em src/services/aiProviderSelector.ts
export type CaseOfUse = 
  | 'legalAnalysis'
  | 'emailExtraction'
  // ...
  | 'myNewCase'  // ← Adicionar

// 2. Definir provider para esse caso
const PROVIDER_MAP: Record<CaseOfUse, AIProvider> = {
  // ...
  myNewCase: {
    name: 'gemini',  // ou 'claude', 'grok', 'ollama'
    model: 'gemini-2.0-flash',
    cost: 0.075,
    speed: 'fast',
    quality: 85,
    maxTokens: 4096,
    rateLimitPerMinute: 600,
  },
}

// 3. Usar no componente
const { executeAI } = useAIProvider()
await executeAI('myNewCase', prompt)
```

#### 3. Acessar Estatísticas

```typescript
const { getStats } = useAIProvider()

const stats = getStats()
console.log(stats)
// {
//   totalCalls: 1000,
//   totalCostUSD: 12.34,
//   avgLatencyMs: 187,
//   byProvider: { claude: { calls: 200, cost: 8.5 }, ... },
//   byCaseOfUse: { legalAnalysis: { calls: 150, cost: 4.2 }, ... }
// }
```

---

## Arquitetura Detalhada

### Service Layer

```typescript
// AIProviderSelector - Core service
class AIProviderSelector {
  // Seleção de provider para um caso de uso
  selectBestProvider(caseOfUse: CaseOfUse): AIProvider

  // Executa com fallback automático
  async executeWithFallback(
    caseOfUse: CaseOfUse, 
    prompt: string
  ): Promise<{
    response: string
    provider: AIProviderName
    costUSD: number
    latencyMs: number
  }>

  // Registra chamada para analytics
  recordCall(
    provider: AIProviderName,
    caseOfUse: CaseOfUse,
    costUSD: number,
    latencyMs: number
  ): void

  // Obtém estatísticas acumuladas
  getStats(): {
    totalCalls: number
    totalCostUSD: number
    avgLatencyMs: number
    byProvider: Record<AIProviderName, { calls: number; cost: number }>
    byCaseOfUse: Record<CaseOfUse, { calls: number; cost: number }>
  }
}
```

### Hook Layer

```typescript
// useAIProvider - React integration
function useAIProvider(): {
  response: string | null         // Resposta do provider
  loading: boolean                // Em processamento
  error: string | null            // Mensagem de erro
  provider: string | null         // Provider usado
  costUSD: number                 // Custo da última chamada
  executeAI(caseOfUse, prompt)    // Executar IA
  getStats()                      // Obter estatísticas
}
```

### Component Layer

```typescript
// AIProviderStats - Dashboard
<AIProviderStats />

// Renderiza:
// - Summary cards (total calls, cost, latency)
// - Provider breakdown (grid com distribuição)
// - Use-case breakdown (tabela detalhada)
// - Savings calculator (comparação vs stack anterior)
```

---

## Fallback Chain em Ação

```
Usuario chama: executeAI('legalAnalysis', prompt)
    ↓
AIProviderSelector.executeWithFallback()
    ↓
Tenta Provider 1: Claude
    ├─ Sucesso? → Retorna resposta
    └─ Falha? → Registra erro, continua
    ↓
Tenta Provider 2: Gemini
    ├─ Sucesso? → Retorna resposta
    └─ Falha? → Registra erro, continua
    ↓
Tenta Provider 3: Grok
    ├─ Sucesso? → Retorna resposta
    └─ Falha? → Registra erro, continua
    ↓
Tenta Provider 4: Ollama (local)
    ├─ Sucesso? → Retorna resposta
    └─ Falha? → Lança erro
    ↓
useAIProvider Hook
    ├─ Atualiza state (response, provider, costUSD)
    ├─ Registra em localStorage
    └─ Notifica UI
    ↓
Componente React
    ├─ Renderiza resposta
    ├─ Mostra provider usado
    └─ Acumula estatísticas
```

---

## Configuração por Ambiente

### Development

```typescript
// .env.local
VITE_CLAUDE_API_KEY=your_key
VITE_GEMINI_API_KEY=your_key
VITE_GROK_API_KEY=your_key
VITE_OLLAMA_URL=http://localhost:11434  # Local Ollama
```

### Fallback automático se key ausente:
- Claude ausente → Tenta Gemini
- Gemini ausente → Tenta Grok
- Grok ausente → Tenta Ollama
- Ollama ausente → Erro

---

## Cost Tracking

### Cálculo de Custo

```typescript
// Por provider
const costs: Record<AIProviderName, number> = {
  claude: 0.80,    // $0.80 por 1M tokens (entrada)
  gemini: 0.075,   // $0.075 por 1M tokens (mais barato)
  grok: 0.05,      // $0.05 por 1M tokens
  ollama: 0,       // Grátis (local)
}

// Cálculo
totalTokens = inputTokens + outputTokens
costPerToken = costMap[provider]
costUSD = totalTokens * costPerToken

// Exemplo:
// Input: 500 tokens, Output: 1000 tokens = 1500 total
// Provider: Claude
// Cost = 1500 * (0.80 / 1_000_000) = $0.0012
```

### Monitoramento

```typescript
// Dashboard mostra:
const stats = {
  totalCalls: 1000,           // Total requisições
  totalCostUSD: 12.34,        // Custo acumulado
  avgLatencyMs: 187,          // Latência média

  byProvider: {
    claude: { calls: 200, cost: 8.50 },
    gemini: { calls: 500, cost: 3.00 },
    grok: { calls: 200, cost: 0.50 },
    ollama: { calls: 100, cost: 0.00 },
  },

  byCaseOfUse: {
    legalAnalysis: { calls: 150, cost: 4.20 },
    emailExtraction: { calls: 300, cost: 0.22 },
    searchQuery: { calls: 250, cost: 0.19 },
    contraArguments: { calls: 200, cost: 3.00 },
    driveSync: { calls: 100, cost: 0.00 },
    ragAnalysis: { calls: 100, cost: 0.00 },
    llmRouting: { calls: 100, cost: 0.00 },
  }
}
```

---

## Quality Assurance

### Validação de Qualidade

Cada caso de uso tem critérios específicos:

```typescript
// legalAnalysis
✓ Resposta > 100 caracteres (profundidade)
✓ Menciona "fraqueza" ou conceito similar (acurácia)
✓ Referência legal presente (técnica)
✓ Usa símbolos jurídicos § ou "art" (formalidade)

// emailExtraction
✓ Jurisprudência ou STF mencionado (contexto)
✓ Conceito jurídico identificado (relevância)
✓ Lei ou artigo referenciado (estrutura)

// searchQuery
✓ LGPD ou proteção de dados mencionado (precisão)
✓ Brasil/lei identificado (localização)
✓ "Dado" ou "informação" no contexto (relevância)

// contraArguments
✓ > 150 caracteres (completude)
✓ Conectivos ("contudo", "porém") (estrutura)
✓ Jurisprudência/precedente referenciado (suporte)
✓ Base legal mencionada (formalidade)

// driveSync
✓ "Metadados" ou "sync" mencionado (domínio)
✓ "Sucesso" ou status OK (resultado)
✓ "Documento" referenciado (contexto)
✓ "Timestamp" ou status temporal (auditorium)

// ragAnalysis
✓ "Contratual" ou "contrato" presente (análise)
✓ "Dano" ou "indenização" identificado (consequência)
✓ "Jurisdição" ou "tribunal" mencionado (foro)

// llmRouting
✓ Tipo de requisição capturado (classificação)
✓ Urgência ou prioridade identificada (escalonamento)
✓ Qualidade mínima definida (SLA)
✓ Rota/provider recomendado (inteligência)
```

### Score Calculation

```typescript
qualityScore = 0
if (criteria1_met) qualityScore += 25
if (criteria2_met) qualityScore += 25
if (criteria3_met) qualityScore += 25
if (criteria4_met) qualityScore += 25

// Score final: 0-100
// Limiar aceitável: >= 80
// Fallback se: < 80
```

---

## Integração com Componentes Existentes

### Exemplo: GmailIntegration

```typescript
// Antes (sem otimização)
const referencias = await servicoGmail.buscarMensagens(query)

// Depois (com otimização)
import { useAIProvider } from '@/hooks/useAIProvider'

function GmailIntegration() {
  const { executeAI } = useAIProvider()
  
  const buscar = async (query: string) => {
    // Buscar emails
    const emails = await servicoGmail.buscarMensagens(query)
    
    // Extrair referências com provider otimizado
    for (const email of emails) {
      const referencias = await executeAI(
        'emailExtraction',
        email.corpo
      )
      // Processar referencias
    }
  }
}
```

### Exemplo: AdvancedSearchUI

```typescript
// Otimizar buscas
const executarBusca = async (query: string) => {
  const { executeAI } = useAIProvider()
  
  // Parse otimizado de query
  const queryParsed = await executeAI('searchQuery', query)
  
  // Resulta em custo mínimo mas qualidade boa
}
```

---

## Performance Tips

### 1. Usar Caching quando possível

```typescript
// Para buscas repetidas
const cache = new Map()
const cacheKey = `${caseOfUse}:${prompt}`

if (cache.has(cacheKey)) {
  return cache.get(cacheKey)
}

const result = await executeAI(caseOfUse, prompt)
cache.set(cacheKey, result)
return result
```

### 2. Batch Requests

```typescript
// Não: 100 chamadas individuais
for (const item of items) {
  await executeAI('legalAnalysis', item)
}

// Sim: 1 chamada com batch
const batch = items.join('\n\n---\n\n')
await executeAI('legalAnalysis', batch)
```

### 3. Use Ollama para Orchestração Local

```typescript
// Meta-tarefas (sempre Ollama, grátis)
const routed = await executeAI('llmRouting', userQuery)
// → Determina qual case of use usar

const classified = await executeAI('driveSync', docMetadata)
// → Classifica documentos localmente
```

---

## Troubleshooting

### Problema: Resposta baixa qualidade

```
1. Check: qualityScore < 80?
2. Log: Qual provider foi usado?
3. Se esperado (Ollama): ok
4. Se inesperado (Claude): investigar
5. Fallback automático disparado?
```

### Problema: Latência alta (> 2s)

```
1. Check: latencyMs > 2000?
2. Log: qual provider?
3. Se Claude (legalAnalysis): esperado
4. Se Gemini (emailExtraction): investigar
5. Network issue ou provider delay?
```

### Problema: Custo acima do budgeted

```
1. Check: stats.totalCostUSD > budget?
2. Analisar: byCaseOfUse breakdown
3. Rebalancear: ajustar weights de seleção
4. Cache: implementar caching mais agressivo
5. Limits: impor rate limits por caso de uso
```

---

## Próximos Passos

1. ✅ **FASE 5**: Integração (COMPLETO)
2. 🔄 **FASE 6**: Benchmarking real dos provedores
3. 📋 **FASE 7**: Otimização baseada em dados
4. 🎯 **V1.1**: Real API integration
5. 🚀 **V2.0**: Full Legal Data Hunter integration

---

## Referências Rápidas

| Arquivo | Responsabilidade |
|---|---|
| `src/services/aiProviderSelector.ts` | Core selection logic |
| `src/hooks/useAIProvider.ts` | React integration |
| `src/components/aiOptimization/AIProviderStats.tsx` | Dashboard UI |
| `src/components/aiOptimization/AIProviderStats.css` | Styling |
| `src/services/aiProviderSelector.test.ts` | Unit tests |
| `docs/AI_PROVIDER_STRATEGY.md` | Strategic overview |
| `docs/IMPLEMENTATION_GUIDE.md` | This file |

**Suporte**: Para dúvidas, veja a estratégia no `docs/AI_PROVIDER_STRATEGY.md`
