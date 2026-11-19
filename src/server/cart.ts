import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { isTier, normalizeSeats, upgradePrice, upgradeTargets, type Tier } from '@/lib/licenses';
import type { Currency } from '@/lib/money';
import { priceCart, type BundleInput, type CouponInput, type PriceLineInput, type PricingResult } from '@/lib/pricing';
import { decideTax, type TaxDecision } from '@/lib/tax';
import { activeSale, publishedWhere } from './catalog';

export interface CartLineInput {
  productId: string;
  tier: Tier;
  seats?: number;
  upgradeFromLicenseId?: string | null;
}

export interface QuoteInput {
  lines: CartLineInput[];
  currency: Currency;
  country: string;
  region?: string | null;
  vatIdValid?: boolean;
  couponCode?: string | null;
  userId?: string | null;
  email?: string | null;
  useStoreCredit?: boolean;
}

export interface Quote extends PricingResult {
  tax: TaxDecision;
  coupon: { id: string; code: string } | null;
  lineMeta: Record<string, { slug: string; posterPath: string | null; isFree: boolean }>;
  invalidLines: string[];
}

export async function validateCoupon(code: string, opts: { userId?: string | null; email?: string | null; currency: string }) {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.active) return { error: 'Unknown or inactive code' } as const;
  if (coupon.startsAt && coupon.startsAt > now) return { error: 'This code is not active yet' } as const;
  if (coupon.expiresAt && coupon.expiresAt < now) return { error: 'This code has expired' } as const;
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) return { error: 'This code has reached its usage limit' } as const;
  if (coupon.type === 'FIXED' && coupon.currency && coupon.currency !== opts.currency) return { error: `This code is only valid for ${coupon.currency} orders` } as const;
  if (coupon.firstOrderOnly) {
    const or = [opts.userId ? { userId: opts.userId } : undefined, opts.email ? { email: opts.email.toLowerCase() } : undefined].filter(Boolean) as object[];
    if (or.length) {
      const prior = await db.order.count({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, OR: or } });
      if (prior > 0) return { error: 'This code is only valid on your first order' } as const;
    }
  }
  return { coupon } as const;
}

export async function quoteCart(input: QuoteInput): Promise<Quote> {
  const tax = decideTax({ sellerCountry: env().SELLER_COUNTRY, country: input.country, region: input.region, vatIdValid: input.vatIdValid });
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const products = await db.product.findMany({ where: { id: { in: ids }, ...publishedWhere() }, include: { prices: { where: { currency: input.currency } } } });
  const invalidLines: string[] = [];
  const lines: PriceLineInput[] = [];
  const lineMeta: Quote['lineMeta'] = {};

  for (const l of input.lines) {
    const p = products.find((x) => x.id === l.productId);
    if (!p || !isTier(l.tier)) {
      invalidLines.push(l.productId);
      continue;
    }
    const priceOf = (t: Tier) => p.prices.find((x) => x.tier === t)?.amount;
    let unit = priceOf(l.tier);
    if (unit === undefined) {
      invalidLines.push(l.productId);
      continue;
    }
    let upgradeFromLicenseId: string | null = null;
    if (l.upgradeFromLicenseId) {
      const lic = await db.license.findUnique({ where: { id: l.upgradeFromLicenseId } });
      const owned = lic && lic.status === 'ACTIVE' && lic.productId === p.id && input.userId && lic.userId === input.userId;
      if (!owned || !upgradeTargets(lic.tier as Tier).includes(l.tier)) {
        invalidLines.push(l.productId);
        continue;
      }
      unit = upgradePrice(priceOf(lic.tier as Tier) ?? 0, unit);
      upgradeFromLicenseId = lic.id;
    }
    lines.push({ productId: p.id, title: p.title, categoryId: p.categoryId, tier: l.tier, seats: normalizeSeats(l.tier, l.seats), unitAmount: p.isFree ? 0 : unit, upgradeFromLicenseId });
    lineMeta[p.id] = { slug: p.slug, posterPath: p.posterPath, isFree: p.isFree };
  }

  let coupon: CouponInput | null = null;
  let couponRef: Quote['coupon'] = null;
  let couponError: string | undefined;
  if (input.couponCode) {
    const v = await validateCoupon(input.couponCode, { userId: input.userId, email: input.email, currency: input.currency });
    if ('error' in v) couponError = v.error;
    else {
      coupon = { code: v.coupon.code, type: v.coupon.type, value: v.coupon.value, productIds: v.coupon.productIds, categoryIds: v.coupon.categoryIds, minSubtotal: v.coupon.minSubtotal };
      couponRef = { id: v.coupon.id, code: v.coupon.code };
    }
  }

  const bundles = await db.bundle.findMany({ where: { active: true }, include: { items: true } });
  const bundleInputs: BundleInput[] = bundles.map((b) => ({ id: b.id, title: b.title, slug: b.slug, discountType: b.discountType, discountValue: b.discountValue, productIds: b.items.map((i) => i.productId) }));
  const sale = await activeSale();
  let credit = 0;
  if (input.useStoreCredit && input.userId) credit = (await db.user.findUnique({ where: { id: input.userId }, select: { storeCredit: true } }))?.storeCredit ?? 0;
  // Store credit is held in USD minor units; only usable on USD carts to avoid FX ambiguity.
  if (input.currency !== 'USD') credit = 0;

  const result = priceCart(lines, {
    currency: input.currency,
    taxRateBps: tax.rateBps,
    salePercentOff: sale?.percentOff,
    coupon,
    bundles: bundleInputs,
    storeCreditAvailable: credit,
  });
  if (result.couponError) {
    couponRef = null;
  }
  return { ...result, couponError: couponError ?? result.couponError, tax, coupon: couponRef, lineMeta, invalidLines };
}
