import type { PaymentProvider, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { audit, SYSTEM_ACTOR, type AuditActor } from '@/lib/audit';
import { generateLicenseKey, signToken } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';
import { TIERS, type Tier } from '@/lib/licenses';
import { formatMoney } from '@/lib/money';
import { absoluteUrl } from '@/lib/utils';
import { STORE_NAME } from '@/lib/env';
import { formatInvoiceNumber, nextCounter } from './counters';
import { emitTo } from './realtime';
import { notify } from './notifications';
import { providerFor } from './payments';

export function orderAccessToken(orderId: string) {
  return signToken({ orderId }, 30 * 24 * 3600, 'order-access');
}

// ─── Webhook processing (Stripe and the local test provider share Stripe's event shapes) ───

interface StripeLikeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/**
 * Idempotent: the provider event id is the WebhookEvent primary key. A second delivery of the same event
 * (Stripe retries, replays) is detected and acknowledged without side effects.
 */
export async function handleProviderEvent(provider: PaymentProvider, event: StripeLikeEvent): Promise<WebhookOutcome> {
  const existing = await db.webhookEvent.findUnique({ where: { id: event.id } });
  if (existing && (existing.status === 'PROCESSED' || existing.status === 'IGNORED')) return 'duplicate';
  if (!existing) {
    try {
      await db.webhookEvent.create({ data: { id: event.id, provider, type: event.type, payload: event as unknown as Prisma.InputJsonValue } });
    } catch {
      return 'duplicate'; // concurrent delivery won the insert
    }
  }
  await db.webhookEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
  try {
    const outcome = await dispatch(provider, event);
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: outcome === 'ignored' ? 'IGNORED' : 'PROCESSED', processedAt: new Date(), error: null } });
    return outcome;
  } catch (err) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 1000) } });
    throw err;
  }
}

/** Re-run a stored event (admin → system health → webhook replay). */
export async function replayWebhook(eventId: string) {
  const ev = await db.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  await db.webhookEvent.update({ where: { id: eventId }, data: { status: 'RECEIVED' } });
  return handleProviderEvent(ev.provider, ev.payload as unknown as StripeLikeEvent);
}

async function dispatch(provider: PaymentProvider, event: StripeLikeEvent): Promise<WebhookOutcome> {
  const o = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (o.payment_status && o.payment_status !== 'paid' && o.payment_status !== 'no_payment_required') return 'ignored'; // async methods confirm later
      const order = await db.order.findFirst({ where: { OR: [{ providerSessionId: o.id }, { id: o.metadata?.orderId ?? '__none__' }] } });
      if (!order) throw new Error(`No order for session ${o.id}`);
      await fulfilOrder(order.id, { provider, paymentId: o.payment_intent ?? null, amount: o.amount_total ?? null });
      return 'processed';
    }
    case 'payment_intent.succeeded': {
      const orderId = o.metadata?.orderId;
      if (!orderId) return 'ignored';
      await fulfilOrder(orderId, { provider, paymentId: o.id, amount: o.amount_received ?? o.amount ?? null });
      return 'processed';
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      await db.order.updateMany({ where: { providerSessionId: o.id, status: 'PENDING' }, data: { status: event.type.endsWith('failed') ? 'FAILED' : 'CANCELED' } });
      return 'processed';
    }
    case 'charge.refunded': {
      const order = await findOrderByPayment(o.payment_intent, o.metadata?.orderId);
      if (!order) throw new Error(`No order for payment ${o.payment_intent}`);
      const refunds: Array<{ id: string; amount: number }> = o.refunds?.data ?? [];
      await recordProviderRefund(order.id, Number(o.amount_refunded ?? 0), refunds);
      return 'processed';
    }
    case 'charge.dispute.created': {
      const order = await findOrderByPayment(o.payment_intent, o.metadata?.orderId);
      if (!order) throw new Error(`No order for disputed payment ${o.payment_intent}`);
      await db.$transaction(async (tx) => {
        await tx.dispute.upsert({
          where: { providerDisputeId: o.id },
          create: { orderId: order.id, providerDisputeId: o.id, status: o.status ?? 'needs_response', amount: Number(o.amount ?? order.total), reason: o.reason ?? null },
          update: { status: o.status ?? 'needs_response' },
        });
        await tx.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
        await tx.license.updateMany({ where: { orderId: order.id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'Chargeback opened' } });
        await tx.paymentEvent.create({ data: { orderId: order.id, provider, type: 'dispute.created', amount: Number(o.amount ?? 0), providerRef: o.id } });
        await audit({ actor: SYSTEM_ACTOR, action: 'order.disputed', resourceType: 'Order', resourceId: order.id, after: { disputeId: o.id }, ip: null }, tx);
      });
      if (order.userId) emitTo(`user:${order.userId}`, 'library:updated', { orderId: order.id, reason: 'dispute' });
      return 'processed';
    }
    default:
      return 'ignored';
  }
}

