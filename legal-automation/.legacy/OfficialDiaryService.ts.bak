import db from '@db/connection';
import { logger } from '@utils/logger';

export interface OfficialDiary {
  id: string;
  state: string; // UF
  title: string;
  publishedDate: Date;
  content: string;
  source: string;
  url?: string;
  processNumber?: string;
  scrapedAt: Date;
}

export interface DiaryAlert {
  id: string;
  userId: string;
  processNumber: string;
  partyName: string;
  alertType: 'processo' | 'parte' | 'palavra-chave';
  foundIn: string; // state or diary name
  foundDate: Date;
  diaryId: string;
  read: boolean;
  createdAt: Date;
}

export interface AlertPreference {
  userId: string;
  processNumbers: string[];
  partyNames: string[];
  keywords: string[];
  states: string[];
  emailNotification: boolean;
  smsNotification: boolean;
  pushNotification: boolean;
  slackNotification: boolean;
}

export class OfficialDiaryService {
  private readonly states = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  async scrapeDiary(state: string): Promise<OfficialDiary[]> {
    logger.info(`Raspando diário oficial de ${state}`);

    try {
      // This is a placeholder for actual scraping logic
      // In production, use Puppeteer or similar
      const entries: OfficialDiary[] = [];

      logger.debug(`${entries.length} entradas encontradas em ${state}`);
      return entries;
    } catch (error) {
      logger.error({ err: error }, `Erro ao raspar diário de ${state}`);
      throw error;
    }
  }

