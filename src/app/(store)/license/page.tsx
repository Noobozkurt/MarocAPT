import { LICENSE_TIERS, TIERS } from '@/lib/licenses';
import { PageHeader } from '@/components/ui';
import { STORE_NAME } from '@/lib/env';

export const metadata = { title: 'Licenses explained' };

export default function LicensePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Licenses explained" subtitle="Plain-language summaries first. The full legal text follows below." />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">License comparison</caption>
          <thead className="bg-surface-2"><tr><th scope="col" className="p-3 text-left">Right</th>{LICENSE_TIERS.map((t) => <th key={t} scope="col" className="p-3 text-left">{TIERS[t].name}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {[
              ['Personal & portfolio use', [1, 1, 1, 1, 1]],
              ['Editorial / news / education', [0, 1, 1, 1, 1]],
              ['Client work, ads, film & TV', [0, 0, 1, 1, 1]],
              ['Games & apps sold to end users', [0, 0, 0, 1, 1]],
              ['Merchandise & 3D prints for sale', [0, 0, 0, 1, 1]],
              ['Multiple users (seats)', [0, 0, 0, 0, 1]],
              ['Resell the raw asset files', [0, 0, 0, 0, 0]],
            ].map(([label, v]) => (
              <tr key={label as string}><th scope="row" className="p-3 text-left font-medium">{label as string}</th>{(v as number[]).map((x, i) => <td key={i} className="p-3">{x ? '✓ Yes' : '— No'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Columns in order: Personal, Commercial, Extended, Editorial, Team — Editorial covers editorial use only and is not part of the commercial upgrade path.</p>
      <section className="prose-s3d mt-12 max-w-3xl">
        <h2>Full license text</h2>
        <p>1. <strong>Grant.</strong> {STORE_NAME} grants you a worldwide, non-exclusive, perpetual license to use the purchased asset under the tier shown on your license certificate. Each certificate carries a unique key that third parties can verify at /verify.</p>
        <p>2. <strong>Restrictions.</strong> You may not resell, sublicense, share or redistribute the asset files on their own or as part of another asset pack, template or library, regardless of tier. Embedded use (e.g. compiled inside a game build) is not redistribution.</p>
        <p>3. <strong>Team licenses</strong> may be used by the number of named seats purchased. Seats may be reassigned when a team member leaves.</p>
        <p>4. <strong>Updates.</strong> Your license covers all future versions of the same asset.</p>
        <p>5. <strong>Termination.</strong> Licenses tied to refunded or charged-back orders are revoked. Breach of these terms terminates the license.</p>
        <p>6. <strong>AI disclosure.</strong> Assets created or assisted by AI are labelled on the product page. You may not use assets to train generative models unless you hold an Extended or Team license.</p>
        <p>7. <strong>Warranty.</strong> Assets are provided as described. If a file is defective or misdescribed, contact support for a fix or refund.</p>
      </section>
    </div>
  );
}
