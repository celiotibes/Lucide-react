// src/modules/calendar/index.ts
export { CalendarService } from './calendar.service';
export { setupCalendarRoutes } from './routes';
export type {
  CalendarEvent,
  CalendarCredential,
  CalendarSync,
  CalendarAvailability,
  CalendarProvider,
  EventType,
  MeetingRequest,
  TimeSlot,
  CalendarConfig,
} from './types';
