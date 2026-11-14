// Digital-goods tax engine: EU VAT (OSS + B2B reverse charge), UK VAT, US state sales tax.
// Rates are standard rates for electronically supplied services as of 2026.
// In production with Stripe you can enable STRIPE_AUTOMATIC_TAX to let Stripe Tax compute instead;
// this engine is still used for quotes, invoices and the test provider.

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;

/** Standard VAT rates in basis points (2500 = 25 %). */
export const EU_VAT_BPS: Record<string, number> = {
  AT: 2000, BE: 2100, BG: 2000, HR: 2500, CY: 1900, CZ: 2100, DK: 2500, EE: 2400, FI: 2550, FR: 2000, DE: 1900, GR: 2400, HU: 2700, IE: 2300,
  IT: 2200, LV: 2100, LT: 2100, LU: 1700, MT: 1800, NL: 2100, PL: 2300, PT: 2300, RO: 2100, SK: 2300, SI: 2200, ES: 2100, SE: 2500,
};

/** Other VAT/GST jurisdictions where the store is registered for digital sales. */
export const OTHER_VAT_BPS: Record<string, number> = { GB: 2000, NO: 2500, CH: 810, AU: 1000 };

/** US states that tax digitally delivered products (state-level base rate, bps). Others: exempt. */
export const US_DIGITAL_STATE_BPS: Record<string, number> = {
  AL: 400, AZ: 560, CO: 290, CT: 100, DC: 600, HI: 400, ID: 600, IN: 700, KY: 600, LA: 500, ME: 550, MN: 688, MS: 700, NE: 550,
  NJ: 663, NM: 488, NC: 475, OH: 575, PA: 600, SD: 420, TN: 700, TX: 625, UT: 610, VT: 600, WA: 650, WI: 500, WY: 400,
};

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export type TaxModeName = 'STANDARD' | 'REVERSE_CHARGE' | 'EXEMPT' | 'NONE';

export interface TaxInput {
  sellerCountry: string;
  country: string;
  region?: string | null;
  /** true only when the VAT ID has been validated (VIES or equivalent). */
  vatIdValid?: boolean;
}

export interface TaxDecision {
  mode: TaxModeName;
  rateBps: number;
  /** Whether storefront prices in this region are labelled tax-inclusive. */
  displayInclusive: boolean;
  label: string;
  invoiceNote?: string;
}

export function isEu(country: string): boolean {
  return (EU_COUNTRIES as readonly string[]).includes(country.toUpperCase());
}

export function decideTax(input: TaxInput): TaxDecision {
  const country = input.country.toUpperCase();
  const seller = input.sellerCountry.toUpperCase();

  if (isEu(country)) {
    const rate = EU_VAT_BPS[country] ?? 0;
    if (input.vatIdValid && country !== seller) {
      return {
        mode: 'REVERSE_CHARGE',
        rateBps: 0,
        displayInclusive: true,
        label: 'VAT reverse charge',
        invoiceNote: 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Council Directive 2006/112/EC).',
      };
    }
    return { mode: 'STANDARD', rateBps: rate, displayInclusive: true, label: `VAT ${bpsToPercent(rate)}` };
  }

  if (country in OTHER_VAT_BPS) {
    const rate = OTHER_VAT_BPS[country]!;
    if (input.vatIdValid) {
      return { mode: 'REVERSE_CHARGE', rateBps: 0, displayInclusive: true, label: 'Reverse charge', invoiceNote: 'Reverse charge: customer to account for VAT/GST.' };
    }
    return { mode: 'STANDARD', rateBps: rate, displayInclusive: true, label: `${country === 'AU' ? 'GST' : 'VAT'} ${bpsToPercent(rate)}` };
  }

  if (country === 'US') {
    const state = (input.region || '').toUpperCase();
    const rate = US_DIGITAL_STATE_BPS[state];
    if (rate) return { mode: 'STANDARD', rateBps: rate, displayInclusive: false, label: `Sales tax ${state} ${bpsToPercent(rate)}` };
    return { mode: 'EXEMPT', rateBps: 0, displayInclusive: false, label: state ? `No sales tax on digital goods in ${state}` : 'Sales tax' };
  }

  return { mode: 'NONE', rateBps: 0, displayInclusive: false, label: 'No tax collected (export)' };
}

