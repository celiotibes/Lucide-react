/**
 * Eventos específicos de Cobrança
 * Rastreiam todas as mudanças no ciclo de vida de uma cobrança
 */

import { criarDomainEvent, type DomainEvent } from './DomainEvent.js';

/**
 * Evento disparado quando uma cobrança é criada
 */
export function criarCobrancaCriadaEvent(
  cobrancaId: number,
  usuarioId: number,
  imovelId: number,
  valor: number,
  dataVencimento: string,
  metadados?: Record<string, any>
): DomainEvent {
  return criarDomainEvent(
    'CobrancaCriada',
    `cobranca-${cobrancaId}`,
    'Cobranca',
    {
      cobrancaId,
      usuarioId,
      imovelId,
      valor,
      dataVencimento,
      status: 'pendente',
    },
    metadados
  );
}

/**
 * Evento disparado quando cobrança é atualizada
 */
export function criarCobrancaAtualizadaEvent(
  cobrancaId: number,
  alteracoes: Record<string, any>,
  metadados?: Record<string, any>
): DomainEvent {
  return criarDomainEvent(
    'CobrancaAtualizada',
    `cobranca-${cobrancaId}`,
    'Cobranca',
    {
      cobrancaId,
      alteracoes,
    },
    metadados
  );
}

/**
 * Evento disparado quando cobrança é reconciliada/paga
 */
export function criarCobrancaReconciliadaEvent(
  cobrancaId: number,
  novoStatus: 'pago' | 'cancelado' | 'atrasado',
  dataPagamento: string,
  metadados?: Record<string, any>
): DomainEvent {
  return criarDomainEvent(
    'CobrancaReconciliada',
    `cobranca-${cobrancaId}`,
    'Cobranca',
    {
      cobrancaId,
      novoStatus,
      dataPagamento,
    },
    metadados
  );
}

/**
 * Evento disparado quando cobrança vence
 */
export function criarCobrancaVencidaEvent(
  cobrancaId: number,
  dataVencimento: string,
  diasAtrasado: number,
  metadados?: Record<string, any>
): DomainEvent {
  return criarDomainEvent(
    'CobrancaVencida',
    `cobranca-${cobrancaId}`,
    'Cobranca',
    {
      cobrancaId,
      dataVencimento,
      diasAtrasado,
    },
    metadados
  );
}

/**
 * Evento disparado quando cobrança é deletada
 */
export function criarCobrancaDeletadaEvent(
  cobrancaId: number,
  motivo?: string,
  metadados?: Record<string, any>
): DomainEvent {
  return criarDomainEvent(
    'CobrancaDeletada',
    `cobranca-${cobrancaId}`,
    'Cobranca',
    {
      cobrancaId,
      motivo,
    },
    metadados
  );
}
