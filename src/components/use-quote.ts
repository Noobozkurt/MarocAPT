'use client';

import { useEffect, useState } from 'react';
import type { CartLine } from './providers';
import { useStore } from './providers';

export interface QuoteDTO {
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  creditApplied: number;
  total: number;
  appliedDiscounts: Array<{ kind: string; label: string; amount: number }>;
  bundleHints: Array<{ bundleId: string; title: string; slug: string; have: number; of: number; missingProductIds: string[]; discountLabel: string }>;
  lines: Array<{ productId: string; title: string; tier: string; seats: number; unitAmount: number; baseAmount: number; discountAmount: number; netAmount: number; taxAmount: number; totalAmount: number; upgradeFromLicenseId?: string | null }>;
  tax: { mode: string; rateBps: number; displayInclusive: boolean; label: string; invoiceNote?: string };
  couponError?: string;
  coupon: { code: string } | null;
  invalidLines: string[];
  vat?: { valid: boolean; error?: string; name?: string } | null;
}

export function useQuote(lines: CartLine[], extra: { country?: string; region?: string | null; vatId?: string | null; couponCode?: string | null; useStoreCredit?: boolean; email?: string } = {}) {
  const store = useStore();
  const [quote, setQuote] = useState<QuoteDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify({ lines: lines.map((l) => [l.productId, l.tier, l.seats, l.upgradeFromLicenseId]), ...extra, c: store.currency });
  useEffect(() => {
    if (!lines.length) {
      setQuote(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/cart/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lines: lines.map(({ productId, tier, seats, upgradeFromLicenseId }) => ({ productId, tier, seats, upgradeFromLicenseId })), currency: store.currency, country: extra.country ?? store.country, ...extra }),
          signal: ctrl.signal,
        });
        if (res.ok) setQuote(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote, loading };
}
