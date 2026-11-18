import { Prisma, type Product, type ProductPrice } from '@prisma/client';
import { db } from '@/lib/db';
import type { Currency } from '@/lib/money';

export const SOFTWARE = ['Blender', 'Maya', '3ds Max', 'Cinema 4D', 'Unreal Engine', 'Unity', 'Godot'] as const;
export const FORMATS = ['GLB', 'GLTF', 'FBX', 'OBJ', 'USDZ', 'BLEND', 'STL', 'MAX', 'MA'] as const;
export const RESOLUTIONS = ['1K', '2K', '4K', '8K'] as const;
export const FLAGS = { rigged: 'Rigged', animated: 'Animated', gameReady: 'Game-ready', lowPoly: 'Low-poly', printable: '3D-printable', uvUnwrapped: 'UV-unwrapped', pbr: 'PBR' } as const;
export type FlagKey = keyof typeof FLAGS;
export const SORTS = { relevance: 'Relevance', newest: 'Newest', bestselling: 'Best-selling', price_asc: 'Price: low to high', price_desc: 'Price: high to low', rating: 'Top rated' } as const;
export type SortKey = keyof typeof SORTS;

export interface CatalogFilters {
  q?: string;
  category?: string;
  software?: string[];
  formats?: string[];
  res?: string[];
  flags?: FlagKey[];
  polyMin?: number;
  polyMax?: number;
  priceMin?: number; // major units
  priceMax?: number;
  rating?: number;
  price?: 'free' | 'paid';
  ai?: 'exclude' | 'only';
  sort?: SortKey;
  page?: number;
}

const arr = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : v.split(',')).filter(Boolean);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v) !== '' ? n : undefined;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): CatalogFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const sort = one('sort') as SortKey | undefined;
  return {
    q: one('q')?.slice(0, 120) || undefined,
    category: one('category') || undefined,
    software: arr(sp.software).filter((s) => (SOFTWARE as readonly string[]).includes(s)),
    formats: arr(sp.format).filter((s) => (FORMATS as readonly string[]).includes(s)),
    res: arr(sp.res).filter((s) => (RESOLUTIONS as readonly string[]).includes(s)),
    flags: arr(sp.flag).filter((s): s is FlagKey => s in FLAGS),
    polyMin: num(one('polyMin')),
    polyMax: num(one('polyMax')),
    priceMin: num(one('priceMin')),
    priceMax: num(one('priceMax')),
    rating: num(one('rating')),
    price: one('price') === 'free' ? 'free' : one('price') === 'paid' ? 'paid' : undefined,
    ai: one('ai') === 'exclude' ? 'exclude' : one('ai') === 'only' ? 'only' : undefined,
    sort: sort && sort in SORTS ? sort : undefined,
    page: Math.max(1, Math.floor(num(one('page')) ?? 1)),
  };
}

// ── Natural-language query understanding ("low-poly medieval tavern props for mobile") ──
const SYNONYMS: Record<string, string[]> = {
  medieval: ['tavern', 'barrel', 'sword', 'viking', 'stool', 'mug', 'potion', 'fantasy'],
  fantasy: ['potion', 'crystal', 'mushroom', 'sword', 'tentacle'],
  tavern: ['barrel', 'stool', 'table', 'mug'],
  props: ['prop'],
  scifi: ['sci-fi', 'crate', 'space', 'planet', 'turbine'],
  'sci-fi': ['crate', 'space', 'planet'],
  space: ['planet', 'moon', 'ring'],
  nature: ['tree', 'pine', 'rock', 'boulder', 'mushroom', 'forest'],
  rock: ['boulder', 'stone'],
  food: ['donut'],
  weapon: ['sword'],
  furniture: ['table', 'stool', 'lamp', 'chair'],
  interior: ['lamp', 'vase', 'table', 'furniture'],
  game: ['chess'],
};
const STOPWORDS = new Set(['a', 'an', 'the', 'for', 'with', 'and', 'or', 'of', 'in', 'to', 'my', 'some', 'asset', 'assets', 'model', 'models', '3d', 'pack', 'set', 'me', 'i', 'need', 'want', 'looking']);

export interface ParsedQuery {
  terms: string[];
  expanded: string[];
  flags: FlagKey[];
  software: string[];
  formats: string[];
  free?: boolean;
  maxPrice?: number;
}

