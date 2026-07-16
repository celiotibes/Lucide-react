import { Pool } from 'pg';
import { Lead, LeadCreateInput, LeadUpdateInput, LeadFunnelStats } from '../types';
import { Logger } from '../../shared/logger';

export class LeadService {
  private logger = Logger.getLogger('LeadService');

  constructor(private pool: Pool) {}

  async getLeadById(id: string): Promise<Lead | null> {
    const result = await this.pool.query(
      'SELECT * FROM leads WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getLeadsByPropertyId(propertyId: string, limit = 50, offset = 0): Promise<Lead[]> {
    const result = await this.pool.query(
      `SELECT * FROM leads WHERE property_id = $1 AND is_active = true
       ORDER BY first_contact_at DESC LIMIT $2 OFFSET $3`,
      [propertyId, limit, offset]
    );
    return result.rows;
  }

  async getLeadsByStage(stage: string, limit = 50, offset = 0): Promise<Lead[]> {
    const result = await this.pool.query(
      `SELECT * FROM leads WHERE stage = $1 AND is_active = true
       ORDER BY first_contact_at DESC LIMIT $2 OFFSET $3`,
      [stage, limit, offset]
    );
    return result.rows;
  }

  async getLeadsByChannel(sourceChannel: string, limit = 50, offset = 0): Promise<Lead[]> {
    const result = await this.pool.query(
      `SELECT * FROM leads WHERE source_channel = $1 AND is_active = true
       ORDER BY first_contact_at DESC LIMIT $2 OFFSET $3`,
      [sourceChannel, limit, offset]
    );
    return result.rows;
  }

  async createLead(data: LeadCreateInput): Promise<Lead> {
    const {
      property_id,
      listing_id,
      name,
      email,
      phone,
      source_channel,
      source_campaign,
      platform_lead_id,
      notes,
    } = data;

    const result = await this.pool.query(
      `INSERT INTO leads (
        property_id, listing_id, name, email, phone,
        source_channel, source_campaign, platform_lead_id, notes,
        stage, first_contact_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'inquiry', NOW())
      RETURNING *`,
      [
        property_id,
        listing_id,
        name,
        email,
        phone,
        source_channel,
        source_campaign,
        platform_lead_id,
        notes,
      ]
    );

    const lead = result.rows[0];
    this.logger.info('Created new lead', {
      id: lead.id,
      name,
      source: source_channel,
      propertyId: property_id,
    });

    return lead;
  }

  async updateLead(id: string, data: LeadUpdateInput): Promise<Lead> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    Object.entries(data).forEach(([key, value]) => {
      updates.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) {
      throw new Error(`Lead ${id} not found`);
    }

    this.logger.info('Updated lead', { id, stage: data.stage });
    return result.rows[0];
  }

  async updateLeadStage(id: string, stage: string): Promise<Lead> {
    const result = await this.pool.query(
      `UPDATE leads SET stage = $1, last_contact_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [stage, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Lead ${id} not found`);
    }

    Logger.info('lead-service', 'Updated lead stage', { id, stage });
    return result.rows[0];
  }

