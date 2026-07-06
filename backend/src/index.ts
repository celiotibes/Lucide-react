import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import { connectRedis, client as redisClient } from "./redis.js";
import { query, closePool } from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import authRoutes from "./routes/auth.js";
import aiRoutes from "./routes/ai.js";
import crypto from "crypto";

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT || "3000");

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(cors());
app.use(rateLimitMiddleware);

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.use("/auth", authRoutes);

// AI routes (protected)
app.use("/api/ai", aiRoutes);

// Protected API routes
app.get("/api/properties", authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM properties WHERE user_id = $1",
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

// Webhook endpoints
app.post(
  "/webhooks/booking-com",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-booking-signature"] as string;
      const rawBody = req.body.toString("utf-8");

      if (!verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const payload = JSON.parse(rawBody);
      await syncQueue.add(
        "booking-webhook",
        { payload },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.post(
  "/webhooks/vrbo",
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-vrbo-signature"] as string;
      const rawBody = JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const payload = req.body;
      await syncQueue.add(
        "vrbo-webhook",
        { payload },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
      );

      res.json({ success: true });
    } catch (error) {
      console.error("VRBO webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

// Initialize Bull queue
const syncQueue = new Queue("calendar-sync", {
  connection: redisClient,
});

// Queue worker for sync jobs
const syncWorker = new Worker(
  "calendar-sync",
  async (job) => {
    console.log(`Processing job ${job.name}:`, job.data);

    if (job.name === "booking-webhook") {
      const { payload } = job.data;
      console.log("[Webhook] Booking.com event received:", payload.event);

      if (payload.event === "booking_confirmed") {
        // Handle booking confirmed event
        const { property_id, booking_id, check_in, check_out } = payload;

        for (let d = new Date(check_in); d < new Date(check_out); d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          await query(
            `INSERT INTO calendar_slots (property_id, slot_date, status, booking_id, source)
             VALUES ($1, $2, 'blocked', $3, 'booking')
             ON CONFLICT (property_id, slot_date) DO UPDATE SET status = 'blocked'`,
            [property_id, dateStr, booking_id]
          );
        }
      }
    } else if (job.name === "vrbo-webhook") {
      const { payload } = job.data;
      console.log("[Webhook] VRBO event received:", payload.eventType);

      if (payload.eventType === "booking_confirmed") {
        // Handle VRBO booking confirmed
        const { propertyId, bookingId, checkIn, checkOut } = payload;

        for (let d = new Date(checkIn); d < new Date(checkOut); d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          await query(
            `INSERT INTO calendar_slots (property_id, slot_date, status, booking_id, source)
             VALUES ($1, $2, 'blocked', $3, 'vrbo')
             ON CONFLICT (property_id, slot_date) DO UPDATE SET status = 'blocked'`,
            [propertyId, dateStr, bookingId]
          );
        }
      }
    }

    return { processed: true };
  },
  { connection: redisClient }
);

syncWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.BOOKING_WEBHOOK_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Error handling middleware
app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("Error:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await syncQueue.close();
  await syncWorker.close();
  await closePool();
  process.exit(0);
});

// Start server
async function start(): Promise<void> {
  try {
    await connectRedis();
    console.log("✓ Connected to Redis");

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
