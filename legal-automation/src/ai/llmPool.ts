import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { RateLimitError, AppError } from '@utils/errors';

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeout?: number;
  cacheKey?: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  cached: boolean;
}

export type LLMProvider = 'gemini' | 'grok' | 'ollama' | 'offline';

interface ProviderConfig {
  primary: LLMProvider;
  fallbacks: LLMProvider[];
  offlineEnabled: boolean;
  cacheTTL: number;
}

export class LLMPool {
  private config: ProviderConfig;
  private cache: Map<string, { content: string; timestamp: number }> = new Map();
  private geminiClient: any;
  private grokClient: any;
  private ollamaUrl: string;

  constructor() {
    this.config = {
      primary: (config.ai_primary_model as LLMProvider) || 'gemini',
      fallbacks: (config.ai_fallback_models?.split(',') as LLMProvider[]) || ['ollama'],
      offlineEnabled: config.ai_offline_mode !== 'false',
      cacheTTL: parseInt(config.ai_cache_ttl || '604800'),
    };

    this.initializeClients();
    this.startCacheCleanup();
  }

  private initializeClients(): void {
    if (this.config.primary === 'gemini' || this.config.fallbacks.includes('gemini')) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.geminiClient = new GoogleGenerativeAI(config.gemini_api_key);
        logger.info('✓ Gemini client inicializado');
      } catch (error) {
        logger.warn('Gemini não disponível:', error instanceof Error ? error.message : 'desconhecido');
      }
    }

    if (this.config.primary === 'grok' || this.config.fallbacks.includes('grok')) {
      logger.info('✓ Grok client configurado');
    }

    if (this.config.primary === 'ollama' || this.config.fallbacks.includes('ollama')) {
      this.ollamaUrl = config.ollama_base_url || 'http://localhost:11434';
      logger.info(`✓ Ollama configurado: ${this.ollamaUrl}`);
    }
  }

  async call(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    const cacheKey = options.cacheKey || this.generateCacheKey(prompt);

    // Verificar cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.debug(`Cache hit para: ${cacheKey.substring(0, 50)}...`);
      return {
        content: cached,
        provider: 'cache',
        model: 'cached',
        tokensUsed: 0,
        cached: true,
      };
    }

    const providers = [this.config.primary, ...this.config.fallbacks];

    for (const provider of providers) {
      try {
        logger.debug(`Tentando ${provider}...`);
        const response = await this.callProvider(provider, prompt, options);

        // Cache resultado
        this.setInCache(cacheKey, response.content, this.config.cacheTTL);

        return response;
      } catch (error) {
        logger.warn(`${provider} falhou:`, error instanceof Error ? error.message : 'desconhecido');

        if (provider === providers[providers.length - 1]) {
          // Última opção
          if (this.config.offlineEnabled) {
            logger.warn('Todos os provedores falharam, usando modo offline');
            return this.offlineMode(prompt);
          }
          throw new AppError(503, 'Todos os provedores de IA indisponíveis');
        }
      }
    }

    throw new AppError(503, 'Nenhum provedor de IA disponível');
  }

  private async callProvider(
    provider: LLMProvider,
    prompt: string,
    options: LLMOptions,
  ): Promise<LLMResponse> {
    const timeout = options.timeout || 30000;

    switch (provider) {
      case 'gemini':
        return this.callGemini(prompt, options, timeout);
      case 'grok':
        return this.callGrok(prompt, options, timeout);
      case 'ollama':
        return this.callOllama(prompt, options, timeout);
      default:
        throw new AppError(400, `Provedor desconhecido: ${provider}`);
    }
  }

  private async callGemini(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    if (!this.geminiClient) {
      throw new Error('Gemini client não inicializado');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: config.gemini_model || 'gemini-1.5-flash',
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 2048,
        topP: options.topP ?? 0.9,
      },
    });

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Gemini')), timeout),
    );

    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise,
      ]);

      const response = result as any;
      const content = response.response.text();

      return {
        content,
        provider: 'gemini',
        model: config.gemini_model || 'gemini-1.5-flash',
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) {
        throw new RateLimitError('Gemini rate limit excedido');
      }
      throw error;
    }
  }

  private async callGrok(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    const axios = require('axios');

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Grok')), timeout),
    );

    try {
      const response = await Promise.race([
        axios.post(
          'https://api.xai.com/v1/chat/completions',
          {
            model: config.grok_model || 'grok-4.1-fast',
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 2048,
          },
          {
            headers: {
              Authorization: `Bearer ${config.grok_api_key}`,
              'Content-Type': 'application/json',
            },
          },
        ),
        timeoutPromise,
      ]);

      const content = response.data.choices[0].message.content;

      return {
        content,
        provider: 'grok',
        model: config.grok_model || 'grok-4.1-fast',
        tokensUsed: response.data.usage?.total_tokens || 0,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) {
        throw new RateLimitError('Grok rate limit excedido');
      }
      throw error;
    }
  }

  private async callOllama(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    const axios = require('axios');

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Ollama')), timeout),
    );

    try {
      const response = await Promise.race([
        axios.post(
          `${this.ollamaUrl}/api/generate`,
          {
            model: config.ollama_model || 'initium/law_model',
            prompt,
            stream: false,
            temperature: options.temperature ?? 0.3,
            num_predict: options.maxTokens ?? 2048,
          },
          { timeout },
        ),
        timeoutPromise,
      ]);

      return {
        content: response.data.response,
        provider: 'ollama',
        model: config.ollama_model || 'initium/law_model',
        tokensUsed: 0, // Ollama não retorna token count
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error('Ollama não disponível. Ensure `ollama serve` is running');
      }
      throw error;
    }
  }

  private offlineMode(prompt: string): LLMResponse {
    logger.warn('Usando modo offline (degradado)');

    // Implementação simples de template matching
    const templates: Record<string, string> = {
      'gerar petição': 'Rascunho de petição (modo offline) - Requer revisão manual',
      'analisar movimentos':
        'Análise de movimentos (modo offline) - Sincronize com servidor depois',
      'validar petição': 'Validação (modo offline) - Cheque manual necessário',
    };

    for (const [keyword, response] of Object.entries(templates)) {
      if (prompt.toLowerCase().includes(keyword)) {
        return {
          content: response,
          provider: 'offline',
          model: 'template',
          tokensUsed: 0,
          cached: false,
        };
      }
    }

    return {
      content: 'Modo offline: Serviço indisponível. Tente novamente mais tarde.',
      provider: 'offline',
      model: 'fallback',
      tokensUsed: 0,
      cached: false,
    };
  }

  private generateCacheKey(prompt: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  private getFromCache(key: string): string | null {
    const cached = this.cache.get(key);

    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTL * 1000) {
      this.cache.delete(key);
      return null;
    }

    return cached.content;
  }

  private setInCache(key: string, content: string, ttl: number): void {
    this.cache.set(key, {
      content,
      timestamp: Date.now(),
    });
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.config.cacheTTL * 1000) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cache cleanup: ${cleaned} entradas removidas`);
      }
    }, 60 * 60 * 1000); // A cada hora
  }

  getStatus(): object {
    return {
      primaryProvider: this.config.primary,
      fallbacks: this.config.fallbacks,
      cacheSize: this.cache.size,
      cacheTTL: this.config.cacheTTL,
      offlineEnabled: this.config.offlineEnabled,
      geminiAvailable: !!this.geminiClient,
      ollamaUrl: this.ollamaUrl,
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Cache de IA limpo');
  }
}

export const llmPool = new LLMPool();
