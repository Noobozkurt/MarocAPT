import Link from 'next/link';
import { requirePageUser } from '@/lib/session';

const NAV: Array<[string, string]> = [
  ['/account', 'Dashboard'],
  ['/account/library', 'Library'],
  ['/account/orders', 'Orders & invoices'],
  ['/account/wishlist', 'Wishlist'],
  ['/account/reviews', 'My reviews'],
  ['/support/chat', 'Support'],
  ['/account/referrals', 'Referrals'],
  ['/account/settings', 'Settings'],
  ['/account/security', 'Security'],
  ['/account/privacy', 'Privacy & data'],
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Account" className="lg:sticky lg:top-24 lg:h-fit">
        <p className="mb-3 truncate text-sm text-muted">{user.email}</p>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(([href, label]) => <li key={href}><Link href={href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-surface-2">{label}</Link></li>)}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
