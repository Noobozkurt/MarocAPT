import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sha256, signToken } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';
import { absoluteUrl, clientIp } from '@/lib/utils';

export const POST = route(async (req) => {
  await enforceRateLimit(`forgot:${clientIp(req.headers)}`, 5, 900);
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(await readJson(req));
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === 'ACTIVE') {
    // Fingerprint of the current hash makes the link single-use: it dies once the password changes.
    const token = signToken({ uid: user.id, fp: sha256(user.passwordHash ?? 'none').slice(0, 16) }, 3600, 'pw-reset');
    await sendEmail({ to: user.email, template: 'password-reset', subject: 'Reset your password', text: `Reset your password (valid for 1 hour):\n${absoluteUrl(`/reset-password?token=${token}`)}\n\nIf you didn't ask for this, ignore this email.` });
  }
  return json({ ok: true }); // same response either way (no account enumeration)
});
