import { createHash } from 'node:crypto';
import { toBuffer, type Database } from '@sovereignfs/database';
import { inspectImage, MAX_IMAGE_BYTES, ImageError } from '../images/validate';

/** The address a picture is served from. The version is part of it, so a new picture is a new address. */
export const avatarPath = (userId: string, version: string): string =>
  `/api/avatars/${userId}?v=${version}`;

export type StoredAvatar = {
  contentType: string;
  bytes: Buffer;
  version: string;
};

/**
 * People's pictures (core-app §3.15). A picture is checked (`inspectImage`) before it is kept, kept in
 * the database, and named in the person's `image`, which is what the session and the `picture` claim
 * read. `image` is only ever set here: no request can set it (see the hooks in `auth.ts`).
 */
export class AvatarStore {
  readonly #database: Database;
  readonly #now: () => number;

  constructor(database: Database, options: { now?: () => number } = {}) {
    this.#database = database;
    this.#now = options.now ?? Date.now;
  }

  #stamp(): number | Date {
    const now = this.#now();
    return this.#database.family === 'postgres' ? new Date(now) : now;
  }

  /** Keeps `bytes` as the person's picture, or throws an `ImageError` saying why it is not one. */
  async set(userId: string, bytes: Buffer): Promise<{ version: string; path: string }> {
    const image = inspectImage(bytes);
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const path = avatarPath(userId, version);
    await this.#database.transaction(async (transaction) => {
      const { rows } = await transaction.run('select id from users where id = ?', [userId]);
      if (rows.length === 0) throw new ImageError('corrupt', 'There is no such account.');
      const stamp = this.#stamp();
      await transaction.run(
        `insert into avatars (user_id, content_type, bytes, size, version, updated_at)
           values (?, ?, ?, ?, ?, ?)
         on conflict (user_id) do update set content_type = excluded.content_type,
           bytes = excluded.bytes, size = excluded.size, version = excluded.version,
           updated_at = excluded.updated_at`,
        // this table's own times are plain milliseconds on every dialect; `users` keeps a timestamp
        [userId, image.contentType, bytes, bytes.length, version, this.#now()],
      );
      await transaction.run('update users set image = ?, updated_at = ? where id = ?', [
        path,
        stamp,
        userId,
      ]);
    });
    return { version, path };
  }

  /** Removes the person's picture. False when they had none. */
  async remove(userId: string): Promise<boolean> {
    return this.#database.transaction(async (transaction) => {
      const { rowsAffected } = await transaction.run('delete from avatars where user_id = ?', [
        userId,
      ]);
      await transaction.run('update users set image = null, updated_at = ? where id = ?', [
        this.#stamp(),
        userId,
      ]);
      return rowsAffected > 0;
    });
  }

  /** The picture to serve, or nothing: there is none, or the account is deactivated (not shown to anyone). */
  async get(userId: string): Promise<StoredAvatar | undefined> {
    const { rows } = await this.#database.run(
      `select a.content_type, a.bytes, a.version from avatars a
         join users u on u.id = a.user_id
        where a.user_id = ? and u.deactivated_at is null`,
      [userId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      contentType: String(row.content_type),
      bytes: toBuffer(row.bytes),
      version: String(row.version),
    };
  }
}

/**
 * Reads a request's body, at most `limit` bytes of it: a longer one is refused as soon as it is known to
 * be, without keeping the rest. A declared length over the limit is refused before reading anything.
 */
export async function readLimited(request: Request, limit = MAX_IMAGE_BYTES): Promise<Buffer> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    throw new ImageError('too-large', 'That picture is larger than 1 MB.');
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ImageError('too-large', 'That picture is larger than 1 MB.');
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts, total);
}
