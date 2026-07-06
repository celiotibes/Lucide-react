import { createVrboClient } from "../services/vrbo-api.js";
import { query } from "../db.js";
import crypto from "crypto";

interface SyncResult {
  propertyId: string;
  externalPropertyId: string;
  availabilitySynced: number;
  bookingsSynced: number;
  conflicts: number;
  error?: string;
}

async function generateSyncHash(
  propertyId: string,
  date: string,
  status: string
): Promise<string> {
  const data = `${propertyId}:${date}:${status}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function syncPropertyAvailability(
  propertyId: string,
  externalPropertyId: string,
  startDate: string,
  endDate: string
): Promise<SyncResult> {
  const client = createVrboClient();
  const result: SyncResult = {
    propertyId,
    externalPropertyId,
    availabilitySynced: 0,
    bookingsSynced: 0,
    conflicts: 0,
  };

  try {
    console.log(
      `[VRBO] Syncing availability for property ${externalPropertyId}...`
    );

    const availability = await client.getAvailability(
      externalPropertyId,
      startDate,
      endDate
    );

    for (const slot of availability) {
      const syncHash = await generateSyncHash(
        propertyId,
        slot.date,
        slot.status
      );

      // Check if sync already processed (idempotency)
      const existing = await query(
        `SELECT sync_hash FROM calendar_slots
         WHERE property_id = $1 AND slot_date = $2`,
        [propertyId, slot.date]
      );

      if (existing.rows.length > 0 && existing.rows[0].sync_hash === syncHash) {
        continue;
      }

      // Upsert calendar slot
      await query(
        `INSERT INTO calendar_slots (property_id, slot_date, status, source, sync_hash)
         VALUES ($1, $2, $3, 'vrbo', $4)
         ON CONFLICT (property_id, slot_date) DO UPDATE SET
         status = $3, source = 'vrbo', sync_hash = $4, updated_at = NOW()`,
        [propertyId, slot.date, slot.status, syncHash]
      );

      result.availabilitySynced++;
    }

    // Sync bookings
    console.log(
      `[VRBO] Syncing bookings for property ${externalPropertyId}...`
    );

    const bookings = await client.getBookings(
      externalPropertyId,
      startDate,
      endDate
    );

    for (const booking of bookings) {
      // Check for existing booking
      const existing = await query(
        `SELECT id FROM bookings
         WHERE ota_listing_id IN (
           SELECT id FROM ota_listings WHERE external_property_id = $1
         ) AND external_booking_id = $2`,
        [externalPropertyId, booking.bookingId]
      );

      if (existing.rows.length > 0) {
        continue;
      }

      // Get OTA listing
      const otaListing = await query(
        `SELECT id FROM ota_listings
         WHERE property_id = $1 AND ota_name = 'vrbo'`,
        [propertyId]
      );

      if (otaListing.rows.length === 0) {
        console.warn(
          `[VRBO] No VRBO listing found for property ${propertyId}`
        );
        continue;
      }

      // Insert booking
      await query(
        `INSERT INTO bookings (
          property_id, ota_listing_id, external_booking_id,
          guest_name, guest_email, check_in, check_out,
          total_price, currency, status, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'vrbo')`,
        [
          propertyId,
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

      result.bookingsSynced++;
    }

    // Log sync success
    await query(
      `INSERT INTO ota_sync_log (property_id, ota_name, sync_type, status, items_processed, conflicts_detected)
       VALUES ($1, 'vrbo', 'pull', 'success', $2, $3)`,
      [propertyId, result.availabilitySynced + result.bookingsSynced, result.conflicts]
    );

    console.log(
      `✓ Successfully synced ${result.availabilitySynced} availability and ${result.bookingsSynced} bookings for ${propertyId}`
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);

    await query(
      `INSERT INTO ota_sync_log (property_id, ota_name, sync_type, status, error_message)
       VALUES ($1, 'vrbo', 'pull', 'failed', $2)`,
      [propertyId, result.error]
    );

    console.error(`✗ Failed to sync property ${propertyId}:`, result.error);
  }

  return result;
}

async function pushPropertyAvailability(
  propertyId: string,
  externalPropertyId: string
): Promise<boolean> {
  const client = createVrboClient();

  try {
    console.log(
      `[VRBO] Pushing availability for property ${externalPropertyId}...`
    );

    // Get current calendar slots for this property
    const slots = await query(
      `SELECT slot_date, status FROM calendar_slots
       WHERE property_id = $1 AND status IN ('available', 'blocked')
       ORDER BY slot_date`,
      [propertyId]
    );

    if (slots.rows.length === 0) {
      return true;
    }

    // Group by status for update
    const updates = slots.rows.map((slot: any) => ({
      date: slot.slot_date,
      status: slot.status,
    }));

    await client.updateAvailability(externalPropertyId, updates);

    console.log(
      `✓ Successfully pushed ${updates.length} availability slots for ${propertyId}`
    );

    return true;
  } catch (error) {
    console.error(`✗ Failed to push availability for ${propertyId}:`, error);
    return false;
  }
}

async function syncAllProperties(): Promise<void> {
  console.log("[VRBO] Starting calendar sync for all properties...");

  const result = await query(`
    SELECT p.id, ol.external_property_id
    FROM properties p
    INNER JOIN ota_listings ol ON ol.property_id = p.id
    WHERE ol.ota_name = 'vrbo' AND ol.sync_enabled = true
  `);

  const properties = result.rows;

  if (properties.length === 0) {
    console.log("[VRBO] No properties to sync");
    return;
  }

  const today = new Date();
  const startDate = today.toISOString().split("T")[0];
  const endDate = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const syncResults: SyncResult[] = [];

  for (const prop of properties) {
    // Pull from VRBO
    const syncResult = await syncPropertyAvailability(
      prop.id,
      prop.external_property_id,
      startDate,
      endDate
    );
    syncResults.push(syncResult);

    // Push to VRBO
    await pushPropertyAvailability(prop.id, prop.external_property_id);

    // Rate limit: 10 req/sec = 100ms per request
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const summary = {
    totalProperties: syncResults.length,
    successCount: syncResults.filter((r) => !r.error).length,
    failureCount: syncResults.filter((r) => r.error).length,
    totalAvailabilitySynced: syncResults.reduce((sum, r) => sum + r.availabilitySynced, 0),
    totalBookingsSynced: syncResults.reduce((sum, r) => sum + r.bookingsSynced, 0),
  };

  console.log("[VRBO] Sync Summary:", summary);
}

syncAllProperties().catch((error) => {
  console.error("[VRBO] Fatal error:", error);
  process.exit(1);
});
