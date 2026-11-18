'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from './providers';

// No analytics or tracking scripts load until the visitor opts in. Reject is one click, same as accept.
export function CookieConsent() {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!document.cookie.includes('s3d_consent=')) setShow(true);
  }, []);
  const decide = (v: 'analytics' | 'essential') => {
    document.cookie = `s3d_consent=${v}; Path=/; Max-Age=${180 * 86400}; SameSite=Lax`;
    setShow(false);
    window.dispatchEvent(new CustomEvent('s3d:consent', { detail: v }));
  };
  if (!show) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie consent" className="glass fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-2xl p-4 shadow-2xl sm:flex sm:items-center sm:gap-4">
      <p className="text-sm">{t('cookie.text')} <Link href="/legal/cookies" className="underline">{t('cookie.settings')}</Link></p>
      <div className="mt-3 flex flex-none gap-2 sm:mt-0">
        <button onClick={() => decide('essential')} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-2" data-testid="cookie-reject">{t('cookie.reject')}</button>
        <button onClick={() => decide('analytics')} className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">{t('cookie.accept')}</button>
      </div>
    </div>
  );
}