async function findOrderByPayment(paymentId?: string, orderId?: string) {
  if (orderId) {
    const o = await db.order.findUnique({ where: { id: orderId } });
    if (o) return o;
  }
  return paymentId ? db.order.findUnique({ where: { providerPaymentId: paymentId } }) : null;
}

// ─── Fulfilment ───

export async function fulfilOrder(orderId: string, payment: { provider: PaymentProvider; paymentId: string | null; amount: number | null }) {
  const result = await db.$transaction(async (tx) => {
    // Status transition is the lock: only one caller can move PENDING → PAID.
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'FAILED', 'CANCELED'] } },
      data: { status: 'PAID', paidAt: new Date(), providerPaymentId: payment.paymentId ?? undefined },
    });
    if (moved.count === 0) return null; // already fulfilled
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { product: true } } } });
    if (payment.amount !== null && payment.amount !== order.total && process.env.STRIPE_AUTOMATIC_TAX !== 'true') {
      throw new Error(`Amount mismatch for order ${orderId}: paid ${payment.amount}, expected ${order.total}`);
    }
    const invoiceNumber = formatInvoiceNumber(await nextCounter(tx, `invoice-${new Date().getFullYear()}`));
    await tx.order.update({ where: { id: orderId }, data: { invoiceNumber } });

    const licenses = [];
    for (const item of order.items) {
      if (item.upgradeFromLicenseId) {
        await tx.license.updateMany({ where: { id: item.upgradeFromLicenseId, status: 'ACTIVE' }, data: { status: 'UPGRADED' } });
      }
      licenses.push(
        await tx.license.create({
          data: {
            key: generateLicenseKey(),
            orderId,
            orderItemId: item.id,
            userId: order.userId,
            email: order.email,
            productId: item.productId,
            tier: item.tier,
            seats: item.seats,
            downloadLimit: TIERS[item.tier as Tier].defaultDownloadLimit * Math.max(1, item.seats),
            lastSeenVersion: item.product.currentVersion,
          },
        }),
      );
      await tx.product.update({ where: { id: item.productId }, data: { salesCount: { increment: 1 } } });
    }
    if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { redemptionCount: { increment: 1 } } });
    if (order.creditApplied > 0 && order.userId) await tx.user.update({ where: { id: order.userId }, data: { storeCredit: { decrement: order.creditApplied } } });
    if (order.referrerId && order.referrerId !== order.userId && order.currency === 'USD') {
      await tx.user.update({ where: { id: order.referrerId }, data: { storeCredit: { increment: Math.round(order.total * 0.1) } } });
    }
    await tx.paymentEvent.create({ data: { orderId, provider: payment.provider, type: 'payment.succeeded', amount: payment.amount ?? order.total, providerRef: payment.paymentId } });
    await audit({ actor: SYSTEM_ACTOR, action: 'order.paid', resourceType: 'Order', resourceId: orderId, after: { invoiceNumber, licenses: licenses.length }, ip: null }, tx);
    return { order, licenses, invoiceNumber };
  });
  if (!result) return { alreadyFulfilled: true as const };

  const { order, licenses, invoiceNumber } = result;
  const access = orderAccessToken(order.id);
  const lines = order.items.map((i) => `• ${i.title} — ${TIERS[i.tier as Tier].name}${i.seats > 1 ? ` × ${i.seats} seats` : ''}`).join('\n');
  const keys = licenses.map((l) => `• ${order.items.find((i) => i.id === l.orderItemId)?.title}: ${l.key}`).join('\n');
  const claim = !order.userId && order.claimToken ? `\n\nCreate your free account to keep these files in your library forever:\n${absoluteUrl(`/claim/${order.claimToken}`)}` : '';
  await sendEmail({
    to: order.email,
    template: 'receipt',
    subject: `Your ${STORE_NAME} order ${invoiceNumber}`,
    text:
      `Thanks for your purchase! Your files are ready to download.\n\n${lines}\n\nTotal: ${formatMoney(order.total, order.currency)}\n\n` +
      `Download your files:\n${absoluteUrl(`/checkout/success?order=${order.id}&access=${access}`)}\n\n` +
      `Invoice (PDF): ${absoluteUrl(`/api/orders/${order.id}/invoice?access=${access}`)}\n\nLicense keys (verify at ${absoluteUrl('/verify')}):\n${keys}${claim}\n\n` +
      `You waived your 14-day right of withdrawal when you started the download, as agreed at checkout.`,
    meta: { orderId: order.id },
  });
  if (order.userId) {
    await notify(order.userId, { type: 'order.paid', title: 'Order complete', body: `${order.items.length} item(s) added to your library`, link: '/account/library' });
    emitTo(`user:${order.userId}`, 'library:updated', { orderId: order.id, reason: 'paid' });
  }
  emitTo('admin-feed', 'sale:new', { orderId: order.id, total: order.total, currency: order.currency, items: order.items.length, at: new Date().toISOString() });
  return { alreadyFulfilled: false as const, invoiceNumber };
}

