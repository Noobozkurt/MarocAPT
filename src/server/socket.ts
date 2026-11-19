import type { Server, Socket } from 'socket.io';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/crypto';
import { hasPermission, isRole, isStaff } from '@/lib/permissions';
import { HttpError } from '@/lib/api';
import {
  SOCKET_TOKEN_PURPOSE,
  identityFromGuestToken,
  isAgent,
  loadConversationFor,
  markDelivered,
  markRead,
  postMessage,
  getAvailability,
  type ChatIdentity,
} from './chat';
import { heartbeat, markOffline, markOnline } from './presence';

type Ack = (res: { ok: boolean; error?: string; code?: string; [k: string]: unknown }) => void;

interface SocketData {
  identity: ChatIdentity;
  presenceKey: string;
  typingTimers: Map<string, NodeJS.Timeout>;
}

const viewing = new Map<string, Map<string, string>>(); // conversationId → agentId → name (this instance)

function err(e: unknown) {
  if (e instanceof HttpError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof Error && 'status' in e) return { ok: false, error: e.message, code: String((e as { status: number }).status) };
  console.error('[socket]', e);
  return { ok: false, error: 'Server error' };
}

export function attachChatServer(io: Server) {
  // Authenticate every connection: a short-lived signed token (from /api/chat/token) or a guest token.
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string; guestToken?: string };
      let identity: ChatIdentity | null = null;
      if (auth.token) {
        const t = verifyToken<{ uid: string }>(auth.token, SOCKET_TOKEN_PURPOSE);
        if (t) {
          const u = await db.user.findUnique({ where: { id: t.uid } });
          if (u && u.status === 'ACTIVE' && isRole(u.role)) identity = { kind: 'user', userId: u.id, role: u.role, name: u.name ?? u.email, email: u.email };
        }
      } else if (auth.guestToken) {
        identity = await identityFromGuestToken(auth.guestToken);
      }
      if (!identity) return next(new Error('unauthorized'));
      const data = socket.data as SocketData;
      data.identity = identity;
      data.presenceKey = identity.kind === 'user' ? identity.userId : `guest:${identity.conversationId}`;
      data.typingTimers = new Map();
      next();
    } catch (e) {
      next(e as Error);
    }
  });

  io.on('connection', async (socket: Socket) => {
    const data = socket.data as SocketData;
    const id = data.identity;
    await markOnline(data.presenceKey, socket.id);
    const hb = setInterval(() => heartbeat(data.presenceKey).catch(() => undefined), 45_000);

    if (id.kind === 'user') socket.join(`user:${id.userId}`);
    if (isAgent(id)) {
      socket.join('agent-inbox');
      io.emit('presence:update', await getAvailability());
    }
    if (id.kind === 'user' && isStaff(id.role) && hasPermission(id.role, 'dashboard:view')) socket.join('admin-feed');
    if (id.kind === 'guest') socket.join(`conversation:${id.conversationId}`);

    socket.on('conversation:join', async ({ conversationId }: { conversationId: string }, ack?: Ack) => {
      try {
        await loadConversationFor(id, conversationId);
        socket.join(`conversation:${conversationId}`);
        if (isAgent(id) && id.kind === 'user') {
          socket.join(`conversation:${conversationId}:agents`);
          if (!viewing.has(conversationId)) viewing.set(conversationId, new Map());
          viewing.get(conversationId)!.set(id.userId, id.name);
          io.to(`conversation:${conversationId}:agents`).emit('agent:viewing', { conversationId, agents: [...viewing.get(conversationId)!].map(([agentId, name]) => ({ agentId, name })) });
        }
        ack?.({ ok: true });
      } catch (e) {
        ack?.(err(e));
      }
    });

    const leave = (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      socket.leave(`conversation:${conversationId}:agents`);
      if (id.kind === 'user' && viewing.get(conversationId)?.delete(id.userId)) {
        io.to(`conversation:${conversationId}:agents`).emit('agent:viewing', { conversationId, agents: [...viewing.get(conversationId)!].map(([agentId, name]) => ({ agentId, name })) });
      }
    };
    socket.on('conversation:leave', ({ conversationId }: { conversationId: string }) => leave(conversationId));

    // client → validate/sanitize/rate-limit/persist → ACK with real id → broadcast (Redis adapter fans out across instances)
    socket.on('message:send', async (payload: { conversationId: string; body: string; clientMessageId: string; attachmentIds?: string[]; isInternalNote?: boolean }, ack?: Ack) => {
      try {
        const { message, duplicate } = await postMessage(id, payload);
        ack?.({ ok: true, message, duplicate });
        if (duplicate) return;
        const room = message.isInternalNote ? `conversation:${payload.conversationId}:agents` : `conversation:${payload.conversationId}`;
        socket.to(room).emit('message:new', message);
        if (!message.isInternalNote) {
          io.to('agent-inbox').emit('conversation:activity', { conversationId: payload.conversationId, lastMessageAt: message.createdAt, preview: message.body.slice(0, 80), from: message.senderType });
          // Delivered = a socket from the other side is in the room right now.
          const sockets = await io.in(`conversation:${payload.conversationId}`).fetchSockets();
          const otherSidePresent = sockets.some((s) => {
            const other = (s.data as SocketData).identity;
            return other && isAgent(other) !== isAgent(id);
          });
          if (otherSidePresent) {
            await markDelivered(payload.conversationId, [message.id]);
            io.to(`conversation:${payload.conversationId}`).emit('message:status', { conversationId: payload.conversationId, ids: [message.id], status: 'DELIVERED' });
          }
        }
        stopTyping(payload.conversationId, Boolean(payload.isInternalNote));
      } catch (e) {
        ack?.(err(e));
      }
    });

    socket.on('message:delivered', async ({ conversationId, ids }: { conversationId: string; ids: string[] }) => {
      try {
        await loadConversationFor(id, conversationId);
        await markDelivered(conversationId, ids.slice(0, 100));
        socket.to(`conversation:${conversationId}`).emit('message:status', { conversationId, ids, status: 'DELIVERED' });
      } catch {
        /* ignore */
      }
    });

    socket.on('message:read', async ({ conversationId, messageId }: { conversationId: string; messageId: string }, ack?: Ack) => {
      try {
        const r = await markRead(id, conversationId, messageId);
        ack?.({ ok: true, ...r });
        if (r.changed) socket.to(`conversation:${conversationId}`).emit('message:read', { conversationId, messageId, side: isAgent(id) ? 'AGENT' : 'CUSTOMER', name: id.name });
      } catch (e) {
        ack?.(err(e));
      }
    });

    const typingRoom = (cid: string, note: boolean) => (note ? `conversation:${cid}:agents` : `conversation:${cid}`);
    const stopTyping = (cid: string, note = false) => {
      const t = data.typingTimers.get(cid);
      if (t) clearTimeout(t);
      data.typingTimers.delete(cid);
      socket.to(typingRoom(cid, note)).emit('typing', { conversationId: cid, name: id.name, side: isAgent(id) ? 'AGENT' : 'CUSTOMER', userId: id.kind === 'user' ? id.userId : null, typing: false });
    };
    socket.on('typing:start', ({ conversationId, isInternalNote }: { conversationId: string; isInternalNote?: boolean }) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      const note = Boolean(isInternalNote && isAgent(id));
      socket.to(typingRoom(conversationId, note)).emit('typing', { conversationId, name: id.name, side: isAgent(id) ? 'AGENT' : 'CUSTOMER', userId: id.kind === 'user' ? id.userId : null, typing: true, note });
      const prev = data.typingTimers.get(conversationId);
      if (prev) clearTimeout(prev);
      data.typingTimers.set(conversationId, setTimeout(() => stopTyping(conversationId, note), 5000)); // auto-expire
    });
    socket.on('typing:stop', ({ conversationId, isInternalNote }: { conversationId: string; isInternalNote?: boolean }) => stopTyping(conversationId, Boolean(isInternalNote)));

    socket.on('presence:set', async ({ status }: { status: 'ONLINE' | 'AWAY' | 'OFFLINE' }, ack?: Ack) => {
      if (!isAgent(id) || id.kind !== 'user' || !['ONLINE', 'AWAY', 'OFFLINE'].includes(status)) return ack?.({ ok: false });
      await db.user.update({ where: { id: id.userId }, data: { agentStatus: status } });
      io.emit('presence:update', await getAvailability());
      io.to('agent-inbox').emit('agent:status', { agentId: id.userId, status });
      ack?.({ ok: true });
    });

    socket.on('disconnect', async () => {
      clearInterval(hb);
      for (const t of data.typingTimers.values()) clearTimeout(t);
      for (const [cid, m] of viewing) if (id.kind === 'user' && m.has(id.userId)) leave(cid);
      const gone = await markOffline(data.presenceKey, socket.id);
      if (gone && isAgent(id)) io.emit('presence:update', await getAvailability());
    });
  });
}
