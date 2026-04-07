import { Request, Response, NextFunction } from "express";
import { redis } from "../utils/redis";
import { config } from "../config/env";

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ip = req.ip ?? "unknown";
    const key = `rate_limit:${ip}`;

    const windowMs = config.rateLimitWindowMs;
    const max = config.rateLimitMax;

    // Increment count
    const current = await redis.incr(key);

    // If first request → set expiry
    if (current === 1) {
      await redis.pexpire(key, windowMs);
    }

    // Get remaining TTL
    const ttl = await redis.pttl(key);

    if (current > max) {
      const retryAfterSec = Math.ceil(ttl / 1000);

      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: `Too many requests. Try again in ${retryAfterSec} seconds.`,
        retryAfterMs: ttl,
      });
    }

    next();
  } catch (err) {
    // Fail open (important in production)
    console.error("Rate limiter error:", err);
    next();
  }
}
