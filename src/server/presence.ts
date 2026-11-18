// Who is connected right now. Redis-backed (works across instances) with an in-memory fallback.
import { getRedis } from '@/lib/redis';

// Shared via globalThis: the custom server and Next route bundles are separate module graphs in one process.
const local: Map<string, Set<string>> = ((globalThis as any).__presence ??= new Map());
const TTL = 90;

export async function markOnline(userId: string, socketId: string) {
  const r = getRedis();
  if (r) {
    await r.multi().sadd(`presence:${userId}`, socketId).expire(`presence:${userId}`, TTL).exec();
    return;
  }
  if (!local.has(userId)) local.set(userId, new Set());
  local.get(userId)!.add(socketId);
}

export async function heartbeat(userId: string) {
  const r = getRedis();
  if (r) await r.expire(`presence:${userId}`, TTL);
}

export async function markOffline(userId: string, socketId: string): Promise<boolean> {
  const r = getRedis();
  if (r) {
    await r.srem(`presence:${userId}`, socketId);
    return (await r.scard(`presence:${userId}`)) === 0;
  }
  const set = local.get(userId);
  set?.delete(socketId);
  if (set && set.size === 0) local.delete(userId);
  return !local.has(userId);
}

export async function isOnline(key: string): Promise<boolean> {
  const r = getRedis();
  if (r) return (await r.scard(`presence:${key}`)) > 0;
  return (local.get(key)?.size ?? 0) > 0;
}

export async function onlineAmong(keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(keys.map(async (k) => (await isOnline(k)) && out.add(k)));
  return out;
}
