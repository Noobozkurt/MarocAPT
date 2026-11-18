'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ShoppingBag, X, Trash2, Sparkles } from 'lucide-react';
import { TIERS, LICENSE_TIERS, type Tier } from '@/lib/licenses';
import { useCart, useStore, useT } from './providers';
import { useQuote } from './use-quote';
import { Money } from './money';
import { Button, ButtonLink } from './ui';

export function CartButton() {
  const { lines, setOpen, ready } = useCart();
  const t = useT();
  return (
    <button onClick={() => setOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2" aria-label={`${t('nav.cart')} (${lines.length} items)`} data-testid="cart-button">
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {ready && lines.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-fg">{lines.length}</span>}
    </button>
  );
}

export function CartLines({ compact = false }: { compact?: boolean }) {
  const { lines, update, remove } = useCart();
  const { quote } = useQuote(lines);
  const t = useT();
  const store = useStore();
  return (
    <>
      <ul className="divide-y divide-border">
        {lines.map((l) => {
          const q = quote?.lines.find((x) => x.productId === l.productId);
          const invalid = quote?.invalidLines.includes(l.productId);
          return (
            <li key={l.productId} className="flex gap-3 py-4" data-testid="cart-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.posterPath || '/icon.svg'} alt="" className="h-16 w-16 flex-none rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <Link href={`/products/${l.slug}`} className="block truncate font-semibold hover:underline">{l.title}</Link>
                {l.upgradeFromLicenseId ? (
                  <p className="text-xs text-muted">Upgrade to {TIERS[l.tier].name}</p>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`tier-${l.productId}`}>License for {l.title}</label>
                    <select id={`tier-${l.productId}`} value={l.tier} onChange={(e) => update(l.productId, { tier: e.target.value as Tier, seats: TIERS[e.target.value as Tier].seatBased ? Math.max(2, l.seats ?? 2) : undefined })} className="h-8 rounded-lg border border-border bg-surface px-2 text-xs">
                      {LICENSE_TIERS.map((tier) => <option key={tier} value={tier}>{TIERS[tier].name}</option>)}
                    </select>
                    {TIERS[l.tier].seatBased && (
                      <label className="flex items-center gap-1 text-xs">
                        Seats
                        <input type="number" min={2} max={500} value={l.seats ?? 2} onChange={(e) => update(l.productId, { seats: Math.max(2, Number(e.target.value) || 2) })} className="h-8 w-16 rounded-lg border border-border bg-surface px-2" />
                      </label>
                    )}
                  </div>
                )}
                {invalid && <p className="mt-1 text-xs text-danger">No longer available</p>}
                {q && q.discountAmount > 0 && <p className="mt-1 text-xs text-success">−<Money amount={q.discountAmount} /> discount</p>}
              </div>
              <div className="flex flex-col items-end justify-between">
                <span className="text-sm font-semibold">{q ? <Money amount={store.country && quote?.tax.displayInclusive ? q.totalAmount : q.netAmount} /> : <span className="skeleton inline-block h-4 w-12" />}</span>
                <button onClick={() => remove(l.productId)} className="text-muted hover:text-danger" aria-label={`${t('cart.remove')} ${l.title}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {quote && quote.bundleHints.length > 0 && !compact && null}
      {quote && (
        <div className="space-y-3 pt-4">
          {quote.bundleHints.map((h) => (
            <div key={h.bundleId} className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm" data-testid="bundle-hint">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden />
              <span>
                You have {h.have} of {h.of} in <strong>{h.title}</strong> — complete it and save {h.discountLabel}.{' '}
                <Link href={`/catalog?bundle=${h.slug}`} className="underline">See bundle</Link>
              </span>
            </div>
          ))}
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd><Money amount={quote.subtotal} /></dd></div>
            {quote.appliedDiscounts.map((d) => (
              <div key={d.label} className="flex justify-between text-success"><dt>{d.label}</dt><dd>−<Money amount={d.amount} /></dd></div>
            ))}
            <div className="flex justify-between"><dt className="text-muted">{quote.tax.label}{quote.tax.displayInclusive ? ' (included)' : ''}</dt><dd><Money amount={quote.taxTotal} /></dd></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>{t('cart.total')}</dt><dd data-testid="cart-total"><Money amount={quote.total} /></dd></div>
          </dl>
          <p className="text-xs text-muted">Estimated for {store.country}. Final tax is confirmed at checkout.</p>
        </div>
      )}
    </>
  );
}

export function CartDrawer() {
  const { lines, open, setOpen } = useCart();
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
      <div ref={panel} tabIndex={-1} className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-2xl outline-none">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="cart-title" className="text-lg font-bold">{t('cart.title')}</h2>
          <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-2" aria-label="Close cart"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 ? <p className="py-16 text-center text-muted">{t('cart.empty')}</p> : <CartLines compact />}
        </div>
        {lines.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-t border-border p-5">
            <ButtonLink href="/cart" variant="outline" className="w-full">View cart</ButtonLink>
            <ButtonLink href="/checkout" className="w-full">{t('cart.checkout')}</ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}

export function AddToCartButton(props: { productId: string; title: string; slug: string; posterPath: string | null; tier: Tier; seats?: number; className?: string }) {
  const { add, lines, setOpen } = useCart();
  const t = useT();
  const inCart = lines.some((l) => l.productId === props.productId && l.tier === props.tier);
  return (
    <Button size="lg" className={props.className} data-testid="add-to-cart" onClick={() => { add({ productId: props.productId, title: props.title, slug: props.slug, posterPath: props.posterPath, tier: props.tier, seats: props.seats }); setOpen(true); }}>
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {inCart ? t('product.inCart') : t('product.addToCart')}
    </Button>
  );
}
