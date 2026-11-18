import { cookies } from 'next/headers';
import { json, readJson, route } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/utils';
import { verifyTurnstile } from '@/lib/turnstile';
import { checkoutSchema, createCheckout } from '@/server/checkout';

export const POST = route(async (req) => {
  const ip = clientIp(req.headers);
  await enforceRateLimit(`checkout:${ip}`, 10, 60);
  const body = await readJson<Record<string, unknown>>(req);
  await verifyTurnstile(body.turnstileToken as string | undefined, ip);
  const input = checkoutSchema.parse(body);
  const user = await getSessionUser();
  if (user?.impersonatorId) throw new Error('Read-only while impersonating');
  const ref = (await cookies()).get('s3d_ref')?.value ?? null;
  const result = await createCheckout(input, { userId: user?.id ?? null, ip, userAgent: req.headers.get('user-agent'), referrerCode: ref });
  return json({ orderId: result.orderId, redirectUrl: result.redirectUrl, total: result.quote.total });
});
