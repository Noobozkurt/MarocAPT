import { z } from 'zod';
import { json, readJson, route } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { clientIp } from '@/lib/utils';
import { issueDownload } from '@/server/downloads';

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { fileId, access, versionId } = z.object({ fileId: z.string().max(40), access: z.string().max(500).nullable().optional(), versionId: z.string().max(40).optional() }).parse(await readJson(req));
  const user = await getSessionUser();
  const grant = await issueDownload(id, fileId, { userId: user?.id ?? null, accessToken: access, ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') }, versionId);
  return json(grant);
});
