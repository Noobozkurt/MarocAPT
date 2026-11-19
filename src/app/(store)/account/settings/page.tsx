import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { Card, PageHeader } from '@/components/ui';
import { NotificationsForm, PasswordForm, ProfileForm } from '@/components/account-forms';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const u = await requirePageUser('/account/settings');
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <Card><h2 className="mb-4 font-bold">Profile</h2><ProfileForm name={user.name ?? ''} currency={user.currency} locale={user.locale} /><p className="mt-3 text-xs text-muted">Email: {user.email} — contact support to change it.</p></Card>
      <Card><h2 className="mb-4 font-bold">Notifications</h2><NotificationsForm chat={user.notifyChatEmail} order={user.notifyOrderEmail} wishlist={user.notifyWishlistSale} marketing={user.marketingConsent} /></Card>
      <Card><h2 className="mb-4 font-bold">Password</h2><PasswordForm hasPassword={Boolean(user.passwordHash)} /></Card>
    </div>
  );
}
