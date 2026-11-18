import { db } from '@/lib/db';
import { TIERS, type Tier } from '@/lib/licenses';
import { rateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { clientIp, formatDate } from '@/lib/utils';
import { Alert, Card } from '@/components/ui';

export const metadata = { title: 'License verification', robots: { index: false } };

export default async function VerifyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const rl = await rateLimit(`verify:${clientIp(await headers())}`, 30, 60);
  const license = rl.ok ? await db.license.findUnique({ where: { key: decodeURIComponent(key).toUpperCase() }, include: { product: true, order: true } }) : null;
  const masked = (email: string) => email.replace(/^(.).*(@.).*(\..+)$/, '$1•••$2•••$3');
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="mb-6 text-3xl font-extrabold">License verification</h1>
      {!rl.ok && <Alert tone="warning">Too many lookups. Try again in a minute.</Alert>}
      {rl.ok && !license && <Alert tone="danger">No license with key <code>{key}</code> exists. It may be mistyped or counterfeit.</Alert>}
      {license && (
        <Card>
          <Alert tone={license.status === 'ACTIVE' ? 'success' : 'danger'}>{license.status === 'ACTIVE' ? '✓ This license is genuine and active.' : `✗ This license is ${license.status.toLowerCase()}${license.revokedAt ? ` since ${formatDate(license.revokedAt)}` : ''}.`}</Alert>
          <dl className="mt-4 grid grid-cols-[140px_1fr] gap-2 text-sm">
            <dt className="text-muted">Key</dt><dd className="font-mono">{license.key}</dd>
            <dt className="text-muted">Asset</dt><dd>{license.product.title}</dd>
            <dt className="text-muted">License</dt><dd>{TIERS[license.tier as Tier].name}{license.seats > 1 ? ` (${license.seats} seats)` : ''}</dd>
            <dt className="text-muted">Licensee</dt><dd>{license.order.companyName || masked(license.email)}</dd>
            <dt className="text-muted">Issued</dt><dd>{formatDate(license.createdAt)}</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}