/** Tax on a tax-exclusive (net) amount, rounded half-up to the minor unit. */
export function taxOn(netMinor: number, rateBps: number): number {
  return Math.round((netMinor * rateBps) / 10000);
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;
}

// ─── VAT ID validation ───────────────────────────────────────────────

const VAT_FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, HR: /^\d{11}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  FI: /^\d{8}$/, FR: /^[0-9A-HJ-NP-Z]{2}\d{9}$/, DE: /^\d{9}$/, EL: /^\d{9}$/, HU: /^\d{8}$/, IE: /^\d{7}[A-W][A-I]?$|^\d[A-Z+*]\d{5}[A-W]$/,
  IT: /^\d{11}$/, LV: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/,
  RO: /^\d{2,10}$/, SK: /^\d{10}$/, SI: /^\d{8}$/, ES: /^[0-9A-Z]\d{7}[0-9A-Z]$/, SE: /^\d{12}$/, XI: /^(\d{9}|\d{12})$/, GB: /^(\d{9}|\d{12})$/,
};

export interface VatIdParts {
  prefix: string; // VIES prefix (EL for Greece)
  number: string;
}

export function normalizeVatId(raw: string, country?: string): VatIdParts | null {
  const v = raw.toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([A-Z]{2})([0-9A-Z+*]+)$/.exec(v);
  let prefix: string;
  let number: string;
  if (m) {
    prefix = m[1]!;
    number = m[2]!;
  } else if (country) {
    prefix = country.toUpperCase() === 'GR' ? 'EL' : country.toUpperCase();
    number = v;
  } else return null;
  const format = VAT_FORMATS[prefix];
  if (!format || !format.test(number)) return null;
  return { prefix, number };
}

export function vatPrefixToCountry(prefix: string): string {
  return prefix === 'EL' ? 'GR' : prefix === 'XI' ? 'GB' : prefix;
}

export interface VatValidationResult {
  valid: boolean;
  formatValid: boolean;
  name?: string;
  address?: string;
  source: 'vies' | 'mock' | 'format';
  error?: string;
}

const viesCache = new Map<string, { at: number; result: VatValidationResult }>();

export async function validateVatId(raw: string, country: string, mode: 'live' | 'mock' = 'live'): Promise<VatValidationResult> {
  const parts = normalizeVatId(raw, country);
  if (!parts) return { valid: false, formatValid: false, source: 'format', error: 'Invalid VAT ID format' };
  if (vatPrefixToCountry(parts.prefix) !== country.toUpperCase()) {
    return { valid: false, formatValid: true, source: 'format', error: 'VAT ID country does not match billing country' };
  }
  if (mode === 'mock') {
    // Deterministic offline behaviour for tests/dev: format-valid IDs are valid unless they contain 000000.
    const valid = !parts.number.includes('000000');
    return { valid, formatValid: true, source: 'mock', name: valid ? 'Mock Company Ltd' : undefined, error: valid ? undefined : 'Not registered (mock)' };
  }
  if (parts.prefix === 'GB') {
    // UK numbers are checked by HMRC, not VIES. Treat as format-validated only.
    return { valid: false, formatValid: true, source: 'format', error: 'UK VAT numbers require HMRC validation' };
  }
  const cacheKey = parts.prefix + parts.number;
  const hit = viesCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.result;
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${parts.prefix}/vat/${parts.number}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`VIES HTTP ${res.status}`);
    const data = (await res.json()) as { isValid?: boolean; name?: string; address?: string; userError?: string };
    const result: VatValidationResult = {
      valid: Boolean(data.isValid),
      formatValid: true,
      source: 'vies',
      name: data.name && data.name !== '---' ? data.name : undefined,
      address: data.address && data.address !== '---' ? data.address : undefined,
      error: data.isValid ? undefined : data.userError || 'Not registered in VIES',
    };
    viesCache.set(cacheKey, { at: Date.now(), result });
    return result;
  } catch (err) {
    // VIES is frequently unavailable. We must not apply reverse charge without validation → charge VAT.
    return { valid: false, formatValid: true, source: 'vies', error: `VIES unavailable (${(err as Error).message}); VAT will be charged` };
  }
}
