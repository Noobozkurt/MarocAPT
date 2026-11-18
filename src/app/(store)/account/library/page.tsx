import Link from 'next/link';
import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { TIERS, upgradeTargets, type Tier } from '@/lib/licenses';
import { formatBytes, formatDate } from '@/lib/utils';
import { DownloadButton } from '@/components/download-button';
import { LibraryLive, UpgradeButton } from '@/components/library-client';
import { Badge, Card, EmptyState, PageHeader, ButtonLink, Input, Select } from '@/components/ui';

export const metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; tier?: string }> }) {
  const u = await requirePageUser('/account/library');
  const { q, tier } = await searchParams;
  const licenses = await db.license.findMany({
    where: {
      userId: u.id,
      status: 'ACTIVE',
      ...(tier ? { tier: tier as Tier } : {}),
      ...(q ? { product: { title: { contains: q, mode: 'insensitive' } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { order: true, product: { include: { versions: { orderBy: { createdAt: 'desc' }, include: { files: true } } } } },
  });
  return (
    <div>
      <LibraryLive />
      <PageHeader title="Library" subtitle="Every asset you own. Downloads are single-use links that expire after 5 minutes." />
      <form className="mb-6 flex flex-wrap gap-2" role="search">
        <label htmlFor="lib-q" className="sr-only">Search your library</label>
        <Input id="lib-q" name="q" defaultValue={q} placeholder="Search your library" className="max-w-xs" />
        <label htmlFor="lib-tier" className="sr-only">License tier</label>
        <Select id="lib-tier" name="tier" defaultValue={tier ?? ''}><option value="">All licenses</option>{Object.values(TIERS).map((t) => <option key={t.tier} value={t.tier}>{t.name}</option>)}</Select>
        <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold">Filter</button>
      </form>
      {licenses.length === 0 ? (
        <EmptyState title={q || tier ? 'Nothing matches' : 'Your library is empty'} action={<ButtonLink href="/catalog">Browse the catalog</ButtonLink>}>Purchased and free assets appear here instantly after checkout.</EmptyState>
      ) : (
        <ul className="space-y-4" data-testid="library-list">
          {licenses.map((l) => {
            const [latest, ...older] = l.product.versions;
            const isNew = l.lastSeenVersion !== l.product.currentVersion;
            return (
              <li key={l.id}>
                <Card className="flex flex-col gap-4 sm:flex-row" >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.product.posterPath ?? ''} alt="" className="h-28 w-28 flex-none rounded-xl object-cover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/products/${l.product.slug}`} className="text-lg font-bold hover:underline" data-testid="library-item">{l.product.title}</Link>
                      <Badge tone="accent">{TIERS[l.tier as Tier].name}{l.seats > 1 ? ` × ${l.seats}` : ''}</Badge>
                      <Badge>v{l.product.currentVersion}</Badge>
                      {isNew && <Badge tone="success">What’s new: v{l.product.currentVersion}</Badge>}
                    </div>
                    <p className="text-xs text-muted">Key <code className="font-mono">{l.key}</code> · bought {formatDate(l.createdAt)} · {l.downloadCount}/{l.downloadLimit} downloads used</p>
                    {isNew && latest && <p className="text-sm">{latest.changelog}</p>}
                    <div className="flex flex-wrap gap-2">
                      <DownloadButton licenseId={l.id} fileId="all" label="Download all (ZIP)" />
                      {latest?.files.map((f) => <DownloadButton key={f.id} licenseId={l.id} fileId={f.id} label={`${f.format} · ${formatBytes(f.size)}`} className="bg-surface-2 text-fg" />)}
                      <a href={`/api/licenses/${l.id}/certificate`} className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2">Certificate</a>
                      {upgradeTargets(l.tier as Tier).length > 0 && <UpgradeButton license={{ id: l.id, productId: l.productId, title: l.product.title, slug: l.product.slug, posterPath: l.product.posterPath }} targets={upgradeTargets(l.tier as Tier)} />}
                    </div>
                    {older.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted">Previous versions</summary>
                        <ul className="mt-2 space-y-2">{older.map((v) => <li key={v.id} className="flex items-center gap-3"><Badge>v{v.version}</Badge><span className="text-xs text-muted">{v.changelog}</span><DownloadButton licenseId={l.id} fileId="all" versionId={v.id} label="ZIP" className="h-8 bg-surface-2 text-fg" /></li>)}</ul>
                      </details>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
