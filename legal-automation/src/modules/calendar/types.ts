// src/modules/calendar/types.ts

export type CalendarProvider = 'google' | 'outlook' | 'local';
export type EventType = 'deadline' | 'hearing' | 'meeting' | 'court_appearance' | 'consultation' | 'other';
export type EventStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';

export interface CalendarCredential {
  id: string;
  userId: string;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  calendarId?: string;
  email?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEvent {
  id: string;
  caseId?: string;
  userId: string;
  type: EventType;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  reminders: number[]; // minutes before event
  status: EventStatus;
  externalId?: string; // provider's event ID
  provider: CalendarProvider;
  attendees?: string[];
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarSync {
  id: string;
  userId: string;
  provider: CalendarProvider;
  lastSyncTime: Date;
  nextSyncTime: Date;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  syncStatus: 'pending' | 'syncing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: Date;
}

export interface CalendarAvailability {
  userId: string;
  date: Date;
  availableSlots: {
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    duration: number; // minutes
  }[];
  totalAvailableMinutes: number;
  busy: boolean;
}

export interface CalendarConfig {
  providers: {
    google?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
    outlook?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
  };
  autoSync: boolean;
  syncIntervalMinutes: number;
  defaultReminders: number[];
  timezone: string;
  workingHours: {
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    weekDays: number[]; // 0-6, 0=Sunday
  };
}

export interface MeetingRequest {
  id: string;
  caseId: string;
  requestedBy: string;
  requestedWith: string;
  suggestedDate?: Date;
  duration: number; // minutes
  type: 'consultation' | 'status_meeting' | 'strategy_session' | 'client_meeting';
  purpose: string;
  status: 'pending' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  date: Date;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  available: boolean;
  provider: CalendarProvider;
}
