import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/api';
import { randomToken, sha256, verifyToken } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { slugify } from '@/lib/utils';
import { storage } from './storage';
import { createZip } from './zip';

export interface Requester {
  userId: string | null;
  /** Signed order-access token (guest checkouts / email links). */
  accessToken?: string | null;
  ip: string;
  userAgent: string | null;
}

/** Ownership: the license belongs to the signed-in user, or the request carries a valid access token for its order. */
export async function assertLicenseAccess(licenseId: string, who: Requester) {
  const license = await db.license.findUnique({ where: { id: licenseId }, include: { product: true, order: true } });
  if (!license) throw new HttpError(404, 'License not found');
  const tokenOrder = verifyToken<{ orderId: string }>(who.accessToken, 'order-access')?.orderId;
  const owns = (who.userId && license.userId === who.userId) || (tokenOrder && tokenOrder === license.orderId);
  if (!owns) throw new HttpError(403, 'You do not own this license');
  if (license.status !== 'ACTIVE') throw new HttpError(410, `This license is ${license.status.toLowerCase()}`, 'LICENSE_INACTIVE');
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(license.order.status)) throw new HttpError(410, 'Order is not in a downloadable state', 'ORDER_INACTIVE');
  return license;
}

/**
 * Issue a single-use, short-lived download URL after the ownership check.
 * fileId = a ProductFile id, or "all" for a ZIP of every file in the latest (or requested) version.
 */
export async function issueDownload(licenseId: string, fileId: string, who: Requester, versionId?: string) {
  await enforceRateLimit(`dl:${who.userId ?? who.ip}`, 20, 60);
  const license = await assertLicenseAccess(licenseId, who);
  if (license.downloadCount >= license.downloadLimit) throw new HttpError(429, 'Download limit reached for this license. Contact support to reset it.', 'DOWNLOAD_LIMIT');

  let storageKey: string;
  let fileName: string;
  let fileRef: string | null = null;
  if (fileId === 'all') {
    const version = versionId
      ? await db.productVersion.findFirst({ where: { id: versionId, productId: license.productId }, include: { files: true } })
      : await db.productVersion.findFirst({ where: { productId: license.productId }, orderBy: { createdAt: 'desc' }, include: { files: true } });
    if (!version || !version.files.length) throw new HttpError(404, 'No files for this product yet');
    storageKey = `bundles/${license.productId}/${version.id}.zip`;
    fileName = `${slugify(license.product.title)}-v${version.version}.zip`;
    if (!(await storage().exists(storageKey))) {
      const files = await Promise.all(version.files.filter((f) => f.status === 'READY').map(async (f) => ({ name: f.fileName, data: await storage().get(f.storageKey) })));
      files.push({ name: 'LICENSE.txt', data: Buffer.from(`Licensed under ${license.tier} terms. See ${process.env.APP_URL || ''}/license\n`) });
      await storage().put(storageKey, createZip(files), 'application/zip');
    }
  } else {
    const file = await db.productFile.findFirst({ where: { id: fileId, productId: license.productId } });
    if (!file) throw new HttpError(404, 'File not found');
    if (file.status !== 'READY') throw new HttpError(409, 'This file is still being processed');
    storageKey = file.storageKey;
    fileName = file.fileName;
    fileRef = file.id;
  }

  const token = randomToken(32);
  const ttl = env().DOWNLOAD_URL_TTL_SECONDS;
  await db.$transaction([
    db.downloadGrant.create({ data: { tokenHash: sha256(token), licenseId: license.id, fileId: fileRef, storageKey, fileName, userId: who.userId, expiresAt: new Date(Date.now() + ttl * 1000) } }),
    db.license.update({ where: { id: license.id }, data: { downloadCount: { increment: 1 }, lastSeenVersion: license.product.currentVersion } }),
    db.download.create({ data: { licenseId: license.id, fileId: fileRef, userId: who.userId, ip: who.ip, userAgent: who.userAgent?.slice(0, 300) } }),
  ]);
  return { url: `/api/files/${token}`, expiresInSeconds: ttl, fileName };
}

/** Consume a grant exactly once. Re-checks the license so a refund in the meantime still blocks the download. */
export async function consumeGrant(token: string) {
  const grant = await db.downloadGrant.findUnique({ where: { tokenHash: sha256(token) }, include: { license: { include: { order: true } } } });
  if (!grant) throw new HttpError(404, 'Invalid download link');
  if (grant.expiresAt < new Date()) throw new HttpError(410, 'This download link has expired. Request a new one from your library.', 'EXPIRED');
  const claimed = await db.downloadGrant.updateMany({ where: { id: grant.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw new HttpError(410, 'This download link was already used. Links are single-use.', 'USED');
  if (grant.license.status !== 'ACTIVE') throw new HttpError(410, 'This license is no longer active', 'LICENSE_INACTIVE');
  return grant;
}
