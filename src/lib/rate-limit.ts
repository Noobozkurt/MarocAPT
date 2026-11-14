import { getRedis } from './redis';

const memory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Fixed-window limiter. Redis when available (shared across instances), memory otherwise. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  if (redis) {
    try {
      const [[, count]] = (await redis.multi().incr(bucket).expire(bucket, windowSeconds + 1).exec()) as [[unknown, number]];
      const ttl = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: ttl };
    } catch {
      // fall through to memory if Redis is down
    }
  }
  const now = Date.now();
  const entry = memory.get(bucket);
  if (!entry || entry.resetAt < now) {
    memory.set(bucket, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
    return { ok: true, remaining: limit - 1, retryAfterSeconds: windowSeconds };
  }
  entry.count++;
  return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}

export class RateLimitError extends Error {
  status = 429;
  constructor(public retryAfterSeconds: number) {
    super('Too many requests. Please slow down.');
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new RateLimitError(r.retryAfterSeconds);
  return r;
}
