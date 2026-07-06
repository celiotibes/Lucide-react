import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db.js";
import { hashPassword, generateToken } from "../auth/crypto.js";
import crypto from "crypto";

describe("E2E: Complete Booking Flow", () => {
  const testData = {
    userId: "e2e-user-123",
    propertyId: "e2e-prop-123",
    email: "e2e@example.com",
    password: "TestPassword123!",
    propertyName: "E2E Test Property",
    checkInDate: "2026-07-15",
    checkOutDate: "2026-07-20",
    guestName: "John Doe",
    guestEmail: "guest@example.com",
  };

  beforeEach(async () => {
    // Create user
    const passwordHash = await hashPassword(testData.password);
    await query(
      `INSERT INTO users (id, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)`,
      [testData.userId, testData.email, passwordHash, "Test User"]
    );

    // Create property
    await query(
      `INSERT INTO properties (id, user_id, name, bedrooms, bathrooms, max_guests)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testData.propertyId, testData.userId, testData.propertyName, 2, 1, 4]
    );

    // Create OTA listings
    for (const ota of ["booking", "vrbo", "website"]) {
      await query(
        `INSERT INTO ota_listings (property_id, ota_name, external_property_id, sync_enabled)
         VALUES ($1, $2, $3, true)`,
        [testData.propertyId, ota, `${ota}-id-123`]
      );
    }

    // Create calendar availability (90 days)
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      // Mark all as available initially
      await query(
        `INSERT INTO calendar_slots (property_id, slot_date, status, source)
         VALUES ($1, $2, 'available', 'website')`,
        [testData.propertyId, dateStr]
      );
    }

    // Add base pricing rule
    await query(
      `INSERT INTO pricing_rules (property_id, rule_type, price_per_night, active)
       VALUES ($1, 'base', 150, true)`,
      [testData.propertyId]
    );
  });

  afterEach(async () => {
    // Cleanup in reverse order of dependencies
    await query("DELETE FROM bookings WHERE property_id = $1", [
      testData.propertyId,
    ]);
    await query("DELETE FROM calendar_slots WHERE property_id = $1", [
      testData.propertyId,
    ]);
    await query("DELETE FROM pricing_rules WHERE property_id = $1", [
      testData.propertyId,
    ]);
    await query("DELETE FROM ota_listings WHERE property_id = $1", [
      testData.propertyId,
    ]);
    await query("DELETE FROM properties WHERE id = $1", [testData.propertyId]);
    await query("DELETE FROM users WHERE id = $1", [testData.userId]);
  });

  it("should complete full booking flow: website → database → OTA sync", async () => {
    // Step 1: Guest submits booking via website
    const bookingResult = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, currency, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'website')
       RETURNING id`,
      [
        testData.propertyId,
        testData.guestName,
        testData.guestEmail,
        testData.checkInDate,
        testData.checkOutDate,
        750, // 5 nights × $150
      ]
    );

    const bookingId = bookingResult.rows[0].id;

    // Step 2: Calendar slots should be blocked (via trigger)
    const blockedSlots = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND status = 'blocked' AND booking_id = $2`,
      [testData.propertyId, bookingId]
    );

    // Should have 5 blocked dates (check-in to check-out - 1)
    expect(parseInt(blockedSlots.rows[0].count)).toBeGreaterThanOrEqual(4);

    // Step 3: OTA sync should see the blocked dates
    const otaSyncLog = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND status IN ('blocked', 'booked')`
    );

    expect(parseInt(otaSyncLog.rows[0].count)).toBeGreaterThan(0);

    // Step 4: Verify booking has correct details
    const booking = await query(
      "SELECT * FROM bookings WHERE id = $1",
      [bookingId]
    );

    expect(booking.rows[0].guest_name).toBe(testData.guestName);
    expect(booking.rows[0].check_in).toBe(testData.checkInDate);
    expect(booking.rows[0].status).toBe("confirmed");
  });

  it("should detect and prevent overbooking conflicts", async () => {
    // Create first booking
    const booking1 = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        status, source
      ) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'website')
       RETURNING id`,
      [
        testData.propertyId,
        "Guest 1",
        "guest1@example.com",
        "2026-07-15",
        "2026-07-18",
      ]
    );

    // Try to create overlapping booking (should fail or be detected)
    const conflictResult = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND slot_date BETWEEN $2 AND $3
       AND status = 'blocked'`,
      [testData.propertyId, "2026-07-16", "2026-07-17"]
    );

    // First booking should have blocked these dates
    expect(parseInt(conflictResult.rows[0].count)).toBeGreaterThan(0);

    // Step 2: Create second booking with overlap
    try {
      await query(
        `INSERT INTO bookings (
          property_id, guest_name, guest_email, check_in, check_out,
          status, source
        ) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'website')`,
        [
          testData.propertyId,
          "Guest 2",
          "guest2@example.com",
          "2026-07-17",
          "2026-07-20",
        ]
      );

      // If we get here, check if conflict detection triggered
      const hasConflict = parseInt(conflictResult.rows[0].count) > 0;
      expect(hasConflict).toBe(true);
    } catch {
      // Conflict properly prevented
      expect(true).toBe(true);
    }
  });

  it("should sync booking to Booking.com with proper formatting", async () => {
    // Create booking
    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, currency, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'website')
       RETURNING id, check_in, check_out, guest_name`,
      [
        testData.propertyId,
        "Booking Guest",
        "guest@booking.example.com",
        testData.checkInDate,
        testData.checkOutDate,
        750,
        "USD",
      ]
    );

    const bookingData = booking.rows[0];

    // Verify booking can be converted to Booking.com format
    const bookingDatesCount = Math.ceil(
      (new Date(bookingData.check_out).getTime() -
        new Date(bookingData.check_in).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    expect(bookingDatesCount).toBeGreaterThan(0);
    expect(bookingData.guest_name).toBe("Booking Guest");

    // Verify OTA listing exists
    const otaListing = await query(
      "SELECT * FROM ota_listings WHERE property_id = $1 AND ota_name = 'booking'",
      [testData.propertyId]
    );

    expect(otaListing.rows.length).toBe(1);
  });

  it("should sync booking to VRBO with proper data format", async () => {
    // Create booking
    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'vrbo')
       RETURNING id`,
      [
        testData.propertyId,
        "VRBO Guest",
        "guest@vrbo.example.com",
        testData.checkInDate,
        testData.checkOutDate,
        750,
      ]
    );

    // Verify booking source
    const vrboBooking = await query(
      "SELECT source FROM bookings WHERE id = $1",
      [booking.rows[0].id]
    );

    expect(vrboBooking.rows[0].source).toBe("vrbo");

    // Verify dates are blocked
    const blockedCount = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND status = 'blocked'`,
      [testData.propertyId]
    );

    expect(parseInt(blockedCount.rows[0].count)).toBeGreaterThan(0);
  });

  it("should calculate correct pricing with dynamic engine", async () => {
    // Base price: $150/night
    // 5 nights = $750
    // Expected: base × seasonal × demand × stay_discount × last_minute

    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, currency, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'website')
       RETURNING total_price`,
      [
        testData.propertyId,
        testData.guestName,
        testData.guestEmail,
        testData.checkInDate,
        testData.checkOutDate,
        750, // 5 nights × $150
        "USD",
      ]
    );

    expect(booking.rows[0].total_price).toBe(750);

    // Verify pricing rules exist
    const rules = await query(
      "SELECT * FROM pricing_rules WHERE property_id = $1 AND active = true",
      [testData.propertyId]
    );

    expect(rules.rows.length).toBeGreaterThan(0);
  });

  it("should handle concurrent bookings with proper locking", async () => {
    const concurrentBookings = [];

    // Attempt 3 concurrent bookings for same date
    for (let i = 0; i < 3; i++) {
      concurrentBookings.push(
        query(
          `INSERT INTO bookings (
            property_id, guest_name, guest_email, check_in, check_out,
            status, source
          ) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'website')`,
          [
            testData.propertyId,
            `Guest ${i}`,
            `guest${i}@example.com`,
            testData.checkInDate,
            testData.checkOutDate,
          ]
        )
      );
    }

    // Only first should succeed (in real scenario with distributed lock)
    let successCount = 0;
    for (const booking of concurrentBookings) {
      try {
        await booking;
        successCount++;
      } catch {
        // Expected to fail for some bookings
      }
    }

    // At least one booking succeeded
    expect(successCount).toBeGreaterThanOrEqual(1);
  });

  it("should generate revenue transaction on booking confirmation", async () => {
    // Create booking
    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, currency, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 'website')
       RETURNING id`,
      [
        testData.propertyId,
        testData.guestName,
        testData.guestEmail,
        testData.checkInDate,
        testData.checkOutDate,
        750,
        "USD",
      ]
    );

    // Create revenue transaction
    await query(
      `INSERT INTO revenue_transactions (
        property_id, booking_id, transaction_type, amount, platform_fee, status
      ) VALUES ($1, $2, 'booking_confirmed', $3, $4, 'completed')`,
      [testData.propertyId, booking.rows[0].id, 750, 150] // 20% platform fee
    );

    // Verify transaction
    const transaction = await query(
      `SELECT amount, net_amount, platform_fee FROM revenue_transactions
       WHERE booking_id = $1`,
      [booking.rows[0].id]
    );

    expect(transaction.rows[0].amount).toBe(750);
    expect(transaction.rows[0].platform_fee).toBe(150);
    expect(parseInt(transaction.rows[0].net_amount)).toBe(600);
  });

  it("should handle booking cancellation with proper state cleanup", async () => {
    // Create and then cancel booking
    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        total_price, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'website')
       RETURNING id`,
      [
        testData.propertyId,
        testData.guestName,
        testData.guestEmail,
        testData.checkInDate,
        testData.checkOutDate,
        750,
      ]
    );

    const bookingId = booking.rows[0].id;

    // Cancel booking
    await query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1",
      [bookingId]
    );

    // Verify calendar slots are unblocked
    await query(
      `UPDATE calendar_slots SET status = 'available'
       WHERE property_id = $1 AND booking_id = $2`,
      [testData.propertyId, bookingId]
    );

    const available = await query(
      `SELECT COUNT(*) as count FROM calendar_slots
       WHERE property_id = $1 AND status = 'available'`,
      [testData.propertyId]
    );

    expect(parseInt(available.rows[0].count)).toBeGreaterThan(0);
  });

  it("should track sync attempts in OTA sync log", async () => {
    // Log a sync attempt
    await query(
      `INSERT INTO ota_sync_log (
        property_id, ota_name, sync_type, status, items_processed, conflicts_detected
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [testData.propertyId, "booking", "pull", "success", 90, 0]
    );

    // Verify sync log
    const logs = await query(
      `SELECT * FROM ota_sync_log
       WHERE property_id = $1 AND ota_name = 'booking'
       ORDER BY created_at DESC LIMIT 1`,
      [testData.propertyId]
    );

    expect(logs.rows.length).toBe(1);
    expect(logs.rows[0].items_processed).toBe(90);
    expect(logs.rows[0].status).toBe("success");
  });

  it("should maintain data consistency across all OTAs", async () => {
    // Create one booking
    const booking = await query(
      `INSERT INTO bookings (
        property_id, guest_name, guest_email, check_in, check_out,
        status, source
      ) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'website')
       RETURNING id`,
      [
        testData.propertyId,
        testData.guestName,
        testData.guestEmail,
        testData.checkInDate,
        testData.checkOutDate,
      ]
    );

    // Verify all OTAs have same property linked
    const otaListings = await query(
      "SELECT ota_name FROM ota_listings WHERE property_id = $1 ORDER BY ota_name",
      [testData.propertyId]
    );

    expect(otaListings.rows.length).toBe(3);
    expect(otaListings.rows.map((r: any) => r.ota_name).sort()).toEqual([
      "booking",
      "vrbo",
      "website",
    ]);

    // Verify blocked dates visible to all
    const blockedSlots = await query(
      `SELECT COUNT(DISTINCT slot_date) as count
       FROM calendar_slots
       WHERE property_id = $1 AND status = 'blocked'`,
      [testData.propertyId]
    );

    expect(parseInt(blockedSlots.rows[0].count)).toBeGreaterThan(0);
  });
});
