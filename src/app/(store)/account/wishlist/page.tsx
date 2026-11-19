import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { getStoreContext } from '@/server/context';
import { activeSale } from '@/server/catalog';
import { ProductGrid } from '@/components/product-card';
import { EmptyState, PageHeader, ButtonLink } from '@/components/ui';

export const metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  const u = await requirePageUser('/account/wishlist');
  const ctx = await getStoreContext();
  const items = await db.wishlistItem.findMany({ where: { userId: u.id }, include: { product: { include: { prices: { where: { currency: ctx.currency } }, category: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } });
  const sale = await activeSale();
  return (
    <div>
      <PageHeader title="Wishlist" subtitle="We’ll email you when something here goes on sale or drops in price (manage in Settings)." />
      {items.length === 0 ? <EmptyState title="Nothing saved yet" action={<ButtonLink href="/catalog">Find assets</ButtonLink>} /> : <ProductGrid items={items.map((i) => i.product)} ctx={ctx} sale={sale?.percentOff} />}
    </div>
  );
}