  async recordTouchpoint(
    leadId: string,
    channel: string,
    messageType: string,
    messageContent: string,
    direction: string,
    metadata?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `INSERT INTO lead_touchpoints (lead_id, channel, message_type, message_content, direction, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [leadId, channel, messageType, messageContent, direction, JSON.stringify(metadata || {})]
    );

    // Update lead's last_contact_at
    await this.pool.query(
      'UPDATE leads SET last_contact_at = NOW() WHERE id = $1',
      [leadId]
    );

    Logger.info('lead-service', 'Recorded touchpoint', {
      leadId,
      channel,
      messageType,
    });

    return result.rows[0];
  }

  async getTouchpointsByLeadId(leadId: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(
      `SELECT * FROM lead_touchpoints WHERE lead_id = $1 ORDER BY created_at DESC`,
      [leadId]
    );
    return result.rows;
  }

  async closeLead(id: string, dealValue?: number): Promise<Lead> {
    const result = await this.pool.query(
      `UPDATE leads SET
        stage = 'closed', actual_deal_value = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [dealValue || 0, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Lead ${id} not found`);
    }

    Logger.info('lead-service', 'Closed lead', { id, dealValue });
    return result.rows[0];
  }

  async loseLead(id: string): Promise<Lead> {
    const result = await this.pool.query(
      `UPDATE leads SET stage = 'lost', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Lead ${id} not found`);
    }

    Logger.info('lead-service', 'Lost lead', { id });
    return result.rows[0];
  }

  async getFunnelStats(propertyId?: string): Promise<LeadFunnelStats> {
    const startTime = Date.now();
    Logger.info('lead-service', 'Calculating funnel statistics', { propertyId });

    let query = 'SELECT stage, COUNT(*) as count FROM leads WHERE is_active = true';
    const params: unknown[] = [];

    if (propertyId) {
      query += ' AND property_id = $1';
      params.push(propertyId);
    }

    query += ' GROUP BY stage';

    const stageResult = await this.pool.query(query, params);

    const byStage: Record<string, number> = {};
    let totalLeads = 0;

    stageResult.rows.forEach((row) => {
      byStage[row.stage] = row.count;
      totalLeads += row.count;
    });

    // Calculate conversion rates
    const inquiry = byStage.inquiry || 0;
    const contacted = byStage.contacted || 0;
    const scheduled = byStage.tour_scheduled || 0;
    const closed = byStage.closed || 0;

    const conversionRate = inquiry > 0 ? (closed / inquiry) * 100 : 0;

    // Get channel breakdown
    let channelQuery = `SELECT source_channel, COUNT(*) as count FROM leads WHERE is_active = true`;
    if (propertyId) {
      channelQuery += ` AND property_id = $1`;
    }
    channelQuery += ` GROUP BY source_channel`;

    const channelResult = await this.pool.query(channelQuery, propertyId ? [propertyId] : []);

    const byChannel: Record<string, number> = {};
    channelResult.rows.forEach((row) => {
      byChannel[row.source_channel] = row.count;
    });

    // Calculate average days to close
    let closureQuery = `SELECT EXTRACT(DAY FROM (MAX(updated_at) - MIN(first_contact_at))) as days_to_close
                        FROM leads WHERE is_active = true AND stage = 'closed'`;
    if (propertyId) {
      closureQuery += ` AND property_id = $1`;
    }

    const closureResult = await this.pool.query(closureQuery, propertyId ? [propertyId] : []);
    const avgDaysToClose = closureResult.rows[0]?.days_to_close || 0;

    const result = {
      total_leads: totalLeads,
      by_stage: byStage,
      conversion_rate_inquiry_to_close: parseFloat(conversionRate.toFixed(2)),
      average_days_to_close: Math.round(avgDaysToClose),
      by_channel: byChannel,
    };

    const duration = Date.now() - startTime;
    this.logger.time('Funnel statistics calculated', duration, {
      propertyId,
      totalLeads,
      conversionRate: result.conversion_rate_inquiry_to_close,
    });

    return result;
  }

  async getLeadsNeedingFollowUp(hoursAgo = 24): Promise<Lead[]> {
    const result = await this.pool.query(
      `SELECT * FROM leads
       WHERE is_active = true
       AND stage NOT IN ('closed', 'lost')
       AND (last_contact_at IS NULL OR last_contact_at < NOW() - INTERVAL $1)
       ORDER BY last_contact_at ASC NULLS FIRST`,
      [`${hoursAgo} hours`]
    );
    return result.rows;
  }

  async getHighValueLeads(minValue: number = 0): Promise<Lead[]> {
    const result = await this.pool.query(
      `SELECT * FROM leads
       WHERE is_active = true
       AND (estimated_deal_value >= $1 OR actual_deal_value >= $1)
       ORDER BY estimated_deal_value DESC NULLS LAST`,
      [minValue]
    );
    return result.rows;
  }

  async deactivateLead(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE leads SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    Logger.info('lead-service', 'Deactivated lead', { id });
  }

  async bulkUpdateStage(ids: string[], stage: string): Promise<number> {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.pool.query(
      `UPDATE leads SET stage = $${ids.length + 1}, updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [...ids, stage]
    );

    Logger.info('lead-service', 'Bulk updated stage', { count: result.rowCount, stage });
    return result.rowCount || 0;
  }
}
