'use client';

import { useState } from 'react';
import { Button, Input, Label, Alert } from './ui';

export function TestPaymentForm({ session }: { session: string }) {
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [step, setStep] = useState<'card' | '3ds'>('card');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pay = async (threeDs?: 'approve' | 'fail') => {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/pay/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, card, threeDs }) });
    const data = await res.json();
    setBusy(false);
    if (data.status === 'requires_action') return setStep('3ds');
    if (!res.ok) {
      setStep('card');
      return setError(data.error);
    }
    window.location.assign(data.redirectUrl);
  };
  if (step === '3ds')
    return (
      <div className="mt-6 space-y-3" role="dialog" aria-label="3-D Secure verification">
        <Alert tone="warning">Your bank asks you to confirm this payment (3-D Secure test).</Alert>
        <div className="flex gap-2">
          <Button onClick={() => pay('approve')} disabled={busy} data-testid="3ds-approve">Complete authentication</Button>
          <Button variant="outline" onClick={() => pay('fail')} disabled={busy}>Fail authentication</Button>
        </div>
      </div>
    );
  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); pay(); }}>
      <div>
        <Label htmlFor="card">Card number</Label>
        <Input id="card" inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => setCard(e.target.value)} data-testid="test-card" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="exp">Expiry</Label><Input id="exp" defaultValue="12/34" autoComplete="cc-exp" /></div>
        <div><Label htmlFor="cvc">CVC</Label><Input id="cvc" defaultValue="123" autoComplete="cc-csc" /></div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="test-pay">{busy ? 'Processing…' : 'Pay'}</Button>
    </form>
  );
}
