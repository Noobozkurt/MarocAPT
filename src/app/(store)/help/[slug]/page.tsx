import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { renderSafeMarkdown } from '@/lib/sanitize';
import { absoluteUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await db.helpArticle.findUnique({ where: { slug } });
  if (!a || !a.published) notFound();
  await db.helpArticle.update({ where: { id: a.id }, data: { views: { increment: 1 } } });
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: a.title, acceptedAnswer: { '@type': 'Answer', text: a.body } }], url: absoluteUrl(`/help/${a.slug}`) };
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <Link href="/help" className="text-sm text-muted hover:text-fg">← Help center</Link>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-accent">{a.category}</p>
      <h1 className="mt-1 text-3xl font-extrabold">{a.title}</h1>
      <div className="prose-s3d mt-6" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(a.body) }} />
      <p className="mt-10 text-sm text-muted">Didn’t help? <Link href="/support/chat" className="text-accent underline">Talk to a human</Link>.</p>
    </article>
  );
}
