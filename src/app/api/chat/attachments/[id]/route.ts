import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, errorResponse } from '@/lib/api';
import { chatIdentity } from '@/server/chat-http';
import { loadConversationFor } from '@/server/chat';
import { storage } from '@/server/storage';

/** Attachments are only ever served after a CLEAN scan, and only to participants of the conversation. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const who = await chatIdentity(req);
    const a = await db.attachment.findUnique({ where: { id } });
    if (!a) throw new HttpError(404, 'Not found');
    await loadConversationFor(who, a.conversationId);
    if (a.scanStatus !== 'CLEAN') throw new HttpError(423, a.scanStatus === 'PENDING' ? 'Still being scanned' : 'File blocked by malware scan');
    const data = await storage().get(a.storageKey);
    const inline = a.mimeType.startsWith('image/');
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': a.mimeType, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${a.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
