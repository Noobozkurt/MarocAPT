// Local payment simulator. It behaves like a hosted checkout + webhooks: the browser is sent to
// /pay/test/<session>, the "provider" posts Stripe-shaped events signed with TEST_PAYMENT_WEBHOOK_SECRET
// to /api/webhooks/test, and fulfilment happens only after that signature is verified.
import { randomToken } from '@/lib/crypto';
import { signStripeShapedPayload } from './stripe';
import type { PaymentProviderAdapter } from './types';

export function testWebhookSecret() {
  return process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'whsec_test_local_simulator_secret';
}

export async function deliverTestEvent(type: string, object: Record<string, unknown>): Promise<Response> {
  const event = { id: `evt_test_${randomToken(12)}`, object: 'event', type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } };
  const payload = JSON.stringify(event);
  const base = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  return fetch(`${base}/api/webhooks/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signStripeShapedPayload(payload, testWebhookSecret()) },
    body: payload,
  });
}

export const testProvider: PaymentProviderAdapter = {
  name: 'TEST',
  async createCheckout(input) {
    const sessionId = `cs_test_${randomToken(18)}`;
    return { sessionId, url: `/pay/test/${sessionId}` };
  },
  async refund({ paymentId, amount, orderId }) {
    const refundId = `re_test_${randomToken(12)}`;
    // Async like a real provider: the charge.refunded webhook follows shortly.
    setTimeout(() => {
      deliverTestEvent('charge.refunded', {
        id: `ch_test_${paymentId}`,
        object: 'charge',
        payment_intent: paymentId,
        amount_refunded: amount,
        metadata: { orderId },
        refunds: { data: [{ id: refundId, amount }] },
      }).catch((e) => console.error('[test-provider] refund webhook failed', e));
    }, 300);
    return { refundId };
  },
};
