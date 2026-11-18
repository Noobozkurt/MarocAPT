import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { formatMoney } from '@/lib/money';
import { absoluteUrl } from '@/lib/utils';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Referrals' };

export default async function ReferralsPage() {
  const u = await requirePageUser('/account/referrals');
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  const [clicks, signups, conversions] = await Promise.all([
    db.referralClick.count({ where: { referrerId: u.id } }),
    db.user.count({ where: { referredById: u.id } }),
    db.order.aggregate({ where: { referrerId: u.id, status: 'PAID' }, _count: true, _sum: { total: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Referrals" subtitle="Share your link. You earn 10% of every first purchase (USD) as store credit." />
      <Card><p className="text-sm text-muted">Your link</p><p className="mt-1 break-all font-mono text-lg">{absoluteUrl(`/r/${user.referralCode}`)}</p></Card>
      <div className="grid gap-4 sm:grid-cols-4">
        {[['Clicks', clicks], ['Sign-ups', signups], ['Conversions', conversions._count], ['Credit balance', formatMoney(user.storeCredit, 'USD')]].map(([k, v]) => <Card key={k as string}><p className="text-sm text-muted">{k}</p><p className="text-2xl font-extrabold">{v}</p></Card>)}
      </div>
    </div>
  );
}
