import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { Providers } from '@/components/providers';
import { CookieConsent } from '@/components/cookie-consent';
import { getStoreContext } from '@/server/context';
import { STORE_NAME } from '@/lib/env';
import { RTL_LOCALES } from '@/lib/i18n';
import { absoluteUrl } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl('/')),
  title: { default: `${STORE_NAME} — 3D models, materials & game-ready assets`, template: `%s · ${STORE_NAME}` },
  description: 'Production-ready 3D models, PBR materials, rigs and game-ready packs with clear licenses, instant secure downloads and free updates.',
  applicationName: STORE_NAME,
  manifest: '/manifest.webmanifest',
  openGraph: { type: 'website', siteName: STORE_NAME },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0a0a0f' }, { media: '(prefers-color-scheme: light)', color: '#f6f6fa' }],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStoreContext();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang={ctx.locale} dir={RTL_LOCALES.includes(ctx.locale) ? 'rtl' : 'ltr'} className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Providers store={{ currency: ctx.currency, country: ctx.country, locale: ctx.locale, taxInclusive: ctx.tax.displayInclusive, taxLabel: ctx.tax.label }}>
          {children}
          <CookieConsent />
        </Providers>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
      </body>
    </html>
  );
}
