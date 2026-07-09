import { query } from '../connection';
import { logger } from '@utils/logger';

export interface QuotaRecord {
  id: string;
  user_id: string;
  tier: string;
  daily_limit: number;
  hourly_limit: number;
  minutely_limit: number;
  daily_consumed: number;
  hourly_consumed: number;
  minutely_consumed: number;
  last_reset_daily: Date;
  last_reset_hourly: Date;
  last_reset_minutely: Date;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class RateLimitingRepository {
  async findOrCreateQuota(userId: string): Promise<QuotaRecord> {
    try {
      let record = await this.findByUserId(userId);

      if (!record) {
        const result = await query(
          `INSERT INTO rate_limiting_quotas (
            user_id, tier, daily_limit, hourly_limit, minutely_limit,
            daily_consumed, hourly_consumed, minutely_consumed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [userId, 'free', 100, 20, 5, 0, 0, 0],
        );
        record = result.rows[0];
      }

      return record;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar/criar quota para usuário ${userId}`);
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<QuotaRecord | null> {
    try {
      const result = await query('SELECT * FROM rate_limiting_quotas WHERE user_id = $1', [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar quota do usuário ${userId}`);
      throw error;
    }
  }

  async updateConsumed(
    userId: string,
    dailyConsumed: number,
    hourlyConsumed: number,
    minutelyConsumed: number,
  ): Promise<QuotaRecord> {
    try {
      const result = await query(
        `UPDATE rate_limiting_quotas
         SET daily_consumed = $1, hourly_consumed = $2, minutely_consumed = $3, updated_at = NOW()
         WHERE user_id = $4
         RETURNING *`,
        [dailyConsumed, hourlyConsumed, minutelyConsumed, userId],
      );

      if (result.rows.length === 0) {
        throw new Error(`Quota não encontrada para usuário ${userId}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar quota do usuário ${userId}`);
      throw error;
    }
  }

  async resetQuota(userId: string, window: 'daily' | 'hourly' | 'minutely'): Promise<QuotaRecord> {
    try {
      const column = `${window}_consumed`;
      const resetColumn = `last_reset_${window}`;

      const result = await query(
        `UPDATE rate_limiting_quotas
         SET ${column} = 0, ${resetColumn} = NOW(), updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [userId],
      );

      if (result.rows.length === 0) {
        throw new Error(`Quota não encontrada para usuário ${userId}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao resetar quota ${window} do usuário ${userId}`);
      throw error;
    }
  }

  async setUserTier(userId: string, tier: 'free' | 'standard' | 'premium'): Promise<QuotaRecord> {
    const tierLimits = {
      free: { daily: 100, hourly: 20, minutely: 5 },
      standard: { daily: 500, hourly: 100, minutely: 20 },
      premium: { daily: 5000, hourly: 500, minutely: 100 },
    };

    try {
      const limits = tierLimits[tier];
      const result = await query(
        `UPDATE rate_limiting_quotas
         SET tier = $1, daily_limit = $2, hourly_limit = $3, minutely_limit = $4, updated_at = NOW()
         WHERE user_id = $5
         RETURNING *`,
        [tier, limits.daily, limits.hourly, limits.minutely, userId],
      );

      if (result.rows.length === 0) {
        throw new Error(`Quota não encontrada para usuário ${userId}`);
      }

      logger.info(`Tier de usuário ${userId} atualizado para ${tier}`);
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar tier do usuário ${userId}`);
      throw error;
    }
  }

  async deactivateUser(userId: string): Promise<void> {
    try {
      await query('UPDATE rate_limiting_quotas SET active = false, updated_at = NOW() WHERE user_id = $1', [
        userId,
      ]);
      logger.info(`Usuário ${userId} desativado`);
    } catch (error) {
      logger.error({ err: error }, `Erro ao desativar usuário ${userId}`);
      throw error;
    }
  }

  async activateUser(userId: string): Promise<void> {
    try {
      await query('UPDATE rate_limiting_quotas SET active = true, updated_at = NOW() WHERE user_id = $1', [
        userId,
      ]);
      logger.info(`Usuário ${userId} ativado`);
    } catch (error) {
      logger.error({ err: error }, `Erro ao ativar usuário ${userId}`);
      throw error;
    }
  }

  async getAllQuotas(limit: number = 50, offset: number = 0): Promise<{ data: QuotaRecord[]; total: number }> {
    try {
      const resultData = await query(
        'SELECT * FROM rate_limiting_quotas ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );

      const resultCount = await query('SELECT COUNT(*) as total FROM rate_limiting_quotas');

      return {
        data: resultData.rows,
        total: parseInt(resultCount.rows[0].total),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar quotas');
      throw error;
    }
  }

  async getStatisticsLastHour(): Promise<any> {
    try {
      const result = await query(
        `SELECT
          COUNT(DISTINCT user_id) as active_users,
          AVG(daily_consumed::numeric / daily_limit::numeric) as avg_daily_usage,
          AVG(hourly_consumed::numeric / hourly_limit::numeric) as avg_hourly_usage,
          SUM(daily_consumed) as total_daily_consumed,
          COUNT(*) FILTER (WHERE active = true) as active_count
        FROM rate_limiting_quotas
        WHERE updated_at > NOW() - INTERVAL '1 hour'`,
        [],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas');
      throw error;
    }
  }
}

export const rateLimitingRepository = new RateLimitingRepository();
