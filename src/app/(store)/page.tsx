import Link from 'next/link';
import { ArrowRight, Download, RefreshCw, ShieldCheck, BadgeCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { t } from '@/lib/i18n';
import { getStoreContext } from '@/server/context';
import { activeSale, publishedWhere } from '@/server/catalog';
import { ProductGrid } from '@/components/product-card';
import { ModelViewer3D } from '@/components/viewer/model-viewer-3d';
import { SaleCountdown } from '@/components/sale-countdown';
import { ButtonLink } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const ctx = await getStoreContext();
  const sale = await activeSale();
  const inc = { prices: { where: { currency: ctx.currency } }, category: { select: { name: true } } } as const;
  const [hero, featured, newest, trending, staff, categories, collections, freeSetting] = await Promise.all([
    db.product.findFirst({ where: { slug: 'tavern-barrel', ...publishedWhere() } }),
    db.product.findMany({ where: { ...publishedWhere(), isFeatured: true }, include: inc, take: 4 }),
    db.product.findMany({ where: publishedWhere(), include: inc, orderBy: { createdAt: 'desc' }, take: 4 }),
    db.product.findMany({ where: publishedWhere(), include: inc, orderBy: { salesCount: 'desc' }, take: 4 }),
    db.product.findMany({ where: { ...publishedWhere(), isStaffPick: true }, include: inc, take: 4 }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } }),
    db.collection.findMany({ where: { isFeatured: true }, include: { _count: { select: { products: true } } }, take: 4 }),
    db.setting.findUnique({ where: { key: 'store.freeAssetOfMonth' } }),
  ]);
  const free = freeSetting ? await db.product.findUnique({ where: { id: (freeSetting.value as { productId: string }).productId } }) : null;
  const s = sale?.percentOff ?? 0;
  const L = ctx.locale;

  return (
    <div>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_30%,rgb(var(--accent)/0.25),transparent)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-semibold text-muted">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> 20 new CC0 sample assets · GLB, OBJ, STL
            </p>
            <h1 className="text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">{t(L, 'hero.title')}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{t(L, 'hero.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/catalog" size="lg">{t(L, 'hero.cta')} <ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink>
              {free && <ButtonLink href={`/products/${free.slug}`} size="lg" variant="outline">{t(L, 'hero.free')}</ButtonLink>}
            </div>
            {sale && <p className="mt-6 text-sm font-semibold text-accent">{sale.bannerText} — <SaleCountdown endsAt={sale.endsAt.toISOString()} /></p>}
          </div>
          {hero?.previewGlbPath && (
            <div className="glass rounded-3xl p-2">
              <ModelViewer3D url={hero.previewGlbPath} poster={hero.posterPath} title={hero.title} variant="hero" />
              <p className="px-3 py-2 text-xs text-muted">Drag to orbit · <Link className="underline" href={`/products/${hero.slug}`}>{hero.title}</Link></p>
            </div>
          )}
        </div>
      </section>

      <section aria-label="Why buy here" className="border-y border-border bg-surface/40">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 text-sm font-semibold md:grid-cols-4">
          {[[ShieldCheck, t(L, 'trust.secure')], [Download, t(L, 'trust.instant')], [BadgeCheck, t(L, 'trust.license')], [RefreshCw, t(L, 'trust.updates')]].map(([Icon, label]) => {
            const I = Icon as typeof ShieldCheck;
            return <li key={label as string} className="flex items-center gap-2"><I className="h-5 w-5 text-accent" aria-hidden />{label as string}</li>;
          })}
        </ul>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16">
        {[[t(L, 'home.featured'), featured, '/catalog?sort=relevance'], [t(L, 'home.new'), newest, '/catalog?sort=newest'], [t(L, 'home.trending'), trending, '/catalog?sort=bestselling'], [t(L, 'home.staff'), staff, '/collections/staff-picks']].map(([title, items, href]) => (
          <section key={title as string} aria-labelledby={`h-${title}`}>
            <div className="mb-6 flex items-end justify-between">
              <h2 id={`h-${title}`} className="text-2xl font-extrabold tracking-tight">{title as string}</h2>
              <Link href={href as string} className="text-sm font-semibold text-accent">View all →</Link>
            </div>
            <ProductGrid items={items as never} ctx={ctx} sale={s} />
          </section>
        ))}

        <section aria-labelledby="h-cats">
          <h2 id="h-cats" className="mb-6 text-2xl font-extrabold tracking-tight">{t(L, 'home.categories')}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/catalog?category=${c.slug}`} className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 hover:border-accent/60">
                <div aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl" style={{ background: `hsl(${(i * 47) % 360} 80% 60%)` }} />
                <h3 className="font-bold">{c.name}</h3>
                <p className="mt-1 text-xs text-muted">{c._count.products} assets</p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="h-col" className="grid gap-4 md:grid-cols-4">
          <h2 id="h-col" className="sr-only">Collections</h2>
          {collections.map((c) => (
            <Link key={c.id} href={`/collections/${c.slug}`} className="glass rounded-2xl p-6 hover:border-accent/60">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Collection</p>
              <h3 className="mt-2 text-lg font-bold">{c.title}</h3>
              <p className="text-sm text-muted">{c._count.products} assets</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
