export const CURRENCIES = ['USD', 'EUR', 'GBP', 'SEK'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

/** Minor units → localized string, e.g. 1999 → "$19.99". */
export function formatMoney(minor: number, currency: string, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

/** Static FX used only to derive default per-currency prices when admins don't set one. */
export const FX_FROM_USD: Record<Currency, number> = { USD: 1, EUR: 0.92, GBP: 0.79, SEK: 10.4 };

/** Convert a USD price to a "psychological" price in another currency (x.99 / x9 kr). */
export function deriveLocalPrice(usdMinor: number, currency: Currency): number {
  if (usdMinor === 0) return 0;
  const raw = (usdMinor / 100) * FX_FROM_USD[currency];
  if (currency === 'SEK') return Math.max(9, Math.round(raw / 10) * 10 - 1) * 100;
  return Math.max(1, Math.round(raw)) * 100 - 1;
}

export function currencyForCountry(country: string): Currency {
  const c = country.toUpperCase();
  if (c === 'GB') return 'GBP';
  if (c === 'SE') return 'SEK';
  if (EU_EUR.has(c)) return 'EUR';
  return 'USD';
}

const EU_EUR = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES']);
