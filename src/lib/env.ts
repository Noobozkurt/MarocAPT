import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  NEXTAUTH_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i).default('0'.repeat(64)),
  PAYMENT_PROVIDER: z.enum(['stripe', 'test', '']).optional().default(''),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_AUTOMATIC_TAX: z.string().optional().default('false'),
  TEST_PAYMENT_WEBHOOK_SECRET: z.string().default('whsec_test_local_simulator_secret'),
  SELLER_NAME: z.string().default('Aether3D Studio AB'),
  SELLER_ADDRESS: z.string().default('Example Street 1, 111 22 Stockholm, Sweden'),
  SELLER_COUNTRY: z.string().length(2).default('SE'),
  SELLER_VAT_ID: z.string().default('SE556677889901'),
  VIES_MODE: z.enum(['live', 'mock']).default('live'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_BUCKET: z.string().default('aether3d-private'),
  S3_FORCE_PATH_STYLE: z.string().default('true'),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  EMAIL_FROM: z.string().default('Aether3D <noreply@aether3d.local>'),
  SMTP_URL: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  SUPPORT_REPLY_DOMAIN: z.string().default('reply.aether3d.local'),
  INBOUND_EMAIL_SECRET: z.string().default('change-me-inbound'),
  CHAT_OFFLINE_EMAIL_MINUTES: z.coerce.number().min(0).default(5),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  CHAT_RETENTION_MONTHS: z.coerce.number().int().min(1).default(24),
  CLAMAV_HOST: z.string().optional().default(''),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  TURNSTILE_SECRET_KEY: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.NEXTAUTH_SECRET.startsWith('dev-')) throw new Error('NEXTAUTH_SECRET must be set in production');
    if (/^0+$/.test(parsed.data.APP_ENCRYPTION_KEY)) throw new Error('APP_ENCRYPTION_KEY must be set in production');
  }
  cached = parsed.data;
  return cached;
}

export function paymentProviderName(): 'stripe' | 'test' {
  const e = env();
  if (e.PAYMENT_PROVIDER) return e.PAYMENT_PROVIDER;
  return e.STRIPE_SECRET_KEY ? 'stripe' : 'test';
}

export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Aether3D';
