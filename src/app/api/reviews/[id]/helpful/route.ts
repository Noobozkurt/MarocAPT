import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireUserForWrite } from '@/lib/session';

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUserForWrite();
  const { id } = await params;
  const exists = await db.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId: u.id } } });
  if (!exists) await db.$transaction([db.reviewVote.create({ data: { reviewId: id, userId: u.id } }), db.review.update({ where: { id }, data: { helpfulCount: { increment: 1 } } })]);
  const r = await db.review.findUniqueOrThrow({ where: { id } });
  return json({ helpfulCount: r.helpfulCount });
});
