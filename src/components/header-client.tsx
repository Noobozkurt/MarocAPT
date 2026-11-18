'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Bell, Moon, Search, Sun, User, Globe } from 'lucide-react';
import { useStore, useT } from './providers';
import { useSocket } from './use-socket';
import { cn } from '@/lib/utils';

interface Suggestion {
  slug: string;
  title: string;
  category: string;
  posterPath: string | null;
}

export function SearchBox({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const t = useT();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) {
          setItems((await res.json()).items);
          setOpen(true);
        }
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(h);
      ctrl.abort();
    };
  }, [q]);
  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };
  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && items[active]) go(`/products/${items[active]!.slug}`);
        else go(`/catalog?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor="site-search" className="sr-only">{t('search.label')}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id="site-search"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('search.placeholder')}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="h-10 w-full rounded-xl border border-border bg-surface-2/70 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none"
        data-testid="search-input"
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {items.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={() => go(`/products/${s.slug}`)} className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2', i === active && 'bg-surface-2')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.posterPath || ''} alt="" className="h-8 w-8 rounded-md object-cover" />
                <span className="flex-1 truncate">{s.title}</span>
                <span className="text-xs text-muted">{s.category}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onMouseDown={() => go(`/catalog?q=${encodeURIComponent(q.trim())}`)} className="w-full border-t border-border px-3 py-2 text-left text-sm text-accent hover:bg-surface-2">
              See all results for “{q}”
            </button>
          </li>
        </ul>
      )}
    </form>
  );
}

export function PrefsMenu({ currencies }: { currencies: readonly string[] }) {
  const store = useStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const save = async (patch: Record<string, string>) => {
    await fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    router.refresh();
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm hover:bg-surface-2" aria-label="Region, currency, language and theme">
        <Globe className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{store.currency}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-xl">
          <label className="block text-xs font-semibold text-muted">Currency
            <select className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg" value={store.currency} onChange={(e) => save({ currency: e.target.value })} data-testid="currency-select">
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">Country (for tax)
            <select className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg" value={store.country} onChange={(e) => save({ country: e.target.value })}>
              {['US', 'GB', 'SE', 'DE', 'FR', 'NL', 'ES', 'IT', 'IE', 'BE', 'PL', 'NO', 'CH', 'CA', 'AU', 'MA', 'JP'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">Language
            <select className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg" value={store.locale} onChange={(e) => save({ locale: e.target.value })}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          {mounted && (
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'} {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const { socket } = useSocket({});
  useEffect(() => {
    fetch('/api/notifications').then(async (r) => r.ok && setItems((await r.json()).items));
  }, []);
  useEffect(() => {
    if (!socket) return;
    const onNew = (n: NotificationItem) => n.id && setItems((prev) => [n, ...prev].slice(0, 30));
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket]);
  const unread = items.filter((i) => !i.readAt).length;
  const markAll = async () => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setItems((p) => p.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-bold">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-xs text-accent">Mark all read</button>}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id} className={cn('border-b border-border/60 px-4 py-3 text-sm', !n.readAt && 'bg-accent/5')}>
                {n.link ? <Link href={n.link} className="font-semibold hover:underline" onClick={() => setOpen(false)}>{n.title}</Link> : <span className="font-semibold">{n.title}</span>}
                {n.body && <p className="text-muted">{n.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function UserMenu({ user, isStaff }: { user: { name: string | null; email: string } | null; isStaff: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user)
    return (
      <Link href="/login" className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-surface-2" data-testid="signin-link">
        <User className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{t('nav.signin')}</span>
      </Link>
    );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="grid h-10 w-10 place-items-center rounded-full bg-accent/20 text-sm font-bold text-accent" aria-label="Account menu" data-testid="user-menu">
        {(user.name || user.email)[0]!.toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
          <p className="truncate px-4 py-2 text-xs text-muted">{user.email}</p>
          {[
            ['/account', 'Dashboard'],
            ['/account/library', 'Library'],
            ['/account/orders', 'Orders & invoices'],
            ['/account/wishlist', 'Wishlist'],
            ['/support/chat', 'Support'],
            ['/account/settings', 'Settings'],
          ].map(([href, label]) => (
            <Link key={href} role="menuitem" href={href!} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-2">{label}</Link>
          ))}
          {isStaff && <Link role="menuitem" href="/admin" className="block px-4 py-2 text-sm font-semibold text-accent hover:bg-surface-2">{t('nav.admin')}</Link>}
          <button role="menuitem" onClick={() => signOut({ callbackUrl: '/' })} className="block w-full border-t border-border px-4 py-2 text-left text-sm hover:bg-surface-2">{t('nav.signout')}</button>
        </div>
      )}
    </div>
  );
}
