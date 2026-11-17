import { db } from './db';

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
    const { rows } = await db().query<{
      id: string;
      owner: string;
      version: number;
      meta: Buffer;
      body: Buffer;
      record: string;
    }>(
      `SELECT n.id, n.owner, n.version, n.meta, n.body, r.record
         FROM notes n JOIN note_readers r ON r.note_id = n.id AND r.reader = $1
        ORDER BY n.updated_at DESC LIMIT 200`,
      [sub],
    );
    const owned = rows.filter((row) => row.owner === sub).map((row) => row.id);
    const readers = owned.length
      ? (
          await db().query<{ note_id: string; reader: string }>(
            'SELECT note_id, reader FROM note_readers WHERE note_id = ANY($1) ORDER BY reader',
            [owned],
          )
        ).rows
      : [];
    return rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      version: row.version,
      meta: row.meta.toString('base64url'),
      body: row.body.toString('base64url'),
      record: row.record,
      readers:
        row.owner === sub ? readers.filter((r) => r.note_id === row.id).map((r) => r.reader) : [],
    }));
  },

  /**
   * Writes a note of the person's, new or changed, with all its readers, in one transaction. A note of someone else's under the same id,
   * or an older version than the one stored, is refused as not there.
   */
  async save(owner: string, note: NoteWrite & { id: string }): Promise<void> {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const written = await client.query(
        `INSERT INTO notes (id, owner, version, meta, body) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, meta = EXCLUDED.meta, body = EXCLUDED.body, updated_at = now()
          WHERE notes.owner = EXCLUDED.owner AND notes.version <= EXCLUDED.version`,
        [
          note.id,
          owner,
          note.version,
          Buffer.from(note.meta, 'base64url'),
          Buffer.from(note.body, 'base64url'),
        ],
      );
      if (written.rowCount !== 1) throw new NoteError(404, 'There is no such note.');
      await client.query('DELETE FROM note_readers WHERE note_id = $1', [note.id]);
      for (const reader of note.readers) {
        await client.query(
          'INSERT INTO note_readers (note_id, reader, record) VALUES ($1, $2, $3)',
          [note.id, reader.sub, reader.record],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  /** Deletes a note of the person's, and every key sealed for it. */
  async remove(owner: string, id: string): Promise<boolean> {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const deleted = await client.query('DELETE FROM notes WHERE id = $1 AND owner = $2', [
        id,
        owner,
      ]);
      if (deleted.rowCount === 1)
        await client.query('DELETE FROM note_readers WHERE note_id = $1', [id]);
      await client.query('COMMIT');
      return deleted.rowCount === 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  /** Everything of a person, when their account is deleted: their notes, the keys for them, and the keys sealed to them. */
  async deleteAll(sub: string): Promise<void> {
    await db().query(
      'DELETE FROM note_readers WHERE note_id IN (SELECT id FROM notes WHERE owner = $1) OR reader = $1',
      [sub],
    );
    await db().query('DELETE FROM notes WHERE owner = $1', [sub]);
  },
});