export function understandQuery(q: string): ParsedQuery {
  let text = ` ${q.toLowerCase()} `;
  const flags = new Set<FlagKey>();
  const software: string[] = [];
  const formats: string[] = [];
  const rules: Array<[RegExp, () => void]> = [
    [/\blow[\s-]?poly\b/g, () => flags.add('lowPoly')],
    [/\b(for )?mobile\b|\bgame[\s-]?ready\b|\breal[\s-]?time\b/g, () => (flags.add('gameReady'), undefined)],
    [/\brigged\b/g, () => flags.add('rigged')],
    [/\banimated\b|\banimation\b/g, () => flags.add('animated')],
    [/\b3d[\s-]?print(able|ing)?\b|\bprintable\b/g, () => flags.add('printable')],
    [/\bpbr\b/g, () => flags.add('pbr')],
  ];
  for (const [re, fn] of rules) if (re.test(text)) {
    fn();
    text = text.replace(re, ' ');
  }
  for (const s of ['Blender', 'Maya', 'Unity', 'Unreal', 'Godot', 'Cinema 4D', '3ds Max']) {
    const re = new RegExp(`\\b${s.toLowerCase().replace(' ', '\\s?')}( engine)?\\b`, 'g');
    if (re.test(text)) {
      software.push(s === 'Unreal' ? 'Unreal Engine' : s);
      text = text.replace(re, ' ');
    }
  }
  for (const f of FORMATS) {
    const re = new RegExp(`\\b${f.toLowerCase()}\\b`, 'g');
    if (re.test(text)) {
      formats.push(f);
      text = text.replace(re, ' ');
    }
  }
  let free: boolean | undefined;
  if (/\bfree\b/.test(text)) {
    free = true;
    text = text.replace(/\bfree\b/g, ' ');
  }
  let maxPrice: number | undefined;
  const m = /\b(under|below|less than|max)\s*\$?€?£?\s*(\d+)/.exec(text);
  if (m) {
    maxPrice = Number(m[2]);
    text = text.replace(m[0], ' ');
  }
  const terms = text.split(/[^a-z0-9-]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t)).map((t) => t.replace(/s$/, ''));
  const expanded = [...new Set(terms.flatMap((t) => [t, ...(SYNONYMS[t] ?? [])]))];
  return { terms, expanded, flags: [...flags], software, formats, free, maxPrice };
}

