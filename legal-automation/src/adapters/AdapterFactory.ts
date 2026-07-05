import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { TribunalAdapter } from './TribunalAdapter';
import { TJSCAdapter } from './TJSCAdapter';
import { TRF4Adapter } from './TRF4Adapter';
import { JFPRAdapter } from './JFPRAdapter';
import { TJPRAdapter } from './TJPRAdapter';
import { JUSTAdapter } from './JUSTAdapter';
import { TJMTAdapter } from './TJMTAdapter';
import { TJROAdapter } from './TJROAdapter';
import { PJeAdapter } from './PJeAdapter';
import { eSAJAdapter } from './eSAJAdapter';
import { PJeConfig, eSAJConfig } from '@types/tribunalAdapters';

export class AdapterFactory {
  private static adapters: Map<string, TribunalAdapter> = new Map();

  static {
    // Initialize all tribunal adapters
    this.register('tjsc', new TJSCAdapter());
    this.register('trf4', new TRF4Adapter());
    this.register('jfpr', new JFPRAdapter());
    this.register('tjpr', new TJPRAdapter());
    this.register('just', new JUSTAdapter());
    this.register('tjmt', new TJMTAdapter());
    this.register('tjro', new TJROAdapter());

    // Register PJe adapters for multiple tribunals
    const pjeConfig: PJeConfig = {
      code: 'pje',
      name: 'PJe - Plataforma de Processo Eletrônico',
      apiUrl: process.env.PJE_API_URL || 'https://pje.cnj.jus.br/api',
      tokenUrl: process.env.PJE_TOKEN_URL || 'https://pje.cnj.jus.br/auth/oauth2/token',
      clientId: process.env.PJE_CLIENT_ID || '',
      clientSecret: process.env.PJE_CLIENT_SECRET || '',
      systemId: 'tjal', // Tribunal de Alagoas como default
    };

    // Register eSAJ adapters for multiple tribunals
    const esajConfig: eSAJConfig = {
      code: 'esaj',
      name: 'eSAJ - Tribunal de Justiça',
      apiUrl: process.env.ESAJ_API_URL || 'https://esaj.tjsp.jus.br/webservices',
      courtSystem: process.env.ESAJ_COURT_SYSTEM || 'TJSP',
    };

    this.register('pje-tjal', new PJeAdapter(pjeConfig));
    this.register('pje-tjpi', new PJeAdapter({ ...pjeConfig, systemId: 'tjpi' }));
    this.register('pje-tjma', new PJeAdapter({ ...pjeConfig, systemId: 'tjma' }));

    this.register('esaj-tjsp', new eSAJAdapter(esajConfig));
    this.register('esaj-tjrs', new eSAJAdapter({ ...esajConfig, courtSystem: 'TJRS' }));
    this.register('esaj-tjmg', new eSAJAdapter({ ...esajConfig, courtSystem: 'TJMG' }));
  }

  /**
   * Get adapter for specific tribunal
   * @param tribunal Tribunal code (tjsc, trf4, jfpr, tjpr, just)
   * @returns TribunalAdapter instance
   */
  static getAdapter(tribunal: string): TribunalAdapter {
    const adapter = this.adapters.get(tribunal.toLowerCase());
    if (!adapter) {
      logger.warn(`Adapter not found for tribunal: ${tribunal}`);
      throw new Error(
        `Tribunal ${tribunal} não suportado. Tribunais disponíveis: ${this.listAdapters().join(', ')}`,
      );
    }
    logger.debug(`Retornando adapter para: ${tribunal}`);
    return adapter;
  }

  /**
   * Register a new tribunal adapter
   * @param name Tribunal code
   * @param adapter TribunalAdapter instance
   */
  static register(name: string, adapter: TribunalAdapter): void {
    this.adapters.set(name.toLowerCase(), adapter);
    logger.info(`Adapter registrado para: ${name}`);
  }

  /**
   * Get list of supported tribunal codes
   * @returns Array of tribunal codes
   */
  static listAdapters(): string[] {
    return Array.from(this.adapters.keys()).sort();
  }

  /**
   * Get detailed information about all adapters
   * @returns Array of adapter info
   */
  static getAdaptersInfo() {
    return Array.from(this.adapters.entries()).map(([code, adapter]) => ({
      code,
      name: adapter.getName(),
      baseUrl: adapter.getBaseUrl(),
    }));
  }

  /**
   * Check if tribunal is supported
   * @param tribunal Tribunal code
   * @returns boolean
   */
  static isSupported(tribunal: string): boolean {
    return this.adapters.has(tribunal.toLowerCase());
  }

  /**
   * Get adapter by tribunal name
   * @param name Tribunal name (TJSC, TRF4, etc)
   * @returns TribunalAdapter instance or null
   */
  static getAdapterByName(name: string): TribunalAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.getName().toLowerCase() === name.toLowerCase()) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * Check health of all adapters
   * @returns Map of tribunal codes to health status
   */
  static async checkAllHealth(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();

    for (const [code, adapter] of this.adapters) {
      try {
        const isHealthy = await adapter.isHealthy();
        health.set(code, isHealthy);
        logger.debug(`${code}: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      } catch (error) {
        logger.warn(`Erro ao verificar saúde de ${code}: ${error}`);
        health.set(code, false);
      }
    }

    return health;
  }

  /**
   * Get health status for specific tribunal
   * @param tribunal Tribunal code
   * @returns boolean
   */
  static async getHealth(tribunal: string): Promise<boolean> {
    try {
      const adapter = this.getAdapter(tribunal);
      return await adapter.isHealthy();
    } catch (error) {
      logger.error(`Erro ao verificar saúde de ${tribunal}: ${error}`);
      return false;
    }
  }
}

export default AdapterFactory;
