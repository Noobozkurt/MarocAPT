import Link from 'next/link';
export default function Forbidden() {
  return <div className="mx-auto max-w-md py-16 text-center"><h1 className="text-2xl font-extrabold">Not allowed</h1><p className="mt-2 text-muted">Your role doesn’t include this area. Ask a super admin if you need access.</p><Link href="/admin" className="mt-6 inline-block text-accent underline">Back to dashboard</Link></div>;
}
