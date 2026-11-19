import { Card, PageHeader } from '@/components/ui';
import { DeleteAccountForm } from '@/components/account-forms';

export const metadata = { title: 'Privacy & data' };

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Privacy & data" subtitle="Your GDPR rights, self-service." />
      <Card>
        <h2 className="font-bold">Export your data</h2>
        <p className="mt-1 text-sm text-muted">Download everything we hold about you — profile, orders, licenses, downloads, reviews, wishlist and support chats — as JSON.</p>
        <a href="/api/account/export" className="mt-3 inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg" data-testid="export-data">Download my data (JSON)</a>
      </Card>
      <Card><h2 className="mb-2 font-bold text-danger">Delete account</h2><DeleteAccountForm /></Card>
    </div>
  );
}
