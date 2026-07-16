/**
 * Booking.com Apartments Integration Client
 * Endpoint específico para apartamentos/STR (Short-Term Rentals)
 * 
 * Diferenças vs Booking Hotels:
 * - Endpoint: /v2/apartments (vs /v2/properties)
 * - Rate limit: 100 req/min (vs 50)
 * - Suporte a pricing por data
 * - Suporte a calendar sync
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '../../shared/logger';

const logger = Logger.getLogger('BookingApartmentsClient');

export interface BookingApartment {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  country: string;
  zipcode: string;
  type: 'apartment' | 'house' | 'villa' | 'studio';
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  amenities: string[];
  price_per_night: number;
  currency: 'BRL';
  minimum_stay: number;
  cancellation_policy: 'free' | 'moderate' | 'non_refundable';
  images: Array<{ url: string; position: number }>;
}

export interface PricingByDate {
  date: string;
  price: number;
  min_stay?: number;
}

export class BookingApartmentsClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.booking.com/v2/apartments',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Booking-Version': '2024.01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getApartments(filters?: {
    city?: string;
    status?: string;
  }) {
    try {
      const response = await this.client.get('/list', {
        params: {
          ...filters,
          type: 'apartment',
        },
      });

      return response.data.apartments;
    } catch (error) {
      throw this.handleError('getApartments', error);
    }
  }

  async createApartment(apartment: BookingApartment) {
    try {
      const response = await this.client.post('/create', {
        name: apartment.name,
        description: apartment.description,
        address: apartment.address,
        city: apartment.city,
        country: apartment.country,
        zipcode: apartment.zipcode,
        type: 'apartment',
        bedrooms: apartment.bedrooms,
        bathrooms: apartment.bathrooms,
        max_guests: apartment.max_guests,
        amenities: apartment.amenities,
        price_per_night: apartment.price_per_night,
        currency: 'BRL',
        minimum_stay: apartment.minimum_stay || 1,
        cancellation_policy: apartment.cancellation_policy || 'moderate',
      });

      logger.info('Apartment created in Booking', { apartmentId: response.data.id });

      return {
        id: response.data.id,
        url: response.data.url,
      };
    } catch (error) {
      throw this.handleError('createApartment', error);
    }
  }

  async updatePricingByDate(apartmentId: string, rates: PricingByDate[]) {
    try {
      const response = await this.client.patch(`/${apartmentId}/pricing`, { rates });

      logger.info('Pricing updated in Booking', { 
        apartmentId,
        datesUpdated: rates.length 
      });

      return response.data;
    } catch (error) {
      throw this.handleError('updatePricingByDate', error);
    }
  }

  async updateAvailability(
    apartmentId: string,
    availability: Array<{ date: string; available: boolean }>
  ) {
    try {
      const response = await this.client.patch(`/${apartmentId}/availability`, {
        dates: availability,
      });

      logger.info('Availability updated in Booking', { 
        apartmentId,
        datesUpdated: availability.length 
      });

      return response.data;
    } catch (error) {
      throw this.handleError('updateAvailability', error);
    }
  }

  async syncCalendar(apartmentId: string, blockedDates: string[]) {
    try {
      const response = await this.client.post(`/${apartmentId}/sync-calendar`, {
        blocked_dates: blockedDates,
      });

      logger.info('Calendar synced with Booking', { 
        apartmentId,
        blockedDates: blockedDates.length 
      });

      return response.data;
    } catch (error) {
      throw this.handleError('syncCalendar', error);
    }
  }

  private handleError(method: string, error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      logger.error('Booking Apartments API error', { 
        method, 
        status, 
        message: data.message || data.error 
      });

      throw new Error(`Booking Apartments Error (${method}): ${data.message || data.error}`);
    }

    logger.error('Booking request failed', { method, error });
    throw error;
  }
}

export default BookingApartmentsClient;
