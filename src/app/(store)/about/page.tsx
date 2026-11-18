import { PageHeader, Card } from '@/components/ui';
export const metadata = { title: 'About & creators' };
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title="About Stuffin3D" subtitle="A small studio-run marketplace for production-ready 3D." />
      <div className="prose-s3d"><p>We started Stuffin3D because buying 3D assets was confusing: unclear licenses, broken files and no updates. Every asset here ships with a plain-language license, a verifiable certificate and free updates for life.</p></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[['Quality-checked', 'Every upload is scanned, measured and previewed before it goes live.'], ['Fair licensing', 'Pay for the rights you need — upgrade later and only pay the difference.'], ['Creators first', 'Sellers keep the majority of every sale and get paid monthly.']].map(([t, d]) => <Card key={t}><h2 className="font-bold">{t}</h2><p className="mt-1 text-sm text-muted">{d}</p></Card>)}
      </div>
    </div>
  );
}
