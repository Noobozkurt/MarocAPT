'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useCart, useStore } from './providers';
import { useQuote } from './use-quote';
import { Money } from './money';
import { Alert, Button, Card, Input, Label, Select } from './ui';
import { TIERS } from '@/lib/licenses';

const COUNTRIES: Array<[string, string]> = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['SE', 'Sweden'], ['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['ES', 'Spain'], ['IT', 'Italy'], ['IE', 'Ireland'],
  ['AT', 'Austria'], ['PL', 'Poland'], ['PT', 'Portugal'], ['FI', 'Finland'], ['DK', 'Denmark'], ['NO', 'Norway'], ['CH', 'Switzerland'], ['CA', 'Canada'], ['AU', 'Australia'], ['MA', 'Morocco'], ['JP', 'Japan'],
];

function newKey() {
  return `ck_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function CheckoutForm({ email: initialEmail, signedIn, storeCredit, usStates, canceled, turnstileSiteKey }: { email: string; signedIn: boolean; storeCredit: number; usStates: string[]; canceled: boolean; turnstileSiteKey: string }) {
  const { lines, ready } = useCart();
  const store = useStore();
  const [email, setEmail] = useState(initialEmail);
  const [country, setCountry] = useState(store.country);
  const [region, setRegion] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [vatId, setVatId] = useState('');
  const [vatDebounced, setVatDebounced] = useState('');
  const [company, setCompany] = useState('');
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One idempotency key per checkout attempt; retries reuse it so we never double-charge.
  const [idemKey, setIdemKey] = useState('');
  useEffect(() => {
    const saved = sessionStorage.getItem('s3d_ck');
    const k = saved || newKey();
    sessionStorage.setItem('s3d_ck', k);
    setIdemKey(k);
  }, []);
  useEffect(() => {
    const h = setTimeout(() => setVatDebounced(isBusiness ? vatId.trim() : ''), 500);
    return () => clearTimeout(h);
  }, [vatId, isBusiness]);

  const { quote, loading } = useQuote(lines, { country, region: country === 'US' ? region : null, vatId: vatDebounced || null, couponCode: appliedCoupon, useStoreCredit: useCredit, email });
  const isEuLike = useMemo(() => !['US', 'CA', 'MA', 'JP'].includes(country), [country]);

  if (!ready) return <div className="skeleton h-96" />;
  if (!lines.length) return <Alert>Your cart is empty. <Link href="/catalog" className="underline">Browse the catalog</Link>.</Alert>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!terms || !waiver) return setError('Please accept the license terms and the withdrawal waiver.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, country, region: country === 'US' ? region : null, vatId: isBusiness ? vatId || null : null, companyName: isBusiness ? company || null : null,
          currency: store.currency, couponCode: appliedCoupon, useStoreCredit: useCredit, acceptTerms: terms, waiveWithdrawal: waiver, idempotencyKey: idemKey,
          lines: lines.map(({ productId, tier, seats, upgradeFromLicenseId }) => ({ productId, tier, seats, upgradeFromLicenseId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'ALREADY_PAID') {
          sessionStorage.removeItem('s3d_ck');
          setIdemKey(newKey());
        }
        throw new Error(data.issues?.[0]?.message || data.error || 'Checkout failed');
      }
      sessionStorage.removeItem('s3d_ck');
      window.location.assign(data.redirectUrl);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_400px]" noValidate>
      <div className="space-y-6">
        {canceled && <Alert tone="warning">Payment was canceled — nothing was charged. You can try again below.</Alert>}
        <Card as="section">
          <h2 className="mb-4 text-lg font-bold">1. Email</h2>
          <Label htmlFor="email">Email for receipt and downloads</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="checkout-email" />
          {!signedIn && <p className="mt-2 text-xs text-muted">Checking out as a guest. We’ll email you a link to claim your purchases into a free account. <Link href="/login?next=/checkout" className="underline">Sign in instead</Link></p>}
        </Card>

        <Card as="section">
          <h2 className="mb-4 text-lg font-bold">2. Billing details (for tax)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">Country</Label>
              <Select id="country" className="w-full" value={country} onChange={(e) => setCountry(e.target.value)} data-testid="checkout-country">
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </Select>
            </div>
            {country === 'US' && (
              <div>
                <Label htmlFor="region">State</Label>
                <Select id="region" className="w-full" required value={region} onChange={(e) => setRegion(e.target.value)} data-testid="checkout-region">
                  <option value="">Select state…</option>
                  {usStates.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
            )}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} data-testid="checkout-business" /> I’m buying for a business</label>
          {isBusiness && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="company">Company name</Label><Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" /></div>
              {isEuLike && (
                <div>
                  <Label htmlFor="vat">VAT ID (EU/UK)</Label>
                  <Input id="vat" value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="DE123456789" aria-describedby="vat-status" data-testid="checkout-vat" />
                  <p id="vat-status" className="mt-1 text-xs" aria-live="polite">
                    {vatDebounced && quote?.vat && (quote.vat.valid ? <span className="text-success">✓ Valid{quote.vat.name ? ` — ${quote.vat.name}` : ''}. {quote.tax.mode === 'REVERSE_CHARGE' ? 'Reverse charge applies.' : 'Domestic VAT applies.'}</span> : <span className="text-danger">{quote.vat.error}</span>)}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card as="section">
          <h2 className="mb-4 text-lg font-bold">3. Payment</h2>
          <p className="text-sm text-muted">You’ll be redirected to our payment partner’s secure page to pay with card, Apple Pay, Google Pay, Link, PayPal or local methods (iDEAL, Bancontact, Klarna, Swish…). 3-D Secure is supported.</p>
          {turnstileSiteKey && <p className="mt-2 text-xs text-muted">Protected by Cloudflare Turnstile.</p>}
          <div className="mt-6 space-y-3 text-sm">
            <label className="flex gap-3"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required data-testid="checkout-terms" /> <span>I agree to the <Link href="/license" className="underline" target="_blank">license terms</Link> and <Link href="/legal/terms" className="underline" target="_blank">terms of service</Link>.</span></label>
            <label className="flex gap-3"><input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} required data-testid="checkout-waiver" /> <span>I request immediate access to the digital content and acknowledge that I lose my right of withdrawal once the download starts.</span></label>
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Order summary</h2>
          <ul className="space-y-3 text-sm">
            {lines.map((l) => {
              const q = quote?.lines.find((x) => x.productId === l.productId);
              return (
                <li key={l.productId} className="flex justify-between gap-3">
                  <span>{l.title}<span className="block text-xs text-muted">{TIERS[l.tier].name}{l.seats && l.seats > 1 ? ` × ${l.seats} seats` : ''}{l.upgradeFromLicenseId ? ' (upgrade)' : ''}</span></span>
                  <span className="font-semibold">{q ? <Money amount={q.netAmount} /> : '…'}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <label htmlFor="coupon" className="sr-only">Promo code</label>
            <Input id="coupon" placeholder="Promo code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} data-testid="checkout-coupon" />
            <Button type="button" variant="secondary" onClick={() => setAppliedCoupon(coupon || null)}>Apply</Button>
          </div>
          {quote?.couponError && appliedCoupon && <p className="mt-1 text-xs text-danger" role="alert">{quote.couponError}</p>}
          {signedIn && storeCredit > 0 && (
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use store credit (<Money amount={storeCredit} currency="USD" />, USD orders)</label>
          )}
          {quote && (
            <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm" aria-live="polite" aria-busy={loading}>
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money amount={quote.subtotal} /></dd></div>
              {quote.appliedDiscounts.map((d) => <div key={d.label} className="flex justify-between text-success"><dt>{d.label}</dt><dd>−<Money amount={d.amount} /></dd></div>)}
              <div className="flex justify-between" data-testid="checkout-tax-row"><dt className="text-muted">{quote.tax.label}</dt><dd data-testid="checkout-tax"><Money amount={quote.taxTotal} /></dd></div>
              {quote.creditApplied > 0 && <div className="flex justify-between"><dt className="text-muted">Store credit</dt><dd>−<Money amount={quote.creditApplied} /></dd></div>}
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold"><dt>Total</dt><dd data-testid="checkout-total"><Money amount={quote.total} /></dd></div>
              {quote.tax.invoiceNote && <p className="pt-2 text-xs text-muted">{quote.tax.invoiceNote}</p>}
            </dl>
          )}
          {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting || !quote || loading} data-testid="checkout-submit">
            <Lock className="h-4 w-4" aria-hidden /> {submitting ? 'Redirecting…' : quote && quote.total === 0 ? 'Get it free' : 'Pay securely'}
          </Button>
        </Card>
      </aside>
    </form>
  );
}
