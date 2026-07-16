/**
 * Integrations Index
 * Exporta todos os clientes de integração de plataformas
 */

export { default as HospedaClient } from './hospeda/hospeda-client';
export { default as BookingApartmentsClient } from './booking/booking-apartments-client';
export { default as TripAdvisorClient } from './tripadvisor/tripadvisor-client';

// Tipos
export type { HospedaProperty, HospedaBooking } from './hospeda/hospeda-client';
export type { BookingApartment, PricingByDate } from './booking/booking-apartments-client';
export type { TripAdvisorReview, TripAdvisorRatings } from './tripadvisor/tripadvisor-client';
