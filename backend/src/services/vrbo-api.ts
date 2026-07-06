import axios, { AxiosInstance } from "axios";

interface VrboProperty {
  propertyId: string;
  name: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
}

interface VrboAvailability {
  date: string;
  status: "available" | "blocked" | "booked";
  minStay?: number;
  maxStay?: number;
}

interface VrboBooking {
  bookingId: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  status: string;
}

class VrboApiClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = "https://ws.viatorconnect.com/api";
  private requestCount = 0;
  private lastResetTime = Date.now();
  private maxRequestsPerSecond = 10;

  constructor() {
    this.apiKey = process.env.VRBO_API_KEY || "";

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          console.error("[VRBO] Rate limit exceeded");
        }
        throw error;
      }
    );
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;

    if (timeSinceReset >= 1000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    if (this.requestCount >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - timeSinceReset;
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastResetTime = Date.now();
      }
    }

    this.requestCount++;
  }

  async getProperties(): Promise<VrboProperty[]> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get("/v1/properties");
      return response.data.properties || [];
    } catch (error) {
      console.error("[VRBO] Failed to fetch properties:", error);
      throw error;
    }
  }

  async getAvailability(
    propertyId: string,
    startDate: string,
    endDate: string
  ): Promise<VrboAvailability[]> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get(
        `/v1/properties/${propertyId}/availability`,
        {
          params: {
            fromDate: startDate,
            toDate: endDate,
          },
        }
      );

      const availability: VrboAvailability[] = [];

      if (response.data.calendar) {
        for (const [date, slot] of Object.entries(
          response.data.calendar
        )) {
          availability.push({
            date,
            status: (slot as any).status || "available",
            minStay: (slot as any).minStay,
            maxStay: (slot as any).maxStay,
          });
        }
      }

      return availability;
    } catch (error) {
      console.error(
        `[VRBO] Failed to fetch availability for ${propertyId}:`,
        error
      );
      throw error;
    }
  }

  async updateAvailability(
    propertyId: string,
    updates: VrboAvailability[]
  ): Promise<boolean> {
    await this.waitForRateLimit();

    try {
      const calendar: Record<string, any> = {};

      for (const update of updates) {
        calendar[update.date] = {
          status: update.status,
          minStay: update.minStay,
          maxStay: update.maxStay,
        };
      }

      await this.client.put(
        `/v1/properties/${propertyId}/availability`,
        { calendar }
      );

      return true;
    } catch (error) {
      console.error(
        `[VRBO] Failed to update availability for ${propertyId}:`,
        error
      );
      throw error;
    }
  }

  async blockDates(
    propertyId: string,
    dates: string[]
  ): Promise<boolean> {
    await this.waitForRateLimit();

    try {
      const calendar: Record<string, any> = {};

      for (const date of dates) {
        calendar[date] = { status: "blocked" };
      }

      await this.client.put(
        `/v1/properties/${propertyId}/availability`,
        { calendar }
      );

      return true;
    } catch (error) {
      console.error(
        `[VRBO] Failed to block dates for ${propertyId}:`,
        error
      );
      throw error;
    }
  }

  async getBookings(
    propertyId: string,
    startDate: string,
    endDate: string
  ): Promise<VrboBooking[]> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get(
        `/v1/properties/${propertyId}/bookings`,
        {
          params: {
            fromDate: startDate,
            toDate: endDate,
          },
        }
      );

      return response.data.bookings || [];
    } catch (error) {
      console.error(
        `[VRBO] Failed to fetch bookings for ${propertyId}:`,
        error
      );
      throw error;
    }
  }

  async confirmBooking(bookingId: string): Promise<boolean> {
    await this.waitForRateLimit();

    try {
      await this.client.put(`/v1/bookings/${bookingId}/confirm`);
      return true;
    } catch (error) {
      console.error(
        `[VRBO] Failed to confirm booking ${bookingId}:`,
        error
      );
      throw error;
    }
  }

  async cancelBooking(bookingId: string): Promise<boolean> {
    await this.waitForRateLimit();

    try {
      await this.client.put(`/v1/bookings/${bookingId}/cancel`);
      return true;
    } catch (error) {
      console.error(`[VRBO] Failed to cancel booking ${bookingId}:`, error);
      throw error;
    }
  }
}

export function createVrboClient(): VrboApiClient {
  return new VrboApiClient();
}

export { VrboApiClient };
