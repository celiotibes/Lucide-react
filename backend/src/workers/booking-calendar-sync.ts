import { createBookingClient } from "../services/booking-xmlrpc.js";
import { query } from "../db.js";
import crypto from "crypto";
import Logger from "../logger.js";

interface SyncResult {
  propertyId: string;
  totalDays: number;
  blockedDays: number;
  bookedDays: number;
  availableDays: number;
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

async function syncPropertyCalendar(
  propertyId: string,
  externalPropertyId: string,
  startDate: string,
  endDate: string
): Promise<SyncResult> {
  const client = createBookingClient();
  const result: SyncResult = {
    propertyId,
    totalDays: 0,
    blockedDays: 0,
    bookedDays: 0,
    availableDays: 0,
    conflicts: 0,
  };

  try {
    Logger.info("Syncing calendar for property", {
      context: "BookingCalendarSync",
      propertyId,
      externalPropertyId,
    });

    const availability = await client.getAvailability(
      parseInt(externalPropertyId),
      startDate,
      endDate
    );

    result.totalDays = availability.length;

    for (const slot of availability) {
      const syncHash = await generateSyncHash(propertyId, slot.date, slot.status);

      if (slot.status === "blocked") {
        result.blockedDays++;
      } else if (slot.status === "booked") {
        result.bookedDays++;
      } else {
        result.availableDays++;
      }

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
         VALUES ($1, $2, $3, 'booking', $4)
         ON CONFLICT (property_id, slot_date) DO UPDATE SET
         status = $3, source = 'booking', sync_hash = $4, updated_at = NOW()`,
        [propertyId, slot.date, slot.status, syncHash]
      );
    }

    // Log sync success
    await query(
      `INSERT INTO ota_sync_log (property_id, ota_name, sync_type, status, items_processed, conflicts_detected)
       VALUES ($1, 'booking', 'pull', 'success', $2, $3)`,
      [propertyId, result.totalDays, result.conflicts]
    );

    Logger.info("Successfully synced calendar days", {
      context: "BookingCalendarSync",
      propertyId,
      totalDays: result.totalDays,
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);

    await query(
      `INSERT INTO ota_sync_log (property_id, ota_name, sync_type, status, error_message)
       VALUES ($1, 'booking', 'pull', 'failed', $2)`,
      [propertyId, result.error]
    );

    console.error(`✗ Failed to sync property ${propertyId}:`, result.error);
  }

  return result;
}

async function syncAllProperties(): Promise<void> {
  Logger.info("Starting calendar sync for all properties", {
    context: "BookingCalendarSync",
  });

  // Get all properties with Booking.com enabled
  const result = await query(`
    SELECT p.id, ol.external_property_id
    FROM properties p
    INNER JOIN ota_listings ol ON ol.property_id = p.id
    WHERE ol.ota_name = 'booking' AND ol.sync_enabled = true
  `);

  const properties = result.rows;

  if (properties.length === 0) {
    Logger.info("No properties to sync", { context: "BookingCalendarSync" });
    return;
  }

  const today = new Date();
  const startDate = today.toISOString().split("T")[0];
  const endDate = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const syncResults: SyncResult[] = [];

  for (const prop of properties) {
    const syncResult = await syncPropertyCalendar(
      prop.id,
      prop.external_property_id,
      startDate,
      endDate
    );
    syncResults.push(syncResult);

    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  const summary = {
    totalProperties: syncResults.length,
    successCount: syncResults.filter((r) => !r.error).length,
    failureCount: syncResults.filter((r) => r.error).length,
    totalDaysSynced: syncResults.reduce((sum, r) => sum + r.totalDays, 0),
    totalConflicts: syncResults.reduce((sum, r) => sum + r.conflicts, 0),
  };

  Logger.info("Calendar sync completed", {
    context: "BookingCalendarSync",
    data: summary,
  });
}

syncAllProperties().catch((error) => {
  Logger.error("Fatal error in calendar sync", error, {
    context: "BookingCalendarSync",
  });
  process.exit(1);
});
