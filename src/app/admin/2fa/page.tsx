import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Alert } from '@/components/ui';
import { StepUpForm } from '@/components/admin/admin-client';

export const metadata = { title: 'Two-factor verification' };

export default async function AdminTwoFactor({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const u = await getSessionUser();
  if (!u) redirect('/login?next=/admin');
  const dest = next?.startsWith('/admin') ? next : '/admin';
  if (u.mfa) redirect(dest);
  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="mb-2 text-2xl font-extrabold">Admin requires 2FA</h1>
      {u.totpEnabled ? (
        <><p className="mb-6 text-sm text-muted">Enter the 6-digit code from your authenticator app to continue.</p><StepUpForm next={dest} /></>
      ) : (
        <Alert tone="warning">Your account doesn’t have two-factor authentication yet. <Link href="/account/security" className="underline">Enable it in Security</Link>, then come back.</Alert>
      )}
    </div>
  );
}