/** Ids matching free text, scored by full-text rank + trigram similarity (typo tolerant). */
async function textSearchIds(q: string, expanded: string[]): Promise<Map<string, number>> {
  const words = expanded.length ? expanded : [q.toLowerCase()];
  const tsq = words.map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean).join(' | ');
  const rows = await db.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
    SELECT p.id,
      (ts_rank(to_tsvector('english', p.title || ' ' || p."shortDescription" || ' ' || array_to_string(p.tags, ' ')), to_tsquery('english', ${tsq || 'x'})) * 2
       + similarity(p.title, ${q})
       + COALESCE((SELECT MAX(similarity(t, w)) FROM unnest(p.tags) t, unnest(${words}::text[]) w), 0)) AS score
    FROM "Product" p
    WHERE p.status = 'PUBLISHED' AND (
      to_tsvector('english', p.title || ' ' || p."shortDescription" || ' ' || array_to_string(p.tags, ' ')) @@ to_tsquery('english', ${tsq || 'x'})
      OR similarity(p.title, ${q}) > 0.18
      OR word_similarity(${q}, p.title) > 0.45
      OR EXISTS (SELECT 1 FROM unnest(p.tags) t, unnest(${words}::text[]) w WHERE similarity(t, w) > 0.45)
    )
    ORDER BY score DESC
    LIMIT 300`);
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

export type CatalogProduct = Product & { prices: ProductPrice[]; category: { name: string; slug: string } };

export interface CatalogResult {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  parsed?: ParsedQuery;
}

export const PAGE_SIZE = 12;

export function publishedWhere(): Prisma.ProductWhereInput {
  return { OR: [{ status: 'PUBLISHED' }, { status: 'SCHEDULED', publishAt: { lte: new Date() } }] };
}

export async function searchCatalog(f: CatalogFilters, currency: Currency, opts: { log?: boolean; userId?: string } = {}): Promise<CatalogResult> {
  const where: Prisma.ProductWhereInput[] = [publishedWhere()];
  let parsed: ParsedQuery | undefined;
  let scores: Map<string, number> | undefined;
  const flags = new Set(f.flags);
  const software = new Set(f.software);
  const formats = new Set(f.formats);
  let priceMax = f.priceMax;
  let price = f.price;

  if (f.q) {
    parsed = understandQuery(f.q);
    parsed.flags.forEach((x) => flags.add(x));
    parsed.software.forEach((x) => software.add(x));
    parsed.formats.forEach((x) => formats.add(x));
    if (parsed.free) price = 'free';
    if (parsed.maxPrice !== undefined) priceMax = Math.min(priceMax ?? Infinity, parsed.maxPrice);
    if (parsed.terms.length) {
      scores = await textSearchIds(parsed.terms.join(' '), parsed.expanded);
      where.push({ id: { in: [...scores.keys()] } });
    }
  }
  if (f.category) where.push({ category: { slug: f.category } });
  if (software.size) where.push({ software: { hasSome: [...software] } });
  if (formats.size) where.push({ formats: { hasSome: [...formats] } });
  if (f.res?.length) where.push({ textureRes: { in: f.res } });
  for (const flag of flags) where.push({ [flag]: true });
  if (f.polyMin !== undefined) where.push({ polycount: { gte: f.polyMin } });
  if (f.polyMax !== undefined) where.push({ polycount: { lte: f.polyMax } });
  if (f.rating) where.push({ ratingAvg: { gte: f.rating } });
  if (price === 'free') where.push({ isFree: true });
  if (price === 'paid') where.push({ isFree: false });
  if (f.ai === 'exclude') where.push({ aiProvenance: 'NONE' });
  if (f.ai === 'only') where.push({ aiProvenance: { not: 'NONE' } });
  if (f.priceMin !== undefined || priceMax !== undefined) {
    where.push({
      prices: { some: { tier: 'PERSONAL', currency, amount: { gte: f.priceMin !== undefined ? Math.round(f.priceMin * 100) : undefined, lte: priceMax !== undefined ? Math.round(priceMax * 100) : undefined } } },
    });
  }

  const all = await db.product.findMany({
    where: { AND: where },
    include: { prices: { where: { currency } }, category: { select: { name: true, slug: true } } },
    take: 500,
  });

  const personal = (p: CatalogProduct) => p.prices.find((x) => x.tier === 'PERSONAL')?.amount ?? 0;
  const sort = f.sort ?? (scores ? 'relevance' : 'newest');
  all.sort((a, b) => {
    switch (sort) {
      case 'relevance':
        return (scores?.get(b.id) ?? 0) - (scores?.get(a.id) ?? 0) || b.salesCount - a.salesCount;
      case 'bestselling':
        return b.salesCount - a.salesCount;
      case 'price_asc':
        return personal(a) - personal(b);
      case 'price_desc':
        return personal(b) - personal(a);
      case 'rating':
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  if (f.q && opts.log) {
    await db.searchLog.create({ data: { query: f.q.toLowerCase().slice(0, 120), results: all.length, userId: opts.userId } }).catch(() => undefined);
  }
  const page = f.page ?? 1;
  return { items: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: all.length, page, pageSize: PAGE_SIZE, parsed };
}

export function filtersToQuery(f: CatalogFilters, patch: Partial<Record<string, string | string[] | number | undefined>> = {}): string {
  const p = new URLSearchParams();
  const base: Record<string, unknown> = {
    q: f.q, category: f.category, software: f.software?.join(','), format: f.formats?.join(','), res: f.res?.join(','), flag: f.flags?.join(','),
    polyMin: f.polyMin, polyMax: f.polyMax, priceMin: f.priceMin, priceMax: f.priceMax, rating: f.rating, price: f.price, ai: f.ai, sort: f.sort,
    page: f.page && f.page > 1 ? f.page : undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val !== undefined && val !== '' && val !== null) p.set(k, String(val));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function getProductBySlug(slug: string, currency: Currency) {
  return db.product.findFirst({
    where: { slug, ...publishedWhere() },
    include: {
      prices: { where: { currency } },
      category: true,
      versions: { orderBy: { createdAt: 'desc' }, include: { files: { select: { id: true, format: true, fileName: true, size: true } } } },
      reviews: { where: { status: 'APPROVED' }, orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }], take: 20, include: { user: { select: { name: true } } } },
      questions: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { name: true } } } },
      bundleItems: { include: { bundle: { include: { items: { include: { product: { include: { prices: { where: { currency } } } } } } } } } },
    },
  });
}

export async function relatedProducts(productId: string, categoryId: string, tags: string[], currency: Currency, take = 4) {
  return db.product.findMany({
    where: { AND: [publishedWhere(), { id: { not: productId } }, { OR: [{ categoryId }, { tags: { hasSome: tags } }] }] },
    include: { prices: { where: { currency } }, category: { select: { name: true, slug: true } } },
    orderBy: { salesCount: 'desc' },
    take,
  });
}

/** "Frequently bought together": products co-occurring in paid orders with this one. */
export async function boughtTogether(productId: string, currency: Currency, take = 3) {
  const rows = await db.$queryRaw<Array<{ productId: string; n: bigint }>>(Prisma.sql`
    SELECT oi2."productId", COUNT(*) AS n FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi1."orderId" = oi2."orderId" AND oi2."productId" <> oi1."productId"
    JOIN "Order" o ON o.id = oi1."orderId" AND o.status = 'PAID'
    WHERE oi1."productId" = ${productId}
    GROUP BY oi2."productId" ORDER BY n DESC LIMIT ${take}`);
  if (!rows.length) return [];
  const products = await db.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) }, ...publishedWhere() },
    include: { prices: { where: { currency } }, category: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => products.find((p) => p.id === r.productId)).filter(Boolean) as typeof products;
}

export async function activeSale() {
  const now = new Date();
  return db.sale.findFirst({ where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { percentOff: 'desc' } });
}
