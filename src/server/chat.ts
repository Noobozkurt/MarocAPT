import type { ChatTopic, Conversation, ConversationStatus, Message, Prisma, Priority } from '@prisma/client';
import { db } from '@/lib/db';
import { env, STORE_NAME } from '@/lib/env';
import { HttpError } from '@/lib/api';
import { hmac, safeEqual, sha256, signToken, verifyToken } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';
import { hasPermission, type RoleName } from '@/lib/permissions';
import { enforceRateLimit } from '@/lib/rate-limit';
import { detectSpam, maskProfanity, sanitizeText } from '@/lib/sanitize';
import { absoluteUrl, formatDuration } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { emitTo } from './realtime';
import { isOnline, onlineAmong } from './presence';
import { notify } from './notifications';

// ─── Identity & authorization ───

export type ChatIdentity =
  | { kind: 'user'; userId: string; role: RoleName; name: string; email: string }
  | { kind: 'guest'; conversationId: string; name: string; email: string };

export const GUEST_TOKEN_PURPOSE = 'chat-guest';
export const SOCKET_TOKEN_PURPOSE = 'chat-socket';

export function isAgent(id: ChatIdentity): boolean {
  return id.kind === 'user' && hasPermission(id.role, 'support:inbox');
}

export function participantKey(id: ChatIdentity): string {
  return id.kind === 'user' ? id.userId : 'guest';
}

export function guestTokenFor(conversationId: string) {
  return signToken({ cid: conversationId }, 90 * 24 * 3600, GUEST_TOKEN_PURPOSE);
}

export async function identityFromGuestToken(token: string | null | undefined): Promise<ChatIdentity | null> {
  const data = verifyToken<{ cid: string }>(token, GUEST_TOKEN_PURPOSE);
  if (!data) return null;
  const conv = await db.conversation.findUnique({ where: { id: data.cid } });
  if (!conv || !conv.guestTokenHash || !safeEqual(conv.guestTokenHash, sha256(token!))) return null;
  return { kind: 'guest', conversationId: conv.id, name: conv.guestName || 'Guest', email: conv.guestEmail || '' };
}

export async function loadConversationFor(id: ChatIdentity, conversationId: string): Promise<Conversation> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const ok = isAgent(id) || (id.kind === 'user' && conv.customerId === id.userId) || (id.kind === 'guest' && id.conversationId === conv.id);
  if (!ok) throw new HttpError(403, 'You cannot access this conversation');
  return conv;
}

// ─── DTOs ───

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderType: Message['senderType'];
  senderId: string | null;
  senderName: string;
  body: string;
  clientMessageId: string | null;
  status: Message['status'];
  isInternalNote: boolean;
  createdAt: string;
  attachments: Array<{ id: string; fileName: string; mimeType: string; size: number; scanStatus: string }>;
}

type MessageWithRels = Message & { sender: { name: string | null; email: string } | null; attachments: Array<{ id: string; fileName: string; mimeType: string; size: number; scanStatus: string }> };

const messageInclude = { sender: { select: { name: true, email: true } }, attachments: { select: { id: true, fileName: true, mimeType: true, size: true, scanStatus: true } } } satisfies Prisma.MessageInclude;

export function toDTO(m: MessageWithRels, viewerIsAgent: boolean): MessageDTO {
  const senderName =
    m.senderType === 'SYSTEM' ? 'System' : m.senderType === 'BOT' ? `${STORE_NAME} assistant` : m.senderType === 'AGENT' ? (m.sender?.name?.split(' ')[0] ?? 'Support') : (m.sender?.name ?? 'Customer');
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderType: m.senderType,
    senderId: m.senderId,
    senderName,
    body: m.deletedAt ? '[message deleted]' : m.body,
    clientMessageId: m.clientMessageId,
    status: m.status,
    isInternalNote: m.isInternalNote,
    createdAt: m.createdAt.toISOString(),
    // Agents only ever see attachments that passed the scan.
    attachments: m.attachments.filter((a) => !viewerIsAgent || a.scanStatus === 'CLEAN'),
  };
}

// ─── Business hours / availability ───

export interface Availability {
  agentsOnline: number;
  withinHours: boolean;
  expectedReply: string;
}

