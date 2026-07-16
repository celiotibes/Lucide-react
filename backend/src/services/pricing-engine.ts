import { query } from "../db.js";
import { Logger } from "../shared/logger";

interface PricingRule {
  id: string;
  propertyId: string;
  ruleType: string;
  startDate: string;
  endDate: string;
  pricePerNight: number;
  minimumStay: number;
  maximumStay: number;
  active: boolean;
}

interface DemandForecast {
  date: string;
  occupancyRate: number;
  demandScore: number;
  suggestedPrice: number;
  confidence: number;
}

interface PricingAnalysis {
  basePrice: number;
  adjustments: {
    seasonalMultiplier: number;
    demandMultiplier: number;
    minimumStayDiscount: number;
    lastMinuteMultiplier: number;
  };
  finalPrice: number;
  confidence: number;
}

class PricingEngine {
  private propertyId: string;
  private basePrice: number = 150; // Default
  private logger = Logger.getLogger('PricingEngine');

  constructor(propertyId: string) {
    this.propertyId = propertyId;
    this.logger.debug('PricingEngine initialized', { propertyId });
  }

  async getHistoricalOccupancy(
    days: number = 90
  ): Promise<Map<string, number>> {
    const occupancyMap = new Map<string, number>();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const result = await query(
      `SELECT
        slot_date,
        CASE
          WHEN status = 'booked' THEN 1.0
          WHEN status = 'blocked' THEN 0.5
          ELSE 0.0
        END as occupancy
      FROM calendar_slots
      WHERE property_id = $1
        AND slot_date BETWEEN $2 AND $3
      ORDER BY slot_date`,
      [
        this.propertyId,
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
      ]
    );

    for (const row of result.rows) {
      occupancyMap.set(row.slot_date, row.occupancy);
    }

    return occupancyMap;
  }

  async getSeasonalMultiplier(date: string): Promise<number> {
    const month = new Date(date).getMonth();

    // High season: June-August (summer), December (holidays)
    if (month >= 5 && month <= 7) return 1.4; // +40%
    if (month === 11) return 1.35; // +35%

    // Medium season: April-May, September-October
    if ((month >= 3 && month <= 4) || (month >= 8 && month <= 9)) return 1.15; // +15%

    // Low season: January-March, November
    return 0.85; // -15%
  }

  async getDemandMultiplier(
    date: string,
    occupancyRate: number
  ): Promise<number> {
    // High occupancy (>80%) → increase price
    if (occupancyRate > 0.8) return 1.3; // +30%
    if (occupancyRate > 0.6) return 1.15; // +15%

    // Low occupancy (<40%) → decrease price
    if (occupancyRate < 0.2) return 0.75; // -25%
    if (occupancyRate < 0.4) return 0.9; // -10%

    return 1.0;
  }

  async getMinimumStayDiscount(nights: number): Promise<number> {
    // Longer stays get discounts
    if (nights >= 28) return 0.8; // -20% for month-long stays
    if (nights >= 14) return 0.9; // -10% for 2-week stays
    if (nights >= 7) return 0.95; // -5% for week-long stays

    return 1.0;
  }

