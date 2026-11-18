import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { chatIdentity } from '@/server/chat-http';
import { submitCsat } from '@/server/chat';

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const who = await chatIdentity(req);
  const { score, comment } = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).parse(await readJson(req));
  await submitCsat(who, id, score, comment);
  return json({ ok: true });
});
