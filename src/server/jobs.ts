// Durable job queue on Postgres (FOR UPDATE SKIP LOCKED) — safe with multiple app instances.
// Failed jobs retry with exponential backoff and are visible in /admin/health.
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { formatMoney } from '@/lib/money';
import { absoluteUrl } from '@/lib/utils';
import { STORE_NAME } from '@/lib/env';
import { applyChatRetention, sendOfflineDigests } from './chat';
import { emitTo } from './realtime';
import { scanBuffer } from './scan';
import { storage } from './storage';
import { notify } from './notifications';

type Handler = (payload: any) => Promise<void>;

export async function enqueue(type: string, payload: Prisma.InputJsonValue, opts: { runAt?: Date; maxAttempts?: number } = {}) {
  return db.job.create({ data: { type, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 } });
}

const handlers: Record<string, Handler> = {
  async 'attachment.scan'({ attachmentId }: { attachmentId: string }) {
    const a = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!a || a.scanStatus !== 'PENDING') return;
    const result = await scanBuffer(await storage().get(a.storageKey), a.mimeType);
    await db.attachment.update({ where: { id: a.id }, data: { scanStatus: result.clean ? 'CLEAN' : 'INFECTED' } });
    if (!result.clean) await storage().delete(a.storageKey);
    emitTo(`conversation:${a.conversationId}`, 'attachment:scanned', { attachmentId: a.id, messageId: a.messageId, scanStatus: result.clean ? 'CLEAN' : 'INFECTED', fileName: a.fileName, mimeType: a.mimeType, size: a.size });
  },

  async 'product.process-file'({ fileId }: { fileId: string }) {
    const { processProductFile } = await import('./product-files');
    await processProductFile(fileId);
  },

  async 'product.notify-update'({ productId, version }: { productId: string; version: string }) {
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const licenses = await db.license.findMany({ where: { productId, status: 'ACTIVE' }, select: { email: true, userId: true }, distinct: ['email'] });
    for (const l of licenses) {
      await sendEmail({
        to: l.email,
        template: 'asset-updated',
        subject: `${product.title} was updated to v${version}`,
        text: `Good news — ${product.title} has a free update (v${version}).\n\nDownload it from your library: ${absoluteUrl('/account/library')}\n\nPrevious versions remain available too.`,
      });
      if (l.userId) await notify(l.userId, { type: 'asset.updated', title: `${product.title} v${version}`, body: 'A free update is available', link: '/account/library' });
    }
  },

  async 'wishlist.sale-alerts'() {
    const items = await db.wishlistItem.findMany({ include: { user: true, product: { include: { prices: true } } } });
    const sale = await db.sale.findFirst({ where: { active: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } });
    for (const w of items) {
      if (!w.user.notifyWishlistSale || (w.lastAlertAt && Date.now() - w.lastAlertAt.getTime() < 7 * 86400_000)) continue;
      const now = w.product.prices.find((p) => p.tier === 'PERSONAL' && p.currency === w.currency)?.amount ?? w.priceAtAdd;
      const effective = sale ? Math.round(now * (1 - sale.percentOff / 100)) : now;
      if (effective >= w.priceAtAdd) continue;
      await sendEmail({
        to: w.user.email,
        template: 'wishlist-sale',
        subject: `Price drop: ${w.product.title}`,
        text: `${w.product.title} on your wishlist is now ${formatMoney(effective, w.currency)} (was ${formatMoney(w.priceAtAdd, w.currency)}).\n\n${absoluteUrl(`/products/${w.product.slug}`)}\n\nManage alerts: ${absoluteUrl('/account/settings')}`,
      });
      await db.wishlistItem.update({ where: { userId_productId: { userId: w.userId, productId: w.productId } }, data: { lastAlertAt: new Date() } });
    }
  },

  async 'cart.abandoned'({ userId }: { userId: string }) {
    const user = await db.user.findUnique({ where: { id: userId }, include: { cartItems: { include: { product: true } } } });
    if (!user || !user.marketingConsent || !user.cartItems.length) return; // only with consent
    await sendEmail({
      to: user.email,
      template: 'abandoned-cart',
      subject: `You left something in your ${STORE_NAME} cart`,
      text: `Still thinking it over?\n\n${user.cartItems.map((c) => `• ${c.product.title}`).join('\n')}\n\nFinish checkout: ${absoluteUrl('/cart')}\n\nUnsubscribe: ${absoluteUrl('/account/settings')}`,
    });
  },
};

export function registerJobHandler(type: string, handler: Handler) {
  handlers[type] = handler;
}

export async function runNextJob(): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (SELECT id FROM "Job" WHERE status = 'QUEUED' AND "runAt" <= now() ORDER BY "runAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`;
  if (!rows.length) return false;
  const job = await db.job.findUniqueOrThrow({ where: { id: rows[0]!.id } });
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    await handler(job.payload);
    await db.job.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null } });
  } catch (e) {
    const failed = job.attempts >= job.maxAttempts;
    await db.job.update({
      where: { id: job.id },
      data: { status: failed ? 'FAILED' : 'QUEUED', lastError: (e as Error).message.slice(0, 1000), runAt: new Date(Date.now() + 2 ** job.attempts * 5000) },
    });
  }
  return true;
}

export async function drainJobs(max = 50) {
  for (let i = 0; i < max; i++) if (!(await runNextJob())) break;
}

let started = false;
export function startWorker() {
  if (started || process.env.DISABLE_WORKER === '1') return;
  started = true;
  // Recover jobs stuck in RUNNING after a crash.
  void db.job.updateMany({ where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'QUEUED' } });
  const tick = async () => {
    try {
      await drainJobs(20);
    } catch (e) {
      console.error('[jobs]', (e as Error).message);
    }
  };
  setInterval(tick, 1500).unref();
  setInterval(() => sendOfflineDigests().catch((e) => console.error('[chat-digest]', e.message)), 60_000).unref();
  setInterval(() => applyChatRetention().catch(() => undefined), 6 * 3600_000).unref();
  setInterval(() => enqueue('wishlist.sale-alerts', {}).catch(() => undefined), 6 * 3600_000).unref();
  setInterval(
    () => db.order.updateMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } }, data: { status: 'CANCELED' } }).catch(() => undefined),
    3600_000,
  ).unref();
}
