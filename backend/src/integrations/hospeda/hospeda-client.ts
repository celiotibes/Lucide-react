/**
 * Hospeda.com Integration Client
 * Integração com API REST da plataforma brasileira Hospeda
 * 
 * Documentação: https://www.hospeda.com/api/v2
 * Rate Limit: 100 req/min
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { Logger } from '../../shared/logger';

const logger = Logger.getLogger('HospedaClient');

export interface HospedaProperty {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  bedrooms: number;
  bathrooms: number;
  capacity: number;
  amenities: string[];
  price_per_night: number;
  currency: 'BRL';
  images: string[];
  status?: 'draft' | 'published';
}

export interface HospedaBooking {
  id: string;
  property_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guests: number;
  total_price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
}

export class HospedaClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://www.hospeda.com/api/v2',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    // Interceptor para retry com backoff exponencial em 429
    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || '60';
          const delayMs = parseInt(retryAfter) * 1000;
          
          logger.warn('Rate limit hit, retrying after delay', { 
            delayMs,
            url: error.config?.url 
          });

          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.client.request(error.config);
        }
        throw error;
      }
    );
  }

  async getProperties(page = 1, limit = 50) {
    try {
      const response = await this.client.get('/properties', {
        params: { page, limit },
      });

      return {
        properties: response.data.data,
        total: response.data.total,
        page: response.data.page,
      };
    } catch (error) {
      throw this.handleError('getProperties', error);
    }
  }

  async createProperty(property: HospedaProperty) {
    try {
      const response = await this.client.post('/properties', {
        title: property.title,
        description: property.description,
        address: property.address,
        city: property.city,
        state: property.state,
        zipcode: property.zipcode,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        capacity: property.capacity,
        amenities: property.amenities,
        price_per_night: property.price_per_night,
        currency: 'BRL',
        status: 'draft',
      });

      logger.info('Property created in Hospeda', { 
        propertyId: response.data.id 
      });

      return {
        id: response.data.id,
        url: response.data.url,
      };
    } catch (error) {
      throw this.handleError('createProperty', error);
    }
  }

  async updateProperty(propertyId: string, updates: Partial<HospedaProperty>) {
    try {
      await this.client.patch(`/properties/${propertyId}`, {
        ...(updates.title && { title: updates.title }),
        ...(updates.description && { description: updates.description }),
        ...(updates.price_per_night && { price_per_night: updates.price_per_night }),
        ...(updates.status && { status: updates.status }),
        ...(updates.amenities && { amenities: updates.amenities }),
      });

      logger.info('Property updated in Hospeda', { propertyId });
    } catch (error) {
      throw this.handleError('updateProperty', error);
    }
  }

  async uploadImages(propertyId: string, imageUrls: string[]) {
    try {
      const response = await this.client.put(`/properties/${propertyId}/images`, {
        images: imageUrls.map((url, index) => ({
          url,
          position: index,
        })),
      });

      logger.info('Images uploaded to Hospeda', { 
        propertyId,
        count: response.data.uploaded_count 
      });

      return {
        uploaded: response.data.uploaded_count,
        failed: response.data.failed_count,
      };
    } catch (error) {
      throw this.handleError('uploadImages', error);
    }
  }

  async publishProperty(propertyId: string) {
    try {
      const response = await this.client.post(`/properties/${propertyId}/publish`);

      logger.info('Property published in Hospeda', { propertyId });

      return {
        status: response.data.status,
        published_at: response.data.published_at,
        url: response.data.url,
      };
    } catch (error) {
      throw this.handleError('publishProperty', error);
    }
  }

  async unpublishProperty(propertyId: string) {
    try {
      await this.client.post(`/properties/${propertyId}/unpublish`);

      logger.info('Property unpublished in Hospeda', { propertyId });
    } catch (error) {
      throw this.handleError('unpublishProperty', error);
    }
  }

  async getBookings(options?: {
    property_id?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
  }) {
    try {
      const response = await this.client.get('/bookings', { params: options });
      return response.data.bookings;
    } catch (error) {
      throw this.handleError('getBookings', error);
    }
  }

  async confirmBooking(bookingId: string) {
    try {
      await this.client.post(`/bookings/${bookingId}/confirm`);
      logger.info('Booking confirmed in Hospeda', { bookingId });
    } catch (error) {
      throw this.handleError('confirmBooking', error);
    }
  }

  async rejectBooking(bookingId: string, reason?: string) {
    try {
      await this.client.post(`/bookings/${bookingId}/reject`, { reason });
      logger.info('Booking rejected in Hospeda', { bookingId });
    } catch (error) {
      throw this.handleError('rejectBooking', error);
    }
  }

  async getPropertyStats(propertyId: string) {
    try {
      const response = await this.client.get(`/properties/${propertyId}/stats`);

      return {
        views: response.data.views,
        bookings: response.data.bookings,
        occupancy_rate: response.data.occupancy_rate,
        avg_rating: response.data.avg_rating,
        reviews_count: response.data.reviews_count,
      };
    } catch (error) {
      throw this.handleError('getPropertyStats', error);
    }
  }

  async registerWebhook(url: string, events: string[], secret: string) {
    try {
      const response = await this.client.post('/webhooks', {
        url,
        events,
        secret,
      });

      logger.info('Webhook registered with Hospeda', { webhookId: response.data.id });

      return { webhook_id: response.data.id };
    } catch (error) {
      throw this.handleError('registerWebhook', error);
    }
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computed)
    );
  }

  private handleError(method: string, error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401 || status === 403) {
        logger.error('Hospeda authentication failed', { method, status });
        throw new Error(`Hospeda authentication failed: ${data.message}`);
      }

      if (status === 429) {
        throw new Error('Hospeda rate limit exceeded');
      }

      logger.error('Hospeda API error', { 
        method, 
        status, 
        message: data.message || data.error 
      });

      throw new Error(`Hospeda API Error (${method}): ${data.message || data.error}`);
    }

    logger.error('Hospeda request failed', { method, error });
    throw error;
  }
}

export default HospedaClient;
