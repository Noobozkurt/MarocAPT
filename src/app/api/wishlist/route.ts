import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, json, readJson, route } from '@/lib/api';
import { requireUserForWrite } from '@/lib/session';

const schema = z.object({ productId: z.string().max(40) });

export const POST = route(async (req) => {
  const u = await requireUserForWrite();
  const { productId } = schema.parse(await readJson(req));
  const price = await db.productPrice.findFirst({ where: { productId, tier: 'PERSONAL', currency: u.currency } });
  if (!price) throw new HttpError(404, 'Product not found');
  await db.wishlistItem.upsert({ where: { userId_productId: { userId: u.id, productId } }, create: { userId: u.id, productId, priceAtAdd: price.amount, currency: price.currency }, update: {} });
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUserForWrite();
  const { productId } = schema.parse(await readJson(req));
  await db.wishlistItem.deleteMany({ where: { userId: u.id, productId } });
  return json({ ok: true });
});
