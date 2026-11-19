import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { absoluteUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, collections, articles] = await Promise.all([
    db.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ select: { slug: true } }),
    db.helpArticle.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticPages = ['/', '/catalog', '/collections', '/free', '/help', '/license', '/about', '/contact', '/verify', ...['terms', 'privacy', 'cookies', 'refunds', 'accessibility', 'imprint'].map((p) => `/legal/${p}`)];
  return [
    ...staticPages.map((p) => ({ url: absoluteUrl(p), changeFrequency: 'weekly' as const, priority: p === '/' ? 1 : 0.6 })),
    ...products.map((p) => ({ url: absoluteUrl(`/products/${p.slug}`), lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...collections.map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`), changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...articles.map((a) => ({ url: absoluteUrl(`/help/${a.slug}`), lastModified: a.updatedAt, priority: 0.4 })),
  ];
}
