import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, json, readJson, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { absoluteUrl, clientIp } from '@/lib/utils';
import { paymentProviderName } from '@/lib/env';
import { deliverTestEvent } from '@/server/payments/test';
import { orderAccessToken } from '@/server/fulfillment';

// "Hosted payment page" backend of the local test provider. It never fulfils anything itself:
// it emits a signed checkout.session.completed webhook, exactly like a real provider would.
export const POST = route(async (req) => {
  if (paymentProviderName() !== 'test') throw new HttpError(404, 'Test provider disabled');
  await enforceRateLimit(`testpay:${clientIp(req.headers)}`, 20, 60);
  const { session, card, threeDs } = z.object({ session: z.string(), card: z.string(), threeDs: z.enum(['approve', 'fail']).optional() }).parse(await readJson(req));
  const order = await db.order.findUnique({ where: { providerSessionId: session } });
  if (!order || order.provider !== 'TEST') throw new HttpError(404, 'Unknown session');
  const redirectUrl = absoluteUrl(`/checkout/success?order=${order.id}&access=${orderAccessToken(order.id)}`);
  if (order.status === 'PAID') return json({ redirectUrl });
  const digits = card.replace(/\D/g, '');
  if (digits === '4000000000000002') {
    await db.paymentEvent.create({ data: { orderId: order.id, provider: 'TEST', type: 'payment.failed', amount: order.total, providerRef: 'card_declined' } });
    throw new HttpError(402, 'Your card was declined. Try another card.');
  }
  if (digits === '4000002760003184' && !threeDs) return json({ status: 'requires_action' });
  if (threeDs === 'fail') throw new HttpError(402, '3-D Secure authentication failed. You were not charged.');
  if (!/^4242424242424242$|^4000002760003184$/.test(digits)) throw new HttpError(402, 'Use one of the test cards listed below.');
  const res = await deliverTestEvent('checkout.session.completed', {
    id: session,
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: order.total,
    currency: order.currency.toLowerCase(),
    payment_intent: `pi_test_${order.id}`,
    customer_details: { email: order.email },
    metadata: { orderId: order.id },
  });
  if (!res.ok) throw new HttpError(502, `Webhook delivery failed (${res.status})`);
  return json({ redirectUrl });
});
