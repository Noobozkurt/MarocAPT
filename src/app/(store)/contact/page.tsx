import Link from 'next/link';
import { env } from '@/lib/env';
import { PageHeader, Card } from '@/components/ui';
export const metadata = { title: 'Contact' };
export default function ContactPage() {
  const e = env();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="Contact" subtitle="The fastest way to reach us is live chat — we usually reply within minutes during business hours." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><h2 className="font-bold">Live chat</h2><p className="mt-1 text-sm text-muted">Orders, downloads, licensing and file problems.</p><Link href="/support/chat" className="mt-3 inline-block font-semibold text-accent underline">Start a chat</Link></Card>
        <Card><h2 className="font-bold">Company</h2><p className="mt-1 text-sm text-muted">{e.SELLER_NAME}<br />{e.SELLER_ADDRESS}<br />VAT {e.SELLER_VAT_ID}</p></Card>
      </div>
    </div>
  );
}
