'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './providers';

/** Webhooks can land a moment after the redirect: refresh until the order is paid, then clear the cart. */
export function OrderPoller({ paid }: { paid: boolean }) {
  const router = useRouter();
  const { clear, lines } = useCart();
  useEffect(() => {
    if (paid) {
      if (lines.length) clear();
      return;
    }
    const i = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(i);
  }, [paid, router, clear, lines.length]);
  return null;
}
