import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { isStaff } from '@/lib/permissions';
import { t } from '@/lib/i18n';
import { CURRENCIES } from '@/lib/money';
import { STORE_NAME } from '@/lib/env';
import { activeSale } from '@/server/catalog';
import { CartButton, CartDrawer } from './cart-drawer';
import { NotificationBell, PrefsMenu, SearchBox, UserMenu } from './header-client';
import { SaleCountdown } from './sale-countdown';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-extrabold tracking-tight ${className}`} aria-label={`${STORE_NAME} home`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a48bff" /><stop offset="1" stopColor="#5b3df0" /></linearGradient></defs>
        <path d="M16 2 29 9.5v13L16 30 3 22.5v-13Z" fill="url(#lg)" />
        <path d="M16 2v13.5L29 9.5M16 15.5 3 9.5M16 15.5V30" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" fill="none" />
      </svg>
      <span className="text-lg">Stuffin<span className="text-accent">3D</span></span>
    </Link>
  );
}

export async function Header({ locale }: { locale: string }) {
  const user = await getSessionUser();
  const sale = await activeSale();
  return (
    <>
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[100] rounded-lg bg-accent px-4 py-2 text-accent-fg">Skip to content</a>
      {sale && (
        <div className="bg-gradient-to-r from-accent/90 to-fuchsia-500/90 px-4 py-2 text-center text-sm font-semibold text-white">
          {sale.bannerText} · <SaleCountdown endsAt={sale.endsAt.toISOString()} />
        </div>
      )}
      {user?.impersonatorId && (
        <div className="bg-warning px-4 py-2 text-center text-sm font-semibold text-black">
          Viewing as {user.email} (read-only). <a href="/api/admin/impersonate/stop" className="underline">Stop</a>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Logo />
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 text-sm font-medium lg:flex">
            <Link href="/catalog" className="rounded-lg px-3 py-2 hover:bg-surface-2">{t(locale, 'nav.catalog')}</Link>
            <Link href="/collections" className="rounded-lg px-3 py-2 hover:bg-surface-2">{t(locale, 'nav.collections')}</Link>
            <Link href="/free" className="rounded-lg px-3 py-2 hover:bg-surface-2">{t(locale, 'nav.free')}</Link>
            <Link href="/help" className="rounded-lg px-3 py-2 hover:bg-surface-2">{t(locale, 'nav.help')}</Link>
          </nav>
          <div className="mx-2 hidden flex-1 md:block"><SearchBox /></div>
          <div className="ml-auto flex items-center gap-1">
            <PrefsMenu currencies={CURRENCIES} />
            {user && <NotificationBell />}
            <CartButton />
            <UserMenu user={user ? { name: user.name, email: user.email } : null} isStaff={Boolean(user && isStaff(user.role))} />
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden"><SearchBox /></div>
      </header>
      <CartDrawer />
    </>
  );
}
