import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { consumeGrant } from '@/server/downloads';
import { contentTypeFor, storage } from '@/server/storage';

/** Single-use signed download. Expired / reused / revoked → 410. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const grant = await consumeGrant(token);
    const s3 = await storage().presign(grant.storageKey, grant.fileName, 60);
    if (s3) return NextResponse.redirect(s3, { headers: { 'Cache-Control': 'no-store' } });
    const data = await storage().get(grant.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentTypeFor(grant.fileName),
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${grant.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
