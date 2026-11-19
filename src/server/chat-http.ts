import { getSessionUser } from '@/lib/session';
import { UnauthorizedError } from '@/lib/permissions';
import { identityFromGuestToken, type ChatIdentity } from './chat';

/** Chat identity for an HTTP request: signed-in user (session) or guest (x-guest-token header / ?guestToken=). */
export async function chatIdentity(req: Request): Promise<ChatIdentity> {
  const guestToken = req.headers.get('x-guest-token') || new URL(req.url).searchParams.get('guestToken');
  if (guestToken) {
    const g = await identityFromGuestToken(guestToken);
    if (g) return g;
  }
  const u = await getSessionUser();
  if (!u) throw new UnauthorizedError('Sign in or start a chat as a guest');
  if (u.impersonatorId) throw new UnauthorizedError('Chat is unavailable while impersonating');
  return { kind: 'user', userId: u.id, role: u.role, name: u.name ?? u.email, email: u.email };
}
