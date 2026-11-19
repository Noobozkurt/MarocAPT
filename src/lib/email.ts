import { db } from './db';

export interface EmailInput {
  to: string;
  subject: string;
  template: string;
  text: string;
  html?: string;
  replyTo?: string;
  meta?: Record<string, unknown>;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Minimal branded HTML wrapper; links in the text become clickable. */
export function renderEmailHtml(text: string, storeName = process.env.NEXT_PUBLIC_STORE_NAME || 'Stuffin3D'): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#7c5cff">$1</a>')
    .replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:system-ui,sans-serif;color:#e8e8f0">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="font-weight:800;font-size:20px;margin-bottom:24px">${escapeHtml(storeName)}</div>
<div style="background:#15151d;border-radius:12px;padding:24px;line-height:1.6;font-size:15px">${body}</div>
<p style="color:#8a8aa0;font-size:12px;margin-top:24px">You received this email because of activity on your ${escapeHtml(storeName)} account or order.</p>
</div></body></html>`;
}

/**
 * Every email is written to EmailLog (visible in /admin/health and to tests), then delivered via
 * Resend (RESEND_API_KEY) or SMTP (SMTP_URL, e.g. Mailpit). With neither configured it stays in the outbox.
 */
export async function sendEmail(input: EmailInput): Promise<string> {
  const html = input.html ?? renderEmailHtml(input.text);
  const log = await db.emailLog.create({
    data: { to: input.to.toLowerCase(), subject: input.subject, template: input.template, text: input.text, html, meta: (input.meta ?? {}) as object },
  });
  const from = process.env.EMAIL_FROM || 'Stuffin3D <noreply@stuffin3d.local>';
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html, reply_to: input.replyTo }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      await db.emailLog.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date() } });
    } else if (process.env.SMTP_URL) {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html, replyTo: input.replyTo });
      await db.emailLog.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date() } });
    } else {
      await db.emailLog.update({ where: { id: log.id }, data: { status: 'OUTBOX' } });
      if (process.env.NODE_ENV === 'development') console.log(`[email:outbox] to=${input.to} subject="${input.subject}"`);
    }
  } catch (err) {
    await db.emailLog.update({ where: { id: log.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
    console.error('[email] delivery failed', (err as Error).message);
  }
  return log.id;
}