export async function getAvailability(): Promise<Availability> {
  const setting = await db.setting.findUnique({ where: { key: 'support.hours' } });
  const hours = (setting?.value as { tz?: string; start?: number; end?: number; days?: number[] } | null) ?? { tz: 'Europe/Stockholm', start: 9, end: 18, days: [1, 2, 3, 4, 5] };
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: hours.tz || 'UTC', hour: 'numeric', weekday: 'short', hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Mon');
  const withinHours = (hours.days ?? [1, 2, 3, 4, 5]).includes(wd) && hour >= (hours.start ?? 9) && hour < (hours.end ?? 18);
  const agents = await db.user.findMany({ where: { role: { in: ['SUPPORT_AGENT', 'SUPER_ADMIN'] }, status: 'ACTIVE', agentStatus: { not: 'OFFLINE' } }, select: { id: true } });
  const online = await onlineAmong(agents.map((a) => a.id));
  return { agentsOnline: online.size, withinHours, expectedReply: online.size > 0 ? 'Usually replies in a few minutes' : withinHours ? 'Usually replies in ~1 h' : 'Usually replies in ~2 h (outside business hours)' };
}

// ─── Assignment ───

/** Round-robin across agents who are ONLINE (status) and actually connected, least recently assigned first. */
export async function autoAssign(conversationId: string): Promise<string | null> {
  const candidates = await db.user.findMany({
    where: { role: { in: ['SUPPORT_AGENT', 'SUPER_ADMIN'] }, status: 'ACTIVE', agentStatus: 'ONLINE' },
    orderBy: [{ lastAssignedAt: { sort: 'asc', nulls: 'first' } }],
    select: { id: true, name: true },
  });
  const online = await onlineAmong(candidates.map((c) => c.id));
  const agent = candidates.find((c) => online.has(c.id));
  if (!agent) return null;
  const claimed = await db.conversation.updateMany({ where: { id: conversationId, assignedAgentId: null }, data: { assignedAgentId: agent.id } });
  if (!claimed.count) return null;
  await db.user.update({ where: { id: agent.id }, data: { lastAssignedAt: new Date() } });
  await ensureParticipant(conversationId, { kind: 'user', userId: agent.id, role: 'SUPPORT_AGENT', name: agent.name ?? '', email: '' });
  emitTo('agent-inbox', 'conversation:assigned', { conversationId, agentId: agent.id, agentName: agent.name });
  emitTo(`user:${agent.id}`, 'notification:new', { type: 'chat.assigned', title: 'New conversation assigned', body: '', link: `/admin/inbox?c=${conversationId}` });
  return agent.id;
}

async function ensureParticipant(conversationId: string, id: ChatIdentity, role?: string) {
  const key = participantKey(id);
  await db.conversationParticipant.upsert({
    where: { conversationId_participantKey: { conversationId, participantKey: key } },
    create: { conversationId, participantKey: key, userId: id.kind === 'user' ? id.userId : null, role: role ?? (isAgent(id) ? 'AGENT' : 'CUSTOMER') },
    update: {},
  });
}

// ─── Conversations ───

export interface StartConversationInput {
  topic: ChatTopic;
  subject: string;
  message: string;
  clientMessageId: string;
  orderId?: string | null;
  productId?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
}

