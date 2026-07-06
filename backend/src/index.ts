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
import pricingRoutes from "./routes/pricing.js";
import { verifyWebhookSignature } from "./auth/crypto.js";
import Logger from "./logger.js";

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT || "3000");

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalJson = res.json;

  res.json = function (data: any) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    Logger.info("HTTP", `${req.method} ${req.path}`, {
      status,
      duration: `${duration}ms`,
      method: req.method,
      path: req.path,
    });
    return originalJson.call(this, data);
  };

  next();
});

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

// Pricing routes (protected)
app.use("/api", pricingRoutes);

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
      const secret = process.env.BOOKING_WEBHOOK_SECRET;

      if (!secret) {
        Logger.error("Webhook", "BOOKING_WEBHOOK_SECRET environment variable not set");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      if (!signature) {
        return res.status(401).json({ error: "Missing signature header" });
      }

      if (!verifyWebhookSignature(rawBody, signature, secret)) {
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
      Logger.error("Webhook", "Booking.com webhook processing failed", error as Error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.post(
  "/webhooks/vrbo",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-vrbo-signature"] as string;
      const rawBody = req.body.toString("utf-8");
      const secret = process.env.VRBO_WEBHOOK_SECRET;

      if (!secret) {
        Logger.error("Webhook", "VRBO_WEBHOOK_SECRET environment variable not set");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      if (!signature) {
        return res.status(401).json({ error: "Missing signature header" });
      }

      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const payload = JSON.parse(rawBody);
      await syncQueue.add(
        "vrbo-webhook",
        { payload },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
      );

      res.json({ success: true });
    } catch (error) {
      Logger.error("Webhook", "VRBO webhook processing failed", error as Error);
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
    Logger.info("Queue", `Processing job ${job.name}`, { data: job.data });

    if (job.name === "booking-webhook") {
      const { payload } = job.data;
      Logger.info("Webhook", "Booking.com event received", { event: payload.event });

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
      Logger.info("Webhook", "VRBO event received", { eventType: payload.eventType });

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
  Logger.info("Queue", `Job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  Logger.error("Queue", `Job ${job?.id} failed`, err.message);
});

// Error handling middleware
app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    Logger.error("Error", "Unhandled error in request", error);
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
);

// Graceful shutdown
process.on("SIGINT", async () => {
  Logger.info("Server", "Shutting down gracefully...");
  await syncQueue.close();
  await syncWorker.close();
  await closePool();
  process.exit(0);
});

// Start server
async function start(): Promise<void> {
  try {
    await connectRedis();
    Logger.info("Server", "✓ Connected to Redis");

    app.listen(PORT, () => {
      Logger.info("Server", `✓ Server running on port ${PORT}`);
    });
  } catch (error) {
    Logger.error("Server", "Failed to start server", error as Error);
    process.exit(1);
  }
}

start();
