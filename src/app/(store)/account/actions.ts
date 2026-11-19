'use server';

import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { requireUserForWrite } from '@/lib/session';
import { generateTotpSecret, totpUri, verifyTotp } from '@/lib/totp';
import { CURRENCIES } from '@/lib/money';
import { STORE_NAME } from '@/lib/env';
import { audit } from '@/lib/audit';

export async function updateProfile(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  const p = z.object({ name: z.string().trim().min(1).max(80), currency: z.enum(CURRENCIES), locale: z.enum(['en', 'fr']) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]!.message };
  await db.user.update({ where: { id: u.id }, data: p.data });
  revalidatePath('/account');
  return { ok: 'Profile saved' };
}

export async function updateNotifications(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  await db.user.update({ where: { id: u.id }, data: { notifyChatEmail: fd.get('chat') === 'on', notifyOrderEmail: fd.get('order') === 'on', notifyWishlistSale: fd.get('wishlist') === 'on', marketingConsent: fd.get('marketing') === 'on' } });
  return { ok: 'Notification preferences saved' };
}

export async function changePassword(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  const p = z.object({ current: z.string().optional(), next: z.string().min(10, 'New password must be at least 10 characters').max(200) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]!.message };
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (user.passwordHash && !(await bcrypt.compare(p.data.current ?? '', user.passwordHash))) return { error: 'Current password is incorrect' };
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(p.data.next, 12) } }),
    db.authSession.deleteMany({ where: { userId: u.id, id: { not: u.sid ?? '' } } }),
  ]);
  return { ok: 'Password changed. Other devices were signed out.' };
}

export async function startTotpSetup() {
  const u = await requireUserForWrite();
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: u.id }, data: { totpSecret: encrypt(secret), totpEnabled: false } });
  return { secret, qr: await QRCode.toDataURL(totpUri(secret, u.email, STORE_NAME), { margin: 1, width: 220 }) };
}

export async function confirmTotp(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.totpSecret) return { error: 'Start setup first' };
  if (!verifyTotp(decrypt(user.totpSecret), String(fd.get('code') || '').trim())) return { error: 'That code is not valid. Check your device clock and try again.' };
  await db.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
  if (u.role !== 'CUSTOMER') await audit({ actor: { id: u.id, email: u.email }, action: 'staff.2fa_enabled', resourceType: 'User', resourceId: u.id });
  return { ok: '2FA enabled', mfaCode: String(fd.get('code')) };
}

export async function disableTotp(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  if (u.role !== 'CUSTOMER') return { error: 'Staff accounts must keep 2FA enabled' };
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.totpSecret || !verifyTotp(decrypt(user.totpSecret), String(fd.get('code') || '').trim())) return { error: 'Enter a valid current code to disable 2FA' };
  await db.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null } });
  return { ok: '2FA disabled' };
}

export async function revokeSession(fd: FormData) {
  const u = await requireUserForWrite();
  await db.authSession.deleteMany({ where: { id: String(fd.get('id')), userId: u.id } });
  revalidatePath('/account/security');
}

export async function logoutEverywhere() {
  const u = await requireUserForWrite();
  await db.authSession.deleteMany({ where: { userId: u.id } });
  redirect('/login');
}

export async function unlinkAccount(fd: FormData) {
  const u = await requireUserForWrite();
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id }, include: { accounts: true } });
  if (!user.passwordHash && user.accounts.length <= 1) return; // never lock the user out
  await db.account.deleteMany({ where: { id: String(fd.get('id')), userId: u.id } });
  revalidatePath('/account/security');
}

/** GDPR erasure. Orders/invoices are kept for tax law but detached from the person. */
export async function deleteAccount(_: unknown, fd: FormData) {
  const u = await requireUserForWrite();
  if (String(fd.get('confirm')) !== 'DELETE') return { error: 'Type DELETE to confirm' };
  if (u.role !== 'CUSTOMER') return { error: 'Staff accounts are removed by a super admin' };
  const anon = `deleted-${u.id}@anonymized.invalid`;
  await db.$transaction([
    db.order.updateMany({ where: { userId: u.id }, data: { email: anon, ip: null, userAgent: null, companyName: null, userId: null } }),
    db.license.updateMany({ where: { userId: u.id }, data: { email: anon, userId: null, status: 'REVOKED', revokedReason: 'Account deleted' } }),
    db.message.updateMany({ where: { senderId: u.id }, data: { body: '[removed at user request]' } }),
    db.conversation.updateMany({ where: { customerId: u.id }, data: { csatComment: null, anonymizedAt: new Date() } }),
    db.review.deleteMany({ where: { userId: u.id } }),
    db.user.update({ where: { id: u.id }, data: { email: anon, name: null, image: null, passwordHash: null, totpSecret: null, totpEnabled: false, status: 'DELETED', deletedAt: new Date(), marketingConsent: false } }),
    db.authSession.deleteMany({ where: { userId: u.id } }),
    db.account.deleteMany({ where: { userId: u.id } }),
  ]);
  redirect('/?deleted=1');
}
