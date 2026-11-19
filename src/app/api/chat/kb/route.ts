import { json, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/utils';
import { searchHelpArticles } from '@/server/chat';

export const GET = route(async (req) => {
  await enforceRateLimit(`kb:${clientIp(req.headers)}`, 60, 60);
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return json({ articles: await searchHelpArticles(q, 3) });
});
