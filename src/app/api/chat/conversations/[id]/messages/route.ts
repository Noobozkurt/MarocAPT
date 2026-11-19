import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { chatIdentity } from '@/server/chat-http';
import { listMessages, postMessage } from '@/server/chat';
import { emitTo } from '@/server/realtime';

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const who = await chatIdentity(req);
  const sp = new URL(req.url).searchParams;
  return json(await listMessages(who, id, { before: sp.get('before') ?? undefined, after: sp.get('after') ?? undefined, limit: Number(sp.get('limit')) || 30 }));
});

/** HTTP fallback for sending when the socket is down (same validation, dedupe and broadcast). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const who = await chatIdentity(req);
  const input = z.object({ body: z.string().max(4000), clientMessageId: z.string(), attachmentIds: z.array(z.string()).max(5).optional(), isInternalNote: z.boolean().optional() }).parse(await readJson(req));
  const { message, duplicate } = await postMessage(who, { conversationId: id, ...input });
  if (!duplicate) emitTo(message.isInternalNote ? `conversation:${id}:agents` : `conversation:${id}`, 'message:new', message);
  if (!duplicate && !message.isInternalNote) emitTo('agent-inbox', 'conversation:activity', { conversationId: id, lastMessageAt: message.createdAt, preview: message.body.slice(0, 80), from: message.senderType });
  return json({ message, duplicate });
});
