'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSocket } from '../use-socket';
import { Alert, Button, Input } from '../ui';
import { formatMoney } from '@/lib/money';

export function StepUpForm({ next }: { next: string }) {
  const { update } = useSession();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const code = String(new FormData(e.currentTarget).get('code') || '');
        const s = await update({ mfaCode: code });
        setBusy(false);
        if (s?.user?.mfa) {
          router.push(next);
          router.refresh();
        } else setErr('Invalid code. Try the next one from your app.');
      }}
    >
      <label htmlFor="mfa" className="sr-only">Authentication code</label>
      <Input id="mfa" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus placeholder="123456" data-testid="stepup-code" />
      {err && <Alert tone="danger">{err}</Alert>}
      <Button className="w-full" disabled={busy} data-testid="stepup-submit">Verify</Button>
    </form>
  );
}

export function AgentStatusToggle() {
  const { socket } = useSocket({});
  const [status, setStatus] = useState<'ONLINE' | 'AWAY' | 'OFFLINE'>('ONLINE');
  return (
    <label className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${status === 'ONLINE' ? 'bg-success' : status === 'AWAY' ? 'bg-warning' : 'bg-muted'}`} aria-hidden />
      <select
        aria-label="Agent status"
        value={status}
        onChange={(e) => {
          const s = e.target.value as typeof status;
          setStatus(s);
          socket?.emit('presence:set', { status: s });
        }}
        className="h-7 rounded-md border border-border bg-surface px-1 text-xs text-fg"
        data-testid="agent-status"
      >
        <option value="ONLINE">Online (auto-assign)</option>
        <option value="AWAY">Away</option>
        <option value="OFFLINE">Offline</option>
      </select>
    </label>
  );
}

export function SalesFeedToast() {
  const { socket } = useSocket({});
  const [items, setItems] = useState<Array<{ orderId: string; total: number; currency: string; items: number; at: string }>>([]);
  useEffect(() => {
    if (!socket) return;
    const on = (s: (typeof items)[number]) => {
      setItems((p) => [s, ...p].slice(0, 3));
      setTimeout(() => setItems((p) => p.filter((x) => x.orderId !== s.orderId)), 8000);
    };
    socket.on('sale:new', on);
    return () => {
      socket.off('sale:new', on);
    };
  }, [socket]);
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
      {items.map((s) => <div key={s.orderId} className="rounded-xl border border-success/40 bg-surface px-4 py-3 text-sm shadow-xl">💸 New sale: <strong>{formatMoney(s.total, s.currency)}</strong> · {s.items} item(s)</div>)}
    </div>
  );
}

export function LiveRefresh({ event }: { event: string }) {
  const { socket } = useSocket({});
  const router = useRouter();
  useEffect(() => {
    if (!socket) return;
    const on = () => router.refresh();
    socket.on(event, on);
    return () => {
      socket.off(event, on);
    };
  }, [socket, router, event]);
  return null;
}

export function ConfirmButton({ children, message, className, variant = 'danger' }: { children: React.ReactNode; message: string; className?: string; variant?: 'danger' | 'primary' | 'outline' | 'secondary' }) {
  return <Button variant={variant} className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</Button>;
}
