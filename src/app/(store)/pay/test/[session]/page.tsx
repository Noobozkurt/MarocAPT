import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { TestPaymentForm } from '@/components/test-payment-form';

export const metadata = { title: 'Test payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Hosted payment page of the local test provider (stands in for Stripe Checkout when no keys are set). */
export default async function TestPayPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  const order = await db.order.findUnique({ where: { providerSessionId: session }, include: { items: true } });
  if (!order || order.provider !== 'TEST') notFound();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-warning">Test mode — no real money moves</p>
        <h1 className="mt-2 text-2xl font-extrabold">Pay {formatMoney(order.total, order.currency)}</h1>
        <ul className="mt-3 text-sm text-muted">{order.items.map((i) => <li key={i.id}>{i.title}</li>)}</ul>
        {order.status === 'PAID' ? <p className="mt-6 text-success">This order is already paid.</p> : <TestPaymentForm session={session} />}
        <div className="mt-6 rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <p className="font-semibold text-fg">Test cards</p>
          <p>4242 4242 4242 4242 — succeeds</p>
          <p>4000 0027 6000 3184 — requires 3-D Secure</p>
          <p>4000 0000 0000 0002 — declined</p>
        </div>
      </div>
    </div>
  );
}
