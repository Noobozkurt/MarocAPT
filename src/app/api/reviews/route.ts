import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, json, readJson, route } from '@/lib/api';
import { requireUserForWrite } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { detectSpam, maskProfanity, sanitizeText } from '@/lib/sanitize';

export const POST = route(async (req) => {
  const u = await requireUserForWrite();
  await enforceRateLimit(`review:${u.id}`, 5, 3600);
  const input = z.object({ productId: z.string().max(40), rating: z.number().int().min(1).max(5), title: z.string().max(100).nullable().optional(), body: z.string().min(10).max(2000) }).parse(await readJson(req));
  const owned = await db.license.findFirst({ where: { userId: u.id, productId: input.productId, status: 'ACTIVE' } });
  if (!owned) throw new HttpError(403, 'Only verified buyers can review this asset');
  if (detectSpam(input.body).spam) throw new HttpError(422, 'Review looks like spam');
  const data = { rating: input.rating, title: input.title ? maskProfanity(sanitizeText(input.title, 100)) : null, body: maskProfanity(sanitizeText(input.body, 2000)), verified: true, status: 'PENDING' as const };
  await db.review.upsert({ where: { productId_userId: { productId: input.productId, userId: u.id } }, create: { ...data, productId: input.productId, userId: u.id }, update: data });
  return json({ ok: true, status: 'PENDING' }, { status: 201 });
});
