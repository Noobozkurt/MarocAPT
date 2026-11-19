import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { License, Order, OrderItem, Product } from '@prisma/client';
import { env, STORE_NAME } from '@/lib/env';
import { TIERS, type Tier } from '@/lib/licenses';
import { formatMoney } from '@/lib/money';
import { bpsToPercent } from '@/lib/tax';
import { absoluteUrl } from '@/lib/utils';

const ACCENT = rgb(0.486, 0.361, 1);
const GREY = rgb(0.42, 0.42, 0.48);

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size = 10, color = rgb(0.1, 0.1, 0.12)) {
  // Standard fonts are WinAnsi: replace characters they cannot encode.
  const safe = s.replace(/[—–]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, 'x').replace(/•/g, '-').replace(/[^\x20-\x7E\xA0-\xFF€]/g, '?');
  page.drawText(safe, { x, y, size, font, color });
}

export async function invoicePdf(order: Order & { items: OrderItem[] }): Promise<Uint8Array> {
  const e = env();
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${order.invoiceNumber}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  text(page, STORE_NAME, 50, y, bold, 20, ACCENT);
  text(page, 'INVOICE', 440, y, bold, 18);
  y -= 22;
  text(page, e.SELLER_NAME, 50, y, font, 9, GREY);
  text(page, `No. ${order.invoiceNumber ?? 'PENDING'}`, 440, y, font, 10);
  y -= 12;
  text(page, e.SELLER_ADDRESS, 50, y, font, 9, GREY);
  text(page, `Date: ${(order.paidAt ?? order.createdAt).toISOString().slice(0, 10)}`, 440, y, font, 10);
  y -= 12;
  text(page, `VAT ID: ${e.SELLER_VAT_ID}`, 50, y, font, 9, GREY);
  text(page, `Order: ${order.id}`, 440, y, font, 8, GREY);

  y -= 40;
  text(page, 'Bill to', 50, y, bold, 10);
  y -= 14;
  if (order.companyName) {
    text(page, order.companyName, 50, y, font, 10);
    y -= 13;
  }
  text(page, order.email, 50, y, font, 10);
  y -= 13;
  text(page, `Country: ${order.taxCountry}${order.taxRegion ? ` / ${order.taxRegion}` : ''}`, 50, y, font, 10);
  if (order.vatId) {
    y -= 13;
    text(page, `VAT ID: ${order.vatId}${order.vatIdValidated ? ' (validated)' : ''}`, 50, y, font, 10);
  }

  y -= 36;
  page.drawRectangle({ x: 45, y: y - 6, width: 505, height: 20, color: rgb(0.95, 0.94, 1) });
  text(page, 'Item', 50, y, bold, 9);
  text(page, 'License', 280, y, bold, 9);
  text(page, 'Net', 380, y, bold, 9);
  text(page, 'Tax', 440, y, bold, 9);
  text(page, 'Total', 500, y, bold, 9);
  y -= 22;
  for (const i of order.items) {
    const net = i.unitAmount * i.seats - i.discountAmount;
    text(page, i.title.slice(0, 42), 50, y, font, 9);
    text(page, `${TIERS[i.tier as Tier].name}${i.seats > 1 ? ` x${i.seats}` : ''}${i.upgradeFromLicenseId ? ' (upgrade)' : ''}`, 280, y, font, 9);
    text(page, formatMoney(net, order.currency), 380, y, font, 9);
    text(page, formatMoney(i.taxAmount, order.currency), 440, y, font, 9);
    text(page, formatMoney(i.totalAmount, order.currency), 500, y, font, 9);
    y -= 16;
  }
  y -= 10;
  page.drawLine({ start: { x: 330, y: y + 6 }, end: { x: 550, y: y + 6 }, thickness: 0.5, color: GREY });
  const rows: Array<[string, number]> = [
    ['Subtotal', order.subtotal],
    ['Discounts', -order.discountTotal],
    [order.taxMode === 'REVERSE_CHARGE' ? 'VAT (reverse charge)' : `Tax ${bpsToPercent(order.taxRateBps)}`, order.taxTotal],
  ];
  if (order.creditApplied) rows.push(['Store credit', -order.creditApplied]);
  for (const [label, v] of rows) {
    y -= 14;
    text(page, label, 340, y, font, 9);
    text(page, formatMoney(v, order.currency), 480, y, font, 9);
  }
  y -= 18;
  text(page, 'Total paid', 340, y, bold, 11);
  text(page, formatMoney(order.total, order.currency), 480, y, bold, 11);
  if (order.amountRefunded) {
    y -= 14;
    text(page, 'Refunded', 340, y, font, 9, rgb(0.7, 0.1, 0.1));
    text(page, formatMoney(-order.amountRefunded, order.currency), 480, y, font, 9, rgb(0.7, 0.1, 0.1));
  }
  y -= 40;
  if (order.taxMode === 'REVERSE_CHARGE') {
    text(page, 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC).', 50, y, font, 8, GREY);
    y -= 12;
  }
  text(page, 'Digital content delivered electronically. The buyer consented to immediate delivery and', 50, y, font, 8, GREY);
  y -= 11;
  text(page, 'acknowledged the loss of the right of withdrawal (Art. 16(m) Directive 2011/83/EU).', 50, y, font, 8, GREY);
  return doc.save();
}

export async function certificatePdf(license: License & { product: Product; order: Order }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`License certificate ${license.key}`);
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: ACCENT, borderWidth: 3 });
  text(page, STORE_NAME, 60, 520, bold, 18, ACCENT);
  text(page, 'License Certificate', 60, 470, bold, 32);
  const info = TIERS[license.tier as Tier];
  const rows: Array<[string, string]> = [
    ['Asset', license.product.title],
    ['License', `${info.name}${license.seats > 1 ? ` - ${license.seats} seats` : ''}`],
    ['Licensee', license.order.companyName || license.email],
    ['Order', license.order.invoiceNumber || license.orderId],
    ['Issued', license.createdAt.toISOString().slice(0, 10)],
    ['Status', license.status],
    ['License key', license.key],
  ];
  let y = 410;
  for (const [k, v] of rows) {
    text(page, k, 60, y, font, 11, GREY);
    text(page, v, 190, y, k === 'License key' ? bold : font, 13);
    y -= 28;
  }
  text(page, info.summary, 60, 190, font, 10, GREY);
  text(page, `You may: ${info.can.slice(0, 3).join('; ')}.`, 60, 172, font, 9, GREY);
  text(page, `You may not: ${info.cannot.slice(0, 2).join('; ')}.`, 60, 158, font, 9, GREY);
  text(page, `Full terms: ${absoluteUrl('/license')}`, 60, 140, font, 9, GREY);
  const verifyUrl = absoluteUrl(`/verify/${license.key}`);
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 300 });
  const img = await doc.embedPng(qr);
  page.drawImage(img, { x: 640, y: 330, width: 140, height: 140 });
  text(page, 'Verify this license', 650, 315, font, 9, GREY);
  text(page, verifyUrl.slice(0, 60), 60, 60, font, 8, GREY);
  return doc.save();
}