export async function startConversation(user: { id: string; role: RoleName; name: string | null; email: string } | null, input: StartConversationInput) {
  const subject = sanitizeText(input.subject, 140) || 'Support request';
  if (!user && !input.guestEmail) throw new HttpError(400, 'Email is required for guest chats');
  if (user) {
    const u = await db.user.findUnique({ where: { id: user.id }, select: { chatBlocked: true } });
    if (u?.chatBlocked) throw new HttpError(403, 'Chat is disabled for this account. Please email support.');
  }
  // Only attach orders/products the customer actually owns / that exist.
  let orderId: string | null = null;
  if (input.orderId && user) orderId = (await db.order.findFirst({ where: { id: input.orderId, userId: user.id }, select: { id: true } }))?.id ?? null;
  const productId = input.productId ? ((await db.product.findUnique({ where: { id: input.productId }, select: { id: true } }))?.id ?? null) : null;
  const priority: Priority = input.topic === 'ORDER_PAYMENT' || input.topic === 'DOWNLOAD' ? 'HIGH' : 'NORMAL';

  const conv = await db.conversation.create({
    data: {
      customerId: user?.id ?? null,
      guestEmail: user ? null : input.guestEmail!.toLowerCase(),
      guestName: user ? null : sanitizeText(input.guestName || '', 80) || null,
      subject,
      topic: input.topic,
      priority,
      orderId,
      productId,
      tags: [input.topic.toLowerCase()],
      status: 'PENDING_AGENT',
    },
  });
  let guestToken: string | null = null;
  if (!user) {
    guestToken = guestTokenFor(conv.id);
    await db.conversation.update({ where: { id: conv.id }, data: { guestTokenHash: sha256(guestToken) } });
  }
  const identity: ChatIdentity = user
    ? { kind: 'user', userId: user.id, role: user.role, name: user.name ?? user.email, email: user.email }
    : { kind: 'guest', conversationId: conv.id, name: input.guestName || 'Guest', email: input.guestEmail! };
  await ensureParticipant(conv.id, identity, 'CUSTOMER');
  const first = await postMessage(identity, { conversationId: conv.id, body: input.message, clientMessageId: input.clientMessageId });

  const availability = await getAvailability();
  const agentId = await autoAssign(conv.id);
  if (!agentId) {
    await postSystemMessage(
      conv.id,
      `All agents are away right now. ${availability.expectedReply}. We saved your message as ticket #${conv.id.slice(-6).toUpperCase()} and will email the reply to ${identity.email} — you can answer by email or right here.`,
    );
  }
  emitTo('agent-inbox', 'conversation:new', { conversationId: conv.id });
  return { conversation: conv, guestToken, firstMessage: first.message };
}

export async function postSystemMessage(conversationId: string, body: string, senderType: 'SYSTEM' | 'BOT' = 'SYSTEM') {
  const m = await db.message.create({ data: { conversationId, senderType, body, status: 'SENT' }, include: messageInclude });
  emitTo(`conversation:${conversationId}`, 'message:new', toDTO(m, false));
  return m;
}

export interface PostMessageInput {
  conversationId: string;
  body: string;
  clientMessageId: string;
  attachmentIds?: string[];
  isInternalNote?: boolean;
  channel?: 'WIDGET' | 'EMAIL';
}

/**
 * Validate → sanitize → rate-limit → persist (deduped on clientMessageId) → update conversation state.
 * Broadcasting is done by the caller (socket handler or API route) with the returned DTOs.
 */
