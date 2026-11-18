import { db } from '@/lib/db';
import { requirePageUser } from '@/lib/session';
import { isStaff } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { TotpSetup } from '@/components/account-forms';
import { logoutEverywhere, revokeSession, unlinkAccount } from '../actions';

export const metadata = { title: 'Security' };

export default async function SecurityPage() {
  const u = await requirePageUser('/account/security');
  const [user, sessions] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: u.id }, include: { accounts: true } }), db.authSession.findMany({ where: { userId: u.id }, orderBy: { lastSeenAt: 'desc' } })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Security" />
      <Card><h2 className="mb-4 font-bold">Two-factor authentication (TOTP)</h2><TotpSetup enabled={user.totpEnabled} staff={isStaff(user.role)} /><p className="mt-3 text-xs text-muted">Passkeys (WebAuthn) are on the roadmap; use an authenticator app for now.</p></Card>
      <Card>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Active sessions</h2><form action={logoutEverywhere}><Button variant="outline" size="sm">Log out everywhere</Button></form></div>
        <ul className="divide-y divide-border text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block truncate">{s.userAgent ?? 'Unknown device'}</span><span className="text-xs text-muted">{s.ip} · last active {formatDate(s.lastSeenAt, 'en', { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
              {s.id === u.sid ? <Badge tone="success">This device</Badge> : <form action={revokeSession}><input type="hidden" name="id" value={s.id} /><Button variant="ghost" size="sm">Revoke</Button></form>}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">Connected accounts</h2>
        {user.accounts.length === 0 ? <p className="text-sm text-muted">No social logins connected. Sign in with Google, GitHub or Discord (when enabled) to link one.</p> : (
          <ul className="space-y-2 text-sm">{user.accounts.map((a) => <li key={a.id} className="flex items-center justify-between capitalize">{a.provider}<form action={unlinkAccount}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" size="sm">Disconnect</Button></form></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
