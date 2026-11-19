import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ForbiddenError, UnauthorizedError } from './permissions';
import { RateLimitError } from './rate-limit';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) return NextResponse.json({ error: 'Invalid input', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message, permission: err.permission }, { status: 403 });
  if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } });
  if (err instanceof HttpError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  console.error('[api] unhandled error', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: consistent error mapping + CSRF origin check on unsafe methods. */
export function route<C = unknown>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.csrf !== false && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** CSRF defence for cookie-authenticated JSON APIs: the Origin (or Referer) must match our host. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!origin || !host) throw new HttpError(403, 'Missing origin');
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    throw new HttpError(403, 'Bad origin');
  }
  if (o.host !== host) throw new HttpError(403, 'Cross-site request blocked');
}

export async function readJson<T = unknown>(req: Request, maxBytes = 1_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Payload too large');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
