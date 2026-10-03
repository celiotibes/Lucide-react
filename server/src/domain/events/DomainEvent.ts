/**
 * Interface base para todos os eventos de domínio
 * Event Sourcing permite auditoria completa
 */

export interface DomainEvent {
  /**
   * Identificador único do evento
   */
  id: string;

  /**
   * Tipo do evento (usado para routing)
   */
  type: string;

  /**
   * Agregado que originaram o evento
   */
  agregadoId: string;

  /**
   * Tipo do agregado
   */
  agregadoTipo: string;

  /**
   * Payload com dados do evento
   */
  payload: Record<string, any>;

  /**
   * Timestamp de quando foi criado
   */
  timestamp: string;

  /**
   * Versão do evento (para evolução)
   */
  versao: number;

  /**
   * Metadados adicionais (usuário, IP, etc)
   */
  metadados?: Record<string, any>;

  /**
   * Correlação com outro evento (para rastreabilidade)
   */
  correlacaoId?: string;
}

/**
 * Factory para criar eventos
 */
export function criarDomainEvent(
  type: string,
  agregadoId: string,
  agregadoTipo: string,
  payload: Record<string, any>,
  metadados?: Record<string, any>,
  correlacaoId?: string
): DomainEvent {
  return {
    id: `${agregadoTipo}-${agregadoId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    agregadoId,
    agregadoTipo,
    payload,
    timestamp: new Date().toISOString(),
    versao: 1,
    metadados,
    correlacaoId,
  };
}
