import { redirect } from 'next/navigation';
import { PageHeader, Input, Button } from '@/components/ui';
export const metadata = { title: 'Verify a license' };
export default async function VerifyIndex({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (key) redirect(`/verify/${encodeURIComponent(key.trim().toUpperCase())}`);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <PageHeader title="Verify a license" subtitle="Clients of our buyers can confirm a license is genuine and active." />
      <form className="flex gap-2"><label htmlFor="key" className="sr-only">License key</label><Input id="key" name="key" placeholder="S3D-XXXX-XXXX-XXXX-XXXX" required /><Button type="submit">Verify</Button></form>
    </div>
  );
}
