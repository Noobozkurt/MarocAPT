import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { hasPermission, type Permission } from '@/lib/permissions';
import { Logo } from '@/components/header';
import { AgentStatusToggle, SalesFeedToast } from '@/components/admin/admin-client';

export const metadata = { title: { default: 'Admin', template: '%s · Admin' }, robots: { index: false } };

const NAV: Array<[string, string, Permission]> = [
  ['/admin', 'Dashboard', 'dashboard:view'],
  ['/admin/inbox', 'Support inbox', 'support:inbox'],
  ['/admin/orders', 'Orders', 'orders:read'],
  ['/admin/refund-requests', 'Refund requests', 'refunds:request'],
  ['/admin/products', 'Products', 'products:read'],
  ['/admin/customers', 'Customers', 'customers:read'],
  ['/admin/licenses', 'Licenses', 'licenses:read'],
  ['/admin/marketing', 'Coupons & sales', 'marketing:coupons'],
  ['/admin/reviews', 'Reviews & Q&A', 'reviews:moderate'],
  ['/admin/support', 'Canned replies & help', 'support:canned_replies'],
  ['/admin/finance', 'Finance & tax', 'finance:reports'],
  ['/admin/staff', 'Staff & roles', 'staff:manage'],
  ['/admin/audit', 'Audit log', 'audit:read'],
  ['/admin/health', 'System health', 'system:health'],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  const nav = u ? NAV.filter(([, , p]) => hasPermission(u.role, p)) : [];
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-4"><Logo /><span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">Admin</span></div>
        {u && u.mfa && (
          <>
            <nav aria-label="Admin"><ul className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col">{nav.map(([href, label]) => <li key={href}><Link href={href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-surface-2">{label}</Link></li>)}</ul></nav>
            <div className="hidden space-y-2 border-t border-border p-4 text-xs text-muted lg:block">
              <p className="truncate">{u.email}</p>
              <p>Role: <strong className="text-fg">{u.role.replace('_', ' ').toLowerCase()}</strong></p>
              {hasPermission(u.role, 'support:inbox') && <AgentStatusToggle />}
              <Link href="/" className="block underline">← Back to store</Link>
            </div>
          </>
        )}
      </aside>
      <main id="main" className="min-w-0 p-4 lg:p-8">{children}</main>
      {u && u.mfa && hasPermission(u.role, 'dashboard:view') && <SalesFeedToast />}
    </div>
  );
}
