import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/crypto';
import { absoluteUrl } from '@/lib/utils';

export async function GET(req: Request) {
  const data = verifyToken<{ email: string }>(new URL(req.url).searchParams.get('token'), 'newsletter');
  if (data) {
    await db.setting.upsert({ where: { key: `newsletter:${data.email}` }, create: { key: `newsletter:${data.email}`, value: { confirmedAt: new Date().toISOString() } }, update: {} });
    await db.user.updateMany({ where: { email: data.email }, data: { marketingConsent: true } });
  }
  return NextResponse.redirect(absoluteUrl(data ? '/?subscribed=1' : '/?subscribed=0'));
}
