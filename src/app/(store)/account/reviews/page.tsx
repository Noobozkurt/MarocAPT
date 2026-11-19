import Link from 'next/link';
import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { Badge, Card, EmptyState, PageHeader, Stars } from '@/components/ui';

export const metadata = { title: 'My reviews' };

export default async function MyReviews() {
  const u = await requirePageUser('/account/reviews');
  const reviews = await db.review.findMany({ where: { userId: u.id }, include: { product: true }, orderBy: { createdAt: 'desc' } });
  return (
    <div>
      <PageHeader title="My reviews" />
      {reviews.length === 0 ? <EmptyState title="No reviews yet">Review assets you own from their product page.</EmptyState> : (
        <ul className="space-y-3">{reviews.map((r) => <li key={r.id}><Card><div className="flex items-center gap-2"><Link href={`/products/${r.product.slug}`} className="font-semibold hover:underline">{r.product.title}</Link><Stars value={r.rating} /><Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>{r.status.toLowerCase()}</Badge></div><p className="mt-2 text-sm">{r.body}</p></Card></li>)}</ul>
      )}
    </div>
  );
}
