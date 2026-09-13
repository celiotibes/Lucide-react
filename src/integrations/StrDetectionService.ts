/**
 * Short-Term Rental (STR) Detection Service
 * Detecta anúncios de AirBnB e Booking.com
 * Requisito: Contrato proíbe "AirBnB, Booking, temporada"
 */

export interface STRListing {
  found: boolean;
  url?: string;
  listing_id?: string;
  title?: string;
  price?: number;
  reviews_count?: number;
  detection_date: string;
  platform: 'airbnb' | 'booking';
}

export class StrDetectionService {
  /**
   * Verificar se há anúncio de AirBnB para um endereço
   * Usa Web Scraping ou AirBnB API (placeholder)
   */
  async checkAirbnbListing(propertyAddress: string): Promise<STRListing> {
    try {
      // TODO: Integrar com AirBnB API ou Web Scraping
      // Por enquanto, retorna template
      console.log(`[AIRBNB CHECK] Verificando: ${propertyAddress}`);

      // Simulação: 30% de chance de encontrar listagem (realista para validação)
      const found = Math.random() < 0.3;

      return {
        found,
        url: found ? 'https://www.airbnb.com/rooms/12345678' : undefined,
        listing_id: found ? 'airbnb_12345678' : undefined,
        title: found ? 'Acomodação moderna no centro' : undefined,
        price: found ? 150 : undefined,
        reviews_count: found ? 42 : undefined,
        detection_date: new Date().toISOString().split('T')[0],
        platform: 'airbnb',
      };
    } catch (error) {
      console.error('Failed to check Airbnb listing:', error);
      throw error;
    }
  }

  /**
   * Verificar se há anúncio de Booking.com para um endereço
   */
  async checkBookingListing(propertyAddress: string): Promise<STRListing> {
    try {
      // TODO: Integrar com Booking.com API ou Web Scraping
      console.log(`[BOOKING CHECK] Verificando: ${propertyAddress}`);

      // Simulação: 20% de chance de encontrar listagem
      const found = Math.random() < 0.2;

      return {
        found,
        url: found ? 'https://www.booking.com/hotel/br/12345' : undefined,
        listing_id: found ? 'booking_12345' : undefined,
        title: found ? 'Quarto privado - Centro' : undefined,
        price: found ? 120 : undefined,
        reviews_count: found ? 28 : undefined,
        detection_date: new Date().toISOString().split('T')[0],
        platform: 'booking',
      };
    } catch (error) {
      console.error('Failed to check Booking listing:', error);
      throw error;
    }
  }

  /**
   * Verificar ambas as plataformas
   */
  async checkAllPlatforms(propertyAddress: string): Promise<{
    airbnb: STRListing;
    booking: STRListing;
    any_found: boolean;
  }> {
    try {
      const [airbnb, booking] = await Promise.all([
        this.checkAirbnbListing(propertyAddress),
        this.checkBookingListing(propertyAddress),
      ]);

      return {
        airbnb,
        booking,
        any_found: airbnb.found || booking.found,
      };
    } catch (error) {
      console.error('Failed to check STR listings:', error);
      throw error;
    }
  }

  /**
   * Monitoramento contínuo (executado diariamente/semanalmente)
   */
  async monitorProperty(data: {
    property_id: string;
    property_address: string;
    lease_id: string;
  }): Promise<{
    monitoring_date: string;
    property_id: string;
    airbnb_found: boolean;
    booking_found: boolean;
    alert_triggered: boolean;
  }> {
    try {
      const result = await this.checkAllPlatforms(data.property_address);

      const alert_triggered = result.any_found;

      if (alert_triggered) {
        console.log(`[STR ALERT] STR listing detectado!
          Propriedade: ${data.property_address}
          Lease: ${data.lease_id}
          ${result.airbnb.found ? `AirBnB: ${result.airbnb.url}` : ''}
          ${result.booking.found ? `Booking: ${result.booking.url}` : ''}
        `);
        // TODO: Criar violation automaticamente
      }

      return {
        monitoring_date: new Date().toISOString().split('T')[0],
        property_id: data.property_id,
        airbnb_found: result.airbnb.found,
        booking_found: result.booking.found,
        alert_triggered,
      };
    } catch (error) {
      console.error('Failed to monitor property:', error);
      throw error;
    }
  }

  /**
   * Extrair endereço estruturado para busca mais precisa
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calcular similaridade entre endereços
   * (útil para matching com listagens encontradas)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeAddress(str1);
    const s2 = this.normalizeAddress(str2);

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 100.0;

    const editDistance = this.calculateEditDistance(longer, shorter);
    return ((longer.length - editDistance) / longer.length) * 100;
  }

  /**
   * Levenshtein distance para calcular similaridade
   */
  private calculateEditDistance(s1: string, s2: string): number {
    const costs: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[i] = [j];
        } else if (j > 0) {
          let newValue = costs[i][j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[i - 1][j]) + 1;
          }
          costs[i][j] = newValue;
          lastValue = newValue;
        }
      }
    }
    return costs[s1.length][s2.length];
  }
}
