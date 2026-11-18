import { json, route } from '@/lib/api';
import { searchCatalog } from '@/server/catalog';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/utils';

export const GET = route(async (req) => {
  await enforceRateLimit(`suggest:${clientIp(req.headers)}`, 120, 60);
  const q = new URL(req.url).searchParams.get('q')?.slice(0, 80) ?? '';
  if (q.trim().length < 2) return json({ items: [] });
  const r = await searchCatalog({ q, sort: 'relevance' }, 'USD');
  return json({ items: r.items.slice(0, 6).map((p) => ({ slug: p.slug, title: p.title, category: p.category.name, posterPath: p.posterPath })) }, { headers: { 'Cache-Control': 'public, max-age=30' } });
});
