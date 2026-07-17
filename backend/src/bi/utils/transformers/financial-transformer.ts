/**
 * Financial Data Transformer
 * Normaliza dados de diferentes plataformas para o formato padrão de BI
 */

import { Logger } from '../../../shared/logger';
import { FinancialMovement } from '../../../types/bi';

export class FinancialTransformer {
  private logger = Logger.getLogger('FinancialTransformer');

  /**
   * Transforma movimentação de booking em movimento financeiro padrão
   */
  transformBookingMovement(rawData: any): FinancialMovement {
    return {
      id: rawData.id || `booking-${rawData.booking_id}`,
      propertyId: rawData.property_id,
      accountId: this.mapAccountCode(rawData.payment_type, 'booking'),
      movementDate: new Date(rawData.payment_date),
      amount: parseFloat(rawData.amount),
      movementType: this.mapMovementType(rawData.payment_type),
      category: this.mapCategory(rawData.payment_type),
      description: `Booking: ${rawData.booking_id} - ${rawData.guest_name}`,
      platform: 'booking',
      reference: rawData.booking_id,
      createdAt: new Date(rawData.created_at),
    };
  }

  /**
   * Transforma movimentação de Hospeda em movimento financeiro padrão
   */
  transformHospedaMovement(rawData: any): FinancialMovement {
    return {
      id: rawData.id || `hospeda-${rawData.reservation_id}`,
      propertyId: rawData.property_id,
      accountId: this.mapAccountCode(rawData.transaction_type, 'hospeda'),
      movementDate: new Date(rawData.transaction_date),
      amount: parseFloat(rawData.amount),
      movementType: this.mapMovementType(rawData.transaction_type),
      category: this.mapCategory(rawData.transaction_type),
      description: `Hospeda: ${rawData.reservation_id}`,
      platform: 'hospeda',
      reference: rawData.reservation_id,
      createdAt: new Date(rawData.created_at),
    };
  }

  /**
   * Transforma movimentação de TripAdvisor em movimento financeiro padrão
   */
  transformTripAdvisorMovement(rawData: any): FinancialMovement {
    return {
      id: rawData.id || `tripadvisor-${rawData.reservation_id}`,
      propertyId: rawData.property_id,
      accountId: this.mapAccountCode(rawData.payment_status, 'tripadvisor'),
      movementDate: new Date(rawData.payment_date),
      amount: parseFloat(rawData.amount),
      movementType: this.mapMovementType(rawData.payment_status),
      category: this.mapCategory(rawData.payment_status),
      description: `TripAdvisor: ${rawData.reservation_id}`,
      platform: 'tripadvisor',
      reference: rawData.reservation_id,
      createdAt: new Date(rawData.created_at),
    };
  }

  /**
   * Normaliza múltiplas movimentações de diferentes fontes
   */
  normalizeMovements(
    movements: any[],
    platform: 'booking' | 'hospeda' | 'tripadvisor'
  ): FinancialMovement[] {
    this.logger.info('Normalizando movimentações', { platform, count: movements.length });

    try {
      const normalized = movements
        .map((movement) => {
          try {
            switch (platform) {
              case 'booking':
                return this.transformBookingMovement(movement);
              case 'hospeda':
                return this.transformHospedaMovement(movement);
              case 'tripadvisor':
                return this.transformTripAdvisorMovement(movement);
              default:
                return null;
            }
          } catch (error) {
            this.logger.warn('Erro ao normalizar movimento individual', error, {
              platform,
              movementId: movement.id,
            });
            return null;
          }
        })
        .filter((m): m is FinancialMovement => m !== null);

      this.logger.info('Movimentações normalizadas com sucesso', {
        platform,
        total: movements.length,
        normalized: normalized.length,
        failed: movements.length - normalized.length,
      });

      return normalized;
    } catch (error) {
      this.logger.error('Erro ao normalizar movimentações em lote', error as Error, { platform });
      return [];
    }
  }

  /**
   * Mapeia tipo de movimentação para tipo padrão
   */
  private mapMovementType(
    rawType: string
  ): 'revenue' | 'cost' | 'expense' | 'investment' {
    const typeMap: Record<string, any> = {
      // Booking types
      booking_confirmed: 'revenue',
      booking_cancelled: 'revenue', // Negativa
      cleaning_fee: 'revenue',
      service_fee: 'expense',

      // Hospeda types
      payment_confirmed: 'revenue',
      cancellation_fee: 'expense',
      platform_fee: 'expense',

      // TripAdvisor types
      commission_paid: 'expense',
      payment_completed: 'revenue',
      refund_issued: 'revenue', // Negativa

      // Fallback
      debit: 'expense',
      credit: 'revenue',
    };

    return (
      typeMap[rawType.toLowerCase()] ||
      (rawType.includes('fee') ? 'expense' : 'revenue')
    );
  }

  /**
   * Mapeia categoria para classificação padrão
   */
  private mapCategory(rawType: string): string {
    const categoryMap: Record<string, string> = {
      service_fee: 'platform_fees',
      platform_fee: 'platform_fees',
      commission_paid: 'platform_fees',
      cleaning_fee: 'revenue',
      maintenance: 'operational',
      utility: 'operational',
      mortgage: 'financing',
      insurance: 'operational',
    };

    return (
      categoryMap[rawType.toLowerCase()] ||
      (rawType.includes('fee') ? 'fees' : 'general')
    );
  }

  /**
   * Mapeia conta contábil baseada no tipo e plataforma
   */
  private mapAccountCode(rawType: string, platform: string): string {
    // Padrão de contas: 1000-1999 (Receitas), 2000-2999 (Custos), 3000-3999 (Despesas)
    const accountMap: Record<string, Record<string, string>> = {
      booking: {
        booking_confirmed: '1100-booking-revenue',
        service_fee: '2100-booking-service-fee',
        cleaning_fee: '1200-booking-cleaning',
      },
      hospeda: {
        payment_confirmed: '1110-hospeda-revenue',
        platform_fee: '2110-hospeda-platform-fee',
      },
      tripadvisor: {
        payment_completed: '1120-tripadvisor-revenue',
        commission_paid: '2120-tripadvisor-commission',
      },
    };

    const platformAccounts = accountMap[platform] || {};
    return (
      platformAccounts[rawType.toLowerCase()] || `1000-${platform}-general`
    );
  }

  /**
   * Valida dados de movimento
   */
  validateMovement(movement: FinancialMovement): boolean {
    const isValid = !!(
      movement.propertyId &&
      movement.movementDate &&
      movement.amount !== undefined &&
      movement.movementType
    );

    if (!isValid) {
      this.logger.warn('Movimento inválido detectado', undefined, {
        movementId: movement.id,
      });
    }

    return isValid;
  }
}

export function createFinancialTransformer(): FinancialTransformer {
  return new FinancialTransformer();
}