// ─── Refunds ───

/**
 * Admin-initiated refund. Access is revoked immediately in our database (the library updates live),
 * then the provider refund is executed; the provider's charge.refunded webhook later reconciles idempotently.
 */
export async function refundOrder(opts: { orderId: string; amount?: number; itemIds?: string[]; reason: string; actor: AuditActor }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: opts.orderId }, include: { items: true, licenses: true } });
  if (!['PAID', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(order.status)) throw new Error(`Order is ${order.status}; nothing to refund`);
  const refundable = order.total - order.amountRefunded;
  const itemIds = opts.itemIds?.length ? opts.itemIds : null;
  const itemsAmount = itemIds ? order.items.filter((i) => itemIds.includes(i.id)).reduce((a, i) => a + i.totalAmount, 0) : null;
  const amount = Math.min(refundable, opts.amount ?? itemsAmount ?? refundable);
  if (amount <= 0) throw new Error('Refund amount must be positive');
  const full = amount >= refundable && !itemIds;

  const refund = await db.$transaction(async (tx) => {
    const r = await tx.refund.create({ data: { orderId: order.id, amount, reason: opts.reason, createdById: opts.actor.id, status: 'PENDING' } });
    const revokeWhere = full ? { orderId: order.id } : itemIds ? { orderId: order.id, orderItemId: { in: itemIds } } : null;
    if (revokeWhere) await tx.license.updateMany({ where: { ...revokeWhere, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: `Refunded: ${opts.reason}` } });
    await tx.order.update({ where: { id: order.id }, data: { amountRefunded: { increment: amount }, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    await tx.paymentEvent.create({ data: { orderId: order.id, provider: order.provider, type: 'refund.initiated', amount } });
    await audit({ actor: opts.actor, action: 'order.refund', resourceType: 'Order', resourceId: order.id, before: { status: order.status, amountRefunded: order.amountRefunded }, after: { amount, full, itemIds, reason: opts.reason } }, tx);
    return r;
  });
  if (order.userId) emitTo(`user:${order.userId}`, 'library:updated', { orderId: order.id, reason: 'refund' });

  try {
    if (order.provider !== 'MANUAL' && order.providerPaymentId) {
      const { refundId } = await providerFor(order.provider).refund({ paymentId: order.providerPaymentId, amount, orderId: order.id, idempotencyKey: refund.id });
      await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: refundId, status: 'SUCCEEDED' } });
    } else {
      await db.refund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED' } });
    }
  } catch (err) {
    await db.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
    throw new Error(`Access revoked, but the provider refund failed: ${(err as Error).message}. Retry from the order page.`);
  }

  await sendEmail({
    to: order.email,
    template: 'refund',
    subject: `Refund processed for ${order.invoiceNumber ?? order.id}`,
    text: `We've refunded ${formatMoney(amount, order.currency)} to your original payment method. It can take 5–10 business days to appear.\n\n${full ? 'The licenses for this order have been revoked.' : 'Refunded items have been removed from your library.'}`,
    meta: { orderId: order.id },
  });
  if (order.userId) await notify(order.userId, { type: 'order.refunded', title: 'Refund processed', body: `${formatMoney(amount, order.currency)} refunded`, link: `/account/orders/${order.id}` });
  return refund;
}

