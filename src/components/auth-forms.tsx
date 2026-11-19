'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Input, Label } from './ui';

export function LoginForm({ oauth }: { oauth: string[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const next = sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : '/account';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(sp.get('error') === 'suspended' ? 'This account is suspended.' : null);
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(sp.get('check') === 'email');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, totp, redirect: false });
    setBusy(false);
    if (res?.error === '2FA_REQUIRED') return setNeeds2fa(true);
    if (res?.error) return setError(res.error === 'CredentialsSignin' ? 'Invalid email or password' : res.error);
    router.push(next);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {magicSent && <Alert tone="success">Check your inbox — we sent you a sign-in link.</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" /></div>
        <div>
          <div className="flex justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs text-accent">Forgot?</Link></div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
        </div>
        {needs2fa && (
          <div>
            <Label htmlFor="totp">Two-factor code</Label>
            <Input id="totp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required value={totp} onChange={(e) => setTotp(e.target.value)} data-testid="login-totp" />
            <p className="mt-1 text-xs text-muted">Open your authenticator app and enter the 6-digit code.</p>
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" disabled={busy} data-testid="login-submit">{busy ? 'Signing in…' : needs2fa ? 'Verify & sign in' : 'Sign in'}</Button>
      </form>
      <div className="relative text-center text-xs text-muted"><span className="bg-bg px-2">or</span></div>
      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full" onClick={async () => { if (!email) return setError('Enter your email first'); await signIn('email', { email, callbackUrl: next, redirect: false }); setMagicSent(true); }}>Email me a magic link</Button>
        {oauth.map((p) => <Button key={p} type="button" variant="outline" className="w-full capitalize" onClick={() => signIn(p, { callbackUrl: next })}>Continue with {p}</Button>)}
      </div>
      <p className="text-center text-sm text-muted">New here? <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-accent">Create an account</Link></p>
    </div>
  );
}

export function RegisterForm({ claimToken, presetEmail }: { claimToken?: string; presetEmail?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ error?: string; done?: boolean; busy?: boolean }>({});
  return state.done ? (
    <Alert tone="success">Account created! {claimToken ? 'Your purchases are now in your library.' : 'Check your email to verify your address.'} <Link href="/login" className="underline">Sign in</Link></Alert>
  ) : (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ busy: true });
        const fd = new FormData(e.currentTarget);
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), marketingConsent: fd.get('marketing') === 'on', claimToken }) });
        const data = await res.json();
        if (!res.ok) return setState({ error: data.issues?.[0]?.message || data.error });
        if (claimToken) {
          await signIn('credentials', { email: fd.get('email'), password: fd.get('password'), redirect: false });
          router.push('/account/library');
          router.refresh();
          return;
        }
        setState({ done: true });
      }}
    >
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required maxLength={80} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required defaultValue={presetEmail} readOnly={Boolean(presetEmail)} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /><p className="mt-1 text-xs text-muted">At least 10 characters.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="marketing" /> <span>Email me about new releases and sales (optional, unsubscribe any time).</span></label>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={state.busy}>Create account</Button>
      <p className="text-xs text-muted">By creating an account you agree to our <Link href="/legal/terms" className="underline">terms</Link> and <Link href="/legal/privacy" className="underline">privacy policy</Link>.</p>
    </form>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  return sent ? <Alert tone="success">If an account exists for that email, we’ve sent a reset link.</Alert> : (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await fetch('/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: new FormData(e.currentTarget).get('email') }) }); setSent(true); }}>
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
      <Button type="submit" className="w-full">Send reset link</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  return state.done ? <Alert tone="success">Password updated and all other sessions signed out. <Link href="/login" className="underline">Sign in</Link></Alert> : (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: new FormData(e.currentTarget).get('password') }) }); const d = await r.json(); setState(r.ok ? { done: true } : { error: d.issues?.[0]?.message || d.error }); }}>
      <div><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" className="w-full">Set new password</Button>
    </form>
  );
}
