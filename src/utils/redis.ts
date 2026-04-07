// redis.ts
import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number.isFinite(Number(process.env.REDIS_PORT))
    ? Number(process.env.REDIS_PORT)
    : 6379,
});
