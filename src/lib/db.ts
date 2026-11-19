import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db: PrismaClient =
  g.__prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

g.__prisma = db;
