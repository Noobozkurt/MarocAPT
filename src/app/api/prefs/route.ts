import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { CURRENCIES } from '@/lib/money';
import { getSessionUser } from '@/lib/session';
import { COUNTRY_COOKIE, CURRENCY_COOKIE, LOCALE_COOKIE } from '@/server/context';

export const POST = route(async (req) => {
  const p = z.object({ currency: z.enum(CURRENCIES).optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(), locale: z.enum(['en', 'fr']).optional() }).parse(await readJson(req));
  const c = await cookies();
  const opts = { path: '/', maxAge: 365 * 86400, sameSite: 'lax' as const, httpOnly: false, secure: process.env.NODE_ENV === 'production' };
  if (p.currency) c.set(CURRENCY_COOKIE, p.currency, opts);
  if (p.country) c.set(COUNTRY_COOKIE, p.country, opts);
  if (p.locale) c.set(LOCALE_COOKIE, p.locale, opts);
  const user = await getSessionUser();
  if (user && !user.impersonatorId && (p.currency || p.locale)) await db.user.update({ where: { id: user.id }, data: { currency: p.currency, locale: p.locale } });
  return json({ ok: true });
});
