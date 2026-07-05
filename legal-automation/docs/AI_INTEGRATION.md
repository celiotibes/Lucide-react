# Integração de IA (Gemini, Grok, Ollama) - Legal Automation

Guia completo para integrar LLMs ao sistema de automação jurídica com contingências.

## 🏗️ Arquitetura de IA

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer                                       │
│  - Document Analysis                                    │
│  - Petition Generation                                  │
│  - Movement Analysis                                    │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   ┌──────────┐          ┌──────────┐
   │ AI Cache │          │ LLM Pool │
   │ (Redis)  │          │ Manager  │
   └──────────┘          └────┬─────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌──────────┐          ┌──────────┐          ┌──────────┐
   │ Gemini   │          │ Grok     │          │ Ollama   │
   │ 3.5 Flash│          │ 4.1 Fast │          │ Local    │
   │(Primary) │          │(Fallback)│          │(Fallback)│
   └──────────┘          └──────────┘          └──────────┘

Priority: Gemini → Grok → Ollama → Offline Mode
```

## 📊 Comparativo: Qual Usar e Quando

| Caso de Uso | Gemini | Grok | Ollama | Motivo |
|-------------|--------|------|--------|--------|
| Geração de petições | ✅ Prime | ✅ | ⚠️ | Gemini melhor contexto |
| Análise de movimentos | ✅ Prime | ✅ | ✅ | Qualquer um serve |
| Extração de dados | ✅ Prime | ✅ | ✅ | Qualquer um serve |
| Validação de documentos | ⚠️ | ⚠️ | ✅ Prime | Ollama local (LGPD) |
| Dados sensíveis | ❌ | ❌ | ✅ Prime | Privacy-first |
| Custo reduzido | ✅ | ⚠️ Alto | ✅ Grátis | Ollama local é grátis |
| Latência crítica | ✅ Médio | ✅ Médio | ✅ Baixa | Ollama 100-300ms |
| Português nativo | ✅ Bom | ✅ Bom | ⚠️ Limitado | Gemini melhor |

## 🔧 Configuração

### 1. Variáveis de Ambiente

```env
# Gemini (Recomendado)
GEMINI_API_KEY=sua_chave_publica
GEMINI_MODEL=gemini-1.5-flash
GEMINI_ENABLE=true

# Grok (Fallback)
GROK_API_KEY=sua_chave_xai
GROK_MODEL=grok-4.1-fast
GROK_ENABLE=false

# Ollama (Local + Fallback)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=initium/law_model
OLLAMA_ENABLE=true

# AI Config
AI_CACHE_TTL=604800
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=30000
AI_ENABLE_RAG=true
```

### 2. Instalar Dependências

```bash
npm install google-generative-ai @anthropic-ai/sdk axios
```

### 3. Download de Ollama (Opcional)

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Baixar de https://ollama.com/download

# Puxar modelo jurídico
ollama pull initium/law_model
ollama serve
```

## 📝 Casos de Uso Implementados

### 1. Geração de Petições Automatizadas

```typescript
// Exemplo: Gerar petição de homologação

const petition = await aiService.generatePetition({
  processNumber: '0000001-12.2023.8.26.0100',
  processType: 'homologação',
  templateType: 'intermediate',
  context: {
    plaintiff: 'João Silva',
    defendant: 'Maria Santos',
    subject: 'Cobrança de débito',
    caseHistory: '...',
  },
});

// Resultado: Rascunho RTF completo pronto para revisão
console.log(petition.rtfContent);
console.log(petition.confidence); // 0.87
```

**Fluxo:**
1. Extrair contexto do processo
2. Enviar para Gemini com chain-of-thought jurídico
3. Gerar RTF com formatação
4. Revisar e assinar digitalmente

### 2. Análise de Movimentações

```typescript
// Resumo executivo de um processo

const analysis = await aiService.analyzeMovements({
  processNumber: '0000001-12.2023.8.26.0100',
  analysisType: 'executive_summary',
});

// Resultado:
{
  summary: "Processo em fase de recursos...",
  phase: "Recursal",
  nextDeadline: "2024-02-15",
  riskLevel: "medium",
  recommendations: ["Preparar contrarrazões", "..."],
  confidence: 0.92
}
```

### 3. Extração Estruturada de Documentos

