// src/modules/calendar/calendar.service.ts
import { Database } from '@/database';
import {
  CalendarEvent,
  CalendarCredential,
  CalendarSync,
  CalendarAvailability,
  CalendarProvider,
  EventType,
  MeetingRequest,
  TimeSlot,
} from './types';

export class CalendarService {
  constructor(private db: Database) {}

  /**
   * Connect calendar provider (Google Calendar or Outlook)
   */
  async connectCalendarProvider(
    userId: string,
    provider: CalendarProvider,
    accessToken: string,
    expiresAt: Date,
    options?: {
      refreshToken?: string;
      calendarId?: string;
      email?: string;
    }
  ): Promise<CalendarCredential> {
    const query = `
      INSERT INTO calendar_credentials (user_id, provider, access_token, refresh_token, expires_at, calendar_id, email, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      ON CONFLICT (user_id, provider) DO UPDATE
      SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at
      RETURNING *
    `;

    const result = await this.db.query<CalendarCredential>(query, [
      userId,
      provider,
      accessToken,
      options?.refreshToken,
      expiresAt,
      options?.calendarId,
      options?.email,
    ]);

    return result.rows[0];
  }

  /**
   * Get calendar credentials for user
   */
  async getUserCalendarCredentials(userId: string): Promise<CalendarCredential[]> {
    const query = `
      SELECT * FROM calendar_credentials
      WHERE user_id = $1 AND active = TRUE
      ORDER BY provider
    `;

    const result = await this.db.query<CalendarCredential>(query, [userId]);

    return result.rows;
  }

  /**
   * Create calendar event
   */
  async createCalendarEvent(
    userId: string,
    event: {
      caseId?: string;
      type: EventType;
      title: string;
      description?: string;
      startDate: Date;
      endDate: Date;
      location?: string;
      reminders?: number[];
      attendees?: string[];
      provider: CalendarProvider;
      externalId?: string;
    }
  ): Promise<CalendarEvent> {
    const query = `
      INSERT INTO calendar_events
      (user_id, case_id, type, title, description, start_date, end_date, location, reminders, status, external_id, provider, attendees)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await this.db.query<CalendarEvent>(query, [
      userId,
      event.caseId,
      event.type,
      event.title,
      event.description,
      event.startDate,
      event.endDate,
      event.location,
      JSON.stringify(event.reminders || [15, 60]),
      'scheduled',
      event.externalId,
      event.provider,
      JSON.stringify(event.attendees || []),
    ]);

    return result.rows[0];
  }

  /**
   * Get user's calendar events
   */
  async getUserCalendarEvents(
    userId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<CalendarEvent[]> {
    const query = `
      SELECT * FROM calendar_events
      WHERE user_id = $1
        AND start_date >= $2
        AND end_date <= $3
        AND status != 'cancelled'
      ORDER BY start_date ASC
    `;

    const result = await this.db.query<CalendarEvent>(query, [userId, fromDate, toDate]);

    return result.rows;
  }

  /**
   * Get case-related calendar events
   */
  async getCaseCalendarEvents(caseId: string): Promise<CalendarEvent[]> {
    const query = `
      SELECT * FROM calendar_events
      WHERE case_id = $1 AND status != 'cancelled'
      ORDER BY start_date ASC
    `;

    const result = await this.db.query<CalendarEvent>(query, [caseId]);

    return result.rows;
  }

  /**
   * Sync calendar with provider (Google/Outlook)
   */
  async syncCalendarWithProvider(userId: string, provider: CalendarProvider): Promise<CalendarSync> {
    const startTime = new Date();

    const credentialQuery = `
      SELECT * FROM calendar_credentials
      WHERE user_id = $1 AND provider = $2 AND active = TRUE
    `;

    const credResult = await this.db.query<CalendarCredential>(credentialQuery, [
      userId,
      provider,
    ]);

    if (!credResult.rows.length) {
      throw new Error(`No calendar credential found for provider: ${provider}`);
    }

    const credential = credResult.rows[0];

    // Record sync start
    const syncQuery = `
      INSERT INTO calendar_syncs (user_id, provider, sync_status)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const syncResult = await this.db.query<CalendarSync>(syncQuery, [userId, provider, 'syncing']);
    const sync = syncResult.rows[0];

    try {
      // In production, fetch events from provider's API
      // For now, simulate sync
      const eventsCreated = await this.simulateProviderSync(userId, provider, credential);

      // Update sync record
      const updateQuery = `
        UPDATE calendar_syncs
        SET sync_status = $1, events_created = $2, last_sync_time = CURRENT_TIMESTAMP, next_sync_time = CURRENT_TIMESTAMP + INTERVAL '1 hour'
        WHERE id = $3
        RETURNING *
      `;

      const updated = await this.db.query<CalendarSync>(updateQuery, [
        'completed',
        eventsCreated,
        sync.id,
      ]);

      return updated.rows[0];
    } catch (error) {
      // Update sync record with error
      const errorQuery = `
        UPDATE calendar_syncs
        SET sync_status = $1, error_message = $2
        WHERE id = $3
        RETURNING *
      `;

      const errorResult = await this.db.query<CalendarSync>(errorQuery, [
        'failed',
        String(error),
        sync.id,
      ]);

      throw error;
    }
  }

