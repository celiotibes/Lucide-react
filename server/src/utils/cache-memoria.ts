/**
 * Cache em memória para relatórios (DRE, Fluxo, Margens)
 *
 * Reduz carga no banco de dados ao cachear cálculos custosos por TTL.
 * TTLs padrão:
 * - DRE: 1 hora (Demonstração de Resultado do Exercício recalcula 1x/hora)
 * - Fluxo: 2 horas (Projeção de Fluxo de Caixa menos volatilidade)
 * - Margens: 2 horas (Análise de margens por produto/centro de custo)
 *
 * Responde em < 10ms após primeira execução (armazenado em RAM), muito mais rápido
 * que recalcular direto do banco — vantajoso para dashboards que consultam vários
 * relatórios em paralelo.
 */

interface CacheEntry<T> {
  valor: T;
  expiracao: number; // timestamp de expiração (Date.now() + ttl)
}

interface OpcoesCacheSet {
  /**
   * TTL em milissegundos.
   * Default: 3600000 (1 hora)
   *
   * Valores sugeridos:
   * - DRE: 3600000 (1h) — relatório mensal, dados históricos, recalcula 1x/dia ao meio-dia
   * - Fluxo: 7200000 (2h) — projeção próximos 30d, transações novas chegam 2-3x/dia
   * - Margens: 7200000 (2h) — idem Fluxo
   * - Reconciliação: 1800000 (30min) — movimento bancário/PIX, refaz quando novo lançamento
   */
  ttl?: number;
}

/** Cache em memória singleton — uma instância por processo Node.js */
class CacheMemoria {
  private cache = new Map<string, CacheEntry<unknown>>();
  private timers = new Map<string, NodeJS.Timeout>();

  /**
   * Grava um valor no cache com expiração automática.
   *
   * @param chave ID único do cache (ex: "dre:2026:10", "fluxo:proximo-30d")
   * @param valor Objeto a cachear (JSON-serializável)
   * @param opcoes TTL em ms (default 1h)
   *
   * @example
   * const dre = { receita: 50000, despesa: 30000, ... };
   * cache.set("dre:2026:10", dre, { ttl: 3600000 });
   * const cachedDre = cache.get("dre:2026:10"); // retorna o obj em < 10ms
   */
  set<T>(chave: string, valor: T, opcoes: OpcoesCacheSet = {}): void {
    const ttl = opcoes.ttl ?? 3600000; // 1 hora por default
    const expiracao = Date.now() + ttl;

    // Remove timer anterior se existir
    const timerAntigo = this.timers.get(chave);
    if (timerAntigo) clearTimeout(timerAntigo);

    // Grava valor + timestamp de expiração
    this.cache.set(chave, { valor, expiracao });

    // Limpa automaticamente ao expirar (evita memory leak)
    const timer = setTimeout(() => {
      this.cache.delete(chave);
      this.timers.delete(chave);
    }, ttl);
    this.timers.set(chave, timer);
  }

  /**
   * Retorna um valor do cache se ainda for válido, null se expirado/inexistente.
   *
   * @param chave ID único (mesmo valor passado a `set`)
   * @returns Valor original ou null
   *
   * @example
   * const dre = cache.get("dre:2026:10");
   * if (!dre) {
   *   const dre = await db.calcularDre(2026, 10);
   *   cache.set("dre:2026:10", dre, { ttl: 3600000 });
   * }
   */
  get<T = unknown>(chave: string): T | null {
    const entry = this.cache.get(chave) as CacheEntry<T> | undefined;
    if (!entry) return null;

    // Verifica expiração (safety check)
    if (Date.now() > entry.expiracao) {
      this.cache.delete(chave);
      const timer = this.timers.get(chave);
      if (timer) clearTimeout(timer);
      this.timers.delete(chave);
      return null;
    }

    return entry.valor;
  }

  /**
   * Invalida uma entrada do cache imediatamente.
   * Útil quando dado mudou e precisa recalcular agora (ex: novo lançamento → invalida fluxo).
   *
   * @param chave ID único
   *
   * @example
   * // Novo movimento bancário chegou, marca Fluxo como stale
   * cache.invalidate("fluxo:proximo-30d");
   */
  invalidate(chave: string): void {
    this.cache.delete(chave);
    const timer = this.timers.get(chave);
    if (timer) clearTimeout(timer);
    this.timers.delete(chave);
  }

  /**
   * Invalida todas as entradas que começam com um prefixo.
   * Útil em casos como: "novo mês começou, todas as DREs de meses anteriores continuam válidas,
   * mas a DRE do mês atual precisa recalcular".
   *
   * @param prefixo Prefixo da chave (ex: "dre:", "fluxo:", "margens:reconciliacao")
   *
   * @example
   * // Fim de dia: recalcula tudo que começou a virada (mas mês passado continua em cache)
   * cache.invalidarPrefixo("fluxo:");
   */
  invalidarPrefixo(prefixo: string): void {
    const chaves = Array.from(this.cache.keys()).filter((k) => k.startsWith(prefixo));
    chaves.forEach((k) => this.invalidate(k));
  }

  /**
   * Limpa TUDO do cache. Útil em testes e graceful shutdown.
   */
  limpar(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * Retorna estatísticas de cache para monitoramento (quantas chaves, tamanho aprox).
   * Útil em endpoint /api/health ou dashboard de diagnóstico.
   *
   * @returns { total: número de chaves, chaves: [chave1, chave2, ...] }
   *
   * @example
   * const stats = cache.stats();
   * console.log(stats); // { total: 3, chaves: ["dre:2026:10", "fluxo:...", "margens:..."] }
   */
  stats(): { total: number; chaves: string[] } {
    return {
      total: this.cache.size,
      chaves: Array.from(this.cache.keys()),
    };
  }
}

/** Instância singleton exportada */
export const cache = new CacheMemoria();

/**
 * Type-safe wrapper para cache de relatórios
 * Uso recomendado: acesso stateless (sem state server-side compartilhado)
 */
export interface CacheRelatorio {
  get: <T = unknown>(chave: string) => T | null;
  set: <T = unknown>(chave: string, valor: T, opcoes?: OpcoesCacheSet) => void;
  invalidate: (chave: string) => void;
  invalidarPrefixo: (prefixo: string) => void;
  stats: () => { total: number; chaves: string[] };
}

/**
 * Factory para criar cache com keys tipadas (TypeScript)
 * Uso avançado em código que quer type-safety em chaves de cache
 *
 * @example
 * const cacheDre = criarCacheRelatorio("dre");
 * cacheDre.set(2026, 10, {...});
 * const resultado = cacheDre.get(2026, 10); // ✅ type-checked
 */
export function criarCacheRelatorio(prefixo: string) {
  return {
    set<T>(ano: number, mes: number, valor: T, opcoes?: OpcoesCacheSet) {
      const chave = `${prefixo}:${ano}:${mes}`;
      cache.set(chave, valor, opcoes);
    },
    get<T = unknown>(ano: number, mes: number): T | null {
      const chave = `${prefixo}:${ano}:${mes}`;
      return cache.get<T>(chave);
    },
    invalidate(ano: number, mes: number) {
      const chave = `${prefixo}:${ano}:${mes}`;
      cache.invalidate(chave);
    },
  };
}