export async function postMessage(id: ChatIdentity, input: PostMessageInput): Promise<{ message: MessageDTO; duplicate: boolean; conversation: Conversation }> {
  const conv = await loadConversationFor(id, input.conversationId);
  const agent = isAgent(id);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientMessageId)) throw new HttpError(400, 'Invalid clientMessageId');

  const existing = await db.message.findUnique({ where: { conversationId_clientMessageId: { conversationId: conv.id, clientMessageId: input.clientMessageId } }, include: messageInclude });
  if (existing) return { message: toDTO(existing, agent), duplicate: true, conversation: conv };

  await enforceRateLimit(`chat:${participantKey(id)}:${id.kind === 'guest' ? id.conversationId : ''}`, env().CHAT_RATE_LIMIT_PER_MINUTE, 60);
  if (id.kind === 'user' && !agent) {
    const u = await db.user.findUnique({ where: { id: id.userId }, select: { chatBlocked: true } });
    if (u?.chatBlocked) throw new HttpError(403, 'Chat is disabled for this account');
  }
  let body = sanitizeText(input.body);
  const attachmentIds = (input.attachmentIds ?? []).slice(0, 5);
  if (!body && attachmentIds.length === 0) throw new HttpError(400, 'Message is empty');
  if (!agent) {
    const spam = detectSpam(body);
    if (spam.spam) throw new HttpError(422, `Message blocked by spam filter (${spam.reason})`, 'SPAM');
    body = maskProfanity(body);
  }
  const isInternalNote = Boolean(input.isInternalNote && agent);
  const mentions = isInternalNote ? [...body.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1]!.toLowerCase()) : [];

  const others = await db.conversationParticipant.findMany({ where: { conversationId: conv.id, participantKey: { not: participantKey(id) } } });

  let message: MessageWithRels;
  try {
    message = await db.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId: conv.id,
          senderType: agent ? 'AGENT' : 'CUSTOMER',
          senderId: id.kind === 'user' ? id.userId : null,
          body,
          clientMessageId: input.clientMessageId,
          isInternalNote,
          mentions,
          status: 'SENT',
        },
      });
      if (attachmentIds.length) {
        await tx.attachment.updateMany({ where: { id: { in: attachmentIds }, conversationId: conv.id, uploaderKey: participantKey(id), messageId: null }, data: { messageId: m.id } });
      }
      if (!isInternalNote) {
        const data: Prisma.ConversationUpdateInput = { lastMessageAt: new Date() };
        if (agent) {
          data.status = 'PENDING_CUSTOMER';
          if (!conv.firstResponseAt) data.firstResponseAt = new Date();
          if (!conv.assignedAgentId && id.kind === 'user') data.assignedAgent = { connect: { id: id.userId } };
        } else {
          data.status = 'PENDING_AGENT';
          if (conv.status === 'RESOLVED' || conv.status === 'CLOSED') {
            data.resolvedAt = null; // replying reopens a resolved chat
          }
        }
        if (input.channel === 'EMAIL') data.channel = 'EMAIL';
        await tx.conversation.update({ where: { id: conv.id }, data });
      }
      return tx.message.findUniqueOrThrow({ where: { id: m.id }, include: messageInclude });
    });
  } catch (err) {
    // Lost a race against an identical retry → return the stored copy.
    const dup = await db.message.findUnique({ where: { conversationId_clientMessageId: { conversationId: conv.id, clientMessageId: input.clientMessageId } }, include: messageInclude });
    if (dup) return { message: toDTO(dup, agent), duplicate: true, conversation: conv };
    throw err;
  }
  await ensureParticipant(conv.id, id);
  // Sender has implicitly read up to their own message.
  await db.conversationParticipant.update({
    where: { conversationId_participantKey: { conversationId: conv.id, participantKey: participantKey(id) } },
    data: { lastReadMessageId: message.id, lastReadAt: message.createdAt },
  });

  if (agent && !isInternalNote && id.kind === 'user') await ensureParticipant(conv.id, id, 'AGENT');
  if (mentions.length) {
    const mentioned = await db.user.findMany({ where: { role: { not: 'CUSTOMER' }, OR: mentions.map((m) => ({ email: { startsWith: `${m}@` } })) } });
    for (const u of mentioned) await notify(u.id, { type: 'chat.mention', title: `${id.name} mentioned you`, body: body.slice(0, 120), link: `/admin/inbox?c=${conv.id}` });
  }
  if (!agent && conv.assignedAgentId) emitTo(`user:${conv.assignedAgentId}`, 'chat:customer-message', { conversationId: conv.id });
  void others;
  const updated = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
  return { message: toDTO(message, agent), duplicate: false, conversation: updated };
}

