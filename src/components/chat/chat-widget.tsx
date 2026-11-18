'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MessageCircle, X, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { CustomerChat, loadGuest } from './customer-chat';
import { useT } from '../providers';

/** Floating support button on every storefront page, with unread badge. */
export function ChatWidget() {
  const t = useT();
  const path = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [prefill, setPrefill] = useState<{ topic?: string; productId?: string; subject?: string } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setPrefill((e as CustomEvent).detail ?? null);
      setOpen(true);
    };
    window.addEventListener('s3d:open-chat', onOpen);
    return () => window.removeEventListener('s3d:open-chat', onOpen);
  }, []);

  // Unread count for signed-in customers (derived server-side from read pointers).
  useEffect(() => {
    if (status !== 'authenticated' || open) return;
    let stop = false;
    const poll = async () => {
      const r = await fetch('/api/chat/conversations');
      if (r.ok && !stop) setUnread((await r.json()).conversations.reduce((a: number, c: { unread: number }) => a + c.unread, 0));
    };
    poll();
    const i = setInterval(poll, 30_000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, [status, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
    }
  }, [open]);

  if (path?.startsWith('/support/chat')) return null;
  void loadGuest;

  return (
    <>
      {open && (
        <div role="dialog" aria-label={t('chat.title')} className="fixed bottom-24 right-4 z-50 flex h-[min(640px,calc(100vh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onKeyDown={(e) => e.key === 'Escape' && (setOpen(false), button.current?.focus())}>
          <div className="flex items-center justify-between bg-accent px-4 py-3 text-accent-fg">
            <span className="font-bold">{t('chat.title')}</span>
            <span className="flex gap-1">
              <Link href="/support/chat" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Open full-page chat"><Maximize2 className="h-4 w-4" aria-hidden /></Link>
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Close chat"><X className="h-4 w-4" aria-hidden /></button>
            </span>
          </div>
          <div className="min-h-0 flex-1"><CustomerChat prefill={prefill} onUnread={(n) => setUnread((u) => u + n)} /></div>
        </div>
      )}
      <button ref={button} onClick={() => setOpen((o) => !o)} className="fixed bottom-4 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_12px_40px_-10px_rgb(var(--accent))] transition hover:scale-105" aria-label={`${t('chat.open')}${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open} data-testid="chat-launcher">
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
        {unread > 0 && !open && <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white" data-testid="chat-unread">{unread}</span>}
      </button>
    </>
  );
}
