import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, errorResponse } from '@/lib/api';
import { verifyToken } from '@/lib/crypto';
import { getSessionUser } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { invoicePdf } from '@/server/pdf';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await db.order.findUnique({ where: { id }, include: { items: true } });
    if (!order || !order.invoiceNumber) throw new HttpError(404, 'Invoice not available');
    const user = await getSessionUser();
    const access = verifyToken<{ orderId: string }>(new URL(req.url).searchParams.get('access'), 'order-access');
    const allowed = (user && (order.userId === user.id || (hasPermission(user.role, 'orders:read') && user.mfa))) || access?.orderId === order.id;
    if (!allowed) throw new HttpError(403, 'Forbidden');
    const pdf = await invoicePdf(order);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${order.invoiceNumber}.pdf"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
