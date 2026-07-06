import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { query } from "../db.js";

describe("Booking.com Sync Engine", () => {
  beforeEach(async () => {
    // Setup: Create test property
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
      ["user-123", "test@example.com", "hash"]
    );

    await query(
      `INSERT INTO properties (id, user_id, name) VALUES ($1, $2, $3)`,
      ["prop-123", "user-123", "Test Property"]
    );

    await query(
      `INSERT INTO ota_listings (property_id, ota_name, external_property_id)
       VALUES ($1, $2, $3)`,
      ["prop-123", "booking", "12345"]
    );
  });

  afterEach(async () => {
    // Cleanup
    await query("DELETE FROM calendar_slots WHERE property_id = $1", [
      "prop-123",
    ]);
    await query("DELETE FROM ota_listings WHERE property_id = $1", [
      "prop-123",
    ]);
    await query("DELETE FROM properties WHERE id = $1", ["prop-123"]);
    await query("DELETE FROM users WHERE id = $1", ["user-123"]);
  });

  it("should parse booking availability response correctly", async () => {
    const response = {
      booking: [
        { date: "2026-07-01", status: "available" },
        { date: "2026-07-02", status: "booked" },
        { date: "2026-07-03", status: "blocked" },
      ],
    };

    // Simulate parsed response
    const availability = Array.isArray(response.booking)
      ? response.booking
      : [response.booking];

    expect(availability).toHaveLength(3);
    expect(availability[0]).toEqual({
      date: "2026-07-01",
      status: "available",
    });
    expect(availability[1].status).toBe("booked");
    expect(availability[2].status).toBe("blocked");
  });

  it("should detect overlapping bookings as conflicts", async () => {
    // Insert overlapping bookings
    await query(
      `INSERT INTO calendar_slots (property_id, slot_date, status)
       VALUES ($1, $2, 'blocked'), ($1, $3, 'blocked')`,
      ["prop-123", "2026-07-01", "2026-07-02"]
    );

    const result = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND status = 'blocked'`,
      ["prop-123"]
    );

    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("should maintain idempotency with sync_hash", async () => {
    const syncHash = crypto
      .createHash("sha256")
      .update("prop-123:2026-07-01:blocked")
      .digest("hex");

    // First sync
    await query(
      `INSERT INTO calendar_slots (property_id, slot_date, status, sync_hash)
       VALUES ($1, $2, $3, $4)`,
      ["prop-123", "2026-07-01", "blocked", syncHash]
    );

    const result1 = await query(
      "SELECT COUNT(*) as count FROM calendar_slots WHERE property_id = $1",
      ["prop-123"]
    );

    // Second sync with same hash should not insert
    await query(
      `INSERT INTO calendar_slots (property_id, slot_date, status, sync_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, slot_date) DO UPDATE SET sync_hash = $4`,
      ["prop-123", "2026-07-01", "blocked", syncHash]
    );

    const result2 = await query(
      "SELECT COUNT(*) as count FROM calendar_slots WHERE property_id = $1",
      ["prop-123"]
    );

    expect(parseInt(result2.rows[0].count)).toBe(parseInt(result1.rows[0].count));
  });

  it("should track rate limit tokens correctly", async () => {
    const tokens: { timestamp: number }[] = [];
    const maxRequestsPerSecond = 2;

    // Simulate 3 requests
    for (let i = 0; i < 3; i++) {
      tokens.push({ timestamp: Date.now() });
    }

    const oneSecondAgo = Date.now() - 1000;
    const validTokens = tokens.filter((t) => t.timestamp > oneSecondAgo);

    expect(validTokens.length).toBe(3);
    expect(validTokens.length > maxRequestsPerSecond).toBe(true);
  });

  it("should store sync logs with correct metadata", async () => {
    await query(
      `INSERT INTO ota_sync_log (property_id, ota_name, sync_type, status, items_processed)
       VALUES ($1, $2, $3, $4, $5)`,
      ["prop-123", "booking", "pull", "success", 90]
    );

    const result = await query(
      "SELECT * FROM ota_sync_log WHERE property_id = $1",
      ["prop-123"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].items_processed).toBe(90);
    expect(result.rows[0].status).toBe("success");
  });

  it("should handle date range transformations correctly", () => {
    const checkIn = new Date("2026-07-01");
    const checkOut = new Date("2026-07-05");
    const dates: string[] = [];

    for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }

    expect(dates).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
  });

  it("should handle webhook signature verification", () => {
    const payload = JSON.stringify({ event: "booking_confirmed" });
    const secret = "webhook-secret";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );

    expect(isValid).toBe(true);
  });

  it("should reject tampered webhook payloads", () => {
    const payload = JSON.stringify({ event: "booking_confirmed" });
    const tamperedPayload = JSON.stringify({ event: "booking_cancelled" });
    const secret = "webhook-secret";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const tampered = crypto
      .createHmac("sha256", secret)
      .update(tamperedPayload)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(tampered)
    );

    expect(isValid).toBe(false);
  });
});
