export interface CheckoutSessionInput {
  orderId: string;
  email: string;
  currency: string;
  lines: Array<{ name: string; amount: number; quantity: number }>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface PaymentProviderAdapter {
  name: 'STRIPE' | 'TEST';
  createCheckout(input: CheckoutSessionInput): Promise<{ sessionId: string; url: string }>;
  refund(input: { paymentId: string; amount: number; orderId: string; idempotencyKey: string }): Promise<{ refundId: string }>;
}
