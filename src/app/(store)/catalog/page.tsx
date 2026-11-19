import Link from 'next/link';
import type { Metadata } from 'next';
import { LayoutGrid, List } from 'lucide-react';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { getStoreContext } from '@/server/context';
import { activeSale, FLAGS, FORMATS, RESOLUTIONS, SOFTWARE, SORTS, filtersToQuery, parseFilters, searchCatalog } from '@/server/catalog';
import { displayPrice } from '@/server/present';
import { ProductGrid } from '@/components/product-card';
import { AutoSubmitForm } from '@/components/auto-submit-form';
import { Badge, EmptyState, ButtonLink, Stars } from '@/components/ui';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.q ? `Search: ${sp.q}` : 'Catalog', alternates: { canonical: '/catalog' }, robots: sp.q ? { index: false } : undefined };
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const ctx = await getStoreContext();
  const user = await getSessionUser();
  const [result, categories, sale] = await Promise.all([searchCatalog(f, ctx.currency, { log: true, userId: user?.id }), db.category.findMany({ orderBy: { sortOrder: 'asc' } }), activeSale()]);
  const view = sp.view === 'list' ? 'list' : 'grid';
  const pages = Math.ceil(result.total / result.pageSize);
  const checked = (list: string[] | undefined, v: string) => Boolean(list?.includes(v));
  const parsed = result.parsed;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{f.q ? `Results for “${f.q}”` : 'Catalog'}</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">{result.total} asset{result.total === 1 ? '' : 's'}</p>
          {parsed && (parsed.flags.length > 0 || parsed.software.length > 0 || parsed.free || parsed.maxPrice) && (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
              Understood as:
              {parsed.terms.length > 0 && <Badge>{parsed.terms.join(' ')}</Badge>}
              {parsed.flags.map((x) => <Badge key={x} tone="accent">{FLAGS[x]}</Badge>)}
              {parsed.software.map((x) => <Badge key={x} tone="accent">{x}</Badge>)}
              {parsed.free && <Badge tone="success">Free</Badge>}
              {parsed.maxPrice && <Badge>≤ {parsed.maxPrice} {ctx.currency}</Badge>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AutoSubmitForm className="flex items-center gap-2" hidden={{ ...sp, sort: undefined, page: undefined }}>
            <label htmlFor="sort" className="text-sm text-muted">Sort</label>
            <select id="sort" name="sort" defaultValue={f.sort ?? (f.q ? 'relevance' : 'newest')} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </AutoSubmitForm>
          <div className="flex rounded-xl border border-border p-1" role="group" aria-label="Layout">
            <Link href={`/catalog${filtersToQuery(f, { view: undefined })}`} aria-label="Grid view" aria-current={view === 'grid'} className={`grid h-8 w-8 place-items-center rounded-lg ${view === 'grid' ? 'bg-surface-2' : ''}`}><LayoutGrid className="h-4 w-4" aria-hidden /></Link>
            <Link href={`/catalog${filtersToQuery(f, { view: 'list' })}`} aria-label="List view" aria-current={view === 'list'} className={`grid h-8 w-8 place-items-center rounded-lg ${view === 'list' ? 'bg-surface-2' : ''}`}><List className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <details className="group rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" open>
          <summary className="cursor-pointer font-bold lg:hidden">Filters</summary>
          <AutoSubmitForm className="space-y-5 text-sm" hidden={{ q: f.q, sort: f.sort, view: sp.view as string | undefined }} multi>
            <fieldset>
              <legend className="mb-2 font-bold">Category</legend>
              <select name="category" defaultValue={f.category ?? ''} className="h-9 w-full rounded-lg border border-border bg-surface px-2">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Features</legend>
              {Object.entries(FLAGS).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 py-0.5"><input type="checkbox" name="flag" value={k} defaultChecked={checked(f.flags, k)} className="accent-[rgb(var(--accent))]" /> {label}</label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Software</legend>
              {SOFTWARE.map((s) => <label key={s} className="flex items-center gap-2 py-0.5"><input type="checkbox" name="software" value={s} defaultChecked={checked(f.software, s)} /> {s}</label>)}
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">File format</legend>
              <div className="grid grid-cols-3 gap-1">
                {FORMATS.map((s) => <label key={s} className="flex items-center gap-1 py-0.5"><input type="checkbox" name="format" value={s} defaultChecked={checked(f.formats, s)} /> {s}</label>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Texture resolution</legend>
              <div className="flex gap-3">{RESOLUTIONS.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" name="res" value={s} defaultChecked={checked(f.res, s)} /> {s}</label>)}</div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Polycount (tris)</legend>
              <div className="flex gap-2">
                <input aria-label="Minimum polycount" name="polyMin" type="number" min={0} defaultValue={f.polyMin} placeholder="Min" className="h-9 w-full rounded-lg border border-border bg-surface px-2" />
                <input aria-label="Maximum polycount" name="polyMax" type="number" min={0} defaultValue={f.polyMax} placeholder="Max" className="h-9 w-full rounded-lg border border-border bg-surface px-2" />
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Price ({ctx.currency}, Personal)</legend>
              <div className="flex gap-2">
                <input aria-label="Minimum price" name="priceMin" type="number" min={0} defaultValue={f.priceMin} placeholder="Min" className="h-9 w-full rounded-lg border border-border bg-surface px-2" />
                <input aria-label="Maximum price" name="priceMax" type="number" min={0} defaultValue={f.priceMax} placeholder="Max" className="h-9 w-full rounded-lg border border-border bg-surface px-2" />
              </div>
              <div className="mt-2 flex gap-3">
                {[['', 'Any'], ['free', 'Free'], ['paid', 'Paid']].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="radio" name="price" value={v} defaultChecked={(f.price ?? '') === v} /> {l}</label>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">Rating</legend>
              <select name="rating" defaultValue={f.rating ?? ''} className="h-9 w-full rounded-lg border border-border bg-surface px-2">
                <option value="">Any rating</option>
                <option value="4">4★ & up</option>
                <option value="3">3★ & up</option>
              </select>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">AI provenance</legend>
              {[['', 'Show all'], ['exclude', 'Hide AI-generated/assisted'], ['only', 'Only AI-assisted']].map(([v, l]) => <label key={v} className="flex items-center gap-2 py-0.5"><input type="radio" name="ai" value={v} defaultChecked={(f.ai ?? '') === v} /> {l}</label>)}
            </fieldset>
            <p className="text-xs text-muted">All tiers (Personal, Commercial, Extended, Editorial, Team) are available on every asset.</p>
            <noscript><button className="h-9 w-full rounded-lg bg-accent font-semibold text-accent-fg">Apply filters</button></noscript>
            <Link href="/catalog" className="block text-center text-xs text-accent underline">Clear all filters</Link>
          </AutoSubmitForm>
        </details>

        <div>
          {result.items.length === 0 ? (
            <EmptyState title="No assets match" action={<ButtonLink href="/catalog" variant="outline">Clear filters</ButtonLink>}>
              Try fewer filters or different words. We searched titles, descriptions and tags with typo tolerance{f.q ? ` for “${f.q}”` : ''}.
            </EmptyState>
          ) : view === 'grid' ? (
            <ProductGrid items={result.items} ctx={ctx} sale={sale?.percentOff} />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {result.items.map((p) => {
                const price = displayPrice(p.prices, 'PERSONAL', ctx, sale?.percentOff, p.isFree);
                return (
                  <li key={p.id} className="relative flex items-center gap-4 p-4" data-testid="product-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.posterPath ?? ''} alt="" className="h-20 w-20 rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${p.slug}`} className="font-semibold after:absolute after:inset-0">{p.title}</Link>
                      <p className="truncate text-sm text-muted">{p.shortDescription}</p>
                      <p className="mt-1 text-xs text-muted">{p.category.name} · {formatNumber(p.polycount)} tris · {p.formats.join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{price.text}</p>
                      {p.ratingCount > 0 && <Stars value={p.ratingAvg} count={p.ratingCount} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex justify-center gap-2">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={`/catalog${filtersToQuery(f, { page: n === 1 ? undefined : n, view: sp.view as string | undefined })}`} aria-current={n === result.page ? 'page' : undefined} className={`grid h-10 w-10 place-items-center rounded-xl border ${n === result.page ? 'border-accent bg-accent text-accent-fg' : 'border-border hover:bg-surface-2'}`}>
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
