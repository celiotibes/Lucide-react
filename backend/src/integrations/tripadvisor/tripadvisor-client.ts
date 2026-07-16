/**
 * TripAdvisor Rentals Integration Client
 * Sincroniza ratings e reviews para impacto em dynamic pricing
 * 
 * Documentação: https://api.tripadvisor.com/v1/docs
 * Rate Limit: 5000 req/dia
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '../../shared/logger';

const logger = Logger.getLogger('TripAdvisorClient');

export interface TripAdvisorReview {
  id: string;
  rating: number;
  title: string;
  text: string;
  author: string;
  date: string;
  verified_booking: boolean;
}

export interface TripAdvisorRatings {
  overall_rating: number;
  review_count: number;
  rating_histogram: {
    [key: string]: number;
  };
}

export class TripAdvisorClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.tripadvisor.com/v1',
      headers: {
        'Accept': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getPropertyReviews(
    propertyId: string,
    options?: { limit?: number; offset?: number }
  ) {
    try {
      const response = await this.client.get(`/locations/${propertyId}/reviews`, {
        params: {
          key: this.apiKey,
          limit: options?.limit || 50,
          offset: options?.offset || 0,
        },
      });

      return response.data.reviews.map((review: any) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        text: review.text,
        author: review.author,
        date: review.published_date,
        verified_booking: review.is_machine_translated === false,
      }));
    } catch (error) {
      throw this.handleError('getPropertyReviews', error);
    }
  }

  async getPropertyRatings(propertyId: string) {
    try {
      const response = await this.client.get(`/locations/${propertyId}`, {
        params: { key: this.apiKey },
      });

      logger.info('Property ratings retrieved from TripAdvisor', { 
        propertyId,
        rating: response.data.rating,
        reviews: response.data.num_reviews 
      });

      return {
        overall_rating: response.data.rating,
        review_count: response.data.num_reviews,
        rating_histogram: response.data.rating_histogram || {},
      };
    } catch (error) {
      throw this.handleError('getPropertyRatings', error);
    }
  }

  async searchProperties(query: string) {
    try {
      const response = await this.client.get('/locations/search', {
        params: {
          key: this.apiKey,
          query,
          category: 'hotels',
        },
      });

      return response.data.data;
    } catch (error) {
      throw this.handleError('searchProperties', error);
    }
  }

  private handleError(method: string, error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      logger.error('TripAdvisor API error', { 
        method, 
        status, 
        message: data.message || data.error 
      });

      throw new Error(`TripAdvisor Error (${method}): ${data.message || data.error}`);
    }

    logger.error('TripAdvisor request failed', { method, error });
    throw error;
  }
}

export default TripAdvisorClient;
