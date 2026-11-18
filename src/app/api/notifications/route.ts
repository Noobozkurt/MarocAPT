import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireUser, requireUserForWrite } from '@/lib/session';

export const GET = route(async () => {
  const u = await requireUser();
  return json({ items: await db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 30 }) });
});

export const POST = route(async () => {
  const u = await requireUserForWrite();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
});
