import { z } from 'zod';
import { db } from '@/lib/db';
import { json, readJson, route } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import { chatIdentity } from '@/server/chat-http';
import { getAvailability, isAgent, listMessages, loadConversationFor, serializeConversation, updateConversation } from '@/server/chat';

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const who = await chatIdentity(req);
  const conv = await loadConversationFor(who, id);
  const [{ messages, hasMore }, participants, availability] = await Promise.all([
    listMessages(who, id, { limit: 30 }),
    db.conversationParticipant.findMany({ where: { conversationId: id }, select: { participantKey: true, role: true, lastReadMessageId: true, lastReadAt: true, user: { select: { name: true } } } }),
    getAvailability(),
  ]);
  const agent = conv.assignedAgentId ? await db.user.findUnique({ where: { id: conv.assignedAgentId }, select: { name: true, agentStatus: true } }) : null;
  return json({ conversation: { ...serializeConversation(conv), guestEmail: isAgent(who) ? conv.guestEmail : undefined }, messages, hasMore, participants, availability, agent: agent ? { name: agent.name?.split(' ')[0], status: agent.agentStatus } : null });
});

const patchSchema = z.object({
  status: z.enum(['OPEN', 'PENDING_CUSTOMER', 'PENDING_AGENT', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  assignedAgentId: z.string().max(40).nullable().optional(),
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const agent = await requirePermission('support:inbox');
  const patch = patchSchema.parse(await readJson(req));
  const updated = await updateConversation(agent, id, patch);
  return json({ conversation: serializeConversation(updated) });
});
