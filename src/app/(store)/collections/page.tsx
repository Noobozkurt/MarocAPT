import Link from 'next/link';
import { db } from '@/lib/db';
import { PageHeader, Card } from '@/components/ui';

export const metadata = { title: 'Collections & bundles' };
export const dynamic = 'force-dynamic';

export default async function CollectionsPage() {
  const [collections, bundles] = await Promise.all([
    db.collection.findMany({ include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' }, take: 4 } } }),
    db.bundle.findMany({ where: { active: true }, include: { items: { include: { product: true } } } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader title="Collections & bundles" subtitle="Curated sets — bundles get an automatic discount when the full set is in your cart." />
      <h2 className="mb-4 text-xl font-bold">Bundles</h2>
      <div className="mb-12 grid gap-4 md:grid-cols-2">
        {bundles.map((b) => (
          <Card key={b.id}>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Save {b.discountType === 'PERCENT' ? `${b.discountValue}%` : `${(b.discountValue / 100).toFixed(2)}`}</p>
            <h3 className="mt-1 text-lg font-bold">{b.title}</h3>
            <p className="text-sm text-muted">{b.description}</p>
            <ul className="mt-3 flex flex-wrap gap-2">{b.items.map((i) => <li key={i.productId}><Link href={`/products/${i.product.slug}`} className="rounded-lg bg-surface-2 px-2 py-1 text-xs hover:underline">{i.product.title}</Link></li>)}</ul>
          </Card>
        ))}
      </div>
      <h2 className="mb-4 text-xl font-bold">Collections</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="group rounded-2xl border border-border bg-surface p-4 hover:border-accent/60">
            <div className="grid grid-cols-4 gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.products.map((cp) => <img key={cp.productId} src={cp.product.posterPath ?? ''} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" />)}
            </div>
            <h3 className="mt-3 font-bold group-hover:underline">{c.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
}
