import type { NextAuthOptions, DefaultSession } from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import DiscordProvider from 'next-auth/providers/discord';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { db } from './db';
import { decrypt } from './crypto';
import { verifyTotp } from './totp';
import { rateLimit } from './rate-limit';
import { isStaff, type RoleName } from './permissions';
import { sendEmail } from './email';
import { STORE_NAME } from './env';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: RoleName;
      mfa: boolean;
      totpEnabled: boolean;
      sid?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    role?: RoleName;
    sid?: string;
    mfa?: boolean;
    totpEnabled?: boolean;
    checkedAt?: number;
  }
}

type AuthUser = { id: string; email: string; name?: string | null; image?: string | null; role?: RoleName; totpEnabled?: boolean; mfa?: boolean };

async function requestMeta() {
  try {
    const h = await headers();
    return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1', ua: h.get('user-agent') || null };
  } catch {
    return { ip: null, ua: null };
  }
}

function oauthProviders() {
  const list = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    list.push(GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }));
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    list.push(GitHubProvider({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }));
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
    list.push(DiscordProvider({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET }));
  return list;
}

export function enabledOAuthProviders(): string[] {
  return oauthProviders().map((p) => p.id);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login', error: '/login', verifyRequest: '/login?check=email' },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totp: { label: '2FA code', type: 'text' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) throw new Error('Enter your email and password');
        const { ip } = await requestMeta();
        const rl = await rateLimit(`login:${ip}:${email}`, 8, 300);
        if (!rl.ok) throw new Error('Too many attempts. Try again in a few minutes.');

        const user = await db.user.findUnique({ where: { email } });
        // Same message for unknown email and wrong password (no account enumeration).
        if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw new Error('Invalid email or password');
        if (user.status !== 'ACTIVE') throw new Error('This account is suspended. Contact support.');

        let mfa = false;
        if (user.totpEnabled && user.totpSecret) {
          const code = (credentials?.totp || '').replace(/\s+/g, '');
          if (!code) throw new Error('2FA_REQUIRED');
          if (!verifyTotp(decrypt(user.totpSecret), code)) throw new Error('Invalid two-factor code');
          mfa = true;
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role, totpEnabled: user.totpEnabled, mfa } as AuthUser;
      },
    }),
    EmailProvider({
      // Magic link sign-in. Delivery goes through our email layer (Resend / SMTP / dev outbox).
      server: 'smtp://unused.invalid',
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url }) {
        await sendEmail({
          to: identifier,
          template: 'magic-link',
          subject: `Sign in to ${STORE_NAME}`,
          text: `Click to sign in (valid for 15 minutes):\n\n${url}\n\nIf you didn't request this, ignore this email.`,
          meta: { url },
        });
      },
    }),
    ...oauthProviders(),
  ],
  callbacks: {
    async signIn({ user }) {
      const u = await db.user.findUnique({ where: { email: (user.email || '').toLowerCase() }, select: { status: true } });
      if (u && u.status !== 'ACTIVE') return '/login?error=suspended';
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as AuthUser;
        const dbUser = await db.user.findUnique({ where: { id: u.id } });
        if (!dbUser) return token;
        const meta = await requestMeta();
        const s = await db.authSession.create({ data: { userId: dbUser.id, ip: meta.ip, userAgent: meta.ua?.slice(0, 300) } });
        token.uid = dbUser.id;
        token.role = dbUser.role;
        token.sid = s.id;
        token.totpEnabled = dbUser.totpEnabled;
        token.mfa = Boolean(u.mfa);
        token.checkedAt = Date.now();
        return token;
      }

      if (trigger === 'update' && token.uid) {
        const s = session as { mfaCode?: string; refresh?: boolean } | undefined;
        const dbUser = await db.user.findUnique({ where: { id: token.uid } });
        if (!dbUser) return token;
        token.role = dbUser.role;
        token.totpEnabled = dbUser.totpEnabled;
        if (s?.mfaCode && dbUser.totpEnabled && dbUser.totpSecret) {
          const ok = verifyTotp(decrypt(dbUser.totpSecret), String(s.mfaCode).replace(/\s+/g, ''));
          if (ok) token.mfa = true;
        }
        token.checkedAt = Date.now();
        return token;
      }

      // Re-sync role/status every 5 minutes so demotions take effect without re-login.
      if (token.uid && (!token.checkedAt || Date.now() - token.checkedAt > 5 * 60_000)) {
        const dbUser = await db.user.findUnique({ where: { id: token.uid }, select: { role: true, totpEnabled: true } });
        if (dbUser) {
          token.role = dbUser.role;
          token.totpEnabled = dbUser.totpEnabled;
        }
        if (token.sid) await db.authSession.updateMany({ where: { id: token.sid }, data: { lastSeenAt: new Date() } });
        token.checkedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role ?? 'CUSTOMER';
        session.user.mfa = Boolean(token.mfa);
        session.user.totpEnabled = Boolean(token.totpEnabled);
        session.user.sid = token.sid;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.sid) await db.authSession.deleteMany({ where: { id: token.sid } });
    },
    async createUser({ user }) {
      // OAuth / magic-link sign-ups: attach guest orders placed with the same email.
      if (user.email) await claimGuestPurchases(user.id, user.email);
    },
  },
};

/** Attach licenses + orders bought as a guest to the account with the same (verified) email. */
export async function claimGuestPurchases(userId: string, email: string) {
  const e = email.toLowerCase();
  await db.order.updateMany({ where: { email: e, userId: null }, data: { userId } });
  await db.license.updateMany({ where: { email: e, userId: null }, data: { userId } });
  await db.conversation.updateMany({ where: { guestEmail: e, customerId: null }, data: { customerId: userId } });
}

export function staffNeedsMfa(role: RoleName | undefined, mfa: boolean | undefined) {
  return isStaff(role) && !mfa;
}
