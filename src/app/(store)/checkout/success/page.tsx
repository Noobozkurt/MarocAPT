import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/crypto';
import { getSessionUser } from '@/lib/session';
import { TIERS, type Tier } from '@/lib/licenses';
import { formatMoney } from '@/lib/money';
import { formatBytes } from '@/lib/utils';
import { DownloadButton } from '@/components/download-button';
import { OrderPoller } from '@/components/order-poller';
import { Alert, Card, ButtonLink } from '@/components/ui';

export const metadata = { title: 'Order confirmation', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string; access?: string }> }) {
  const { order: orderId, access } = await searchParams;
  const user = await getSessionUser();
  const tokenOk = verifyToken<{ orderId: string }>(access, 'order-access')?.orderId === orderId;
  const order = orderId ? await db.order.findUnique({ where: { id: orderId }, include: { items: true, licenses: { include: { product: { include: { versions: { orderBy: { createdAt: 'desc' }, take: 1, include: { files: true } } } } } } } }) : null;
  if (!order || (!tokenOk && order.userId !== user?.id)) return <div className="mx-auto max-w-xl px-4 py-16"><Alert tone="danger">Order not found or link expired. Check your email or <Link href="/account/orders" className="underline">your orders</Link>.</Alert></div>;
  const paid = ['PAID', 'PARTIALLY_REFUNDED'].includes(order.status);
  const acc = tokenOk ? access! : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <OrderPoller paid={paid} />
      {paid ? (
        <div className="mb-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold" data-testid="order-success">Thank you — your files are ready</h1>
          <p className="mt-2 text-muted">Order {order.invoiceNumber} · {formatMoney(order.total, order.currency)} · receipt sent to {order.email}</p>
        </div>
      ) : order.status === 'PENDING' ? (
        <div className="mb-8 text-center" role="status">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-accent" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold">Confirming your payment…</h1>
          <p className="mt-2 text-muted">This usually takes a few seconds. Don’t close this page.</p>
        </div>
      ) : (
        <Alert tone="danger">This order is {order.status.toLowerCase()}.</Alert>
      )}
      {paid && (
        <div className="space-y-4">
          {order.licenses.map((l) => {
            const v = l.product.versions[0];
            return (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">{l.product.title}</h2>
                    <p className="text-sm text-muted">{TIERS[l.tier as Tier].name} license · key <code className="font-mono">{l.key}</code></p>
                  </div>
                  {l.status === 'ACTIVE' && <DownloadButton licenseId={l.id} fileId="all" label="Download all (ZIP)" access={acc} />}
                </div>
                {l.status === 'ACTIVE' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {v?.files.map((f) => <DownloadButton key={f.id} licenseId={l.id} fileId={f.id} label={`${f.format} · ${formatBytes(f.size)}`} access={acc} className="bg-surface-2 text-fg" />)}
                    <a href={`/api/licenses/${l.id}/certificate${acc ? `?access=${acc}` : ''}`} className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2">License certificate (PDF)</a>
                  </div>
                ) : <p className="mt-2 text-sm text-danger">License {l.status.toLowerCase()}.</p>}
              </Card>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <a href={`/api/orders/${order.id}/invoice${acc ? `?access=${acc}` : ''}`} className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-2" data-testid="invoice-link">Invoice (PDF)</a>
            {user ? <ButtonLink href="/account/library" variant="secondary">Go to my library</ButtonLink> : order.claimToken && <ButtonLink href={`/claim/${order.claimToken}`} variant="secondary">Create account to keep these files</ButtonLink>}
          </div>
          <p className="text-xs text-muted">Download links are generated on click, are single-use and expire after a few minutes, so they can’t be shared.</p>
        </div>
      )}
    </div>
  );
}
