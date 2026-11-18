'use client';

import { useCart, useT } from '@/components/providers';
import { CartLines } from '@/components/cart-drawer';
import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';

export default function CartPage() {
  const { lines, ready } = useCart();
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t('cart.title')} />
      {!ready ? <div className="skeleton h-40" /> : lines.length === 0 ? (
        <EmptyState title={t('cart.empty')} action={<ButtonLink href="/catalog">Browse the catalog</ButtonLink>}>Find something you like and it’ll show up here — your cart is saved on this device and synced to your account when you sign in.</EmptyState>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <CartLines />
          <ButtonLink href="/checkout" size="lg" className="mt-6 w-full" aria-label="Proceed to checkout">{t('cart.checkout')}</ButtonLink>
        </div>
      )}
    </div>
  );
}