/** Reconcile a provider refund webhook (refunds created in the Stripe Dashboard are handled here too). */
async function recordProviderRefund(orderId: string, amountRefundedTotal: number, refunds: Array<{ id: string; amount: number }>) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    for (const r of refunds) {
      const known = await tx.refund.findUnique({ where: { providerRefundId: r.id } });
      if (!known) {
        // Refund issued outside our admin (e.g. Stripe Dashboard).
        await tx.refund.create({ data: { orderId, amount: r.amount, reason: 'Refunded at provider', providerRefundId: r.id, status: 'SUCCEEDED' } });
      }
    }
    const full = amountRefundedTotal >= order.total;
    const newRefunded = Math.max(order.amountRefunded, amountRefundedTotal);
    await tx.order.update({ where: { id: orderId }, data: { amountRefunded: newRefunded, status: full ? 'REFUNDED' : order.status === 'PAID' ? 'PARTIALLY_REFUNDED' : order.status } });
    if (full) await tx.license.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'Refunded' } });
    await tx.paymentEvent.create({ data: { orderId, provider: order.provider, type: 'refund.confirmed', amount: amountRefundedTotal } });
  });
  const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true } });
  if (order?.userId) emitTo(`user:${order.userId}`, 'library:updated', { orderId, reason: 'refund' });
}

/** Free assets and manual grants: same fulfilment path, no payment provider. */
export async function grantFree(opts: { userId: string | null; email: string; productId: string; tier: Tier; actor?: AuditActor }) {
  const product = await db.product.findUniqueOrThrow({ where: { id: opts.productId } });
  const order = await db.order.create({
    data: {
      userId: opts.userId,
      email: opts.email.toLowerCase(),
      currency: 'USD',
      subtotal: 0,
      total: 0,
      taxCountry: 'XX',
      taxMode: 'NONE',
      provider: 'MANUAL',
      idempotencyKey: `grant_${opts.userId ?? opts.email}_${opts.productId}_${opts.tier}_${Date.now()}`,
      termsAcceptedAt: new Date(),
      withdrawalWaiverAt: new Date(),
      items: { create: [{ productId: product.id, title: product.title, tier: opts.tier, unitAmount: 0, totalAmount: 0 }] },
    },
  });
  if (opts.actor) await audit({ actor: opts.actor, action: 'order.manual_grant', resourceType: 'Order', resourceId: order.id, after: { productId: product.id, tier: opts.tier, email: opts.email } });
  await fulfilOrder(order.id, { provider: 'MANUAL', paymentId: null, amount: 0 });
  return order;
}
