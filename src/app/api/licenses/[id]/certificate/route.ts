import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, errorResponse } from '@/lib/api';
import { verifyToken } from '@/lib/crypto';
import { getSessionUser } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { certificatePdf } from '@/server/pdf';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const license = await db.license.findUnique({ where: { id }, include: { product: true, order: true } });
    if (!license) throw new HttpError(404, 'Not found');
    const user = await getSessionUser();
    const access = verifyToken<{ orderId: string }>(new URL(req.url).searchParams.get('access'), 'order-access');
    const allowed = (user && (license.userId === user.id || (hasPermission(user.role, 'licenses:read') && user.mfa))) || access?.orderId === license.orderId;
    if (!allowed) throw new HttpError(403, 'Forbidden');
    const pdf = await certificatePdf(license);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="license-${license.key}.pdf"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
