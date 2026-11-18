import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { LICENSE_TIERS, normalizeSeats } from '@/lib/licenses';
import { requireUser, requireUserForWrite } from '@/lib/session';
import { enqueue } from '@/server/jobs';

export const GET = route(async () => {
  const u = await requireUser();
  const items = await db.cartItem.findMany({ where: { userId: u.id }, include: { product: true } });
  return json({ lines: items.map((i) => ({ productId: i.productId, tier: i.tier, seats: i.seats, title: i.product.title, slug: i.product.slug, posterPath: i.product.posterPath })) });
});

const schema = z.object({ lines: z.array(z.object({ productId: z.string().max(40), tier: z.enum(LICENSE_TIERS), seats: z.number().int().optional(), upgradeFromLicenseId: z.string().max(40).nullable().optional() })).max(50) });

export const PUT = route(async (req) => {
  const u = await requireUserForWrite();
  const { lines } = schema.parse(await readJson(req));
  const valid = await db.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } }, select: { id: true } });
  const ok = new Set(valid.map((v) => v.id));
  await db.$transaction([
    db.cartItem.deleteMany({ where: { userId: u.id } }),
    db.cartItem.createMany({ data: lines.filter((l) => ok.has(l.productId) && !l.upgradeFromLicenseId).map((l) => ({ userId: u.id, productId: l.productId, tier: l.tier, seats: normalizeSeats(l.tier, l.seats) })) }),
  ]);
  // Abandoned-cart reminder in 24 h (only sent if the user consented to marketing and still has items).
  if (lines.length) {
    await db.job.deleteMany({ where: { type: 'cart.abandoned', status: 'QUEUED', payload: { path: ['userId'], equals: u.id } } });
    await enqueue('cart.abandoned', { userId: u.id }, { runAt: new Date(Date.now() + 24 * 3600_000), maxAttempts: 1 });
  }
  return json({ ok: true });
});
