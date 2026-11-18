import { getSessionUser } from '@/lib/session';
import { db } from '@/lib/db';
import { US_STATES } from '@/lib/tax';
import { CheckoutForm } from '@/components/checkout-form';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const credit = user ? (await db.user.findUnique({ where: { id: user.id }, select: { storeCredit: true } }))?.storeCredit ?? 0 : 0;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Checkout" subtitle="Secure, PCI-compliant payment. Your card details never touch our servers." />
      <CheckoutForm email={user?.email ?? ''} signedIn={Boolean(user)} storeCredit={credit} usStates={US_STATES} canceled={sp.canceled === '1'} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''} />
    </div>
  );
}
