import { NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/server/payments/stripe';
import { testWebhookSecret } from '@/server/payments/test';
import { handleProviderEvent } from '@/server/fulfillment';
import { paymentProviderName } from '@/lib/env';

/** Webhook endpoint of the local test provider. Same Stripe signature scheme, separate secret. */
export async function POST(req: Request) {
  if (paymentProviderName() !== 'test' && process.env.ALLOW_TEST_PROVIDER !== '1') return NextResponse.json({ error: 'Test provider disabled' }, { status: 404 });
  const payload = await req.text();
  let event;
  try {
    event = verifyStripeSignature(payload, req.headers.get('stripe-signature'), testWebhookSecret());
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }
  try {
    return NextResponse.json({ received: true, outcome: await handleProviderEvent('TEST', event as never) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
