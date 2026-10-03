/**
 * Export central para Event Sourcing
 */

export { type DomainEvent, criarDomainEvent } from './DomainEvent.js';
export {
  criarCobrancaCriadaEvent,
  criarCobrancaAtualizadaEvent,
  criarCobrancaReconciliadaEvent,
  criarCobrancaVencidaEvent,
  criarCobrancaDeletadaEvent,
} from './CobrancaEvents.js';

export { type IEventStore, EventStore } from './EventStore.js';