export async function listMessages(id: ChatIdentity, conversationId: string, opts: { before?: string; after?: string; limit?: number } = {}) {
  await loadConversationFor(id, conversationId);
  const agent = isAgent(id);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const where: Prisma.MessageWhereInput = { conversationId, ...(agent ? {} : { isInternalNote: false }) };
  if (opts.after) {
    // Reconnect catch-up: everything newer than the last message the client has.
    const ref = await db.message.findUnique({ where: { id: opts.after }, select: { createdAt: true } });
    const rows = await db.message.findMany({ where: { ...where, ...(ref ? { OR: [{ createdAt: { gt: ref.createdAt } }, { createdAt: ref.createdAt, id: { gt: opts.after } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200, include: messageInclude });
    return { messages: rows.map((m) => toDTO(m, agent)), hasMore: false };
  }
  let cursorWhere: Prisma.MessageWhereInput = {};
  if (opts.before) {
    const ref = await db.message.findUnique({ where: { id: opts.before }, select: { createdAt: true } });
    if (ref) cursorWhere = { OR: [{ createdAt: { lt: ref.createdAt } }, { createdAt: ref.createdAt, id: { lt: opts.before } }] };
  }
  const rows = await db.message.findMany({ where: { ...where, ...cursorWhere }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, include: messageInclude });
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map((m) => toDTO(m, agent)), hasMore };
}

/** Read receipt: move the participant's read pointer forward and mark the other side's messages READ. */
export async function markRead(id: ChatIdentity, conversationId: string, messageId: string) {
  await loadConversationFor(id, conversationId);
  const msg = await db.message.findFirst({ where: { id: messageId, conversationId } });
  if (!msg) throw new HttpError(404, 'Message not found');
  const key = participantKey(id);
  await ensureParticipant(conversationId, id);
  const p = await db.conversationParticipant.findUniqueOrThrow({ where: { conversationId_participantKey: { conversationId, participantKey: key } } });
  if (p.lastReadAt && p.lastReadAt > msg.createdAt) return { changed: false, lastReadMessageId: p.lastReadMessageId };
  await db.conversationParticipant.update({ where: { id: p.id }, data: { lastReadMessageId: msg.id, lastReadAt: msg.createdAt } });
  const otherSide = isAgent(id) ? 'CUSTOMER' : 'AGENT';
  await db.message.updateMany({ where: { conversationId, senderType: otherSide, createdAt: { lte: msg.createdAt }, status: { in: ['SENT', 'DELIVERED'] } }, data: { status: 'READ' } });
  return { changed: true, lastReadMessageId: msg.id };
}

export async function markDelivered(conversationId: string, messageIds: string[]) {
  if (!messageIds.length) return;
  await db.message.updateMany({ where: { conversationId, id: { in: messageIds }, status: 'SENT' }, data: { status: 'DELIVERED' } });
}

/** Unread = messages from the other side newer than my read pointer (derived, never stored). */
export async function unreadCount(id: ChatIdentity, conversationId: string): Promise<number> {
  const p = await db.conversationParticipant.findUnique({ where: { conversationId_participantKey: { conversationId, participantKey: participantKey(id) } } });
  const otherSide = isAgent(id) ? 'CUSTOMER' : 'AGENT';
  return db.message.count({ where: { conversationId, senderType: otherSide, isInternalNote: false, ...(p?.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}) } });
}

export async function customerConversations(userId: string) {
  const convs = await db.conversation.findMany({ where: { customerId: userId }, orderBy: { lastMessageAt: 'desc' }, take: 50, include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: 'desc' }, take: 1 } } });
  const id: ChatIdentity = { kind: 'user', userId, role: 'CUSTOMER', name: '', email: '' };
  return Promise.all(convs.map(async (c) => ({ ...c, unread: await unreadCount(id, c.id) })));
}

// ─── Agent actions ───

