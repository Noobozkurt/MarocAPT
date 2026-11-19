import Link from 'next/link';
import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import { Badge, Card, PageHeader, EmptyState, ButtonLink } from '@/components/ui';

export const metadata = { title: 'Account' };

export default async function AccountDashboard() {
  const u = await requirePageUser();
  const [orders, licenses, chats, user] = await Promise.all([
    db.order.findMany({ where: { userId: u.id, status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: 5, include: { items: true } }),
    db.license.findMany({ where: { userId: u.id, status: 'ACTIVE' }, include: { product: true } }),
    db.conversation.findMany({ where: { customerId: u.id, status: { notIn: ['RESOLVED', 'CLOSED'] } }, orderBy: { lastMessageAt: 'desc' }, take: 5 }),
    db.user.findUniqueOrThrow({ where: { id: u.id } }),
  ]);
  const updates = licenses.filter((l) => l.lastSeenVersion !== l.product.currentVersion);
  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back${user.name ? `, ${user.name.split(' ')[0]}` : ''}`} subtitle={`${licenses.length} assets in your library${user.storeCredit ? ` · ${formatMoney(user.storeCredit, 'USD')} store credit` : ''}`} />
      {!user.emailVerified && <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Please verify your email to attach guest purchases to this account.</div>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-muted">Assets owned</p><p className="text-3xl font-extrabold">{licenses.length}</p></Card>
        <Card><p className="text-sm text-muted">Updates available</p><p className="text-3xl font-extrabold">{updates.length}</p></Card>
        <Card><p className="text-sm text-muted">Open support chats</p><p className="text-3xl font-extrabold">{chats.length}</p></Card>
      </div>
      {updates.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold">Updates available</h2>
          <ul className="space-y-2 text-sm">{updates.map((l) => <li key={l.id} className="flex justify-between"><span>{l.product.title} <Badge tone="accent">v{l.product.currentVersion}</Badge></span><Link href="/account/library" className="text-accent underline">Download</Link></li>)}</ul>
        </Card>
      )}
      <Card>
        <h2 className="mb-3 font-bold">Recent purchases</h2>
        {orders.length === 0 ? <EmptyState title="No purchases yet" action={<ButtonLink href="/catalog">Browse the catalog</ButtonLink>} /> : (
          <ul className="divide-y divide-border text-sm">{orders.map((o) => <li key={o.id} className="flex justify-between py-2"><Link href={`/account/orders/${o.id}`} className="hover:underline">{o.invoiceNumber} · {o.items.map((i) => i.title).join(', ')}</Link><span className="text-muted">{formatDate(o.createdAt)} · {formatMoney(o.total, o.currency)}</span></li>)}</ul>
        )}
      </Card>
      {chats.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold">Open support chats</h2>
          <ul className="space-y-2 text-sm">{chats.map((c) => <li key={c.id}><Link href={`/support/chat?c=${c.id}`} className="hover:underline">{c.subject}</Link> <Badge>{c.status.replace('_', ' ').toLowerCase()}</Badge></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
