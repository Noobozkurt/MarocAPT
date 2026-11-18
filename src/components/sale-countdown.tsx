'use client';
import { useEffect, useState } from 'react';

export function SaleCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (now === null) return <span>ends soon</span>;
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return <span aria-live="off" className="tabular-nums">ends in {d}d {h}h {m}m {s}s</span>;
}
