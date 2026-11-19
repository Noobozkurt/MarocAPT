import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/api';
import { randomToken } from '@/lib/crypto';
import { LICENSE_TIERS, TIERS } from '@/lib/licenses';
import { CURRENCIES } from '@/lib/money';
import { validateVatId } from '@/lib/tax';
import { absoluteUrl } from '@/lib/utils';
import { quoteCart, type Quote } from './cart';
import { activeProvider } from './payments';
import { fulfilOrder, orderAccessToken } from './fulfillment';

export const checkoutSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  country: z.string().trim().toUpperCase().length(2),
  region: z.string().trim().toUpperCase().max(3).optional().nullable(),
  vatId: z.string().trim().max(20).optional().nullable(),
  companyName: z.string().trim().max(120).optional().nullable(),
  currency: z.enum(CURRENCIES),
  couponCode: z.string().trim().max(40).optional().nullable(),
  useStoreCredit: z.boolean().optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the license terms' }) }),
  waiveWithdrawal: z.literal(true, { errorMap: () => ({ message: 'You must acknowledge the loss of the withdrawal right for digital content' }) }),
  idempotencyKey: z.string().min(16).max(80),
  lines: z
    .array(z.object({ productId: z.string().min(1).max(40), tier: z.enum(LICENSE_TIERS), seats: z.number().int().min(1).max(500).optional(), upgradeFromLicenseId: z.string().max(40).optional().nullable() }))
    .min(1)
    .max(50),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export async function resolveVat(vatId: string | null | undefined, country: string) {
  if (!vatId) return { valid: false, checked: false as const };
  const r = await validateVatId(vatId, country, env().VIES_MODE);
  return { ...r, checked: true as const };
}

export interface CheckoutResult {
  orderId: string;
  redirectUrl: string;
  quote: Quote;
}

export async function createCheckout(input: CheckoutInput, ctx: { userId: string | null; ip: string; userAgent: string | null; referrerCode?: string | null }): Promise<CheckoutResult> {
  // Idempotency: the same key (one per checkout attempt in the browser) never creates a second order/charge.
  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.status === 'PAID') throw new HttpError(409, 'This checkout was already paid', 'ALREADY_PAID');
    const quote = await quoteCart({ ...input, userId: ctx.userId });
    const redirectUrl = existing.provider === 'TEST' ? `/pay/test/${existing.providerSessionId}` : existing.providerSessionId ? await stripeUrl(existing.providerSessionId) : '/cart';
    return { orderId: existing.id, redirectUrl, quote };
  }

  const vat = await resolveVat(input.vatId, input.country);
  if (input.vatId && vat.checked && !vat.formatValid) throw new HttpError(400, 'error' in vat && vat.error ? vat.error : 'Invalid VAT ID', 'VAT_INVALID');
  const quote = await quoteCart({ ...input, vatIdValid: vat.valid, userId: ctx.userId, email: input.email });
  if (quote.invalidLines.length) throw new HttpError(400, 'Some items are no longer available. Refresh your cart.', 'CART_INVALID');
  if (input.couponCode && quote.couponError) throw new HttpError(400, quote.couponError, 'COUPON_INVALID');
  if (input.country === 'US' && !input.region) throw new HttpError(400, 'Select your state (needed for sales tax)', 'REGION_REQUIRED');

  let referrerId: string | null = null;
  if (ctx.referrerCode) referrerId = (await db.user.findUnique({ where: { referralCode: ctx.referrerCode }, select: { id: true } }))?.id ?? null;

  const provider = quote.total === 0 ? null : activeProvider();
  const order = await db.order.create({
    data: {
      userId: ctx.userId,
      email: input.email,
      currency: input.currency,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      creditApplied: quote.creditApplied,
      taxTotal: quote.taxTotal,
      total: quote.total,
      taxCountry: input.country,
      taxRegion: input.region ?? null,
      taxRateBps: quote.tax.rateBps,
      taxMode: quote.tax.mode,
      taxInclusive: quote.tax.displayInclusive,
      vatId: input.vatId || null,
      vatIdValidated: vat.valid,
      companyName: input.companyName || null,
      provider: provider?.name ?? 'MANUAL',
      idempotencyKey: input.idempotencyKey,
      couponId: quote.coupon?.id ?? null,
      referrerId,
      termsAcceptedAt: new Date(),
      withdrawalWaiverAt: new Date(),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 300),
      claimToken: ctx.userId ? null : randomToken(24),
      items: {
        create: quote.lines.map((l) => ({
          productId: l.productId,
          title: l.title,
          tier: l.tier,
          seats: l.seats,
          unitAmount: l.unitAmount,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          totalAmount: l.totalAmount,
          upgradeFromLicenseId: l.upgradeFromLicenseId ?? null,
        })),
      },
    },
  });

  const access = orderAccessToken(order.id);
  if (!provider) {
    // Free cart (free assets or fully covered by credit/discounts): fulfil directly, no payment step.
    await fulfilOrder(order.id, { provider: 'MANUAL', paymentId: null, amount: 0 });
    return { orderId: order.id, redirectUrl: `/checkout/success?order=${order.id}&access=${access}`, quote };
  }

  // One provider line per order line, amounts tax-inclusive so the charged total equals our total.
  // Store credit is applied as a proportional reduction to keep the sum exact.
  const gross = quote.lines.reduce((a, l) => a + l.totalAmount, 0);
  let remainingCredit = quote.creditApplied;
  const providerLines = quote.lines.map((l, i) => {
    const share = i === quote.lines.length - 1 ? remainingCredit : Math.min(remainingCredit, Math.floor((quote.creditApplied * l.totalAmount) / Math.max(1, gross)));
    remainingCredit -= share;
    return { name: `${l.title} — ${TIERS[l.tier].name} license${l.seats > 1 ? ` (${l.seats} seats)` : ''}${l.upgradeFromLicenseId ? ' (upgrade)' : ''}`, amount: l.totalAmount - share, quantity: 1 };
  }).filter((l) => l.amount > 0);

  const session = await activeProvider().createCheckout({
    orderId: order.id,
    email: input.email,
    currency: input.currency,
    lines: providerLines,
    successUrl: absoluteUrl(`/checkout/success?order=${order.id}&access=${access}`),
    cancelUrl: absoluteUrl('/checkout?canceled=1'),
    idempotencyKey: input.idempotencyKey,
  });
  await db.order.update({ where: { id: order.id }, data: { providerSessionId: session.sessionId } });
  await db.paymentEvent.create({ data: { orderId: order.id, provider: provider.name, type: 'checkout.created', amount: quote.total, providerRef: session.sessionId } });
  return { orderId: order.id, redirectUrl: session.url, quote };
}

async function stripeUrl(sessionId: string) {
  const { stripeClient } = await import('./payments/stripe');
  const s = await stripeClient().checkout.sessions.retrieve(sessionId);
  return s.url ?? '/checkout?expired=1';
}
