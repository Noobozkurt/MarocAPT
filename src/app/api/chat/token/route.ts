import { json, route } from '@/lib/api';
import { signToken } from '@/lib/crypto';
import { requireUser } from '@/lib/session';
import { SOCKET_TOKEN_PURPOSE } from '@/server/chat';

/** Short-lived (5 min) token used only for the Socket.IO handshake. Staff must have passed 2FA. */
export const POST = route(async () => {
  const u = await requireUser();
  if (u.impersonatorId) return json({ error: 'Unavailable while impersonating' }, { status: 403 });
  if (u.role !== 'CUSTOMER' && !u.mfa) return json({ error: '2FA required' }, { status: 403 });
  return json({ token: signToken({ uid: u.id }, 300, SOCKET_TOKEN_PURPOSE) });
});
