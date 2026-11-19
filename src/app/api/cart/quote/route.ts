import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { LICENSE_TIERS } from '@/lib/licenses';
import { CURRENCIES } from '@/lib/money';
import { getSessionUser } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/utils';
import { quoteCart } from '@/server/cart';
import { resolveVat } from '@/server/checkout';

const schema = z.object({
  lines: z.array(z.object({ productId: z.string().max(40), tier: z.enum(LICENSE_TIERS), seats: z.number().int().optional(), upgradeFromLicenseId: z.string().max(40).nullable().optional() })).max(50),
  currency: z.enum(CURRENCIES),
  country: z.string().length(2).toUpperCase(),
  region: z.string().max(3).nullable().optional(),
  vatId: z.string().max(20).nullable().optional(),
  couponCode: z.string().max(40).nullable().optional(),
  useStoreCredit: z.boolean().optional(),
  email: z.string().max(200).optional(),
});

// Read-only pricing preview; no CSRF risk, but rate limited (it can hit VIES).
export const POST = route(async (req) => {
  await enforceRateLimit(`quote:${clientIp(req.headers)}`, 120, 60);
  const input = schema.parse(await readJson(req));
  const user = await getSessionUser();
  const vat = input.vatId ? await resolveVat(input.vatId, input.country) : null;
  const quote = await quoteCart({ ...input, vatIdValid: Boolean(vat?.valid), userId: user?.id ?? null, email: input.email || user?.email || null });
  return json({ ...quote, vat: vat ? { valid: vat.valid, error: 'error' in vat ? vat.error : undefined, name: 'name' in vat ? vat.name : undefined } : null });
}, { csrf: false });
