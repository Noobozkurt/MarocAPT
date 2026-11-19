import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { errorResponse, readJson } from '@/lib/api';
import { handleInboundEmail } from '@/server/chat';

/**
 * Inbound email (customer replies to support emails). Accepts Postmark-style JSON
 * ({ From, To, TextBody, StrippedTextReply }) or generic { from, to, text }. Authenticated by a shared secret header.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-inbound-secret') || new URL(req.url).searchParams.get('secret') || '';
  if (!safeEqual(secret, process.env.INBOUND_EMAIL_SECRET || 'change-me-inbound')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const b = await readJson<Record<string, string>>(req, 2_000_000);
    const msg = await handleInboundEmail({ from: b.From || b.from || '', to: b.OriginalRecipient || b.To || b.to || '', text: b.StrippedTextReply || b.TextBody || b.text || '' });
    return NextResponse.json({ ok: true, messageId: msg?.id ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
