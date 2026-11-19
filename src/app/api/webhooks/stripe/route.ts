import { NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/server/payments/stripe';
import { handleProviderEvent } from '@/server/fulfillment';

// Fulfilment happens ONLY here (and in the test-provider twin), after signature verification.
export async function POST(req: Request) {
  const payload = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  let event;
  try {
    event = verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }
  try {
    const outcome = await handleProviderEvent('STRIPE', event as never);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    console.error('[stripe webhook]', e);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 }); // Stripe retries
  }
}
