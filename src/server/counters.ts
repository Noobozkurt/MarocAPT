import type { Prisma } from '@prisma/client';

/** Gap-free sequential counter (row-locked upsert). Used for invoice numbers. */
export async function nextCounter(tx: Prisma.TransactionClient, name: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return Number(rows[0]!.value);
}

export function formatInvoiceNumber(n: number, year = new Date().getFullYear()) {
  return `INV-${year}-${String(n).padStart(6, '0')}`;
}
