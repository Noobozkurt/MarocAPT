// Pure cart pricing. No I/O — callers load prices/coupons/bundles and pass them in.
import { taxOn } from './tax';
import type { Tier } from './licenses';

export interface PriceLineInput {
  productId: string;
  title: string;
  categoryId: string;
  tier: Tier;
  seats: number;
  /** Net unit price (per seat) in minor units of the cart currency. */
  unitAmount: number;
  upgradeFromLicenseId?: string | null;
}

export interface CouponInput {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number; // percent (0-100) or minor units
  productIds: string[];
  categoryIds: string[];
  minSubtotal?: number | null;
}

export interface BundleInput {
  id: string;
  title: string;
  slug: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  productIds: string[];
}

export interface PricingOptions {
  currency: string;
  taxRateBps: number;
  salePercentOff?: number;
  coupon?: CouponInput | null;
  bundles?: BundleInput[];
  /** Automatic tiered discount: [minPaidItems, percentOff] — best matching tier wins. */
  volumeTiers?: Array<[number, number]>;
  storeCreditAvailable?: number;
}

export interface PricedLine extends PriceLineInput {
  baseAmount: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  discounts: Array<{ kind: 'sale' | 'bundle' | 'volume' | 'coupon'; label: string; amount: number }>;
}

export interface BundleHint {
  bundleId: string;
  title: string;
  slug: string;
  have: number;
  of: number;
  missingProductIds: string[];
  discountLabel: string;
}

export interface PricingResult {
  currency: string;
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  creditApplied: number;
  total: number;
  appliedDiscounts: Array<{ kind: string; label: string; amount: number }>;
  bundleHints: BundleHint[];
  couponError?: string;
}

export const DEFAULT_VOLUME_TIERS: Array<[number, number]> = [
  [3, 5],
  [5, 10],
];

function pct(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}

