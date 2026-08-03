/**
 * GraphQL Subscription Resolvers
 * Handles real-time updates via WebSocket
 */

import { IResolvers } from '@graphql-tools/utils';
import { eventService, EVENTS } from '@services/EventEmitterService';
import { logger } from '@utils/logger';
import { withFilter } from 'graphql-subscriptions';

/**
 * Subscription Resolvers
 */
export const subscriptionResolvers: IResolvers = {
  Subscription: {
    // ========================================================================
    // CASE SUBSCRIPTIONS
    // ========================================================================

    caseUpdated: {
      subscribe: withFilter(
        () => eventService.asyncIterator([EVENTS.CASE_UPDATED]),
        (payload: any, variables: any) => {
          return payload.caseId === variables.caseId;
        },
      ),
      resolve: (payload: any) => payload.case,
    },

    caseCreated: {
      subscribe: () => eventService.asyncIterator([EVENTS.CASE_CREATED]),
      resolve: (payload: any) => payload.case,
    },

    caseStatusChanged: {
      subscribe: withFilter(
        () => eventService.asyncIterator([EVENTS.CASE_STATUS_CHANGED]),
        (payload: any, variables: any) => {
          return payload.caseId === variables.caseId;
        },
      ),
      resolve: (payload: any) => ({
        caseId: payload.caseId,
        previousStatus: payload.previousStatus,
        newStatus: payload.newStatus,
        timestamp: new Date().toISOString(),
      }),
    },

    // ========================================================================
    // CONTRACT SUBSCRIPTIONS
    // ========================================================================

    contractSigned: {
      subscribe: withFilter(
        () => eventService.asyncIterator([EVENTS.CONTRACT_SIGNED]),
        (payload: any, variables: any) => {
          return payload.contractId === variables.contractId;
        },
      ),
      resolve: (payload: any) => payload.contract,
    },

    contractCreated: {
      subscribe: () => eventService.asyncIterator([EVENTS.CONTRACT_CREATED]),
      resolve: (payload: any) => payload.contract,
    },

    // ========================================================================
    // PAYMENT SUBSCRIPTIONS
    // ========================================================================

    paymentReceived: {
      subscribe: withFilter(
        () => eventService.asyncIterator([EVENTS.PAYMENT_RECEIVED]),
        (payload: any, variables: any) => {
          return payload.invoiceId === variables.invoiceId;
        },
      ),
      resolve: (payload: any) => payload.invoice,
    },

    invoiceCreated: {
      subscribe: () => eventService.asyncIterator([EVENTS.INVOICE_CREATED]),
      resolve: (payload: any) => payload.invoice,
    },

    // ========================================================================
    // DEADLINE SUBSCRIPTIONS
    // ========================================================================

    deadlineApproaching: {
      subscribe: () => eventService.asyncIterator([EVENTS.DEADLINE_APPROACHING]),
      resolve: (payload: any) => ({
        type: payload.type,
        entityId: payload.entityId,
        daysRemaining: payload.daysRemaining,
        deadline: payload.deadline,
        timestamp: new Date().toISOString(),
      }),
    },

    intimationReceived: {
      subscribe: withFilter(
        () => eventService.asyncIterator([EVENTS.INTIMATION_RECEIVED]),
        (payload: any, variables: any) => {
          return payload.caseId === variables.caseId;
        },
      ),
      resolve: (payload: any) => payload.intimation,
    },

    // ========================================================================
    // ANALYTICS SUBSCRIPTIONS
    // ========================================================================

    analyticsUpdated: {
      subscribe: () => eventService.asyncIterator([EVENTS.ANALYTICS_UPDATED]),
      resolve: (payload: any) => ({
        timestamp: new Date().toISOString(),
        metrics: payload.metrics,
      }),
    },

    systemAlert: {
      subscribe: () => eventService.asyncIterator([EVENTS.SYSTEM_ALERT]),
      resolve: (payload: any) => ({
        level: payload.level,
        message: payload.message,
        timestamp: new Date().toISOString(),
      }),
    },
  },
};
