'use client';
import { useState } from 'react';

export function NewsletterForm({ label, cta }: { label: string; cta: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get('email');
        const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, consent: true }) });
        setState(r.ok ? 'ok' : 'err');
      }}
      className="max-w-sm"
    >
      <label htmlFor="nl-email" className="mb-2 block text-sm font-semibold">{label}</label>
      <div className="flex gap-2">
        <input id="nl-email" name="email" type="email" required placeholder="you@studio.com" className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm" />
        <button className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">{cta}</button>
      </div>
      <p className="mt-2 text-xs text-muted" role="status">{state === 'ok' ? 'Check your inbox to confirm.' : state === 'err' ? 'Please enter a valid email.' : 'Double opt-in. Unsubscribe any time.'}</p>
    </form>
  );
}
