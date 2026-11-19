import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { chatIdentity } from '@/server/chat-http';
import { isAgent, markRead } from '@/server/chat';
import { emitTo } from '@/server/realtime';

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const who = await chatIdentity(req);
  const { messageId } = z.object({ messageId: z.string() }).parse(await readJson(req));
  const r = await markRead(who, id, messageId);
  if (r.changed) emitTo(`conversation:${id}`, 'message:read', { conversationId: id, messageId, side: isAgent(who) ? 'AGENT' : 'CUSTOMER', name: who.name });
  return json(r);
});
