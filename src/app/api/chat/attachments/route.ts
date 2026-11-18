import { db } from '@/lib/db';
import { HttpError, json, route } from '@/lib/api';
import { randomToken } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { chatIdentity } from '@/server/chat-http';
import { loadConversationFor, participantKey } from '@/server/chat';
import { CHAT_ATTACHMENT_MAX, CHAT_ATTACHMENT_TYPES } from '@/server/scan';
import { storage } from '@/server/storage';
import { enqueue } from '@/server/jobs';

export const POST = route(async (req) => {
  const who = await chatIdentity(req);
  await enforceRateLimit(`chat-upload:${participantKey(who)}`, 10, 60);
  const form = await req.formData();
  const file = form.get('file');
  const conversationId = String(form.get('conversationId') || '');
  if (!(file instanceof File)) throw new HttpError(400, 'No file');
  await loadConversationFor(who, conversationId);
  if (file.size > CHAT_ATTACHMENT_MAX) throw new HttpError(413, 'Files can be up to 25 MB');
  const mime = file.type || 'application/octet-stream';
  if (!CHAT_ATTACHMENT_TYPES.includes(mime)) throw new HttpError(415, 'Allowed: images, PDF, ZIP and text files');
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';
  const key = `chat/${conversationId}/${randomToken(8)}-${safeName}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), mime);
  const a = await db.attachment.create({ data: { conversationId, uploaderKey: participantKey(who), storageKey: key, fileName: safeName, mimeType: mime, size: file.size, scanStatus: 'PENDING' } });
  await enqueue('attachment.scan', { attachmentId: a.id });
  return json({ attachment: { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, scanStatus: a.scanStatus } }, { status: 201 });
});
