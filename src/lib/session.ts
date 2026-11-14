import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authOptions } from './auth';
import { db } from './db';
import { verifyToken } from './crypto';
import { ForbiddenError, UnauthorizedError, hasPermission, isStaff, type Permission, type RoleName } from './permissions';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: RoleName;
  mfa: boolean;
  totpEnabled: boolean;
  sid: string | null;
  locale: string;
  currency: string;
  /** Set when a staff member is viewing the site as this customer (read-only). */
  impersonatorId?: string;
}

export const IMPERSONATE_COOKIE = 'a3d_impersonate';

/**
 * The authenticated user for this request, validated against the database:
 * the device session must still exist (log-out-everywhere / revoked sessions) and the account must be active.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = await db.user.findUnique({ where: { id: uid } });
  if (!user || user.status !== 'ACTIVE') return null;

  // JWT must map to a live AuthSession row (revocation support).
  const sid = session.user.sid ?? null;
  if (!sid) return null;
  const live = await db.authSession.findUnique({ where: { id: sid }, select: { id: true, userId: true } });
  if (!live || live.userId !== user.id) return null;

  const base: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    mfa: Boolean(session.user.mfa),
    totpEnabled: user.totpEnabled,
    sid,
    locale: user.locale,
    currency: user.currency,
  };

  // Staff "view as customer".
  if (isStaff(user.role) && hasPermission(user.role, 'customers:impersonate')) {
    const c = await cookies();
    const imp = verifyToken<{ target: string; by: string }>(c.get(IMPERSONATE_COOKIE)?.value, 'impersonate');
    if (imp && imp.by === user.id) {
      const target = await db.user.findUnique({ where: { id: imp.target } });
      if (target && target.role === 'CUSTOMER') {
        return { ...base, id: target.id, email: target.email, name: target.name, image: target.image, role: 'CUSTOMER', mfa: false, totpEnabled: target.totpEnabled, locale: target.locale, currency: target.currency, impersonatorId: user.id };
      }
    }
  }
  return base;
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

/** For mutations: impersonation sessions are read-only. */
export async function requireUserForWrite(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.impersonatorId) throw new ForbiddenError('impersonation:read-only');
  return u;
}

/** Server-side permission gate for API routes and server actions. Staff must have passed 2FA. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new UnauthorizedError();
  if (u.impersonatorId) throw new ForbiddenError(permission);
  if (!hasPermission(u.role, permission)) throw new ForbiddenError(permission);
  if (!u.mfa) throw new ForbiddenError('mfa:required');
  return u;
}

/** Page variant: redirects instead of throwing. */
export async function requirePagePermission(permission: Permission, next = '/admin'): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!isStaff(u.role)) redirect('/');
  if (!u.mfa) redirect(`/admin/2fa?next=${encodeURIComponent(next)}`);
  if (!hasPermission(u.role, permission)) redirect('/admin/forbidden');
  return u;
}

export async function requirePageUser(next = '/account'): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export function actorOf(u: SessionUser) {
  return { id: u.id, email: u.email };
}
