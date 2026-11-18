import { cookies, headers } from 'next/headers';
import { CURRENCIES, currencyForCountry, isCurrency, type Currency } from '@/lib/money';
import { decideTax, type TaxDecision } from '@/lib/tax';
import { env } from '@/lib/env';

export const CURRENCY_COOKIE = 's3d_currency';
export const COUNTRY_COOKIE = 's3d_country';
export const LOCALE_COOKIE = 's3d_locale';

export interface StoreContext {
  currency: Currency;
  country: string;
  locale: string;
  tax: TaxDecision;
}

/** Currency/country/locale for the current visitor: explicit cookie → geo header → default. */
export async function getStoreContext(): Promise<StoreContext> {
  const c = await cookies();
  const h = await headers();
  const geo = (h.get('x-vercel-ip-country') || h.get('cf-ipcountry') || '').toUpperCase();
  const country = (c.get(COUNTRY_COOKIE)?.value || geo || 'US').toUpperCase().slice(0, 2);
  const cur = c.get(CURRENCY_COOKIE)?.value;
  const currency: Currency = isCurrency(cur) ? cur : currencyForCountry(country);
  const locale = c.get(LOCALE_COOKIE)?.value === 'fr' ? 'fr' : 'en';
  return { currency, country, locale, tax: decideTax({ sellerCountry: env().SELLER_COUNTRY, country }) };
}

export { CURRENCIES };
