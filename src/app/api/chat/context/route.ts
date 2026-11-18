import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { getSessionUser } from '@/lib/session';

/** Orders the signed-in customer can attach to a new conversation. */
export const GET = route(async () => {
  const u = await getSessionUser();
  if (!u) return json({ orders: [] });
  const orders = await db.order.findMany({ where: { userId: u.id, status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, createdAt: true, items: { select: { title: true } } } });
  return json({ orders: orders.map((o) => ({ id: o.id, label: `${o.invoiceNumber ?? o.id.slice(-6)} — ${o.items.map((i) => i.title).join(', ').slice(0, 60)}` })) });
});
