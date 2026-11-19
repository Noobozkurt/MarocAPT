import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, json, readJson, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { claimGuestPurchases } from '@/lib/auth';
import { signToken } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';
import { STORE_NAME } from '@/lib/env';
import { absoluteUrl, clientIp } from '@/lib/utils';
import { verifyTurnstile } from '@/lib/turnstile';

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  marketingConsent: z.boolean().optional(),
  claimToken: z.string().max(100).optional(),
  turnstileToken: z.string().optional(),
});

export const POST = route(async (req) => {
  const ip = clientIp(req.headers);
  await enforceRateLimit(`register:${ip}`, 5, 600);
  const input = schema.parse(await readJson(req));
  await verifyTurnstile(input.turnstileToken, ip);
  if (await db.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'An account with this email already exists');
  // A valid claim token proves control of the inbox the receipt was sent to.
  const claimOrder = input.claimToken ? await db.order.findUnique({ where: { claimToken: input.claimToken } }) : null;
  const emailProven = Boolean(claimOrder && claimOrder.email === input.email);
  const user = await db.user.create({
    data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12), marketingConsent: Boolean(input.marketingConsent), emailVerified: emailProven ? new Date() : null, referredById: await referrer(req) },
  });
  if (emailProven) {
    await claimGuestPurchases(user.id, user.email);
    await db.order.update({ where: { id: claimOrder!.id }, data: { claimToken: null } });
  } else {
    const token = signToken({ uid: user.id, email: user.email }, 48 * 3600, 'verify-email');
    await sendEmail({ to: user.email, template: 'verify-email', subject: `Verify your ${STORE_NAME} email`, text: `Welcome to ${STORE_NAME}, ${input.name}!\n\nConfirm your email address:\n${absoluteUrl(`/verify-email?token=${token}`)}` });
  }
  await sendEmail({ to: user.email, template: 'welcome', subject: `Welcome to ${STORE_NAME}`, text: `Hi ${input.name}, your account is ready. Browse new releases: ${absoluteUrl('/catalog')}` });
  return json({ ok: true, verified: emailProven }, { status: 201 });
});

async function referrer(req: Request) {
  const code = /(?:^|;\s*)s3d_ref=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
  if (!code) return null;
  return (await db.user.findUnique({ where: { referralCode: decodeURIComponent(code) }, select: { id: true } }))?.id ?? null;
}
