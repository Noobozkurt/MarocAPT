import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { signToken } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';
import { absoluteUrl, clientIp } from '@/lib/utils';

// Double opt-in: we only store consent after the confirmation link is clicked (see /api/newsletter/confirm).
export const POST = route(async (req) => {
  await enforceRateLimit(`nl:${clientIp(req.headers)}`, 5, 600);
  const { email } = z.object({ email: z.string().trim().toLowerCase().email(), consent: z.literal(true) }).parse(await readJson(req));
  const token = signToken({ email }, 7 * 86400, 'newsletter');
  await sendEmail({ to: email, template: 'newsletter-confirm', subject: 'Confirm your subscription', text: `Confirm you want new releases and sale alerts:\n${absoluteUrl(`/api/newsletter/confirm?token=${token}`)}` });
  void db;
  return json({ ok: true });
});