```typescript
// OCR + Extração de PDF

const extracted = await aiService.extractFromDocument({
  file: pdfBuffer,
  extractionSchema: {
    partes: 'array',
    pretensoes: 'array',
    fundamentos: 'array',
    prazos: 'array',
  },
});

// Resultado estruturado JSON
{
  partes: [
    { nome: "João Silva", role: "autor" },
    { nome: "Maria Santos", role: "ré" }
  ],
  pretensoes: ["Cobrança de débito"],
  prazos: [
    { descricao: "Contestação", data: "2024-02-15" }
  ]
}
```

### 4. Validação de Petições Antes de Envio

```typescript
// Checklist automático de completude

const validation = await aiService.validatePetition({
  petitionContent: rtfContent,
  petitionType: 'PETICAO',
  checklist: [
    'Numeração processual correta',
    'Partes identificadas',
    'Pedido claro',
    'Fundamentos jurídicos',
    'Assinatura digital presente'
  ],
});

// Resultado:
{
  isValid: true,
  score: 0.94,
  issues: [],
  warnings: ["Jurisprudência não verificada - consulte STF"],
  suggestions: ["Adicionar citação do CPC artigo XYZ"]
}
```

### 5. RAG (Retrieval-Augmented Generation)

Combinar LLM com base de conhecimento jurídico verificada:

```typescript
const response = await aiService.queryWithRAG({
  question: "Qual é o prazo para contestação em ação ordinária?",
  sources: ['codigo_processual_civil', 'jurisprudencia_stf'],
  verificationRequired: true,
});

// Resultado com citações verificadas
{
  answer: "15 dias úteis conforme CPC art. 335",
  sources: [
    {
      type: "statute",
      reference: "CPC art. 335",
      url: "https://..."
    }
  ],
  confidence: 0.99
}
```

## 🛡️ Estratégia de Contingência

### Arquitetura de Fallback

```typescript
interface AIProviderConfig {
  primary: 'gemini' | 'grok' | 'ollama';
  fallbacks: Array<'gemini' | 'grok' | 'ollama'>;
  offlineMode: boolean;
  cacheStrategy: 'aggressive' | 'normal' | 'none';
}

const aiConfig: AIProviderConfig = {
  primary: 'gemini',
  fallbacks: ['grok', 'ollama'],
  offlineMode: true,
  cacheStrategy: 'aggressive',
};
```

### Implementação do LLMPool

```typescript
class LLMPool {
  async call(
    prompt: string,
    options: LLMOptions
  ): Promise<string> {
    const providers = [this.config.primary, ...this.config.fallbacks];
    
    for (const provider of providers) {
      try {
        logger.debug(`Tentando com ${provider}...`);
        return await this.callProvider(provider, prompt, options);
      } catch (error) {
        logger.warn(`${provider} falhou: ${error.message}`);
        // Continua para próximo fallback
      }
    }
    
    // Última opção: modo offline
    return this.offlineMode(prompt);
  }

  private async callProvider(
    provider: string,
    prompt: string,
    options: LLMOptions
  ): Promise<string> {
    // Verificar cache primeiro
    const cached = await this.cache.get(prompt);
    if (cached) return cached;
    
    // Chamar provider
    let response: string;
    switch (provider) {
      case 'gemini':
        response = await this.geminiClient.call(prompt, options);
        break;
      case 'grok':
        response = await this.grokClient.call(prompt, options);
        break;
      case 'ollama':
        response = await this.ollamaClient.call(prompt, options);
        break;
    }
    
    // Cache para próximas vezes
    await this.cache.set(prompt, response, this.config.cacheTTL);
    
    return response;
  }

  private offlineMode(prompt: string): string {
    // Modo degradado com templates/regex
    return this.templateEngine.process(prompt);
  }
}
```

### Rate Limiting com Redis

