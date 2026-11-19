import { notFound } from 'next/navigation';
import { env, STORE_NAME } from '@/lib/env';

const PAGES: Record<string, { title: string; body: (e: ReturnType<typeof env>) => string[] }> = {
  terms: { title: 'Terms of service', body: (e) => [`These terms govern purchases from ${STORE_NAME}, operated by ${e.SELLER_NAME}, ${e.SELLER_ADDRESS}.`, 'Contract: by placing an order you enter a contract for the supply of digital content. Prices are shown with or without tax depending on your region and confirmed at checkout.', 'Delivery: files are delivered immediately after payment through your library and the order email. Download links are personal, single-use and expire after a few minutes.', 'Right of withdrawal: for EU consumers, you expressly agree that delivery starts immediately and acknowledge that you thereby lose your right of withdrawal (Art. 16(m) Directive 2011/83/EU). This does not affect your statutory rights for faulty content.', 'Accounts: keep your credentials secure. We may suspend accounts used for fraud, chargeback abuse or license violations.', 'Liability: our liability is limited to the price paid, except where the law does not allow such a limitation.', 'Governing law: Swedish law, without prejudice to mandatory consumer protection in your country of residence. EU online dispute resolution: https://ec.europa.eu/consumers/odr'] },
  privacy: { title: 'Privacy policy', body: (e) => [`Controller: ${e.SELLER_NAME}, ${e.SELLER_ADDRESS}.`, 'Data we process: account details (email, name, password hash), order and invoice data (kept 7 years for tax law), download logs (IP, time, file — fraud prevention, 24 months), support chat history (configurable retention, default 24 months, then anonymised), and analytics only with your consent.', 'Processors: payment providers (Stripe, PayPal), email delivery, hosting and storage providers, each under a data-processing agreement.', 'Your rights: access, rectification, erasure, restriction, portability and objection. Export your data or delete your account at Account → Privacy. Orders are anonymised rather than deleted where tax law requires us to keep them.', 'International transfers rely on the EU Standard Contractual Clauses where applicable.', 'Complaints can be filed with your local data protection authority.'] },
  cookies: { title: 'Cookie policy', body: () => ['Essential cookies (always on): session and security (next-auth), CSRF protection, cart, currency/country/language preferences and your consent choice.', 'Analytics (only after you click "Accept analytics"): privacy-friendly, cookieless-where-possible product analytics. No advertising or cross-site tracking cookies are used.', 'You can change your choice at any time by clearing the s3d_consent cookie; the banner will appear again. Rejecting is as easy as accepting.'] },
  refunds: { title: 'Refund policy', body: () => ['Digital files are delivered instantly. Because you agree at checkout to immediate delivery, the 14-day withdrawal right does not apply once a download has started.', 'We still refund in these cases: the file is faulty and we cannot fix it, the asset does not match its description, you were charged twice, or you bought the same asset twice by mistake.', 'Request a refund through support chat within 30 days. Approved refunds go back to the original payment method and the license is revoked automatically.'] },
  accessibility: { title: 'Accessibility statement', body: () => [`${STORE_NAME} aims to conform to WCAG 2.2 level AA and the European Accessibility Act.`, 'Measures: full keyboard navigation (including the 3D viewer — arrow keys orbit, +/− zoom — and the support chat), visible focus indicators, screen-reader labels, live regions announcing new chat messages, reduced-motion support (auto-rotation and animations are disabled), sufficient colour contrast in light and dark themes.', 'Known limitations: 3D previews are inherently visual; every asset has a text specification table and poster image with alternative text.', 'Feedback: contact us through the support chat or the contact page and we will respond within 5 business days.'] },
  imprint: { title: 'Imprint / legal notice', body: (e) => [e.SELLER_NAME, e.SELLER_ADDRESS, `VAT ID: ${e.SELLER_VAT_ID}`, 'Contact: via the contact page or live chat.', 'Responsible for content: the managing director of the company named above.'] },
};

export function generateMetadata() {
  return {};
}

export default async function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const p = PAGES[page];
  if (!p) notFound();
  return (
    <article className="prose-s3d mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold">{p.title}</h1>
      <p className="text-sm text-muted">Last updated: {new Date().getFullYear()}-01-01. Template text — have it reviewed by counsel before launch.</p>
      {p.body(env()).map((para, i) => <p key={i}>{para}</p>)}
    </article>
  );
}