/** Split `amount` across `weights` proportionally, assigning rounding remainder to the largest weights. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amount <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const floored = raw.map(Math.floor);
  let rest = amount - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floored[i]! += 1;
    rest--;
  }
  return floored;
}

export function priceCart(inputs: PriceLineInput[], opts: PricingOptions): PricingResult {
  const lines: PricedLine[] = inputs.map((l) => {
    const baseAmount = l.unitAmount * l.seats;
    return { ...l, baseAmount, discountAmount: 0, netAmount: baseAmount, taxAmount: 0, totalAmount: baseAmount, discounts: [] };
  });
  const remaining = (l: PricedLine) => l.baseAmount - l.discountAmount;
  const applyTo = (l: PricedLine, kind: PricedLine['discounts'][number]['kind'], label: string, amount: number) => {
    const a = Math.min(Math.max(0, amount), remaining(l));
    if (a <= 0) return;
    l.discountAmount += a;
    l.discounts.push({ kind, label, amount: a });
  };

  // 1. Site-wide sale (never on upgrades — they are already a difference price).
  if (opts.salePercentOff && opts.salePercentOff > 0) {
    for (const l of lines) if (!l.upgradeFromLicenseId) applyTo(l, 'sale', `Sale −${opts.salePercentOff}%`, pct(remaining(l), opts.salePercentOff));
  }

  // 2. Bundles: best savings first, each product used by at most one bundle.
  const bundleHints: BundleHint[] = [];
  const inCart = new Set(lines.filter((l) => !l.upgradeFromLicenseId).map((l) => l.productId));
  const bundled = new Set<string>();
  const candidates = (opts.bundles ?? [])
    .map((b) => {
      const complete = b.productIds.length > 1 && b.productIds.every((p) => inCart.has(p));
      const members = lines.filter((l) => b.productIds.includes(l.productId) && !l.upgradeFromLicenseId);
      const base = members.reduce((a, l) => a + remaining(l), 0);
      const savings = b.discountType === 'PERCENT' ? pct(base, b.discountValue) : Math.min(b.discountValue, base);
      return { b, complete, members, savings };
    })
    .sort((x, y) => y.savings - x.savings);
  for (const c of candidates) {
    const label = c.b.discountType === 'PERCENT' ? `${c.b.discountValue}%` : `${(c.b.discountValue / 100).toFixed(2)} ${opts.currency}`;
    if (c.complete && c.members.every((m) => !bundled.has(m.productId))) {
      const members = c.members;
      if (c.b.discountType === 'PERCENT') {
        for (const m of members) applyTo(m, 'bundle', `${c.b.title} bundle −${c.b.discountValue}%`, pct(remaining(m), c.b.discountValue));
      } else {
        const parts = allocate(Math.min(c.b.discountValue, members.reduce((a, m) => a + remaining(m), 0)), members.map(remaining));
        members.forEach((m, i) => applyTo(m, 'bundle', `${c.b.title} bundle`, parts[i]!));
      }
      members.forEach((m) => bundled.add(m.productId));
    } else if (!c.complete) {
      const have = c.b.productIds.filter((p) => inCart.has(p)).length;
      if (have >= Math.max(1, Math.ceil(c.b.productIds.length / 2))) {
        bundleHints.push({
          bundleId: c.b.id,
          title: c.b.title,
          slug: c.b.slug,
          have,
          of: c.b.productIds.length,
          missingProductIds: c.b.productIds.filter((p) => !inCart.has(p)),
          discountLabel: label,
        });
      }
    }
  }

  // 3. Automatic volume tier — on paid, non-bundled, non-upgrade lines.
  const volumeEligible = lines.filter((l) => remaining(l) > 0 && !bundled.has(l.productId) && !l.upgradeFromLicenseId);
  const paidCount = lines.filter((l) => l.baseAmount > 0 && !l.upgradeFromLicenseId).length;
  const tier = [...(opts.volumeTiers ?? DEFAULT_VOLUME_TIERS)].sort((a, b) => b[0] - a[0]).find(([min]) => paidCount >= min);
  if (tier) for (const l of volumeEligible) applyTo(l, 'volume', `${tier[0]}+ items −${tier[1]}%`, pct(remaining(l), tier[1]));

  // 4. Coupon.
  let couponError: string | undefined;
  if (opts.coupon) {
    const c = opts.coupon;
    const eligible = lines.filter(
      (l) =>
        remaining(l) > 0 &&
        (c.productIds.length === 0 || c.productIds.includes(l.productId)) &&
        (c.categoryIds.length === 0 || c.categoryIds.includes(l.categoryId)),
    );
    const eligibleBase = eligible.reduce((a, l) => a + remaining(l), 0);
    if (eligible.length === 0) couponError = 'This code does not apply to the items in your cart';
    else if (c.minSubtotal && eligibleBase < c.minSubtotal) couponError = `Minimum order of ${(c.minSubtotal / 100).toFixed(2)} ${opts.currency} for this code`;
    else if (c.type === 'PERCENT') for (const l of eligible) applyTo(l, 'coupon', `Code ${c.code} −${c.value}%`, pct(remaining(l), c.value));
    else {
      const parts = allocate(Math.min(c.value, eligibleBase), eligible.map(remaining));
      eligible.forEach((l, i) => applyTo(l, 'coupon', `Code ${c.code}`, parts[i]!));
    }
  }

  // 5. Tax per line on the discounted net amount.
  for (const l of lines) {
    l.netAmount = remaining(l);
    l.taxAmount = taxOn(l.netAmount, opts.taxRateBps);
    l.totalAmount = l.netAmount + l.taxAmount;
  }

  const subtotal = lines.reduce((a, l) => a + l.baseAmount, 0);
  const discountTotal = lines.reduce((a, l) => a + l.discountAmount, 0);
  const taxTotal = lines.reduce((a, l) => a + l.taxAmount, 0);
  const gross = lines.reduce((a, l) => a + l.totalAmount, 0);
  const creditApplied = Math.min(Math.max(0, opts.storeCreditAvailable ?? 0), gross);

  const applied = new Map<string, { kind: string; label: string; amount: number }>();
  for (const l of lines)
    for (const d of l.discounts) {
      const key = `${d.kind}:${d.label}`;
      const cur = applied.get(key) ?? { kind: d.kind, label: d.label, amount: 0 };
      cur.amount += d.amount;
      applied.set(key, cur);
    }

  return {
    currency: opts.currency,
    lines,
    subtotal,
    discountTotal,
    taxTotal,
    creditApplied,
    total: gross - creditApplied,
    appliedDiscounts: [...applied.values()],
    bundleHints,
    couponError,
  };
}
