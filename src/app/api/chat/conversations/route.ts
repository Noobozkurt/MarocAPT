import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/utils';
import { customerConversations, startConversation } from '@/server/chat';
import { emitTo } from '@/server/realtime';

export const GET = route(async () => {
  const u = await getSessionUser();
  if (!u) return json({ conversations: [] });
  const list = await customerConversations(u.id);
  return json({ conversations: list.map((c) => ({ id: c.id, subject: c.subject, status: c.status, lastMessageAt: c.lastMessageAt, unread: c.unread, preview: c.messages[0]?.body.slice(0, 80) ?? '' })) });
});

const schema = z.object({
  topic: z.enum(['ORDER_PAYMENT', 'DOWNLOAD', 'LICENSE', 'TECHNICAL', 'OTHER']),
  subject: z.string().max(140).optional(),
  message: z.string().min(1).max(4000),
  clientMessageId: z.string().min(8).max(64),
  orderId: z.string().max(40).nullable().optional(),
  productId: z.string().max(40).nullable().optional(),
  guestEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  guestName: z.string().max(80).nullable().optional(),
});

export const POST = route(async (req) => {
  await enforceRateLimit(`chat-start:${clientIp(req.headers)}`, 5, 600);
  const input = schema.parse(await readJson(req));
  const u = await getSessionUser();
  const topicSubjects = { ORDER_PAYMENT: 'Order / payment', DOWNLOAD: 'Download issue', LICENSE: 'License question', TECHNICAL: 'Technical / file problem', OTHER: 'General question' } as const;
  const { conversation, guestToken, firstMessage } = await startConversation(u && !u.impersonatorId ? { id: u.id, role: u.role, name: u.name, email: u.email } : null, { ...input, subject: input.subject || topicSubjects[input.topic] });
  emitTo(`conversation:${conversation.id}`, 'message:new', firstMessage);
  return json({ conversation: { id: conversation.id, subject: conversation.subject, status: conversation.status }, guestToken, message: firstMessage }, { status: 201 });
});
