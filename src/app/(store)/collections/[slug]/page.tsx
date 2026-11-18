import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getStoreContext } from '@/server/context';
import { activeSale, publishedWhere } from '@/server/catalog';
import { ProductGrid } from '@/components/product-card';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getStoreContext();
  const c = await db.collection.findUnique({ where: { slug }, include: { products: { orderBy: { sortOrder: 'asc' }, include: { product: { include: { prices: { where: { currency: ctx.currency } }, category: { select: { name: true } } } } } } } });
  if (!c) notFound();
  const sale = await activeSale();
  const items = c.products.map((p) => p.product).filter((p) => p.status === 'PUBLISHED');
  void publishedWhere;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader title={c.title} subtitle={c.description ?? `${items.length} assets`} />
      <ProductGrid items={items} ctx={ctx} sale={sale?.percentOff} />
    </div>
  );
}
