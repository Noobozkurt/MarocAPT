'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Heart, Share2, Flag, X as XIcon, ThumbsUp } from 'lucide-react';
import { LICENSE_TIERS, TIERS, type Tier } from '@/lib/licenses';
import { AddToCartButton } from './cart-drawer';
import { Button, Textarea } from './ui';
import { cn } from '@/lib/utils';

export function LicenseSelector({ product, prices, freeProduct }: { product: { id: string; title: string; slug: string; posterPath: string | null }; prices: Record<string, { text: string; originalText: string | null; taxNote: string }>; freeProduct: boolean }) {
  const [tier, setTier] = useState<Tier>('PERSONAL');
  const [seats, setSeats] = useState(2);
  const info = TIERS[tier];
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Choose a license</legend>
        <div className="space-y-2" role="radiogroup">
          {LICENSE_TIERS.map((t) => (
            <label key={t} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition', tier === t ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2')}>
              <span className="flex items-center gap-3">
                <input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} className="accent-[rgb(var(--accent))]" data-testid={`tier-${t}`} />
                <span>
                  <span className="block text-sm font-semibold">{TIERS[t].name}</span>
                  <span className="block text-xs text-muted">{TIERS[t].summary}</span>
                </span>
              </span>
              <span className="text-right text-sm font-bold">
                {prices[t]?.text}
                {TIERS[t].seatBased && !freeProduct && <span className="block text-[11px] font-normal text-muted">per seat</span>}
                {prices[t]?.originalText && <s className="block text-[11px] font-normal text-muted">{prices[t]?.originalText}</s>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {info.seatBased && (
        <label className="flex items-center gap-3 text-sm">
          Seats
          <input type="number" min={info.minSeats} max={500} value={seats} onChange={(e) => setSeats(Math.max(info.minSeats, Number(e.target.value) || info.minSeats))} className="h-10 w-24 rounded-xl border border-border bg-surface px-3" />
        </label>
      )}
      <div className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold">You can</p>
          <ul className="space-y-1">{info.can.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-success" aria-hidden />{c}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 font-semibold">You can’t</p>
          <ul className="space-y-1">{info.cannot.map((c) => <li key={c} className="flex gap-2"><XIcon className="mt-0.5 h-4 w-4 flex-none text-danger" aria-hidden />{c}</li>)}</ul>
        </div>
        <Link href="/license" className="text-xs text-accent underline sm:col-span-2">Read the full license text</Link>
      </div>
      <AddToCartButton productId={product.id} title={product.title} slug={product.slug} posterPath={product.posterPath} tier={tier} seats={info.seatBased ? seats : undefined} className="w-full" />
      <p className="text-center text-xs text-muted">{prices[tier]?.taxNote} · Instant download · Free updates</p>
    </div>
  );
}

export function WishlistButton({ productId, initial, signedIn }: { productId: string; initial: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(initial);
  const router = useRouter();
  return (
    <Button
      variant="outline"
      aria-pressed={on}
      onClick={async () => {
        if (!signedIn) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
        const res = await fetch('/api/wishlist', { method: on ? 'DELETE' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId }) });
        if (res.ok) setOn(!on);
      }}
    >
      <Heart className={cn('h-4 w-4', on && 'fill-current text-danger')} aria-hidden /> {on ? 'Wishlisted' : 'Wishlist'}
    </Button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = location.href;
        if (navigator.share) await navigator.share({ title, url }).catch(() => undefined);
        else {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <Share2 className="h-4 w-4" aria-hidden /> {copied ? 'Link copied' : 'Share'}
    </Button>
  );
}

export function ReportProblemButton({ productId, title }: { productId: string; title: string }) {
  return (
    <button onClick={() => window.dispatchEvent(new CustomEvent('s3d:open-chat', { detail: { topic: 'TECHNICAL', productId, subject: `Problem with ${title}` } }))} className="inline-flex items-center gap-1 text-xs text-muted underline hover:text-fg">
      <Flag className="h-3.5 w-3.5" aria-hidden /> Report a problem
    </button>
  );
}

export function HelpfulButton({ reviewId, count }: { reviewId: string; count: number }) {
  const [n, setN] = useState(count);
  const [voted, setVoted] = useState(false);
  return (
    <button
      disabled={voted}
      onClick={async () => {
        const r = await fetch(`/api/reviews/${reviewId}/helpful`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        if (r.ok) {
          setN((await r.json()).helpfulCount);
          setVoted(true);
        }
      }}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-60"
    >
      <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Helpful ({n})
    </button>
  );
}

export function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="space-y-3 rounded-2xl border border-border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, rating, title: fd.get('title'), body: fd.get('body') }) });
        const data = await res.json();
        setMsg(res.ok ? 'Thanks! Your review will appear after moderation.' : data.error);
        if (res.ok) e.currentTarget.reset();
      }}
    >
      <p className="font-semibold">Write a review</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={cn('text-2xl', n <= rating ? 'text-warning' : 'text-border')}>★</button>
        ))}
      </div>
      <input name="title" maxLength={100} placeholder="Title" className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" aria-label="Review title" />
      <Textarea name="body" required minLength={10} maxLength={2000} rows={3} placeholder="What did you build with it?" aria-label="Review" />
      <Button type="submit" size="sm">Submit review</Button>
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </form>
  );
}

export function QuestionForm({ productId }: { productId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch('/api/questions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, body: fd.get('body') }) });
        const d = await res.json();
        setMsg(res.ok ? 'Question submitted — we’ll answer soon.' : d.error);
        if (res.ok) e.currentTarget.reset();
      }}
    >
      <input name="body" required minLength={5} maxLength={500} placeholder="Ask a question about this asset" aria-label="Your question" className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm" />
      <Button type="submit" variant="secondary">Ask</Button>
      {msg && <p role="status" className="self-center text-xs text-muted">{msg}</p>}
    </form>
  );
}