```typescript
class AIRateLimiter {
  async checkLimit(userId: string): Promise<boolean> {
    const key = `ai:rate:${userId}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, 3600); // 1 hora
    }
    
    const limit = 100; // 100 requisições por hora
    if (current > limit) {
      throw new RateLimitError('Limite de IA excedido');
    }
    
    return true;
  }
}
```

## 💰 Custos Estimados

### Gemini
- Free tier: Até 50 requisições/dia
- Produção: ~$0.05-0.50 por 1M tokens
- Estimativa mensal: **$20-100** (dependendo de volume)

**Economia com caching:** Context caching reduz custos até 90%

### Grok
- Free: $175/mês (com data-sharing)
- Paid: $0.20/M tokens (4.1 Fast)
- Estimativa mensal: **$150-200**

### Ollama
- Hardware: Computador com 16GB+ RAM
- Licença: Open-source (free)
- Estimativa mensal: **$0**

### Total Recomendado
- **Cenário lean:** Ollama local + Gemini free = $0-20
- **Cenário produção:** Gemini caching + Ollama backup = $50-100/mês
- **Cenário premium:** Gemini + Grok + Ollama = $150-300/mês

## 🔒 Conformidade LGPD

### Dados Sensíveis - SEMPRE Usar Ollama Local

```typescript
// ❌ NUNCA fazer isso com dados sensíveis
const response = await geminiClient.analyze(cpfNumber);

// ✅ SEMPRE fazer assim
const response = await ollamaClient.analyze(cpfNumber);
// Processamento 100% local, não sai da máquina
```

### Audit Trail Obrigatório

```typescript
interface AIAuditLog {
  timestamp: Date;
  userId: string;
  prompt: string; // Ou hash se sensível
  provider: string;
  model: string;
  tokensUsed: number;
  cost: number;
  result: string; // Ou hash se sensível
  approvedBy?: string;
}

// Registrar SEMPRE
await auditLog.save({
  userId: user.id,
  provider: 'gemini',
  prompt: hashIfSensitive(prompt),
  result: hashIfSensitive(result),
});
```

## 🚀 Implementação Prática

### 1. Instalar Dependências

```bash
npm install google-generative-ai @anthropic-ai/sdk axios ioredis
```

### 2. Criar LLM Service

```typescript
// src/services/aiService.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

class AIService {
  private gemini: GoogleGenerativeAI;
  private grokClient: any;
  private ollama: string;
  private cache: Redis;

  constructor() {
    this.gemini = new GoogleGenerativeAI(config.gemini_api_key);
    this.ollama = config.ollama_base_url;
  }

  async generatePetition(options: GeneratePetitionOptions): Promise<PetitionResult> {
    const prompt = this.buildPetitionPrompt(options);
    
    const response = await this.llmPool.call(prompt, {
      model: 'petition_generation',
      temperature: 0.3,
    });

    return this.parsePetitionResponse(response);
  }

  async analyzeMovements(processNumber: string): Promise<MovementAnalysis> {
    // Similar implementation
  }
}

export const aiService = new AIService();
```

### 3. Adicionar Endpoints

```typescript
// src/api/controllers/aiController.ts
router.post('/petitions/generate', async (req, res) => {
  const { processNumber, type } = req.body;
  
  const petition = await aiService.generatePetition({
    processNumber,
    templateType: type,
  });

  res.json({
    content: petition.rtfContent,
    confidence: petition.confidence,
    warnings: petition.warnings,
  });
});
```

## 📋 Checklist de Implementação

- [ ] Gemini API key configurada
- [ ] Redis cache configurado
- [ ] LLMPool com fallbacks implementado
- [ ] Rate limiter com Redis
- [ ] Audit log database
- [ ] Ollama local instalado (opcional)
- [ ] Prompts jurídicos otimizados
- [ ] RAG com fontes verificadas
- [ ] Validação de saída LLM
- [ ] Testes E2E com mocks
- [ ] LGPD audit trail completo
- [ ] Documentação de prompts
- [ ] Dashboard de custos/uso

## ⚠️ Avisos Críticos

1. **LLMs alucinam** - Sempre verificar citações jurídicas em STF/TJ
2. **Sem decisão automática** - Saídas de IA são sempre sugestões para revisão humana
3. **Cache por query** - Mesmos prompts retornam resultado em cache (7 dias)
4. **Monitoramento** - Log todas as requisições para auditoria LGPD
5. **Fallback testado** - Teste contingências regularmente

## 📚 Recursos Adicionais

- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Ollama GitHub](https://github.com/ollama/ollama)
- [RAG Best Practices](https://arxiv.org/abs/2312.10997)
- [LLM Jailbreak Prevention](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications)
