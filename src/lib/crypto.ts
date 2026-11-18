import crypto from 'node:crypto';
import { env } from './env';

function key(): Buffer {
  return Buffer.from(env().APP_ENCRYPTION_KEY, 'hex');
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hmac(data: string, secret = env().NEXTAUTH_SECRET): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Compact signed token: base64url(json).sig — used for socket auth and guest chat tokens. */
export function signToken(payload: Record<string, unknown>, ttlSeconds: number, purpose: string): string {
  const body = Buffer.from(JSON.stringify({ ...payload, p: purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${hmac(`${purpose}.${body}`)}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined | null, purpose: string): T | null {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmac(`${purpose}.${body}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.p !== purpose || typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    return data as T;
  } catch {
    return null;
  }
}

/** Human-friendly license key: S3D-XXXX-XXXX-XXXX-XXXX (Crockford base32, no ambiguous chars). */
export function generateLicenseKey(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i]! % 32];
  return `S3D-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}
