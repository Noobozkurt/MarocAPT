import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { db } from './db';

export interface AuditActor {
  id: string | null;
  email: string;
}

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)));
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null, userAgent: h.get('user-agent') };
  } catch {
    return { ip: null, userAgent: null }; // called outside a request (jobs, scripts)
  }
}

/**
 * Append an audit record. Failures throw: an admin action that cannot be audited must not succeed,
 * so callers run this inside the same transaction as the change when possible (pass `tx`).
 */
export async function audit(entry: AuditEntry, tx: Prisma.TransactionClient = db): Promise<void> {
  const meta = entry.ip !== undefined ? { ip: entry.ip ?? null, userAgent: entry.userAgent ?? null } : await requestMeta();
  await tx.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

export const SYSTEM_ACTOR: AuditActor = { id: null, email: 'system' };
