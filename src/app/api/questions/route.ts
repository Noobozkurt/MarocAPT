import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { requireUserForWrite } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { maskProfanity, sanitizeText } from '@/lib/sanitize';

export const POST = route(async (req) => {
  const u = await requireUserForWrite();
  await enforceRateLimit(`question:${u.id}`, 10, 3600);
  const { productId, body } = z.object({ productId: z.string().max(40), body: z.string().min(5).max(500) }).parse(await readJson(req));
  await db.question.create({ data: { productId, userId: u.id, body: maskProfanity(sanitizeText(body, 500)) } });
  return json({ ok: true }, { status: 201 });
});
