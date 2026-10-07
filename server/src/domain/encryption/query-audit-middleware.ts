/**
 * Middleware para auditoria de queries SELECT
 * Intercepta queries de leitura e registra acesso em compliance-audit-log
 */

import { extrairCamposSelect, deveAuditarQuery, registrarAcessoCampos } from '../../domain/erp/compliance-audit-log';

export interface ContextoRequisicao {
  usuarioId: number;
  usuarioNome: string;
  ipOrigem: string;
}

export interface ConfigAuditMiddleware {
  habilitado: boolean;
  registrarTodosCampos: boolean;
  ignorarCampos?: string[];
  ignorarTabelas?: string[];
}

/**
 * Valor padrão: auditoria habilitada em produção, desabilitada em teste
 */
export const CONFIG_AUDIT_PADRAO: ConfigAuditMiddleware = {
  habilitado: process.env.NODE_ENV === 'production',
  registrarTodosCampos: false,
  ignorarCampos: [],
  ignorarTabelas: ['sqlite_sequence', 'sqlite_stat1'],
};

/**
 * Extrai nome da tabela de uma query SELECT
 */
export function extrairNomeTabelaSelect(query: string): string | null {
  const match = query.match(/FROM\s+(\w+)/i);
  return match ? match[1] : null;
}

/**
 * Middleware para interceptar e auditar queries SELECT
 */
export class AuditoriaQuerySelectMiddleware {
  private config: ConfigAuditMiddleware;
  private db: unknown;

  constructor(db: unknown, config: Partial<ConfigAuditMiddleware> = {}) {
    this.db = db;
    this.config = { ...CONFIG_AUDIT_PADRAO, ...config };
  }

  /**
   * Processa uma query SELECT e registra auditoria
   */
  async executarComAuditoria(
    query: string,
    contexto: ContextoRequisicao,
    executor: (q: string) => Record<string, unknown>
  ): Promise<unknown> {
    const inicio = Date.now();

    // Executar query
    const resultado = executor(query);
    const tempoMs = Date.now() - inicio;

    // Auditar se habilitado
    if (this.config.habilitado) {
      this.auditarSelect(query, contexto, tempoMs);
    }

    return resultado;
  }

  /**
   * Registra acesso a uma query SELECT
   */
  private auditarSelect(
    query: string,
    contexto: ContextoRequisicao,
    tempoMs: number
  ): void {
    // Verificar se query deve ser auditada
    if (!deveAuditarQuery(query)) {
      return;
    }

    // Extrair informações da query
    const tabela = extrairNomeTabelaSelect(query);
    const campos = extrairCamposSelect(query);

    if (!tabela) return;

    // Ignorar certas tabelas
    if (this.config.ignorarTabelas?.includes(tabela)) {
      return;
    }

    // Registrar acesso apenas a campos sensíveis
    if (campos.length > 0 && campos[0] !== '*') {
      try {
        registrarAcessoCampos(
          this.db,
          contexto.usuarioId,
          contexto.usuarioNome,
          contexto.ipOrigem,
          tabela,
          0, // ID genérico para operação na tabela inteira
          campos,
          tempoMs
        );
      } catch (erro) {
        console.error('Erro ao registrar auditoria de SELECT:', erro);
        // Não falhar a query se auditoria falhar
      }
    }
  }

  /**
   * Registra acesso a um registro específico
   */
  registrarAcessoRegistro(
    tabela: string,
    idRegistro: number,
    campos: string[],
    contexto: ContextoRequisicao,
    tempoMs: number = 0
  ): void {
    if (!this.config.habilitado) return;

    if (this.config.ignorarTabelas?.includes(tabela)) {
      return;
    }

    try {
      registrarAcessoCampos(
        this.db,
        contexto.usuarioId,
        contexto.usuarioNome,
        contexto.ipOrigem,
        tabela,
        idRegistro,
        campos,
        tempoMs
      );
    } catch (erro) {
      console.error('Erro ao registrar acesso a registro:', erro);
    }
  }

  /**
   * Habilita ou desabilita auditoria
   */
  setHabilitado(habilitado: boolean): void {
    this.config.habilitado = habilitado;
  }

  /**
   * Adiciona campo à lista de ignorar
   */
  adicionarCampoIgnorado(campo: string): void {
    if (!this.config.ignorarCampos?.includes(campo)) {
      this.config.ignorarCampos?.push(campo);
    }
  }

  /**
   * Adiciona tabela à lista de ignorar
   */
  adicionarTabelaIgnorada(tabela: string): void {
    if (!this.config.ignorarTabelas?.includes(tabela)) {
      this.config.ignorarTabelas?.push(tabela);
    }
  }

  /**
   * Obter configuração atual
   */
  obterConfiguracao(): ConfigAuditMiddleware {
    return { ...this.config };
  }
}

/**
 * Factory para criar middleware com configuração comum
 */
export function criarMiddlewareAuditoria(
  db: unknown,
  config?: Partial<ConfigAuditMiddleware>
): AuditoriaQuerySelectMiddleware {
  return new AuditoriaQuerySelectMiddleware(db, config);
}

/**
 * Decorador para auditar funções que executam SELECT
 */
export function AuditarSelect(
  middleware: AuditoriaQuerySelectMiddleware,
  contexto: ContextoRequisicao
) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const metodoOriginal = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const inicio = Date.now();
      const resultado = await metodoOriginal.apply(this, args);
      const tempoMs = Date.now() - inicio;

      // Registrar acesso genérico ao método
      console.log(`[AUDIT] ${propertyKey} executado em ${tempoMs}ms por usuário ${contexto.usuarioId}`);

      return resultado;
    };

    return descriptor;
  };
}
