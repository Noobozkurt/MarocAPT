'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../use-socket';

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  scanStatus: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: 'CUSTOMER' | 'AGENT' | 'SYSTEM' | 'BOT';
  senderId: string | null;
  senderName: string;
  body: string;
  clientMessageId: string | null;
  status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  isInternalNote: boolean;
  createdAt: string;
  attachments: ChatAttachment[];
  /** client-only */
  pendingAttachmentIds?: string[];
}

export interface ConversationMeta {
  id: string;
  subject: string;
  status: string;
  priority: string;
  tags: string[];
  assignedAgentId: string | null;
  customerId: string | null;
  createdAt: string;
  lastMessageAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  csatScore: number | null;
  orderId: string | null;
  productId: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  topic: string;
}

export interface Availability {
  agentsOnline: number;
  withinHours: boolean;
  expectedReply: string;
}

type Side = 'CUSTOMER' | 'AGENT';

export function newClientId() {
  return `c_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function sortMessages(list: ChatMessage[]) {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Live conversation state. Persistence is server-side; this hook only mirrors it:
 * optimistic send → ack with real id → broadcast; dedupe by id/clientMessageId; catch-up after reconnect.
 */
export function useConversation(conversationId: string | null, opts: { guestToken?: string | null; side: Side; visible?: boolean }) {
  const { socket, connected } = useSocket({ guestToken: opts.guestToken, enabled: Boolean(conversationId) });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [agent, setAgent] = useState<{ name?: string; status?: string } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; side: string; note?: boolean; at: number }>>({});
  const [otherRead, setOtherRead] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Array<{ agentId: string; name: string }>>([]);
  const [csatRequested, setCsatRequested] = useState(false);
  const lastId = useRef<string | null>(null);
  const headers = opts.guestToken ? { 'x-guest-token': opts.guestToken } : undefined;
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const byKey = new Map<string, ChatMessage>();
      for (const m of prev) byKey.set(m.clientMessageId ? `c:${m.clientMessageId}` : `i:${m.id}`, m);
      for (const m of incoming) {
        const key = m.clientMessageId ? `c:${m.clientMessageId}` : `i:${m.id}`;
        const existing = byKey.get(key) ?? [...byKey.values()].find((x) => x.id === m.id);
        // Never downgrade a status (READ > DELIVERED > SENT).
        const rank = { FAILED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4 } as const;
        const status = existing && rank[existing.status] > rank[m.status] && existing.id === m.id ? existing.status : m.status;
        if (existing && existing !== byKey.get(key)) byKey.delete(existing.clientMessageId ? `c:${existing.clientMessageId}` : `i:${existing.id}`);
        byKey.set(key, { ...existing, ...m, status });
      }
      const sorted = sortMessages([...byKey.values()]);
      const last = [...sorted].reverse().find((m) => !m.id.startsWith('tmp_'));
      if (last) lastId.current = last.id;
      return sorted;
    });
  }, []);

  // Initial load
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    lastId.current = null;
    fetch(`/api/chat/conversations/${conversationId}`, { headers: headersRef.current })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not load conversation');
        if (cancelled) return;
        setMeta(d.conversation);
        setHasMore(d.hasMore);
        setAvailability(d.availability);
        setAgent(d.agent);
        merge(d.messages);
        const otherRole = opts.side === 'CUSTOMER' ? 'AGENT' : 'CUSTOMER';
        const other = (d.participants as Array<{ role: string; lastReadMessageId: string | null; lastReadAt: string | null }>).filter((p) => p.role === otherRole && p.lastReadMessageId).sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))[0];
        setOtherRead(other?.lastReadMessageId ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, merge, opts.side]);

  // Socket wiring
  useEffect(() => {
    if (!socket || !conversationId) return;
    const join = () =>
      socket.emit('conversation:join', { conversationId }, async (res: { ok: boolean }) => {
        if (!res?.ok) return;
        // Catch up on anything missed while disconnected.
        if (lastId.current) {
          const r = await fetch(`/api/chat/conversations/${conversationId}/messages?after=${lastId.current}`, { headers: headersRef.current });
          if (r.ok) merge((await r.json()).messages);
        }
      });
    if (socket.connected) join();
    socket.on('connect', join);
    const onNew = (m: ChatMessage) => {
      if (m.conversationId !== conversationId) return;
      merge([m]);
      const fromOther = (opts.side === 'CUSTOMER' && m.senderType === 'AGENT') || (opts.side === 'AGENT' && m.senderType === 'CUSTOMER');
      if (fromOther) socket.emit('message:delivered', { conversationId, ids: [m.id] });
      setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v.name !== m.senderName)));
    };
    const onStatus = (e: { conversationId: string; ids: string[]; status: ChatMessage['status'] }) => {
      if (e.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (e.ids.includes(m.id) && m.status !== 'READ' ? { ...m, status: e.status } : m)));
    };
    const onRead = (e: { conversationId: string; messageId: string; side: string }) => {
      if (e.conversationId !== conversationId || e.side === opts.side) return;
      setOtherRead(e.messageId);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === e.messageId);
        const until = idx === -1 ? null : prev[idx]!.createdAt;
        return prev.map((m) => (m.senderType === opts.side && until && m.createdAt <= until && !m.id.startsWith('tmp_') ? { ...m, status: 'READ' } : m));
      });
    };
    const onTyping = (e: { conversationId: string; name: string; side: string; typing: boolean; userId?: string | null; note?: boolean }) => {
      if (e.conversationId !== conversationId) return;
      const key = e.userId || e.side;
      setTyping((t) => {
        const next = { ...t };
        if (e.typing) next[key] = { name: e.name, side: e.side, note: e.note, at: Date.now() };
        else delete next[key];
        return next;
      });
    };
    const onUpdated = (c: Partial<ConversationMeta> & { id: string }) => c.id === conversationId && setMeta((m) => (m ? { ...m, ...c } : m));
    const onCsat = (e: { conversationId: string }) => e.conversationId === conversationId && setCsatRequested(true);
    const onScanned = (e: { attachmentId: string; scanStatus: string }) =>
      setMessages((prev) => prev.map((m) => ({ ...m, attachments: m.attachments.map((a) => (a.id === e.attachmentId ? { ...a, scanStatus: e.scanStatus } : a)) })));
    const onViewing = (e: { conversationId: string; agents: Array<{ agentId: string; name: string }> }) => e.conversationId === conversationId && setViewers(e.agents);
    const onPresence = (a: Availability) => setAvailability(a);
    socket.on('message:new', onNew);
    socket.on('message:status', onStatus);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);
    socket.on('conversation:updated', onUpdated);
    socket.on('csat:request', onCsat);
    socket.on('attachment:scanned', onScanned);
    socket.on('agent:viewing', onViewing);
    socket.on('presence:update', onPresence);
    return () => {
      socket.emit('conversation:leave', { conversationId });
      socket.off('connect', join);
      socket.off('message:new', onNew);
      socket.off('message:status', onStatus);
      socket.off('message:read', onRead);
      socket.off('typing', onTyping);
      socket.off('conversation:updated', onUpdated);
      socket.off('csat:request', onCsat);
      socket.off('attachment:scanned', onScanned);
      socket.off('agent:viewing', onViewing);
      socket.off('presence:update', onPresence);
    };
  }, [socket, conversationId, merge, opts.side]);

  // Typing indicators auto-expire after 6 s even if a stop event is lost.
  useEffect(() => {
    const i = setInterval(() => setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => Date.now() - v.at < 6000))), 1500);
    return () => clearInterval(i);
  }, []);

  // Read receipts: when visible, move my read pointer to the newest message from the other side.
  const lastOther = [...messages].reverse().find((m) => m.senderType !== opts.side && m.senderType !== 'SYSTEM' && !m.id.startsWith('tmp_'));
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !lastOther || opts.visible === false) return;
    if (lastMarked.current === lastOther.id) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    lastMarked.current = lastOther.id;
    if (socket?.connected) socket.emit('message:read', { conversationId, messageId: lastOther.id });
    else fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST', headers: { 'content-type': 'application/json', ...headersRef.current }, body: JSON.stringify({ messageId: lastOther.id }) });
  }, [conversationId, lastOther, opts.visible, socket]);

  const deliver = useCallback(
    async (msg: ChatMessage, attempt = 0): Promise<void> => {
      if (!conversationId) return;
      const payload = { conversationId, body: msg.body, clientMessageId: msg.clientMessageId, attachmentIds: msg.pendingAttachmentIds ?? [], isInternalNote: msg.isInternalNote };
      try {
        let result: { ok: boolean; message?: ChatMessage; error?: string; code?: string };
        if (socket?.connected) {
          result = await socket.timeout(8000).emitWithAck('message:send', payload).catch(() => ({ ok: false, error: 'timeout' }));
        } else {
          const r = await fetch(`/api/chat/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', ...headersRef.current }, body: JSON.stringify(payload) });
          const d = await r.json();
          result = r.ok ? { ok: true, message: d.message } : { ok: false, error: d.error, code: String(r.status) };
        }
        if (result.ok && result.message) {
          setMessages((prev) => prev.filter((m) => m.clientMessageId !== msg.clientMessageId));
          merge([result.message]);
          return;
        }
        // Validation errors (spam, blocked, too long) are final; network/rate-limit errors are retried.
        const permanent = result.code && ['400', '403', '404', '422', 'SPAM'].includes(result.code);
        if (!permanent && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          return deliver(msg, attempt + 1);
        }
        setMessages((prev) => prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'FAILED' } : m)));
        setError(result.error || 'Message failed to send');
      } catch {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          return deliver(msg, attempt + 1);
        }
        setMessages((prev) => prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'FAILED' } : m)));
      }
    },
    [conversationId, socket, merge],
  );

  const send = useCallback(
    (body: string, extra: { attachments?: ChatAttachment[]; isInternalNote?: boolean; senderName?: string } = {}) => {
      if (!conversationId || (!body.trim() && !extra.attachments?.length)) return;
      setError(null);
      const clientMessageId = newClientId();
      const optimistic: ChatMessage = {
        id: `tmp_${clientMessageId}`,
        conversationId,
        senderType: opts.side,
        senderId: null,
        senderName: extra.senderName ?? 'You',
        body: body.trim(),
        clientMessageId,
        status: 'SENDING',
        isInternalNote: Boolean(extra.isInternalNote),
        createdAt: new Date().toISOString(),
        attachments: extra.attachments ?? [],
        pendingAttachmentIds: extra.attachments?.map((a) => a.id),
      };
      setMessages((prev) => [...prev, optimistic]);
      socket?.emit('typing:stop', { conversationId, isInternalNote: extra.isInternalNote });
      void deliver(optimistic);
    },
    [conversationId, opts.side, socket, deliver],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const m = messages.find((x) => x.clientMessageId === clientMessageId);
      if (!m) return;
      setMessages((prev) => prev.map((x) => (x.clientMessageId === clientMessageId ? { ...x, status: 'SENDING' } : x)));
      void deliver(m);
    },
    [messages, deliver],
  );

  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => !m.id.startsWith('tmp_'));
    if (!conversationId || !first) return;
    const r = await fetch(`/api/chat/conversations/${conversationId}/messages?before=${first.id}`, { headers: headersRef.current });
    if (!r.ok) return;
    const d = await r.json();
    setHasMore(d.hasMore);
    merge(d.messages);
  }, [conversationId, messages, merge]);

  const lastTypingEmit = useRef(0);
  const notifyTyping = useCallback(
    (isInternalNote = false) => {
      if (!socket || !conversationId || Date.now() - lastTypingEmit.current < 2000) return;
      lastTypingEmit.current = Date.now();
      socket.emit('typing:start', { conversationId, isInternalNote });
    },
    [socket, conversationId],
  );

  return { messages, meta, setMeta, availability, agent, hasMore, loading, error, setError, typing: Object.values(typing), otherRead, viewers, csatRequested, setCsatRequested, connected, socket, send, retry, loadOlder, notifyTyping };
}