export async function updateConversation(
  agent: { id: string; email: string; role: RoleName; name: string | null },
  conversationId: string,
  patch: { status?: ConversationStatus; priority?: Priority; tags?: string[]; assignedAgentId?: string | null },
) {
  if (!hasPermission(agent.role, 'support:inbox')) throw new HttpError(403, 'Forbidden');
  const before = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const data: Prisma.ConversationUncheckedUpdateInput = {};
  if (patch.priority) data.priority = patch.priority;
  if (patch.tags) data.tags = [...new Set(patch.tags.map((t) => sanitizeText(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10);
  if (patch.assignedAgentId !== undefined) {
    if (patch.assignedAgentId) {
      const target = await db.user.findUnique({ where: { id: patch.assignedAgentId } });
      if (!target || !hasPermission(target.role, 'support:inbox')) throw new HttpError(400, 'Not a support agent');
    }
    data.assignedAgentId = patch.assignedAgentId;
  }
  if (patch.status) {
    data.status = patch.status;
    if (patch.status === 'RESOLVED' || patch.status === 'CLOSED') data.resolvedAt = new Date();
  }
  const updated = await db.conversation.update({ where: { id: conversationId }, data });
  await audit({ actor: { id: agent.id, email: agent.email }, action: 'conversation.update', resourceType: 'Conversation', resourceId: conversationId, before: pick(before), after: pick(updated) });
  if (patch.assignedAgentId) {
    const target = await db.user.findUniqueOrThrow({ where: { id: patch.assignedAgentId } });
    await ensureParticipant(conversationId, { kind: 'user', userId: target.id, role: target.role, name: target.name ?? '', email: target.email }, 'AGENT');
    emitTo('agent-inbox', 'conversation:assigned', { conversationId, agentId: target.id, agentName: target.name });
  }
  if (patch.status === 'RESOLVED' && before.status !== 'RESOLVED') {
    await postSystemMessage(conversationId, `${agent.name?.split(' ')[0] ?? 'Support'} marked this conversation as resolved. Reply any time to reopen it.`);
    emitTo(`conversation:${conversationId}`, 'csat:request', { conversationId });
  }
  emitTo(`conversation:${conversationId}`, 'conversation:updated', serializeConversation(updated));
  emitTo('agent-inbox', 'conversation:updated', serializeConversation(updated));
  return updated;
}

function pick(c: Conversation) {
  return { status: c.status, priority: c.priority, tags: c.tags, assignedAgentId: c.assignedAgentId };
}

export function serializeConversation(c: Conversation) {
  return { ...c, guestTokenHash: undefined, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), lastMessageAt: c.lastMessageAt.toISOString(), firstResponseAt: c.firstResponseAt?.toISOString() ?? null, resolvedAt: c.resolvedAt?.toISOString() ?? null };
}

export async function submitCsat(id: ChatIdentity, conversationId: string, score: number, comment?: string) {
  const conv = await loadConversationFor(id, conversationId);
  if (isAgent(id)) throw new HttpError(403, 'Only customers rate conversations');
  if (!['RESOLVED', 'CLOSED'].includes(conv.status)) throw new HttpError(400, 'You can rate a conversation once it is resolved');
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(400, 'Score must be 1–5');
  const updated = await db.conversation.update({ where: { id: conversationId }, data: { csatScore: score, csatComment: comment ? sanitizeText(comment, 500) : null } });
  emitTo('agent-inbox', 'conversation:updated', serializeConversation(updated));
  return updated;
}

/** Fill canned-reply variables: {{customer.firstName}}, {{customer.email}}, {{order.id}}, {{agent.firstName}}, {{store.name}}. */
export async function renderCannedReply(body: string, conversationId: string, agentName: string | null) {
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { customer: true } });
  const order = conv.orderId ? await db.order.findUnique({ where: { id: conv.orderId } }) : null;
  const name = conv.customer?.name || conv.guestName || '';
  const vars: Record<string, string> = {
    'customer.firstName': name.split(' ')[0] || 'there',
    'customer.name': name || 'there',
    'customer.email': conv.customer?.email || conv.guestEmail || '',
    'order.id': order?.invoiceNumber || order?.id || '(no order attached)',
    'agent.firstName': agentName?.split(' ')[0] || 'Support',
    'store.name': STORE_NAME,
  };
  return body.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

// ─── Email bridge ───

export function replyAddress(conversationId: string) {
  return `support+${conversationId}.${hmac(conversationId, env().INBOUND_EMAIL_SECRET).slice(0, 10)}@${env().SUPPORT_REPLY_DOMAIN}`;
}

export function parseReplyAddress(address: string): string | null {
  const m = /support\+([a-z0-9]+)\.([A-Za-z0-9_-]{10})@/i.exec(address);
  if (!m) return null;
  return safeEqual(m[2]!, hmac(m[1]!, env().INBOUND_EMAIL_SECRET).slice(0, 10)) ? m[1]! : null;
}

/** Strip quoted history from an email reply ("On … wrote:", "> " lines, signatures). */
export function stripEmailReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line) || /^From: /.test(line) || line.trim() === '-- ') break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export async function handleInboundEmail(input: { from: string; to: string; text: string }) {
  const conversationId = parseReplyAddress(input.to);
  if (!conversationId) throw new HttpError(400, 'Unrecognised reply address');
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { customer: true } });
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const sender = input.from.toLowerCase().match(/[^\s<>"]+@[^\s<>"]+/)?.[0];
  const expected = (conv.customer?.email || conv.guestEmail || '').toLowerCase();
  if (!sender || sender !== expected) throw new HttpError(403, 'Sender does not match the conversation');
  const body = stripEmailReply(input.text);
  if (!body) return null;
  const identity: ChatIdentity = conv.customer
    ? { kind: 'user', userId: conv.customer.id, role: conv.customer.role, name: conv.customer.name ?? sender, email: sender }
    : { kind: 'guest', conversationId: conv.id, name: conv.guestName || 'Guest', email: sender };
  const { message } = await postMessage(identity, { conversationId: conv.id, body, clientMessageId: `email_${sha256(input.text).slice(0, 32)}`, channel: 'EMAIL' });
  emitTo(`conversation:${conv.id}`, 'message:new', message);
  emitTo('agent-inbox', 'conversation:updated', { id: conv.id, lastMessageAt: message.createdAt, status: 'PENDING_AGENT' });
  return message;
}

/**
 * Batched offline notifications: for each participant with unread messages from the other side older than
 * CHAT_OFFLINE_EMAIL_MINUTES, who is not connected, send ONE digest email covering all of them.
 */
