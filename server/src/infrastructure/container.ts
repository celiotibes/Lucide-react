/**
 * Dependency Injection Container
 * Gerencia registro e resolução de dependências (Singleton pattern)
 *
 * Usage:
 *   const container = new Container();
 *   container.register('db', database);
 *   container.register('cobrancaRepository', () => new CobrancaRepository(container.resolve('db')));
 *
 *   const repo = container.resolve('cobrancaRepository');
 */

type Factory<T> = () => T;
type ServiceDefinition<T> = T | Factory<T>;

export class Container {
  private services = new Map<string, any>();
  private factories = new Map<string, Factory<any>>();

  /**
   * Registra um serviço ou factory
   */
  register<T>(name: string, definition: ServiceDefinition<T>): void {
    if (typeof definition === 'function' && !this.isClass(definition)) {
      // É uma factory function
      this.factories.set(name, definition as Factory<T>);
      this.services.delete(name);
    } else {
      // É uma instância ou classe
      this.services.set(name, definition);
      this.factories.delete(name);
    }
  }

  /**
   * Registra um serviço singleton (criado uma única vez)
   */
  registerSingleton<T>(name: string, factory: Factory<T>): void {
    let instance: T | undefined;

    const singletonFactory = () => {
      if (instance === undefined) {
        instance = factory();
      }
      return instance;
    };

    this.factories.set(name, singletonFactory);
    this.services.delete(name);
  }

  /**
   * Resolve um serviço
   */
  resolve<T>(name: string): T {
    // Primeiro tenta retornar instância já criada
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    // Depois tenta usar factory
    if (this.factories.has(name)) {
      return this.factories.get(name)() as T;
    }

    throw new Error(`Service "${name}" not found in container`);
  }

  /**
   * Verifica se serviço está registrado
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Remove um serviço
   */
  remove(name: string): void {
    this.services.delete(name);
    this.factories.delete(name);
  }

  /**
   * Limpa todos os serviços
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }

  /**
   * Helper para detectar se é classe
   */
  private isClass(func: any): boolean {
    const isClass =
      typeof func === 'function' &&
      func.prototype &&
      func.prototype.constructor === func;
    return isClass;
  }
}

// Instância global do container
let globalContainer: Container | null = null;

/**
 * Obtém ou cria a instância global do container
 */
export function getContainer(): Container {
  if (!globalContainer) {
    globalContainer = new Container();
  }
  return globalContainer;
}

/**
 * Reseta container global (útil para testes)
 */
export function resetContainer(): void {
  globalContainer = null;
}

/**
 * Cria um novo container isolado
 */
export function createContainer(): Container {
  return new Container();
}
