import Link from 'next/link';
import type { Product, ProductPrice } from '@prisma/client';
import type { StoreContext } from '@/server/context';
import { displayPrice } from '@/server/present';
import { Badge, Stars } from './ui';
import { formatNumber } from '@/lib/utils';

export type CardProduct = Product & { prices: ProductPrice[]; category?: { name: string } };

export function ProductCard({ p, ctx, sale = 0, priority = false }: { p: CardProduct; ctx: StoreContext; sale?: number; priority?: boolean }) {
  const price = displayPrice(p.prices, 'PERSONAL', ctx, sale, p.isFree);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_20px_50px_-25px_rgb(var(--accent))]" data-testid="product-card">
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.posterPath ?? ''} alt={`${p.title} — preview render`} width={400} height={400} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {p.isFree && <Badge tone="success">Free</Badge>}
          {p.rigged && <Badge tone="accent">Rigged</Badge>}
          {p.animated && <Badge tone="accent">Animated</Badge>}
          {p.aiProvenance !== 'NONE' && <Badge tone="warning">{p.aiProvenance === 'GENERATED' ? 'AI-generated' : 'AI-assisted'}</Badge>}
        </div>
      </div>
      <div className="p-4">
        <h3 className="truncate font-semibold">
          <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0">{p.title}</Link>
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted">{p.category?.name} · {formatNumber(p.polycount)} tris · {p.formats.slice(0, 3).join(', ')}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-bold">
            {price.text}
            {price.originalText && <s className="ml-2 text-xs font-normal text-muted">{price.originalText}</s>}
          </span>
          {p.ratingCount > 0 && <Stars value={p.ratingAvg} count={p.ratingCount} />}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, ctx, sale }: { items: CardProduct[]; ctx: StoreContext; sale?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p, i) => <ProductCard key={p.id} p={p} ctx={ctx} sale={sale} priority={i < 4} />)}
    </div>
  );
}