  async storeDiaryEntry(diary: Omit<OfficialDiary, 'id' | 'scrapedAt'>): Promise<OfficialDiary> {
    logger.info(`Armazenando entrada de diário: ${diary.title}`);

    try {
      // Check if entry already exists
      const existingResult = await db.query(
        `SELECT id FROM official_diaries WHERE source = $1 AND published_date = $2`,
        [diary.source, diary.publishedDate],
      );

      if (existingResult.rows.length > 0) {
        logger.debug(`Entrada de diário já existe: ${diary.source}`);
        const row = existingResult.rows[0];
        return {
          id: row.id,
          ...diary,
          scrapedAt: new Date(),
        };
      }

      const result = await db.query(
        `INSERT INTO official_diaries (
          state, title, published_date, content, source, url, process_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          diary.state,
          diary.title,
          diary.publishedDate,
          diary.content,
          diary.source,
          diary.url,
          diary.processNumber,
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        state: row.state,
        title: row.title,
        publishedDate: new Date(row.published_date),
        content: row.content,
        source: row.source,
        url: row.url,
        processNumber: row.process_number,
        scrapedAt: new Date(row.scraped_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar entrada de diário');
      throw error;
    }
  }

  async setAlertPreferences(userId: string, preferences: Omit<AlertPreference, 'userId'>): Promise<AlertPreference> {
    logger.info(`Configurando preferências de alerta para ${userId}`);

    try {
      const result = await db.query(
        `INSERT INTO alert_preferences (
          user_id, process_numbers, party_names, keywords, states,
          email_notification, sms_notification, push_notification, slack_notification
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) DO UPDATE SET
          process_numbers = $2,
          party_names = $3,
          keywords = $4,
          states = $5,
          email_notification = $6,
          sms_notification = $7,
          push_notification = $8,
          slack_notification = $9
         RETURNING *`,
        [
          userId,
          JSON.stringify(preferences.processNumbers || []),
          JSON.stringify(preferences.partyNames || []),
          JSON.stringify(preferences.keywords || []),
          JSON.stringify(preferences.states || this.states),
          preferences.emailNotification ?? true,
          preferences.smsNotification ?? false,
          preferences.pushNotification ?? true,
          preferences.slackNotification ?? false,
        ],
      );

      const row = result.rows[0];
      return {
        userId: row.user_id,
        processNumbers: JSON.parse(row.process_numbers),
        partyNames: JSON.parse(row.party_names),
        keywords: JSON.parse(row.keywords),
        states: JSON.parse(row.states),
        emailNotification: row.email_notification,
        smsNotification: row.sms_notification,
        pushNotification: row.push_notification,
        slackNotification: row.slack_notification,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao configurar preferências');
      throw error;
    }
  }

  async getAlertPreferences(userId: string): Promise<AlertPreference | null> {
    logger.info(`Obtendo preferências de alerta para ${userId}`);

    try {
      const result = await db.query(`SELECT * FROM alert_preferences WHERE user_id = $1`, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        processNumbers: JSON.parse(row.process_numbers),
        partyNames: JSON.parse(row.party_names),
        keywords: JSON.parse(row.keywords),
        states: JSON.parse(row.states),
        emailNotification: row.email_notification,
        smsNotification: row.sms_notification,
        pushNotification: row.push_notification,
        slackNotification: row.slack_notification,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter preferências');
      throw error;
    }
  }

  async createAlert(
    userId: string,
    processNumber: string,
    partyName: string,
    foundIn: string,
    diaryId: string,
  ): Promise<DiaryAlert> {
    logger.info(`Criando alerta para processo ${processNumber}`);

    try {
      const result = await db.query(
        `INSERT INTO diary_alerts (
          user_id, process_number, party_name, alert_type, found_in, diary_id
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          userId,
          processNumber,
          partyName,
          processNumber ? 'processo' : 'parte',
          foundIn,
          diaryId,
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        processNumber: row.process_number,
        partyName: row.party_name,
        alertType: row.alert_type,
        foundIn: row.found_in,
        foundDate: new Date(row.found_date),
        diaryId: row.diary_id,
        read: row.read,
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar alerta');
      throw error;
    }
  }

  async getAlerts(userId: string, unreadOnly = false, limit = 50, offset = 0): Promise<DiaryAlert[]> {
    logger.info(`Obtendo alertas para ${userId}`);

    try {
      let query = `SELECT * FROM diary_alerts WHERE user_id = $1`;
      const params: any[] = [userId];

      if (unreadOnly) {
        query += ` AND read = false`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        processNumber: row.process_number,
        partyName: row.party_name,
        alertType: row.alert_type,
        foundIn: row.found_in,
        foundDate: new Date(row.found_date),
        diaryId: row.diary_id,
        read: row.read,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter alertas');
      throw error;
    }
  }

  async markAlertAsRead(userId: string, alertId: string): Promise<void> {
    logger.info(`Marcando alerta ${alertId} como lido`);

    try {
      await db.query(`UPDATE diary_alerts SET read = true WHERE id = $1 AND user_id = $2`, [alertId, userId]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao marcar alerta como lido');
      throw error;
    }
  }

  async markAllAlertsAsRead(userId: string): Promise<number> {
    logger.info(`Marcando todos os alertas de ${userId} como lidos`);

    try {
      const result = await db.query(
        `UPDATE diary_alerts SET read = true WHERE user_id = $1 AND read = false`,
        [userId],
      );

      return result.rowCount || 0;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao marcar alertas como lidos');
      throw error;
    }
  }

  async searchDiaries(query: string, state?: string, limit = 20): Promise<OfficialDiary[]> {
    logger.info(`Buscando diários com query: "${query}"`);

    try {
      let sql = `SELECT * FROM official_diaries
                 WHERE to_tsvector('portuguese', content) @@ plainto_tsquery('portuguese', $1)`;
      const params: any[] = [query];

      if (state) {
        sql += ` AND state = $${params.length + 1}`;
        params.push(state);
      }

      sql += ` ORDER BY published_date DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await db.query(sql, params);

      return result.rows.map((row: any) => ({
        id: row.id,
        state: row.state,
        title: row.title,
        publishedDate: new Date(row.published_date),
        content: row.content,
        source: row.source,
        url: row.url,
        processNumber: row.process_number,
        scrapedAt: new Date(row.scraped_at),
      }));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao buscar diários');
      throw error;
    }
  }

  async getDiaryStats(): Promise<{
    totalEntries: number;
    entriesByState: Record<string, number>;
    lastUpdate: Date | null;
    scrapeFrequency: string;
  }> {
    logger.info(`Obtendo estatísticas de diários`);

    try {
      const countResult = await db.query(`SELECT COUNT(*) as count FROM official_diaries`);
      const totalEntries = countResult.rows[0]?.count || 0;

      const stateResult = await db.query(
        `SELECT state, COUNT(*) as count FROM official_diaries GROUP BY state ORDER BY count DESC`,
      );

      const entriesByState: Record<string, number> = {};
      for (const row of stateResult.rows) {
        entriesByState[row.state] = row.count;
      }

      const lastUpdateResult = await db.query(`SELECT MAX(scraped_at) as last_update FROM official_diaries`);
      const lastUpdate = lastUpdateResult.rows[0]?.last_update
        ? new Date(lastUpdateResult.rows[0].last_update)
        : null;

      return {
        totalEntries,
        entriesByState,
        lastUpdate,
        scrapeFrequency: '3 horas',
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas');
      throw error;
    }
  }
}

export const officialDiaryService = new OfficialDiaryService();
