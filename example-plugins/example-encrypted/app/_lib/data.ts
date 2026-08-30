import { desc, eq, and } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { blindIndexMatch } from '@sovereignfs/sdk/drizzle';
import { encryptedNotes, type EncryptedNoteRow } from '../_db/schema';

// The SDK returns an opaque, dialect-agnostic client; plugins type it through
// their own sqlite-core schema (works on either live dialect). No `any`
// needed — BaseSQLiteDatabase's second generic (TRunResult) has no `extends`
// constraint, so `unknown` satisfies it exactly as well (same pattern as
// packages/db/src/client.ts's SqliteDb).
type Db = BaseSQLiteDatabase<'async', unknown>;

async function db(): Promise<Db> {
  return (await sdk.db.getClient()) as Db;
}

let registered = false;

/**
 * Register this plugin's classified tables once per process — what lets the
 * operator tools (`sv db encrypt-fields`, `sv keys rotate-blind-index`) walk
 * them from outside the runtime. Persisted platform-side (idempotent
 * upsert); the flag just avoids re-upserting on every request.
 */
export async function registerEncryptionTables(): Promise<void> {
  if (registered) return;
  await sdk.crypto.registerTables(encryptedNotes);
  registered = true;
}

/** A note as the UI consumes it — already opened (decrypted). */
export interface NoteView {
  id: string;
  label: string | null;
  body: string | null;
  createdAt: number;
}

function toView(row: Record<string, unknown>): NoteView {
  const note = row as EncryptedNoteRow;
  return { id: note.id, label: note.label, body: note.body, createdAt: note.createdAt };
}

/** List the current user's notes, newest first — read then `open()`. */
export async function listNotes(userId: string): Promise<NoteView[]> {
  const rows = await (
    await db()
  )
    .select()
    .from(encryptedNotes)
    .where(eq(encryptedNotes.ownerUserId, userId))
    .orderBy(desc(encryptedNotes.createdAt));
  const opened = await sdk.crypto.open(encryptedNotes, rows as Record<string, unknown>[]);
  return opened.map(toView);
}

/** Insert one note — `seal()` before the write. The tripwire enforces this. */
export async function createNote(input: {
  userId: string;
  tenantId: string;
  label: string;
  body: string;
}): Promise<void> {
  const sealed = await sdk.crypto.seal(encryptedNotes, {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    ownerUserId: input.userId,
    label: input.label,
    body: input.body,
    createdAt: Math.floor(Date.now() / 1000),
  });
  await (await db()).insert(encryptedNotes).values(sealed);
}

/**
 * Exact-match search over the encrypted `label`, via its blind index.
 * `hashFieldCandidates` + `blindIndexMatch` is the rotation-safe pattern —
 * results stay identical while an operator rotates the index key.
 */
export async function findNotesByLabel(userId: string, label: string): Promise<NoteView[]> {
  const candidates = await sdk.crypto.hashFieldCandidates(label, { sensitivity: 'sensitive' });
  const rows = await (
    await db()
  )
    .select()
    .from(encryptedNotes)
    .where(
      and(
        eq(encryptedNotes.ownerUserId, userId),
        blindIndexMatch(encryptedNotes.labelIdx, candidates),
      ),
    );
  const opened = await sdk.crypto.open(encryptedNotes, rows as Record<string, unknown>[]);
  return opened.map(toView);
}

/**
 * Portability export (RFC 0007): rows are `open()`ed before emitting — a
 * user's export contains their data in plaintext, never envelopes. Called
 * per request from the layout, like every portability registration.
 */
export async function registerExport(): Promise<void> {
  await sdk.portability.provideExport(async ({ userId }) => {
    const notes = await listNotes(userId);
    return {
      pluginId: 'fs.sovereign.example-encrypted',
      schemaVersion: 1,
      data: { notes },
    };
  });
}
