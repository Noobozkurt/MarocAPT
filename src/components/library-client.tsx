'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TIERS, type Tier } from '@/lib/licenses';
import { useCart } from './providers';
import { useSocket } from './use-socket';

/** Live library: refunds/chargebacks/new purchases push `library:updated` and the page re-renders within seconds. */
export function LibraryLive() {
  const router = useRouter();
  const { socket } = useSocket({});
  useEffect(() => {
    if (!socket) return;
    const refresh = () => router.refresh();
    socket.on('library:updated', refresh);
    return () => {
      socket.off('library:updated', refresh);
    };
  }, [socket, router]);
  return null;
}

export function UpgradeButton({ license, targets }: { license: { id: string; productId: string; title: string; slug: string; posterPath: string | null }; targets: Tier[] }) {
  const { add, setOpen } = useCart();
  return (
    <select
      aria-label={`Upgrade license for ${license.title}`}
      defaultValue=""
      onChange={(e) => {
        const tier = e.target.value as Tier;
        if (!tier) return;
        add({ productId: license.productId, tier, title: license.title, slug: license.slug, posterPath: license.posterPath, upgradeFromLicenseId: license.id });
        setOpen(true);
        e.target.value = '';
      }}
      className="h-9 rounded-xl border border-accent/50 bg-surface px-2 text-sm font-semibold text-accent"
    >
      <option value="">Upgrade…</option>
      {targets.map((t) => <option key={t} value={t}>To {TIERS[t].name} (pay the difference)</option>)}
    </select>
  );
}
