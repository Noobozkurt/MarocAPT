import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { TIERS, type Tier } from '@/lib/licenses';
import { formatMoney } from '@/lib/money';
import { bpsToPercent } from '@/lib/tax';
import { formatDate } from '@/lib/utils';
import { Badge, Card, PageHeader } from '@/components/ui';
import { OpenChatButton } from '@/components/open-chat-button';

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePageUser('/account/orders');
  const { id } = await params;
  const order = await db.order.findFirst({ where: { id, userId: u.id }, include: { items: { include: { license: true } }, refunds: true } });
  if (!order) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={`Order ${order.invoiceNumber ?? ''}`} subtitle={`${formatDate(order.createdAt)} · ${order.status.toLowerCase()}`} actions={order.invoiceNumber ? <a href={`/api/orders/${order.id}/invoice`} className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">Download invoice (PDF)</a> : null} />
      <Card>
        <ul className="divide-y divide-border text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between py-3">
              <span>{i.title} · {TIERS[i.tier as Tier].name}{i.seats > 1 ? ` × ${i.seats}` : ''} {i.license && <Badge tone={i.license.status === 'ACTIVE' ? 'success' : 'danger'}>{i.license.status.toLowerCase()}</Badge>}</span>
              <span>{formatMoney(i.totalAmount, order.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal, order.currency)}</dd></div>
          {order.discountTotal > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{formatMoney(order.discountTotal, order.currency)}</dd></div>}
          <div className="flex justify-between"><dt>{order.taxMode === 'REVERSE_CHARGE' ? 'VAT (reverse charge)' : `Tax ${bpsToPercent(order.taxRateBps)}`}</dt><dd>{formatMoney(order.taxTotal, order.currency)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatMoney(order.total, order.currency)}</dd></div>
          {order.amountRefunded > 0 && <div className="flex justify-between text-danger"><dt>Refunded</dt><dd>−{formatMoney(order.amountRefunded, order.currency)}</dd></div>}
        </dl>
      </Card>
      <Card>
        <h2 className="font-bold">Need a corrected invoice?</h2>
        <p className="mt-1 text-sm text-muted">If your company name or VAT ID was missing, we can reissue the invoice. Reverse charge can only be applied with a VAT ID that validates in VIES.</p>
        <div className="mt-3"><OpenChatButton topic="ORDER_PAYMENT" subject={`VAT-corrected invoice for ${order.invoiceNumber}`} label="Request a corrected invoice" /></div>
      </Card>
    </div>
  );
}
