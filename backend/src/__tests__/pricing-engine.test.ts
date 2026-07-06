import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db.js";
import { createPricingEngine } from "../services/pricing-engine.js";

describe("Dynamic Pricing Engine", () => {
  const propertyId = "pricing-prop-123";
  const userId = "pricing-user-123";

  beforeEach(async () => {
    // Setup
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
      [userId, "pricing@example.com", "hash"]
    );

    await query(
      `INSERT INTO properties (id, user_id, name) VALUES ($1, $2, $3)`,
      [propertyId, userId, "Pricing Test Property"]
    );

    // Add historical booking data for occupancy calculation
    const baseDate = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Alternate: 70% booked, 30% available
      const status = Math.random() < 0.7 ? "booked" : "available";

      await query(
        `INSERT INTO calendar_slots (property_id, slot_date, status, source)
         VALUES ($1, $2, $3, 'test')`,
        [propertyId, dateStr, status]
      );
    }
  });

  afterEach(async () => {
    await query("DELETE FROM calendar_slots WHERE property_id = $1", [propertyId]);
    await query("DELETE FROM pricing_rules WHERE property_id = $1", [propertyId]);
    await query("DELETE FROM properties WHERE id = $1", [propertyId]);
    await query("DELETE FROM users WHERE id = $1", [userId]);
  });

  it("should calculate seasonal multiplier correctly", async () => {
    const engine = createPricingEngine(propertyId);

    // High season (July)
    const julyMultiplier = await engine["getSeasonalMultiplier"]("2026-07-15");
    expect(julyMultiplier).toBe(1.4);

    // Low season (January)
    const januaryMultiplier = await engine["getSeasonalMultiplier"]("2026-01-15");
    expect(januaryMultiplier).toBe(0.85);

    // Medium season (April)
    const aprilMultiplier = await engine["getSeasonalMultiplier"]("2026-04-15");
    expect(aprilMultiplier).toBe(1.15);
  });

  it("should calculate demand multiplier based on occupancy", async () => {
    const engine = createPricingEngine(propertyId);

    // High occupancy (90%)
    const highDemand = await engine["getDemandMultiplier"]("2026-07-15", 0.9);
    expect(highDemand).toBe(1.3);

    // Medium occupancy (50%)
    const mediumDemand = await engine["getDemandMultiplier"]("2026-07-15", 0.5);
    expect(mediumDemand).toBe(1.0);

    // Low occupancy (20%)
    const lowDemand = await engine["getDemandMultiplier"]("2026-07-15", 0.2);
    expect(lowDemand).toBeLessThan(1.0);
  });

  it("should apply minimum stay discount", async () => {
    const engine = createPricingEngine(propertyId);

    // 28+ nights: -20%
    const monthlyDiscount = await engine["getMinimumStayDiscount"](28);
    expect(monthlyDiscount).toBe(0.8);

    // 7-13 nights: -5%
    const weeklyDiscount = await engine["getMinimumStayDiscount"](7);
    expect(weeklyDiscount).toBe(0.95);

    // 1-6 nights: no discount
    const nightlyDiscount = await engine["getMinimumStayDiscount"](1);
    expect(nightlyDiscount).toBe(1.0);
  });

  it("should apply last-minute discount", async () => {
    const currentDate = "2026-07-01";

    const engine = createPricingEngine(propertyId);

    // 3 days out: -30%
    const threeDayDiscount = await engine["getLastMinuteMultiplier"](
      "2026-07-04",
      currentDate
    );
    expect(threeDayDiscount).toBe(0.7);

    // 7 days out: -15%
    const sevenDayDiscount = await engine["getLastMinuteMultiplier"](
      "2026-07-08",
      currentDate
    );
    expect(sevenDayDiscount).toBe(0.85);

    // 30 days out: no discount
    const longTermPrice = await engine["getLastMinuteMultiplier"](
      "2026-08-01",
      currentDate
    );
    expect(longTermPrice).toBe(1.0);
  });

  it("should calculate dynamic price with all multipliers", async () => {
    const engine = createPricingEngine(propertyId);
    engine.setBasePrice(150);

    const pricing = await engine.calculateDynamicPrice(
      "2026-07-10",
      "2026-07-17", // 7 nights (weekly discount)
      "2026-07-01"
    );

    expect(pricing.basePrice).toBe(150);
    expect(pricing.finalPrice).toBeGreaterThan(0);
    expect(pricing.adjustments.seasonalMultiplier).toBeGreaterThan(1);
    expect(pricing.confidence).toBeGreaterThan(0);
    expect(pricing.confidence).toBeLessThanOrEqual(1);
  });

  it("should create and retrieve pricing rules", async () => {
    const engine = createPricingEngine(propertyId);

    const ruleId = await engine.createPricingRule({
      propertyId,
      ruleType: "seasonal",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      pricePerNight: 200,
      minimumStay: 0,
      maximumStay: 365,
      active: true,
    });

    expect(ruleId).toBeDefined();

    const rules = await engine.getPricingRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].ruleType).toBe("seasonal");
    expect(rules[0].pricePerNight).toBe(200);
  });

  it("should apply custom pricing rules", async () => {
    const engine = createPricingEngine(propertyId);

    // Create summer rule (June-August)
    await engine.createPricingRule({
      propertyId,
      ruleType: "seasonal",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      pricePerNight: 250,
      minimumStay: 0,
      maximumStay: 365,
      active: true,
    });

    const basePrice = 150;
    const junePrice = await engine.applyCustomRules("2026-06-15", basePrice);

    expect(junePrice).toBe(250);
  });

  it("should generate demand forecast", async () => {
    const engine = createPricingEngine(propertyId);

    const forecast = await engine.forecastDemand(
      "2026-07-01",
      "2026-07-31"
    );

    expect(forecast.length).toBe(31);
    expect(forecast[0].date).toBe("2026-07-01");
    expect(forecast[0].occupancyRate).toBeGreaterThanOrEqual(0);
    expect(forecast[0].demandScore).toBeGreaterThanOrEqual(0);
    expect(forecast[0].suggestedPrice).toBeGreaterThan(0);
    expect(forecast[0].confidence).toBeGreaterThan(0);
  });

  it("should handle getHistoricalOccupancy", async () => {
    const engine = createPricingEngine(propertyId);

    const occupancy = await engine["getHistoricalOccupancy"](30);

    expect(occupancy.size).toBeGreaterThan(0);

    // Check occupancy values are in valid range
    for (const [_, value] of occupancy) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("should calculate high-confidence pricing with good historical data", async () => {
    const engine = createPricingEngine(propertyId);

    // With 30 days of historical data, confidence should be decent
    const pricing = await engine.calculateDynamicPrice(
      "2026-07-10",
      "2026-07-12"
    );

    expect(pricing.confidence).toBeGreaterThan(0.7);
  });

  it("should handle base price setting", () => {
    const engine = createPricingEngine(propertyId);

    expect(engine.getBasePrice()).toBe(150); // Default

    engine.setBasePrice(200);
    expect(engine.getBasePrice()).toBe(200);
  });

  it("should suggest lower prices for last-minute bookings", async () => {
    const engine = createPricingEngine(propertyId);
    engine.setBasePrice(150);

    const currentDate = "2026-07-15";

    // 30 days advance
    const advancePrice = await engine.calculateDynamicPrice(
      "2026-08-15",
      "2026-08-16",
      currentDate
    );

    // 3 days out
    const lastMinutePrice = await engine.calculateDynamicPrice(
      "2026-07-18",
      "2026-07-19",
      currentDate
    );

    // Last-minute should be cheaper
    expect(lastMinutePrice.finalPrice).toBeLessThan(advancePrice.finalPrice);
  });

  it("should suggest higher prices during high season", async () => {
    const engine = createPricingEngine(propertyId);
    engine.setBasePrice(150);

    // Summer pricing
    const summerPrice = await engine.calculateDynamicPrice(
      "2026-07-15",
      "2026-07-16"
    );

    // Winter pricing
    const winterPrice = await engine.calculateDynamicPrice(
      "2026-01-15",
      "2026-01-16"
    );

    // Summer should be more expensive
    expect(summerPrice.finalPrice).toBeGreaterThan(winterPrice.finalPrice);
  });
});
