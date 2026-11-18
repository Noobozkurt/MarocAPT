import { HttpError } from './api';

/** Cloudflare Turnstile verification. No-op when TURNSTILE_SECRET_KEY is not configured. */
export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new HttpError(400, 'Bot check missing');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }) });
  const data = (await res.json()) as { success: boolean };
  if (!data.success) throw new HttpError(400, 'Bot check failed');
}
