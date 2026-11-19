import Link from 'next/link';
import { t } from '@/lib/i18n';
import { STORE_NAME } from '@/lib/env';
import { Logo } from './header';
import { NewsletterForm } from './newsletter-form';

export function Footer({ locale }: { locale: string }) {
  const cols: Array<[string, Array<[string, string]>]> = [
    [t(locale, 'footer.store'), [['/catalog', 'Catalog'], ['/collections', 'Collections & bundles'], ['/free', 'Free asset of the month'], ['/about', 'About & creators'], ['/verify', 'Verify a license']]],
    [t(locale, 'footer.support'), [['/help', 'Help center & FAQ'], ['/support/chat', 'Live chat'], ['/contact', 'Contact'], ['/license', 'License explained'], ['/legal/refunds', 'Refund policy']]],
    [t(locale, 'footer.legal'), [['/legal/terms', 'Terms of service'], ['/legal/privacy', 'Privacy policy'], ['/legal/cookies', 'Cookie policy'], ['/legal/accessibility', 'Accessibility statement'], ['/legal/imprint', 'Imprint / legal notice']]],
  ];
  return (
    <footer className="mt-24 border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">Production-ready 3D models, materials and add-ons with clear licensing and instant, secure delivery.</p>
          <div className="mt-6"><NewsletterForm label={t(locale, 'home.newsletter')} cta={t(locale, 'home.subscribe')} /></div>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="mb-3 text-sm font-bold">{title}</h2>
            <ul className="space-y-2 text-sm text-muted">
              {links.map(([href, label]) => <li key={href}><Link href={href} className="hover:text-fg">{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-border py-6 text-center text-xs text-muted">© {new Date().getFullYear()} {STORE_NAME}. {t(locale, 'footer.rights')}</p>
    </footer>
  );
}