export async function sendOfflineDigests(now = new Date()) {
  const minutes = env().CHAT_OFFLINE_EMAIL_MINUTES;
  const cutoff = new Date(now.getTime() - minutes * 60_000);
  const convs = await db.conversation.findMany({
    where: { lastMessageAt: { lte: cutoff, gte: new Date(now.getTime() - 7 * 24 * 3600_000) }, anonymizedAt: null },
    include: { participants: true, customer: true, assignedAgent: true },
    take: 200,
  });
  let sent = 0;
  for (const c of convs) {
    for (const p of c.participants) {
      const isCustomerSide = p.role === 'CUSTOMER';
      if (!isCustomerSide && p.userId !== c.assignedAgentId) continue; // agents: only the assignee gets email
      const since = new Date(Math.max(p.lastReadAt?.getTime() ?? 0, p.lastNotifiedAt?.getTime() ?? 0));
      const unread = await db.message.findMany({
        where: { conversationId: c.id, senderType: isCustomerSide ? { in: ['AGENT'] } : 'CUSTOMER', isInternalNote: false, createdAt: { gt: since, lte: cutoff } },
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { name: true } } },
      });
      if (!unread.length) continue;
      if (await isOnline(p.participantKey === 'guest' ? `guest:${c.id}` : p.participantKey)) continue;
      const to = isCustomerSide ? c.customer?.email || c.guestEmail : c.assignedAgent?.email;
      if (!to) continue;
      if (isCustomerSide && c.customer && !c.customer.notifyChatEmail) continue;
      const link = isCustomerSide ? (c.customerId ? absoluteUrl(`/support/chat?c=${c.id}`) : absoluteUrl(`/support/chat?c=${c.id}&t=${guestTokenFor(c.id)}`)) : absoluteUrl(`/admin/inbox?c=${c.id}`);
      const digest = unread.map((m) => `${m.sender?.name?.split(' ')[0] ?? (isCustomerSide ? 'Support' : 'Customer')} (${m.createdAt.toISOString().slice(11, 16)} UTC):\n${m.body}`).join('\n\n');
      await sendEmail({
        to,
        template: 'chat-digest',
        subject: `${isCustomerSide ? 'New reply' : 'Customer is waiting'}: ${c.subject} [#${c.id.slice(-6).toUpperCase()}]`,
        text: `${digest}\n\n—\nReply to this email or continue the chat: ${link}\nWaiting since ${formatDuration(now.getTime() - unread[0]!.createdAt.getTime())}.`,
        replyTo: isCustomerSide ? replyAddress(c.id) : undefined,
        meta: { conversationId: c.id, messages: unread.length },
      });
      await db.conversationParticipant.update({ where: { id: p.id }, data: { lastNotifiedAt: now } });
      sent++;
    }
  }
  return sent;
}

/** Retention: anonymise conversations older than CHAT_RETENTION_MONTHS. */
export async function applyChatRetention(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - env().CHAT_RETENTION_MONTHS);
  const old = await db.conversation.findMany({ where: { lastMessageAt: { lt: cutoff }, anonymizedAt: null }, select: { id: true }, take: 500 });
  for (const c of old) {
    await db.$transaction([
      db.message.updateMany({ where: { conversationId: c.id }, data: { body: '[removed under retention policy]', senderId: null } }),
      db.attachment.deleteMany({ where: { conversationId: c.id } }),
      db.conversation.update({ where: { id: c.id }, data: { guestEmail: null, guestName: null, csatComment: null, anonymizedAt: now } }),
    ]);
  }
  return old.length;
}

export async function searchHelpArticles(q: string, take = 3) {
  const query = q.trim().slice(0, 200);
  if (query.length < 3) return [];
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return db.$queryRaw<Array<{ slug: string; title: string; excerpt: string }>>`
    SELECT slug, title, left(body, 180) AS excerpt FROM "HelpArticle"
    WHERE published AND (
      word_similarity(${query}, title) > 0.3 OR similarity(title, ${query}) > 0.15
      OR to_tsvector('english', title || ' ' || body) @@ to_tsquery('english', ${words.length ? words.map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean).join(' | ') : 'x'})
    )
    ORDER BY ts_rank(to_tsvector('english', title || ' ' || body), to_tsquery('english', ${words.length ? words.map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean).join(' | ') : 'x'})) + similarity(title, ${query}) DESC
    LIMIT ${take}`;
}
