'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import type { Tier } from '@/lib/licenses';
import { dictFor, type MessageKey } from '@/lib/i18n';

// ─── Store context (currency / country / locale) ───
export interface ClientStore {
  currency: string;
  country: string;
  locale: string;
  taxInclusive: boolean;
  taxLabel: string;
}
const StoreCtx = createContext<ClientStore>({ currency: 'USD', country: 'US', locale: 'en', taxInclusive: false, taxLabel: '' });
export const useStore = () => useContext(StoreCtx);

export function useT() {
  const { locale } = useStore();
  const dict = dictFor(locale);
  return (k: MessageKey) => dict[k];
}

// ─── Cart (localStorage for guests, synced to the account after login) ───
export interface CartLine {
  productId: string;
  tier: Tier;
  seats?: number;
  title: string;
  slug: string;
  posterPath?: string | null;
  upgradeFromLicenseId?: string | null;
}

interface CartApi {
  lines: CartLine[];
  ready: boolean;
  open: boolean;
  setOpen(v: boolean): void;
  add(line: CartLine): void;
  update(productId: string, patch: Partial<CartLine>): void;
  remove(productId: string): void;
  clear(): void;
}
const CartCtx = createContext<CartApi | null>(null);
export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}

const CART_KEY = 's3d_cart_v1';

function readLocal(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(v) ? v.filter((l) => l && typeof l.productId === 'string') : [];
  } catch {
    return [];
  }
}

function CartProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const synced = useRef(false);

  useEffect(() => {
    setLines(readLocal());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === CART_KEY && setLines(readLocal());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // On login: merge local (guest) cart with the server cart once.
  useEffect(() => {
    if (status !== 'authenticated' || synced.current || !ready) return;
    synced.current = true;
    (async () => {
      const res = await fetch('/api/cart');
      if (!res.ok) return;
      const server: CartLine[] = (await res.json()).lines;
      const merged = [...server];
      for (const l of readLocal()) {
        const i = merged.findIndex((m) => m.productId === l.productId);
        if (i === -1) merged.push(l);
        else merged[i] = { ...merged[i]!, ...l };
      }
      persist(merged, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready]);

  const persist = useCallback(
    (next: CartLine[], toServer = status === 'authenticated') => {
      setLines(next);
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      if (toServer) void fetch('/api/cart', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: next.map(({ productId, tier, seats, upgradeFromLicenseId }) => ({ productId, tier, seats, upgradeFromLicenseId })) }) });
    },
    [status],
  );

  const api = useMemo<CartApi>(
    () => ({
      lines,
      ready,
      open,
      setOpen,
      add: (line) => persist([...lines.filter((l) => l.productId !== line.productId), line]),
      update: (productId, patch) => persist(lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l))),
      remove: (productId) => persist(lines.filter((l) => l.productId !== productId)),
      clear: () => persist([]),
    }),
    [lines, ready, open, persist],
  );
  return <CartCtx.Provider value={api}>{children}</CartCtx.Provider>;
}

export function Providers({ children, store }: { children: ReactNode; store: ClientStore }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        <StoreCtx.Provider value={store}>
          <CartProvider>{children}</CartProvider>
        </StoreCtx.Provider>
      </ThemeProvider>
    </SessionProvider>
  );
}
