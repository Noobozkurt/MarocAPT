import Link from 'next/link';
import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Orders & invoices' };

const tone = (s: string) => (s === 'PAID' ? 'success' : s.includes('REFUND') || s === 'DISPUTED' ? 'danger' : 'neutral') as 'success' | 'danger' | 'neutral';

export default async function OrdersPage() {
  const u = await requirePageUser('/account/orders');
  const orders = await db.order.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, include: { items: true } });
  return (
    <div>
      <PageHeader title="Orders & invoices" />
      {orders.length === 0 ? <EmptyState title="No orders yet" /> : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left"><tr><th className="p-3">Invoice</th><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="p-3 font-mono"><Link href={`/account/orders/${o.id}`} className="hover:underline">{o.invoiceNumber ?? '—'}</Link></td>
                  <td className="p-3">{formatDate(o.createdAt)}</td>
                  <td className="p-3">{o.items.map((i) => i.title).join(', ')}</td>
                  <td className="p-3">{formatMoney(o.total, o.currency)}</td>
                  <td className="p-3"><Badge tone={tone(o.status)}>{o.status.replace('_', ' ').toLowerCase()}</Badge></td>
                  <td className="p-3">{o.invoiceNumber && <a className="text-accent underline" href={`/api/orders/${o.id}/invoice`}>PDF</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
