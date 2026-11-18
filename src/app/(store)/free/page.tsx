import { db } from '@/lib/db';
import { getStoreContext } from '@/server/context';
import { publishedWhere } from '@/server/catalog';
import { ProductGrid } from '@/components/product-card';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Free assets of the month' };
export const dynamic = 'force-dynamic';

export default async function FreePage() {
  const ctx = await getStoreContext();
  const items = await db.product.findMany({ where: { ...publishedWhere(), isFree: true }, include: { prices: { where: { currency: ctx.currency } }, category: { select: { name: true } } } });
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader title="Free assets of the month" subtitle="Add to cart and check out for free — you get a real license certificate and the asset stays in your library." />
      <ProductGrid items={items} ctx={ctx} />
    </div>
  );
}
