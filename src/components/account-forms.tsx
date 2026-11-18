'use client';

import { useActionState, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, Button, Input, Label, Select } from './ui';
import { changePassword, confirmTotp, deleteAccount, disableTotp, startTotpSetup, updateNotifications, updateProfile } from '@/app/(store)/account/actions';

type State = { ok?: string; error?: string; mfaCode?: string } | null;

function Msg({ s }: { s: State }) {
  if (!s) return null;
  return s.error ? <Alert tone="danger">{s.error}</Alert> : s.ok ? <Alert tone="success">{s.ok}</Alert> : null;
}

export function ProfileForm({ name, currency, locale }: { name: string; currency: string; locale: string }) {
  const [s, act, pending] = useActionState<State, FormData>(updateProfile, null);
  return (
    <form action={act} className="space-y-3">
      <div><Label htmlFor="p-name">Name</Label><Input id="p-name" name="name" defaultValue={name} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="p-cur">Currency</Label><Select id="p-cur" name="currency" defaultValue={currency} className="w-full">{['USD', 'EUR', 'GBP', 'SEK'].map((c) => <option key={c}>{c}</option>)}</Select></div>
        <div><Label htmlFor="p-loc">Language</Label><Select id="p-loc" name="locale" defaultValue={locale} className="w-full"><option value="en">English</option><option value="fr">Français</option></Select></div>
      </div>
      <Msg s={s} />
      <Button disabled={pending}>Save profile</Button>
    </form>
  );
}

export function NotificationsForm(p: { chat: boolean; order: boolean; wishlist: boolean; marketing: boolean }) {
  const [s, act, pending] = useActionState<State, FormData>(updateNotifications, null);
  return (
    <form action={act} className="space-y-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" name="chat" defaultChecked={p.chat} /> Email me support replies when I’m offline</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="order" defaultChecked={p.order} /> Order, download and asset-update emails</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="wishlist" defaultChecked={p.wishlist} /> Wishlist price-drop and sale alerts</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="marketing" defaultChecked={p.marketing} /> Newsletter and promotions</label>
      <Msg s={s} />
      <Button disabled={pending} size="sm">Save preferences</Button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [s, act, pending] = useActionState<State, FormData>(changePassword, null);
  return (
    <form action={act} className="space-y-3">
      {hasPassword && <div><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" name="current" type="password" autoComplete="current-password" required /></div>}
      <div><Label htmlFor="pw-new">New password</Label><Input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={10} required /></div>
      <Msg s={s} />
      <Button disabled={pending}>{hasPassword ? 'Change password' : 'Set password'}</Button>
    </form>
  );
}

export function TotpSetup({ enabled, staff }: { enabled: boolean; staff: boolean }) {
  const { update } = useSession();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [s, act, pending] = useActionState<State, FormData>(async (prev, fd) => {
    const r = await confirmTotp(prev, fd);
    if (r.mfaCode) await update({ mfaCode: r.mfaCode }); // mark this session as 2FA-verified
    return r;
  }, null);
  const [ds, dact] = useActionState<State, FormData>(disableTotp, null);
  if (enabled && !s?.ok)
    return (
      <div className="space-y-3">
        <Alert tone="success">Two-factor authentication is on.</Alert>
        {!staff && (
          <form action={dact} className="flex gap-2"><Input name="code" inputMode="numeric" placeholder="Current 6-digit code" aria-label="Current 2FA code" className="max-w-[200px]" /><Button variant="outline">Disable 2FA</Button></form>
        )}
        <Msg s={ds} />
      </div>
    );
  if (s?.ok) return <Alert tone="success">2FA enabled. You’ll be asked for a code when you sign in.</Alert>;
  return (
    <div className="space-y-3">
      {staff && <Alert tone="warning">Staff accounts must enable 2FA before they can open the admin panel.</Alert>}
      {!setup ? (
        <Button onClick={async () => setSetup(await startTotpSetup())}>Set up authenticator app</Button>
      ) : (
        <form action={act} className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl bg-white p-2" />
          <p className="text-xs text-muted">Can’t scan? Enter this key: <code className="font-mono">{setup.secret}</code></p>
          <div><Label htmlFor="totp-code">6-digit code</Label><Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="max-w-[200px]" /></div>
          <Msg s={s} />
          <Button disabled={pending}>Verify & enable</Button>
        </form>
      )}
    </div>
  );
}

export function DeleteAccountForm() {
  const [s, act, pending] = useActionState<State, FormData>(deleteAccount, null);
  return (
    <form action={act} className="space-y-3">
      <p className="text-sm text-muted">This permanently deletes your profile, reviews and chat content and revokes your licenses. Invoices are kept, anonymised, because tax law requires it.</p>
      <div><Label htmlFor="confirm-del">Type DELETE to confirm</Label><Input id="confirm-del" name="confirm" className="max-w-[200px]" /></div>
      <Msg s={s} />
      <Button variant="danger" disabled={pending}>Delete my account</Button>
    </form>
  );
}
