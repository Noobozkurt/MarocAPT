import Link from 'next/link';
import { db } from '@/lib/db';
import { searchHelpArticles } from '@/server/chat';
import { PageHeader, Card, Input, Button } from '@/components/ui';

export const metadata = { title: 'Help center & FAQ' };
export const dynamic = 'force-dynamic';

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const articles = await db.helpArticle.findMany({ where: { published: true }, orderBy: [{ category: 'asc' }, { title: 'asc' }] });
  const results = q ? await searchHelpArticles(q, 10) : null;
  const byCat = articles.reduce<Record<string, typeof articles>>((acc, a) => ((acc[a.category] ??= []).push(a), acc), {});
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title="Help center" subtitle="Answers about downloads, licenses, payments and file formats." />
      <form className="mb-10 flex gap-2" role="search">
        <label htmlFor="help-q" className="sr-only">Search help articles</label>
        <Input id="help-q" name="q" defaultValue={q} placeholder="e.g. download limit, VAT invoice, Blender import" />
        <Button type="submit">Search</Button>
      </form>
      {results && (
        <section className="mb-10" aria-live="polite">
          <h2 className="mb-3 font-bold">{results.length} result(s)</h2>
          <ul className="space-y-2">{results.map((r) => <li key={r.slug}><Link className="text-accent underline" href={`/help/${r.slug}`}>{r.title}</Link><p className="text-sm text-muted">{r.excerpt.replace(/\*\*/g, '')}…</p></li>)}</ul>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(byCat).map(([cat, list]) => (
          <Card key={cat}>
            <h2 className="mb-3 font-bold">{cat}</h2>
            <ul className="space-y-2 text-sm">{list.map((a) => <li key={a.id}><Link href={`/help/${a.slug}`} className="hover:underline">{a.title}</Link></li>)}</ul>
          </Card>
        ))}
      </div>
      <p className="mt-10 text-center text-sm text-muted">Still stuck? <Link href="/support/chat" className="font-semibold text-accent underline">Chat with our team</Link></p>
    </div>
  );
}
