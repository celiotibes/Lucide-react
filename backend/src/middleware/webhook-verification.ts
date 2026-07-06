import { Request, Response, NextFunction } from "express";
import { verifyWebhookSignature } from "../auth/crypto";

export interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

export function webhookVerification(otaName: "booking" | "vrbo") {
  return (req: WebhookRequest, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers[
        otaName === "booking" ? "x-booking-signature" : "x-vrbo-signature"
      ] as string;

      if (!signature) {
        return res.status(401).json({ error: "Missing signature header" });
      }

      // Get the raw body
      const rawBody = req.rawBody?.toString("utf-8") || "";

      // Get the appropriate webhook secret
      const secret =
        otaName === "booking"
          ? process.env.BOOKING_WEBHOOK_SECRET
          : process.env.VRBO_WEBHOOK_SECRET;

      if (!secret) {
        console.error(`${otaName} webhook secret not configured`);
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      // Verify the signature
      const isValid = verifyWebhookSignature(rawBody, signature, secret);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      next();
    } catch (error) {
      console.error(
        `${otaName} webhook verification error:`,
        error instanceof Error ? error.message : error
      );
      res.status(500).json({ error: "Webhook verification failed" });
    }
  };
}
