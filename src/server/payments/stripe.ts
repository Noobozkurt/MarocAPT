import Stripe from 'stripe';
import type { CheckoutSessionInput, PaymentProviderAdapter } from './types';

let client: Stripe | null = null;
export function stripeClient(): Stripe {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true, maxNetworkRetries: 2 });
  }
  return client;
}

/** Signature verification only needs the secret, not an API key. */
export function verifyStripeSignature(payload: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new Error('Missing stripe-signature header');
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

export function signStripeShapedPayload(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

export const stripeProvider: PaymentProviderAdapter = {
  name: 'STRIPE',
  async createCheckout(input: CheckoutSessionInput) {
    const session = await stripeClient().checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: input.email,
        client_reference_id: input.orderId,
        // Cards, Apple Pay, Google Pay, Link and local methods (iDEAL, Bancontact, Klarna, Swish…)
        // are enabled from the Stripe Dashboard via dynamic payment methods.
        line_items: input.lines.map((l) => ({
          quantity: l.quantity,
          price_data: { currency: input.currency.toLowerCase(), unit_amount: l.amount, product_data: { name: l.name } },
        })),
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
        metadata: { orderId: input.orderId },
        payment_intent_data: { metadata: { orderId: input.orderId } },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      { idempotencyKey: `checkout_${input.idempotencyKey}` },
    );
    return { sessionId: session.id, url: session.url! };
  },
  async refund({ paymentId, amount, orderId, idempotencyKey }) {
    const r = await stripeClient().refunds.create({ payment_intent: paymentId, amount, metadata: { orderId } }, { idempotencyKey: `refund_${idempotencyKey}` });
    return { refundId: r.id };
  },
};
