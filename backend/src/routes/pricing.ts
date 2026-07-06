import { Router, Request, Response } from "express";
import { createPricingEngine } from "../services/pricing-engine.js";
import { authMiddleware } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(authMiddleware);

// Get dynamic price suggestion for a booking
router.post("/properties/:propertyId/pricing/calculate", async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { checkInDate, checkOutDate, currentDate } = req.body;

    // Verify user owns property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    const engine = createPricingEngine(propertyId);

    // Get base price from property or use default
    const propResult = await query(
      `SELECT COALESCE((
        SELECT price_per_night FROM pricing_rules
        WHERE property_id = $1 AND rule_type = 'base'
        LIMIT 1
      ), 150) as base_price`,
      [propertyId]
    );

    engine.setBasePrice(propResult.rows[0].base_price);

    const pricing = await engine.calculateDynamicPrice(
      checkInDate,
      checkOutDate,
      currentDate || new Date().toISOString().split("T")[0]
    );

    res.json(pricing);
  } catch (error) {
    console.error("Pricing calculation error:", error);
    res.status(500).json({ error: "Failed to calculate pricing" });
  }
});

// Get demand forecast for period
router.get("/properties/:propertyId/pricing/forecast", async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify user owns property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ error: "startDate and endDate required" });
      return;
    }

    const engine = createPricingEngine(propertyId);

    const forecast = await engine.forecastDemand(
      startDate as string,
      endDate as string
    );

    res.json(forecast);
  } catch (error) {
    console.error("Forecast error:", error);
    res.status(500).json({ error: "Failed to generate forecast" });
  }
});

// Create pricing rule
router.post("/properties/:propertyId/pricing/rules", async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { ruleType, startDate, endDate, pricePerNight, minimumStay, maximumStay } = req.body;

    // Verify user owns property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    const engine = createPricingEngine(propertyId);

    const ruleId = await engine.createPricingRule({
      propertyId,
      ruleType,
      startDate,
      endDate,
      pricePerNight,
      minimumStay: minimumStay || 0,
      maximumStay: maximumStay || 365,
      active: true,
    });

    res.status(201).json({
      ruleId,
      message: "Pricing rule created",
    });
  } catch (error) {
    console.error("Rule creation error:", error);
    res.status(500).json({ error: "Failed to create pricing rule" });
  }
});

// Get all pricing rules for property
router.get("/properties/:propertyId/pricing/rules", async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;

    // Verify user owns property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    const engine = createPricingEngine(propertyId);
    const rules = await engine.getPricingRules();

    res.json(rules);
  } catch (error) {
    console.error("Get rules error:", error);
    res.status(500).json({ error: "Failed to fetch pricing rules" });
  }
});

// Delete pricing rule
router.delete("/properties/:propertyId/pricing/rules/:ruleId", async (req: Request, res: Response) => {
  try {
    const { propertyId, ruleId } = req.params;

    // Verify user owns property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    await query(
      "UPDATE pricing_rules SET active = false WHERE id = $1 AND property_id = $2",
      [ruleId, propertyId]
    );

    res.json({ message: "Pricing rule deactivated" });
  } catch (error) {
    console.error("Rule deletion error:", error);
    res.status(500).json({ error: "Failed to delete pricing rule" });
  }
});

export default router;
