import type { SessionStore, StoredRecord, TokenStore } from '@sovereignfs/sdk';
import { db } from './db';
import { fingerprint, open, seal } from './crypto';

/** The SDK's sessions, in the app's database (sdk §9.1). Nothing is returned after its expiry. */
export const sessionStore: SessionStore = {
  async get(id) {
    const { rows } = await db().query<{
      kind: StoredRecord['kind'];
      sub: string | null;
      sid: string | null;
      data: Record<string, unknown>;
    }>('SELECT kind, sub, sid, data FROM sv_sessions WHERE id = $1 AND expires_at > $2', [
      id,
      Date.now(),
    ]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      kind: row.kind,
      ...(row.sub ? { sub: row.sub } : {}),
      ...(row.sid ? { sid: row.sid } : {}),
      data: row.data,
    };
  },

  async set(id, record, expiresAt) {
    await db().query(
      `INSERT INTO sv_sessions (id, kind, sub, sid, data, expires_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET kind = $2, sub = $3, sid = $4, data = $5, expires_at = $6`,
      [
        id,
        record.kind,
        record.sub ?? null,
        record.sid ?? null,
        JSON.stringify(record.data),
        expiresAt,
      ],
    );
    // What has expired is of no use to anyone; a small share of writes clears it.
    if (Math.random() < 0.02)
      await db().query('DELETE FROM sv_sessions WHERE expires_at <= $1', [Date.now()]);
  },

  async delete(id) {
    await db().query('DELETE FROM sv_sessions WHERE id = $1', [id]);
  },

  async deleteMatching(match) {
    if (match.sub !== undefined)
      await db().query('DELETE FROM sv_sessions WHERE sub = $1', [match.sub]);
    if (match.sid !== undefined)
      await db().query('DELETE FROM sv_sessions WHERE sid = $1', [match.sid]);
  },
};

/**
 * A person's refresh token, encrypted. Core rotates it on every use and takes one used twice for theft, so `write` is a conditional
 * update, and `lock` holds a database lock so that two copies of the app never refresh at once (sdk §5.1).
 */
export const tokenStore: TokenStore = {
  async read(sub) {
    const { rows } = await db().query<{ sealed: string }>(
      'SELECT sealed FROM sv_tokens WHERE sub = $1',
      [sub],
    );
    return rows[0] ? open(rows[0].sealed) : undefined;
  },

  async write(sub, next, previous) {
    if (previous === undefined) {
      const done = await db().query(
        'INSERT INTO sv_tokens (sub, sealed, fingerprint) VALUES ($1, $2, $3) ON CONFLICT (sub) DO NOTHING',
        [sub, seal(next), fingerprint(next)],
      );
      return done.rowCount === 1;
    }
    const done = await db().query(
      'UPDATE sv_tokens SET sealed = $2, fingerprint = $3 WHERE sub = $1 AND fingerprint = $4',
      [sub, seal(next), fingerprint(next), fingerprint(previous)],
    );
    return done.rowCount === 1;
  },

  async lock(sub, work) {
    const client = await db().connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [`__NAME__-token:${sub}`]);
      return await work();
    } finally {
      await client
        .query('SELECT pg_advisory_unlock(hashtext($1))', [`__NAME__-token:${sub}`])
        .catch(() => undefined);
      client.release();
    }
  },

  async delete(sub) {
    await db().query('DELETE FROM sv_tokens WHERE sub = $1', [sub]);
  },
};
