import { db } from '@/lib/db';
import { emitTo } from './realtime';

export async function notify(userId: string, n: { type: string; title: string; body: string; link?: string }) {
  const row = await db.notification.create({ data: { userId, ...n } });
  emitTo(`user:${userId}`, 'notification:new', row);
  return row;
}
