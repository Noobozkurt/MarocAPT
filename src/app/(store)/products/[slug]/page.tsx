import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BadgeCheck, Bot } from 'lucide-react';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { LICENSE_TIERS } from '@/lib/licenses';
import { renderSafeMarkdown } from '@/lib/sanitize';
import { absoluteUrl, formatBytes, formatDate, formatNumber } from '@/lib/utils';
import { STORE_NAME } from '@/lib/env';
import { getStoreContext } from '@/server/context';
import { activeSale, boughtTogether, getProductBySlug, relatedProducts } from '@/server/catalog';
import { displayPrice } from '@/server/present';
import { ModelViewer3D } from '@/components/viewer/model-viewer-3d';
import { ProductGrid } from '@/components/product-card';
import { HelpfulButton, LicenseSelector, QuestionForm, ReportProblemButton, ReviewForm, ShareButton, WishlistButton } from '@/components/product-client';
import { Badge, Card, Stars } from '@/components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await db.product.findUnique({ where: { slug } });
  if (!p) return { title: 'Not found' };
  return {
    title: p.seoTitle ?? p.title,
    description: p.seoDescription ?? p.shortDescription,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.title, description: p.shortDescription, images: p.posterPath ? [{ url: p.posterPath, width: 800, height: 800, alt: p.title }] : [], type: 'website' },
    twitter: { card: 'summary_large_image', title: p.title, description: p.shortDescription },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getStoreContext();
  const product = await getProductBySlug(slug, ctx.currency);
  if (!product) notFound();
  const [user, sale] = await Promise.all([getSessionUser(), activeSale()]);
  const [related, together, wish, owned] = await Promise.all([
    relatedProducts(product.id, product.categoryId, product.tags, ctx.currency),
    boughtTogether(product.id, ctx.currency),
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: product.id } } }) : null,
    user ? db.license.findFirst({ where: { userId: user.id, productId: product.id, status: 'ACTIVE' } }) : null,
  ]);
  const prices = Object.fromEntries(LICENSE_TIERS.map((t) => [t, displayPrice(product.prices, t, ctx, sale?.percentOff, product.isFree)]));
  const specs = product.specs as Record<string, unknown>;
  const latest = product.versions[0];
  const bundle = product.bundleItems[0]?.bundle;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: product.shortDescription,
      image: product.posterPath ? absoluteUrl(product.posterPath) : undefined,
      sku: product.id,
      brand: { '@type': 'Brand', name: STORE_NAME },
      category: product.category.name,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: ctx.currency,
        lowPrice: (prices.PERSONAL!.amount / 100).toFixed(2),
        highPrice: (prices.EXTENDED!.amount / 100).toFixed(2),
        offerCount: LICENSE_TIERS.length,
        availability: 'https://schema.org/InStock',
        url: absoluteUrl(`/products/${product.slug}`),
      },
      ...(product.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount } } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Catalog', item: absoluteUrl('/catalog') },
        { '@type': 'ListItem', position: 2, name: product.category.name, item: absoluteUrl(`/catalog?category=${product.category.slug}`) },
        { '@type': 'ListItem', position: 3, name: product.title, item: absoluteUrl(`/products/${product.slug}`) },
      ],
    },
  ];

  const specRows: Array<[string, string]> = [
    ['Polycount', `${formatNumber(product.polycount)} tris · ${formatNumber(product.vertices)} verts`],
    ['Formats', latest?.files.map((f) => `${f.format} (${formatBytes(f.size)})`).join(', ') || product.formats.join(', ')],
    ['Texture maps', ((specs.textureMaps as string[]) ?? []).join(', ') + (product.textureRes ? ` · ${product.textureRes}` : '')],
    ['Rigging / animation', [product.rigged ? `Rigged (${specs.bones ?? '?'} bones)` : 'Not rigged', product.animated ? `${specs.animations ?? 1} animation clip(s)` : 'No animation'].join(' · ')],
    ['Scale & units', `${String(specs.units ?? 'meters')}, ${String(specs.upAxis ?? 'Y')}-up${specs.bbox ? ` · bounds ${JSON.stringify((specs.bbox as { max: number[] }).max)}` : ''}`],
    ['Tested in', ((specs.testedIn as string[]) ?? []).join(', ')],
    ['Renderer', String(specs.renderer ?? '—')],
    ['Compatibility', product.software.join(', ')],
    ['Features', [product.pbr && 'PBR', product.gameReady && 'Game-ready', product.lowPoly && 'Low-poly', product.printable && '3D-printable', product.uvUnwrapped && 'UV-unwrapped'].filter(Boolean).join(' · ') || '—'],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/catalog" className="hover:text-fg">Catalog</Link> /</li>
          <li><Link href={`/catalog?category=${product.category.slug}`} className="hover:text-fg">{product.category.name}</Link> /</li>
          <li aria-current="page" className="text-fg">{product.title}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {product.previewGlbPath && <ModelViewer3D url={product.previewGlbPath} poster={product.posterPath} title={product.title} />}
          <p className="text-xs text-muted">The interactive preview is a decimated, compressed web version (≈35% of source polygons). Purchased files are full resolution.</p>

          <section aria-labelledby="desc" className="prose-s3d">
            <h2 id="desc" className="sr-only">Description</h2>
            <div dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(product.description) }} />
          </section>

          <Card as="section">
            <h2 className="mb-4 text-lg font-bold">Technical specs</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {specRows.map(([k, v]) => (
                  <tr key={k}><th scope="row" className="w-44 py-2 pr-4 text-left font-medium text-muted">{k}</th><td className="py-2">{v}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card as="section">
            <h2 className="mb-4 text-lg font-bold">Version history</h2>
            <ol className="space-y-3">
              {product.versions.map((v, i) => (
                <li key={v.id} className="flex gap-3 text-sm">
                  <Badge tone={i === 0 ? 'accent' : 'neutral'}>v{v.version}</Badge>
                  <div><p>{v.changelog}</p><p className="text-xs text-muted">{formatDate(v.createdAt, ctx.locale)}</p></div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted">Buyers get every future update for free, and older versions stay downloadable.</p>
          </Card>

          <section aria-labelledby="reviews" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="reviews" className="text-lg font-bold">Reviews</h2>
              {product.ratingCount > 0 && <Stars value={product.ratingAvg} count={product.ratingCount} size="md" />}
            </div>
            {product.reviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
            <ul className="space-y-3">
              {product.reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="font-semibold">{r.title}</span>
                    {r.verified && <Badge tone="success"><BadgeCheck className="h-3 w-3" aria-hidden /> Verified purchase</Badge>}
                  </div>
                  <p className="mt-2 text-sm">{r.body}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted"><span>{r.user.name?.split(' ')[0]} · {formatDate(r.createdAt, ctx.locale)}</span><HelpfulButton reviewId={r.id} count={r.helpfulCount} /></div>
                </li>
              ))}
            </ul>
            {owned ? <ReviewForm productId={product.id} /> : <p className="text-xs text-muted">Only verified buyers can review this asset.</p>}
          </section>

          <section aria-labelledby="qa" className="space-y-3">
            <h2 id="qa" className="text-lg font-bold">Questions & answers</h2>
            {product.questions.map((q) => (
              <div key={q.id} className="rounded-2xl border border-border p-4 text-sm">
                <p className="font-semibold">Q: {q.body}</p>
                {q.answer && <p className="mt-1 text-muted">A: {q.answer}</p>}
              </div>
            ))}
            {user ? <QuestionForm productId={product.id} /> : <p className="text-xs text-muted"><Link href={`/login?next=/products/${product.slug}`} className="underline">Sign in</Link> to ask a question.</p>}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
          <div>
            <div className="mb-2 flex flex-wrap gap-1">
              {product.isFree && <Badge tone="success">Free</Badge>}
              {product.rigged && <Badge tone="accent">Rigged</Badge>}
              {product.animated && <Badge tone="accent">Animated</Badge>}
              {product.gameReady && <Badge>Game-ready</Badge>}
              {product.printable && <Badge>3D-printable</Badge>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight" data-testid="product-title">{product.title}</h1>
            <p className="mt-2 text-muted">{product.shortDescription}</p>
            <div className="mt-2 flex items-center gap-3 text-sm">{product.ratingCount > 0 && <Stars value={product.ratingAvg} count={product.ratingCount} />}<span className="text-muted">v{product.currentVersion}</span></div>
          </div>
          {product.aiProvenance !== 'NONE' && (
            <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm" role="note">
              <Bot className="h-5 w-5 flex-none text-warning" aria-hidden />
              <span><strong>{product.aiProvenance === 'GENERATED' ? 'AI-generated' : 'AI-assisted'}.</strong> {product.aiProvenance === 'GENERATED' ? 'This asset was created with generative AI and reviewed by our team.' : 'Parts of this asset were made with AI tools, then finished by an artist.'} {product.c2paManifestUrl ? <a className="underline" href={product.c2paManifestUrl}>View C2PA content credentials</a> : 'No C2PA manifest is available for this asset.'}</span>
            </div>
          )}
          {owned && <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-sm">You own this ({owned.tier.toLowerCase()} license). <Link href="/account/library" className="font-semibold underline">Go to library</Link></div>}
          <Card><LicenseSelector product={{ id: product.id, title: product.title, slug: product.slug, posterPath: product.posterPath }} prices={prices} freeProduct={product.isFree} /></Card>
          <div className="flex flex-wrap items-center gap-2">
            <WishlistButton productId={product.id} initial={Boolean(wish)} signedIn={Boolean(user)} />
            <ShareButton title={product.title} />
            <ReportProblemButton productId={product.id} title={product.title} />
          </div>
          {bundle && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Complete the set · save {bundle.discountType === 'PERCENT' ? `${bundle.discountValue}%` : ''}</p>
              <h2 className="mt-1 font-bold">{bundle.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {bundle.items.map((i) => <li key={i.productId}><Link href={`/products/${i.product.slug}`} className="hover:underline">{i.product.title}</Link></li>)}
              </ul>
              <p className="mt-3 text-xs text-muted">Add all {bundle.items.length} to your cart and the discount applies automatically.</p>
            </Card>
          )}
        </aside>
      </div>

      {together.length > 0 && (
        <section className="mt-16"><h2 className="mb-6 text-2xl font-extrabold">Frequently bought together</h2><ProductGrid items={together} ctx={ctx} sale={sale?.percentOff} /></section>
      )}
      {related.length > 0 && (
        <section className="mt-16"><h2 className="mb-6 text-2xl font-extrabold">You may also like</h2><ProductGrid items={related} ctx={ctx} sale={sale?.percentOff} /></section>
      )}
    </div>
  );
}
