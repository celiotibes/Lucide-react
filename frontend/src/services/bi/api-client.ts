/**
 * BI API Client
 * Cliente HTTP para comunicar com endpoints de BI
 */

import { FinancialKPIs, BiFilterState, WaterfallChartData, SankeyChartData } from '../../types/bi';

interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp: Date;
    executionTime?: number;
    source?: string;
  };
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

class BiApiClient {
  private baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  async fetchKPIs(filters: BiFilterState): Promise<FinancialKPIs> {
    const response = await this.post<FinancialKPIs>('/bi/kpis', {
      startDate: filters.startDate.toISOString().split('T')[0],
      endDate: filters.endDate.toISOString().split('T')[0],
      propertyIds: filters.propertyIds,
    });

    return response.data;
  }

  async fetchMovements(
    startDate: string,
    endDate: string,
    propertyId?: string,
    platform?: string,
    limit: number = 100,
    offset: number = 0
  ) {
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    if (propertyId) params.append('propertyId', propertyId);
    if (platform) params.append('platform', platform);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const response = await this.get<any>(
      `/bi/movements?${params.toString()}`
    );

    return response.data;
  }

  async generateWaterfallReport(
    startDate: string,
    endDate: string,
    propertyId: string
  ): Promise<WaterfallChartData> {
    const response = await this.post<WaterfallChartData>('/bi/reports/waterfall', {
      startDate,
      endDate,
      propertyId,
    });

    return response.data;
  }

  async generateSankeyReport(
    startDate: string,
    endDate: string,
    propertyId: string
  ): Promise<SankeyChartData> {
    const response = await this.post<SankeyChartData>('/bi/reports/sankey', {
      startDate,
      endDate,
      propertyId,
    });

    return response.data;
  }

  async syncMovements(
    propertyId: string,
    startDate?: string,
    endDate?: string,
    platforms?: string[]
  ) {
    return this.post('/bi/movements/sync', {
      propertyId,
      startDate,
      endDate,
      platforms,
    });
  }

  async getHealth() {
    return this.get('/bi/health');
  }

  private async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async post<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private getToken(): string {
    // Obter token do localStorage ou sessão
    return localStorage.getItem('authToken') || '';
  }
}

export const biApiClient = new BiApiClient();
export default BiApiClient;
