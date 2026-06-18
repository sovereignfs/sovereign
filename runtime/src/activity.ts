import { randomUUID } from 'node:crypto';
import { type RecordActivityInput, getPlatformDb, recordActivity } from '@sovereignfs/db';

/**
 * Fire-and-forget activity logger for use in runtime route handlers and
 * server actions. Wraps `recordActivity` from `@sovereignfs/db` with UUID
 * generation and db initialisation; never throws so a log failure never
 * blocks the primary action.
 */
export async function logActivity(input: Omit<RecordActivityInput, 'id'>): Promise<void> {
  try {
    const pdb = await getPlatformDb();
    await recordActivity(pdb, { id: randomUUID(), ...input });
  } catch {
    // Intentionally silent — activity logging must never break the primary operation.
  }
}