  /**
   * Find available time slots
   */
  async findAvailableTimeSlots(
    userId: string,
    fromDate: Date,
    toDate: Date,
    durationMinutes: number = 60
  ): Promise<TimeSlot[]> {
    const busyEvents = await this.getUserCalendarEvents(userId, fromDate, toDate);

    const availableSlots: TimeSlot[] = [];
    const workingStartHour = 9;
    const workingEndHour = 18;

    let currentDate = new Date(fromDate);

    while (currentDate <= toDate) {
      // Skip weekends
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        const daySlots = this.generateDaySlots(
          currentDate,
          workingStartHour,
          workingEndHour,
          durationMinutes,
          busyEvents
        );

        availableSlots.push(...daySlots);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return availableSlots;
  }

  /**
   * Get calendar availability summary
   */
  async getCalendarAvailability(userId: string, date: Date): Promise<CalendarAvailability> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await this.getUserCalendarEvents(userId, dayStart, dayEnd);

    const availableSlots = this.generateDaySlots(date, 9, 18, 60, events);
    const totalAvailableMinutes = availableSlots.reduce(
      (sum, slot) => sum + slot.duration,
      0
    );

    return {
      userId,
      date,
      availableSlots,
      totalAvailableMinutes,
      busy: totalAvailableMinutes < 120, // less than 2 hours available
    };
  }

  /**
   * Create meeting request
   */
  async createMeetingRequest(
    caseId: string,
    requestedBy: string,
    requestedWith: string,
    options: {
      suggestedDate?: Date;
      duration?: number;
      type: 'consultation' | 'status_meeting' | 'strategy_session' | 'client_meeting';
      purpose: string;
    }
  ): Promise<MeetingRequest> {
    const query = `
      INSERT INTO meeting_requests (case_id, requested_by, requested_with, suggested_date, duration, type, purpose, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `;

    const result = await this.db.query<MeetingRequest>(query, [
      caseId,
      requestedBy,
      requestedWith,
      options.suggestedDate,
      options.duration || 60,
      options.type,
      options.purpose,
    ]);

    return result.rows[0];
  }

  /**
   * Confirm meeting request (create calendar event)
   */
  async confirmMeetingRequest(
    meetingRequestId: string,
    scheduledDate: Date
  ): Promise<{ request: MeetingRequest; event: CalendarEvent }> {
    const requestQuery = `
      SELECT * FROM meeting_requests
      WHERE id = $1
    `;

    const requestResult = await this.db.query<MeetingRequest>(requestQuery, [meetingRequestId]);

    if (!requestResult.rows.length) {
      throw new Error('Meeting request not found');
    }

    const request = requestResult.rows[0];

    // Create calendar event
    const endDate = new Date(scheduledDate);
    endDate.setMinutes(endDate.getMinutes() + (request.duration || 60));

    const event = await this.createCalendarEvent(request.requestedBy, {
      caseId: request.caseId,
      type: 'meeting',
      title: `${request.type}: ${request.purpose}`,
      startDate: scheduledDate,
      endDate,
      attendees: [request.requestedWith],
      provider: 'local',
      reminders: [15, 60],
    });

    // Update meeting request status
    const updateQuery = `
      UPDATE meeting_requests
      SET status = 'scheduled'
      WHERE id = $1
      RETURNING *
    `;

    const updated = await this.db.query<MeetingRequest>(updateQuery, [meetingRequestId]);

    return {
      request: updated.rows[0],
      event,
    };
  }

  /**
   * Get pending meeting requests
   */
  async getPendingMeetingRequests(userId: string): Promise<MeetingRequest[]> {
    const query = `
      SELECT * FROM meeting_requests
      WHERE (requested_by = $1 OR requested_with = $1)
        AND status = 'pending'
      ORDER BY created_at DESC
    `;

    const result = await this.db.query<MeetingRequest>(query, [userId]);

    return result.rows;
  }

  /**
   * Disconnect calendar provider
   */
  async disconnectCalendarProvider(userId: string, provider: CalendarProvider): Promise<void> {
    const query = `
      UPDATE calendar_credentials
      SET active = FALSE
      WHERE user_id = $1 AND provider = $2
    `;

    await this.db.query(query, [userId, provider]);
  }

  // Private helper methods

  private async simulateProviderSync(
    userId: string,
    provider: CalendarProvider,
    credential: CalendarCredential
  ): Promise<number> {
    // In production, would fetch from Google Calendar API or Outlook API
    // For now, return 0 (no new events)
    console.log(`[Calendar] Simulated sync for ${provider}:`, credential.email);
    return 0;
  }

  private generateDaySlots(
    date: Date,
    startHour: number,
    endHour: number,
    durationMinutes: number,
    busyEvents: CalendarEvent[]
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const dayStart = new Date(date);
    dayStart.setHours(startHour, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, 0, 0, 0);

    let currentTime = new Date(dayStart);

    while (currentTime < dayEnd) {
      const slotEnd = new Date(currentTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

      // Check if slot overlaps with any busy event
      const isAvailable = !busyEvents.some(
        event =>
          (currentTime >= event.startDate && currentTime < event.endDate) ||
          (slotEnd > event.startDate && slotEnd <= event.endDate) ||
          (currentTime <= event.startDate && slotEnd >= event.endDate)
      );

      slots.push({
        date,
        startTime: currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        endTime: slotEnd.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        available: isAvailable,
        provider: 'local',
      });

      currentTime.setMinutes(currentTime.getMinutes() + durationMinutes);
    }

    return slots.filter(slot => slot.available);
  }
}
