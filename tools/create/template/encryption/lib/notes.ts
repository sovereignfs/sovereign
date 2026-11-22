import { database } from './db';

/**
 * The notes, as the browser sends them (ENCRYPTION.md): a title and a text each encrypted with the note's own key, and that key sealed
 * to each reader. The server checks shapes and who may do what, and opens nothing: it has no key. Every statement names the person, so
 * someone else's note is a note that is not there.
 */

export interface Reader {
  readonly sub: string;
  /** The note's key sealed to this reader and signed by the owner, as JSON. */
  readonly record: string;
}

export interface NoteRow {
  readonly id: string;
  readonly owner: string;
  readonly version: number;
  /** base64url. */
  readonly meta: string;
  readonly body: string;
  /** The note's key sealed to the person asking. */
  readonly record: string;
  /** Who can read it, for the owner; empty for a note shared with the person. */
  readonly readers: string[];
}

export interface NoteWrite {
  readonly version: number;
  readonly meta: string;
  readonly body: string;
  readonly readers: readonly Reader[];
}

export class NoteError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

const ID = /^[a-z0-9-]{1,64}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const MAX_META = 8 * 1024;
const MAX_BODY = 512 * 1024;
const MAX_READERS = 50;

const bytes = (value: unknown, max: number, what: string): Buffer => {
  if (typeof value !== 'string' || !BASE64URL.test(value) || value.length > (max * 4) / 3 + 4) {
    throw new NoteError(400, `${what} is not what this app stores.`);
  }
  return Buffer.from(value, 'base64url');
};

/** What a write must be: an id the browser made, a version, two encrypted values, and its readers, the owner among them. */
export function checkWrite(owner: string, id: string, input: unknown): NoteWrite & { id: string } {
  if (!ID.test(id)) throw new NoteError(404, 'There is no such note.');
  const value = (input ?? {}) as Partial<Record<keyof NoteWrite, unknown>>;
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1) {
    throw new NoteError(400, 'A note has a version.');
  }
  bytes(value.meta, MAX_META, 'The title');
  bytes(value.body, MAX_BODY, 'The note');
  const readers = Array.isArray(value.readers) ? (value.readers as unknown[]) : [];
  if (readers.length === 0 || readers.length > MAX_READERS) {
    throw new NoteError(400, 'A note is shared with 1 to 50 people.');
  }
  const checked = readers.map((reader) => {
    const { sub, record } = (reader ?? {}) as { sub?: unknown; record?: unknown };
    if (typeof sub !== 'string' || !sub || sub.length > 255)
      throw new NoteError(400, 'A reader has no id.');
    if (typeof record !== 'string' || record.length > 8192)
      throw new NoteError(400, 'A key is too large.');
    try {
      JSON.parse(record);
    } catch {
      throw new NoteError(400, 'A key is not what this app stores.');
    }
    return { sub, record };
  });
  if (!checked.some((reader) => reader.sub === owner)) {
    throw new NoteError(400, 'The owner can always read their own note.');
  }
  if (new Set(checked.map((reader) => reader.sub)).size !== checked.length) {
    throw new NoteError(400, 'A reader is named twice.');
  }
  return {
    id,
    version: value.version as number,
    meta: value.meta as string,
    body: value.body as string,
    readers: checked,
  };
}

export const notes = () => ({
  /** The notes the person can read, newest first: their own, and those shared with them. */
  async list(sub: string): Promise<NoteRow[]> {
    const db = await database();
    const { rows } = await db.run(
      `SELECT n.id, n.owner, n.version, n.meta, n.body, r.record
         FROM notes n JOIN note_readers r ON r.note_id = n.id AND r.reader = ?
        ORDER BY n.updated_at DESC LIMIT 200`,
      [sub],
    );
    const notes = rows as {
      id: string;
      owner: string;
      version: number;
      meta: string;
      body: string;
      record: string;
    }[];
    const owned = notes.filter((row) => row.owner === sub).map((row) => row.id);
    const readers = owned.length
      ? ((
          await db.run(
            `SELECT note_id, reader FROM note_readers WHERE note_id IN (${owned.map(() => '?').join(', ')}) ORDER BY reader`,
            owned,
          )
        ).rows as { note_id: string; reader: string }[])
      : [];
    return notes.map((row) => ({
      id: row.id,
      owner: row.owner,
      version: Number(row.version),
      meta: row.meta,
      body: row.body,
      record: row.record,
      readers:
        row.owner === sub ? readers.filter((r) => r.note_id === row.id).map((r) => r.reader) : [],
    }));
  },

  /**
   * Writes a note of the person's, new or changed, with all its readers, in one transaction. A note of someone else's under the same id,
   * or an older version than the one stored, is refused as not there. What the browser encrypted is kept as it came, in base64url.
   */
  async save(owner: string, note: NoteWrite & { id: string }): Promise<void> {
    await (
      await database()
    ).transaction(async (tx) => {
      const written = await tx.run(
        `INSERT INTO notes (id, owner, version, meta, body, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, meta = EXCLUDED.meta, body = EXCLUDED.body,
           updated_at = EXCLUDED.updated_at
          WHERE notes.owner = EXCLUDED.owner AND notes.version <= EXCLUDED.version`,
        [note.id, owner, note.version, note.meta, note.body, Date.now()],
      );
      if (written.rowsAffected !== 1) throw new NoteError(404, 'There is no such note.');
      await tx.run('DELETE FROM note_readers WHERE note_id = ?', [note.id]);
      for (const reader of note.readers) {
        await tx.run('INSERT INTO note_readers (note_id, reader, record) VALUES (?, ?, ?)', [
          note.id,
          reader.sub,
          reader.record,
        ]);
      }
    });
  },

  /** Deletes a note of the person's, and every key sealed for it. */
  async remove(owner: string, id: string): Promise<boolean> {
    return (await database()).transaction(async (tx) => {
      const deleted = await tx.run('DELETE FROM notes WHERE id = ? AND owner = ?', [id, owner]);
      if (deleted.rowsAffected === 1)
        await tx.run('DELETE FROM note_readers WHERE note_id = ?', [id]);
      return deleted.rowsAffected === 1;
    });
  },

  /** Everything of a person, when their account is deleted: their notes, the keys for them, and the keys sealed to them. */
  async deleteAll(sub: string): Promise<void> {
    await (
      await database()
    ).transaction(async (tx) => {
      await tx.run(
        'DELETE FROM note_readers WHERE note_id IN (SELECT id FROM notes WHERE owner = ?) OR reader = ?',
        [sub, sub],
      );
      await tx.run('DELETE FROM notes WHERE owner = ?', [sub]);
    });
  },
});
