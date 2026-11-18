import { db } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { formatMoney } from '@/lib/money';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requirePagePermission('dashboard:view');
  const since = (d: number) => new Date(Date.now() - d * 86400_000);
  const rev = async (d: number) => (await db.order.aggregate({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: since(d) }, currency: 'USD' }, _sum: { total: true }, _count: true }));
  const [d1, d7, d30, openChats, pendingRefunds, zeroSearches] = await Promise.all([
    rev(1), rev(7), rev(30),
    db.conversation.count({ where: { status: { in: ['OPEN', 'PENDING_AGENT'] } } }),
    db.refundRequest.count({ where: { status: 'PENDING' } }),
    db.searchLog.groupBy({ by: ['query'], where: { results: 0 }, _count: true, orderBy: { _count: { query: 'desc' } }, take: 5 }),
  ]);
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="USD revenue shown; other currencies are reported in Finance." />
      <div className="grid gap-4 md:grid-cols-3">
        {[['Today', d1], ['7 days', d7], ['30 days', d30]].map(([k, v]) => {
          const a = v as Awaited<ReturnType<typeof rev>>;
          return <Card key={k as string}><p className="text-sm text-muted">{k as string}</p><p className="text-2xl font-extrabold">{formatMoney(a._sum.total ?? 0, 'USD')}</p><p className="text-xs text-muted">{a._count} orders</p></Card>;
        })}
        <Card><p className="text-sm text-muted">Chats waiting</p><p className="text-2xl font-extrabold">{openChats}</p></Card>
        <Card><p className="text-sm text-muted">Refund requests pending</p><p className="text-2xl font-extrabold">{pendingRefunds}</p></Card>
        <Card><p className="text-sm text-muted">Top zero-result searches</p><ul className="mt-1 text-sm">{zeroSearches.map((z) => <li key={z.query}>{z.query} ({z._count})</li>)}</ul></Card>
      </div>
    </div>
  );
}
