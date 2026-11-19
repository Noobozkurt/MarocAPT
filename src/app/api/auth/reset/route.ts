import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, json, readJson, route } from '@/lib/api';
import { sha256, verifyToken } from '@/lib/crypto';

export const POST = route(async (req) => {
  const { token, password } = z.object({ token: z.string(), password: z.string().min(10, 'Password must be at least 10 characters').max(200) }).parse(await readJson(req));
  const data = verifyToken<{ uid: string; fp: string }>(token, 'pw-reset');
  const user = data ? await db.user.findUnique({ where: { id: data.uid } }) : null;
  if (!user || sha256(user.passwordHash ?? 'none').slice(0, 16) !== data!.fp) throw new HttpError(400, 'This reset link is invalid or was already used');
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    db.authSession.deleteMany({ where: { userId: user.id } }), // log out everywhere
  ]);
  return json({ ok: true });
});
