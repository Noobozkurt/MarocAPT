'use client';
import { formatMoney } from '@/lib/money';
import { useStore } from './providers';

export function Money({ amount, currency, className }: { amount: number; currency?: string; className?: string }) {
  const store = useStore();
  return <span className={className}>{formatMoney(amount, currency ?? store.currency, store.locale === 'fr' ? 'fr-FR' : 'en-US')}</span>;
}