  async getLastMinuteMultiplier(
    checkInDate: string,
    currentDate: string
  ): Promise<number> {
    const checkIn = new Date(checkInDate);
    const today = new Date(currentDate);
    const daysUntilCheckIn = Math.ceil(
      (checkIn.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Last-minute bookings (within 7 days) get discounts to fill gaps
    if (daysUntilCheckIn <= 3) return 0.7; // -30%
    if (daysUntilCheckIn <= 7) return 0.85; // -15%

    return 1.0;
  }

  async calculateDynamicPrice(
    checkInDate: string,
    checkOutDate: string,
    currentDate: string = new Date().toISOString().split("T")[0]
  ): Promise<PricingAnalysis> {
    this.logger.debug('Calculating dynamic price', {
      propertyId: this.propertyId,
      checkInDate,
      checkOutDate
    });

    const occupancy = await this.getHistoricalOccupancy(90);
    const totalOccupied = Array.from(occupancy.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const avgOccupancy = totalOccupied / 90;

    const seasonal = await this.getSeasonalMultiplier(checkInDate);
    const demand = await this.getDemandMultiplier(checkInDate, avgOccupancy);

    const nights = Math.ceil(
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const stayDiscount = await this.getMinimumStayDiscount(nights);
    const lastMinute = await this.getLastMinuteMultiplier(
      checkInDate,
      currentDate
    );

    const finalPrice = Math.round(
      this.basePrice * seasonal * demand * stayDiscount * lastMinute
    );

    const confidence = 0.75 + avgOccupancy * 0.25; // Higher confidence with more data

    this.logger.info('Dynamic price calculated', {
      propertyId: this.propertyId,
      checkInDate,
      nights,
      avgOccupancy: avgOccupancy.toFixed(2),
      basePrice: this.basePrice,
      finalPrice,
      seasonalMultiplier: seasonal.toFixed(2),
      demandMultiplier: demand.toFixed(2),
      confidence: confidence.toFixed(2),
    });

    return {
      basePrice: this.basePrice,
      adjustments: {
        seasonalMultiplier: seasonal,
        demandMultiplier: demand,
        minimumStayDiscount: stayDiscount,
        lastMinuteMultiplier: lastMinute,
      },
      finalPrice,
      confidence,
    };
  }

  async forecastDemand(
    startDate: string,
    endDate: string
  ): Promise<DemandForecast[]> {
    const forecast: DemandForecast[] = [];
    const occupancy = await this.getHistoricalOccupancy(90);

    let currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate < end) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const historicalOccupancy = occupancy.get(dateStr) || 0.5;

      const seasonal = await this.getSeasonalMultiplier(dateStr);
      const demandScore = historicalOccupancy * seasonal;

      const pricing = await this.calculateDynamicPrice(
        dateStr,
        new Date(currentDate.getTime() + 1 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]
      );

      forecast.push({
        date: dateStr,
        occupancyRate: historicalOccupancy,
        demandScore,
        suggestedPrice: pricing.finalPrice,
        confidence: pricing.confidence,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return forecast;
  }

  async createPricingRule(rule: Omit<PricingRule, "id">): Promise<string> {
    this.logger.info('Creating pricing rule', {
      propertyId: rule.propertyId,
      ruleType: rule.ruleType,
      startDate: rule.startDate,
      endDate: rule.endDate,
      pricePerNight: rule.pricePerNight,
    });

    const result = await query(
      `INSERT INTO pricing_rules (
        property_id, rule_type, start_date, end_date,
        price_per_night, minimum_stay, maximum_stay, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        rule.propertyId,
        rule.ruleType,
        rule.startDate,
        rule.endDate,
        rule.pricePerNight,
        rule.minimumStay,
        rule.maximumStay,
        rule.active,
      ]
    );

    const ruleId = result.rows[0].id;
    this.logger.debug('Pricing rule created', { propertyId: rule.propertyId, ruleId });
    return ruleId;
  }

  async getPricingRules(): Promise<PricingRule[]> {
    const result = await query(
      `SELECT * FROM pricing_rules
       WHERE property_id = $1 AND active = true
       ORDER BY start_date`,
      [this.propertyId]
    );

    return result.rows;
  }

  async applyCustomRules(
    checkInDate: string,
    basePrice: number
  ): Promise<number> {
    const rules = await this.getPricingRules();

    let finalPrice = basePrice;

    for (const rule of rules) {
      if (checkInDate >= rule.startDate && checkInDate <= rule.endDate) {
        // Apply rule-specific pricing
        if (rule.ruleType === "seasonal") {
          finalPrice = rule.pricePerNight;
        } else if (rule.ruleType === "special_event") {
          finalPrice = Math.max(finalPrice, rule.pricePerNight);
        } else if (rule.ruleType === "promotion") {
          finalPrice = Math.min(finalPrice, rule.pricePerNight);
        }
      }
    }

    return finalPrice;
  }

  setBasePrice(price: number): void {
    this.basePrice = price;
  }

  getBasePrice(): number {
    return this.basePrice;
  }
}

export function createPricingEngine(propertyId: string): PricingEngine {
  return new PricingEngine(propertyId);
}

export { PricingEngine };
