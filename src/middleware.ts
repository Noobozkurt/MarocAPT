import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { hasPermission, type RoleName } from '@/lib/permissions';

// Edge middleware: per-request CSP nonce + security headers, and a first gate for /admin and /account.
// Every page/route still re-checks permissions server-side (this is defence in depth, not the control).

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? ' https://challenges.cloudflare.com' : '';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}${turnstile}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' blob: data: ws: wss:`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob:`,
    `frame-src 'self'${turnstile}`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://checkout.stripe.com`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const isAdmin = pathname.startsWith('/admin') && !pathname.startsWith('/admin/2fa') && !pathname.startsWith('/admin/forbidden');
  const isAccount = pathname.startsWith('/account');
  if (isAdmin || isAccount) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.uid) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    if (isAdmin) {
      const role = token.role as RoleName;
      if (!hasPermission(role, 'admin:access')) return NextResponse.redirect(new URL('/', req.url));
      if (!token.mfa) return NextResponse.redirect(new URL(`/admin/2fa?next=${encodeURIComponent(pathname)}`, req.url));
    }
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self), xr-spatial-tracking=(self)');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!dev) res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return res;
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|models|posters|favicon.ico|icon.svg|sw.js|manifest.webmanifest|robots.txt|sitemap.xml).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
