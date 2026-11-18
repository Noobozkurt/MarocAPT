import { paymentProviderName } from '@/lib/env';
import { stripeProvider } from './stripe';
import { testProvider } from './test';
import type { PaymentProviderAdapter } from './types';

export function activeProvider(): PaymentProviderAdapter {
  return paymentProviderName() === 'stripe' ? stripeProvider : testProvider;
}

export function providerFor(name: string): PaymentProviderAdapter {
  return name === 'STRIPE' ? stripeProvider : testProvider;
}
