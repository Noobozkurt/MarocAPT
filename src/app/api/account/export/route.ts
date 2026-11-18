import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';

/** GDPR Art. 15/20 export. Secrets (password hash, TOTP secret) are never included. */
export async function GET() {
  try {
    const u = await requireUser();
    await enforceRateLimit(`export:${u.id}`, 5, 3600);
    const user = await db.user.findUniqueOrThrow({
      where: { id: u.id },
      select: {
        id: true, email: true, name: true, createdAt: true, locale: true, currency: true, marketingConsent: true, notifyChatEmail: true, notifyOrderEmail: true, notifyWishlistSale: true, storeCredit: true, referralCode: true,
        orders: { include: { items: true, refunds: true } },
        licenses: { select: { key: true, productId: true, tier: true, seats: true, status: true, createdAt: true, downloadCount: true } },
        downloads: { select: { licenseId: true, fileId: true, ip: true, createdAt: true } },
        reviews: true,
        wishlist: true,
        accounts: { select: { provider: true } },
        authSessions: { select: { ip: true, userAgent: true, createdAt: true, lastSeenAt: true } },
        conversations: { include: { messages: { where: { isInternalNote: false }, select: { senderType: true, body: true, createdAt: true } } } },
      },
    });
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), user }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="stuffin3d-data-${u.id}.json"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
