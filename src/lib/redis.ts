import Redis from 'ioredis';

const g = globalThis as unknown as { __redis?: Redis | null };

/** Shared Redis client, or null when REDIS_URL is not configured (in-memory fallbacks are used). */
export function getRedis(): Redis | null {
  if (g.__redis !== undefined) return g.__redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    g.__redis = null;
    return null;
  }
  const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true, lazyConnect: false });
  client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') console.error('[redis]', err.message);
  });
  g.__redis = client;
  return client;
}

export function createRedisConnection(): Redis | null {
  const url = process.env.REDIS_URL;
  return url ? new Redis(url, { maxRetriesPerRequest: null }) : null;
}
