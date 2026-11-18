import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { absoluteUrl, clientIp } from '@/lib/utils';

/** Referral link: counts the click and remembers the referrer for 30 days. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  const res = NextResponse.redirect(absoluteUrl('/'));
  if (user) {
    await db.referralClick.create({ data: { referrerId: user.id, ipHash: sha256(clientIp(req.headers) + new Date().toDateString()) } });
    res.cookies.set('s3d_ref', code, { path: '/', maxAge: 30 * 86400, sameSite: 'lax', httpOnly: true });
  }
  return res;
}
