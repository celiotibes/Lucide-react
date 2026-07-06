import { Request, Response, NextFunction } from "express";
import { client as redisClient } from "../redis.js";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const config: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
};

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip || "unknown";
  const key = `rate-limit:${ip}`;

  try {
    const current = await redisClient.incr(key);

    if (current === 1) {
      await redisClient.expire(key, Math.ceil(config.windowMs / 1000));
    }

    res.set("X-RateLimit-Limit", String(config.maxRequests));
    res.set("X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - current)));

    if (current > config.maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  } catch (error) {
    console.error("Rate limit error:", error);
    next();
  }
}
