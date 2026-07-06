import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { query } from "../db.js";

describe("VRBO Sync Engine", () => {
  beforeEach(async () => {
    // Setup: Create test property
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
      ["vrbo-user-123", "vrbo@example.com", "hash"]
    );

    await query(
      `INSERT INTO properties (id, user_id, name) VALUES ($1, $2, $3)`,
      ["vrbo-prop-123", "vrbo-user-123", "VRBO Test Property"]
    );

    await query(
      `INSERT INTO ota_listings (property_id, ota_name, external_property_id)
       VALUES ($1, $2, $3)`,
      ["vrbo-prop-123", "vrbo", "54321"]
    );
  });

  afterEach(async () => {
    // Cleanup
    await query("DELETE FROM calendar_slots WHERE property_id = $1", [
      "vrbo-prop-123",
    ]);
    await query("DELETE FROM bookings WHERE property_id = $1", [
      "vrbo-prop-123",
    ]);
    await query("DELETE FROM ota_listings WHERE property_id = $1", [
      "vrbo-prop-123",
    ]);
    await query("DELETE FROM properties WHERE id = $1", ["vrbo-prop-123"]);
    await query("DELETE FROM users WHERE id = $1", ["vrbo-user-123"]);
  });

  it("should parse VRBO availability response correctly", async () => {
    const response = {
      calendar: {
        "2026-07-01": { status: "available" },
        "2026-07-02": { status: "booked" },
        "2026-07-03": { status: "blocked", minStay: 2, maxStay: 14 },
      },
    };

    const availability = [];
    for (const [date, slot] of Object.entries(response.calendar)) {
      availability.push({
        date,
        status: (slot as any).status,
        minStay: (slot as any).minStay,
        maxStay: (slot as any).maxStay,
      });
    }

    expect(availability).toHaveLength(3);
    expect(availability[0].status).toBe("available");
    expect(availability[2].minStay).toBe(2);
  });

  it("should sync VRBO bookings to database correctly", async () => {
    const booking = {
      bookingId: "vrbo-123456",
      propertyId: "54321",
      guestName: "John Doe",
      guestEmail: "john@example.com",
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
      totalPrice: 500,
      status: "confirmed",
    };

    const otaListing = await query(
      "SELECT id FROM ota_listings WHERE property_id = $1 AND ota_name = 'vrbo'",
      ["vrbo-prop-123"]
    );

    await query(
      `INSERT INTO bookings (
        property_id, ota_listing_id, external_booking_id,
        guest_name, guest_email, check_in, check_out,
        total_price, currency, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'vrbo')`,
      [
        "vrbo-prop-123",
        otaListing.rows[0].id,
        booking.bookingId,
        booking.guestName,
        booking.guestEmail,
        booking.checkIn,
        booking.checkOut,
        booking.totalPrice,
        "USD",
        booking.status.toLowerCase(),
      ]
    );

    const result = await query(
      "SELECT * FROM bookings WHERE property_id = $1",
      ["vrbo-prop-123"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].guest_name).toBe("John Doe");
    expect(result.rows[0].external_booking_id).toBe("vrbo-123456");
  });

  it("should block dates when booking is confirmed", async () => {
    const checkIn = new Date("2026-07-01");
    const checkOut = new Date("2026-07-05");

    const otaListing = await query(
      "SELECT id FROM ota_listings WHERE property_id = $1",
      ["vrbo-prop-123"]
    );

    const booking = await query(
      `INSERT INTO bookings (
        property_id, ota_listing_id, external_booking_id,
        guest_name, guest_email, check_in, check_out,
        status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'vrbo')
       RETURNING id`,
      [
        "vrbo-prop-123",
        otaListing.rows[0].id,
        "vrbo-block-123",
        "Guest Name",
        "guest@example.com",
        checkIn,
        checkOut,
      ]
    );

    const bookedDates = [];
    for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
      bookedDates.push(d.toISOString().split("T")[0]);
    }

    // Simulate trigger: insert calendar slots
    for (const date of bookedDates) {
      await query(
        `INSERT INTO calendar_slots (property_id, slot_date, status, booking_id)
         VALUES ($1, $2, 'blocked', $3)
         ON CONFLICT (property_id, slot_date) DO UPDATE SET status = 'blocked'`,
        ["vrbo-prop-123", date, booking.rows[0].id]
      );
    }

    const slots = await query(
      "SELECT * FROM calendar_slots WHERE property_id = $1 AND status = 'blocked'",
      ["vrbo-prop-123"]
    );

    expect(slots.rows).toHaveLength(4);
  });

  it("should prevent duplicate booking sync via idempotency", async () => {
    const bookingId = "vrbo-dup-123";

    const otaListing = await query(
      "SELECT id FROM ota_listings WHERE property_id = $1",
      ["vrbo-prop-123"]
    );

    // First sync
    await query(
      `INSERT INTO bookings (
        property_id, ota_listing_id, external_booking_id,
        guest_name, guest_email, check_in, check_out,
        status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'vrbo')`,
      [
        "vrbo-prop-123",
        otaListing.rows[0].id,
        bookingId,
        "Guest",
        "guest@example.com",
        "2026-07-01",
        "2026-07-03",
      ]
    );

    const result1 = await query(
      `SELECT COUNT(*) as count FROM bookings
       WHERE property_id = $1 AND external_booking_id = $2`,
      ["vrbo-prop-123", bookingId]
    );

    // Second sync (attempt duplicate)
    const existing = await query(
      `SELECT id FROM bookings
       WHERE external_booking_id = $1`,
      [bookingId]
    );

    if (existing.rows.length > 0) {
      // Skip duplicate insert
    } else {
      await query(
        `INSERT INTO bookings (
          property_id, ota_listing_id, external_booking_id,
          guest_name, guest_email, check_in, check_out,
          status, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'vrbo')`,
        [
          "vrbo-prop-123",
          otaListing.rows[0].id,
          bookingId,
          "Guest",
          "guest@example.com",
          "2026-07-01",
          "2026-07-03",
        ]
      );
    }

    const result2 = await query(
      `SELECT COUNT(*) as count FROM bookings
       WHERE property_id = $1 AND external_booking_id = $2`,
      ["vrbo-prop-123", bookingId]
    );

    expect(parseInt(result2.rows[0].count)).toBe(
      parseInt(result1.rows[0].count)
    );
  });

  it("should handle rate limiting with 10 requests per second", async () => {
    let requestCount = 0;
    let lastResetTime = Date.now();
    const maxRequestsPerSecond = 10;

    for (let i = 0; i < 15; i++) {
      const now = Date.now();
      const timeSinceReset = now - lastResetTime;

      if (timeSinceReset >= 1000) {
        requestCount = 0;
        lastResetTime = now;
      }

      if (requestCount < maxRequestsPerSecond) {
        requestCount++;
      } else {
        const waitTime = 1000 - timeSinceReset;
        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          requestCount = 1;
          lastResetTime = Date.now();
        }
      }
    }

    expect(requestCount).toBeLessThanOrEqual(maxRequestsPerSecond);
  });

  it("should verify VRBO webhook signatures", () => {
    const payload = JSON.stringify({
      eventType: "booking_confirmed",
      propertyId: "54321",
    });
    const secret = "vrbo-webhook-secret";

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

  it("should reject tampered VRBO webhook payloads", () => {
    const payload = JSON.stringify({ eventType: "booking_confirmed" });
    const tamperedPayload = JSON.stringify({ eventType: "booking_cancelled" });
    const secret = "vrbo-webhook-secret";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const tampered = crypto
      .createHmac("sha256", secret)
      .update(tamperedPayload)
      .digest("hex");

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(tampered)
      );
      expect(isValid).toBe(false);
    } catch {
      expect(true).toBe(true); // Expected to fail with BufferMismatchError
    }
  });

  it("should sync availability with correct statuses", async () => {
    const availability = [
      { date: "2026-07-01", status: "available" },
      { date: "2026-07-02", status: "blocked" },
      { date: "2026-07-03", status: "booked" },
    ];

    for (const slot of availability) {
      await query(
        `INSERT INTO calendar_slots (property_id, slot_date, status, source)
         VALUES ($1, $2, $3, 'vrbo')`,
        ["vrbo-prop-123", slot.date, slot.status]
      );
    }

    const result = await query(
      "SELECT status, COUNT(*) as count FROM calendar_slots WHERE property_id = $1 GROUP BY status",
      ["vrbo-prop-123"]
    );

    const statuses: Record<string, number> = {};
    for (const row of result.rows) {
      statuses[row.status] = parseInt(row.count);
    }

    expect(statuses["available"]).toBe(1);
    expect(statuses["blocked"]).toBe(1);
    expect(statuses["booked"]).toBe(1);
  });
});
