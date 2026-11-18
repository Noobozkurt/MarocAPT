import { ResetForm } from '@/components/auth-forms';
export const metadata = { title: 'Choose a new password', robots: { index: false } };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <div className="mx-auto max-w-sm px-4 py-16"><h1 className="mb-8 text-3xl font-extrabold">Choose a new password</h1><ResetForm token={token ?? ''} /></div>;
}
