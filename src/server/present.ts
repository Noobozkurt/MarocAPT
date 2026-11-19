import type { ProductPrice } from '@prisma/client';
import { formatMoney } from '@/lib/money';
import { taxOn } from '@/lib/tax';
import type { StoreContext } from './context';

/** Storefront price for a tier: sale applied, tax added when the visitor's region shows tax-inclusive prices. */
export function displayPrice(prices: ProductPrice[], tier: string, ctx: StoreContext, salePercent = 0, isFree = false) {
  const base = prices.find((p) => p.tier === tier && p.currency === ctx.currency)?.amount ?? 0;
  const sale = salePercent && !isFree ? base - Math.round((base * salePercent) / 100) : base;
  const gross = (n: number) => (ctx.tax.displayInclusive ? n + taxOn(n, ctx.tax.rateBps) : n);
  const loc = ctx.locale === 'fr' ? 'fr-FR' : 'en-US';
  return {
    amount: gross(sale),
    original: sale !== base ? gross(base) : null,
    text: isFree || base === 0 ? (ctx.locale === 'fr' ? 'Gratuit' : 'Free') : formatMoney(gross(sale), ctx.currency, loc),
    originalText: sale !== base ? formatMoney(gross(base), ctx.currency, loc) : null,
    taxNote: ctx.tax.displayInclusive ? (ctx.tax.rateBps ? `incl. ${ctx.tax.label}` : '') : ctx.tax.rateBps || ctx.country === 'US' ? '+ tax' : '',
  };
}
