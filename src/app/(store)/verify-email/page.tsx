import Link from 'next/link';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/crypto';
import { claimGuestPurchases } from '@/lib/auth';
import { Alert } from '@/components/ui';
export const metadata = { title: 'Verify email', robots: { index: false } };
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const data = verifyToken<{ uid: string; email: string }>(token, 'verify-email');
  let ok = false;
  if (data) {
    const u = await db.user.findUnique({ where: { id: data.uid } });
    if (u && u.email === data.email) {
      await db.user.update({ where: { id: u.id }, data: { emailVerified: u.emailVerified ?? new Date() } });
      await claimGuestPurchases(u.id, u.email); // only now that the email is proven
      ok = true;
    }
  }
  return <div className="mx-auto max-w-md px-4 py-16">{ok ? <Alert tone="success">Email verified — any earlier guest purchases are now in your library. <Link href="/account/library" className="underline">Open library</Link></Alert> : <Alert tone="danger">This verification link is invalid or expired.</Alert>}</div>;
}
