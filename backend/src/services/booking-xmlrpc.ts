import xmlrpc from "xmlrpc";
import pLimit from "p-limit";
import { Logger } from "../shared/logger";

interface BookingAvailability {
  date: string;
  status: "available" | "blocked" | "booked";
}

interface RateLimiterToken {
  timestamp: number;
}

class BookingXmlRpcClient {
  private client: any;
  private accountId: string;
  private apiKey: string;
  private rateLimitTokens: RateLimiterToken[] = [];
  private maxRequestsPerSecond = 2;
  private limiter: any;
  private logger = Logger.getLogger('BookingXmlRpcClient');

  constructor() {
    this.accountId = process.env.BOOKING_ACCOUNT_ID || "";
    this.apiKey = process.env.BOOKING_API_KEY || "";

    const protocol = "https";
    const hostname = "secure.booking.com";
    const path = "/sync/v2";

    this.logger.debug('Initializing BookingXmlRpcClient', {
      hostname,
      path,
      accountId: this.accountId?.substring(0, 5) + '...'
    });

    this.client = xmlrpc.createSecureClient({
      host: hostname,
      path: path,
      port: 443,
    });

    this.limiter = pLimit(this.maxRequestsPerSecond);
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    this.rateLimitTokens = this.rateLimitTokens.filter(
      (token) => token.timestamp > oneSecondAgo
    );

    if (this.rateLimitTokens.length >= this.maxRequestsPerSecond) {
      const oldestToken = this.rateLimitTokens[0];
      const waitTime = oldestToken.timestamp + 1000 - now;
      if (waitTime > 0) {
        this.logger.debug('Rate limit reached, waiting', { waitTime_ms: waitTime });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.rateLimitTokens.push({ timestamp: Date.now() });
  }

  async getProperties(): Promise<any> {
    await this.waitForRateLimit();

    return new Promise((resolve, reject) => {
      this.logger.debug('Fetching properties from Booking.com');
      this.client.methodCall(
        "get_properties",
        [{ auth: { username: this.accountId, password: this.apiKey } }],
        (error: any, value: any) => {
          if (error) {
            this.logger.error('Failed to fetch properties', error);
            reject(error);
          } else {
            this.logger.debug('Successfully fetched properties', { count: value?.length || 0 });
            resolve(value);
          }
        }
      );
    });
  }

  async getAvailability(
    propertyId: number,
    startDate: string,
    endDate: string
  ): Promise<BookingAvailability[]> {
    await this.waitForRateLimit();

    return new Promise((resolve, reject) => {
      this.logger.debug('Fetching availability', { propertyId, startDate, endDate });
      const params = {
        auth: {
          username: this.accountId,
          password: this.apiKey,
        },
        property_id: propertyId,
        from_date: startDate,
        to_date: endDate,
      };

      this.client.methodCall(
        "getAvailability",
        [params],
        (error: any, value: any) => {
          if (error) {
            this.logger.error('Failed to fetch availability', error, { propertyId });
            reject(error);
          } else {
            try {
              const availability = this.parseAvailabilityResponse(value);
              this.logger.debug('Successfully parsed availability', { propertyId, count: availability.length });
              resolve(availability);
            } catch (parseError) {
              this.logger.error('Failed to parse availability response', parseError as Error, { propertyId });
              reject(parseError);
            }
          }
        }
      );
    });
  }

  private parseAvailabilityResponse(response: any): BookingAvailability[] {
    const availability: BookingAvailability[] = [];

    if (!response || !response.booking) {
      return availability;
    }

    const bookings = Array.isArray(response.booking)
      ? response.booking
      : [response.booking];

    for (const booking of bookings) {
      if (booking.date && booking.status) {
        availability.push({
          date: booking.date as string,
          status: booking.status as "available" | "blocked" | "booked",
        });
      }
    }

    return availability;
  }

  async updateAvailability(
    propertyId: number,
    dates: { date: string; status: string }[]
  ): Promise<boolean> {
    await this.waitForRateLimit();

    return new Promise((resolve, reject) => {
      const params = {
        auth: {
          username: this.accountId,
          password: this.apiKey,
        },
        property_id: propertyId,
        booking: dates,
      };

      this.client.methodCall(
        "updateAvailability",
        [params],
        (error: any, value: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(value === true || value === 1);
          }
        }
      );
    });
  }
}

export function createBookingClient(): BookingXmlRpcClient {
  return new BookingXmlRpcClient();
}

export { BookingXmlRpcClient };
