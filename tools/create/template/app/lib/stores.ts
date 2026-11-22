import type { SessionStore, StoredRecord, TokenStore } from '@sovereignfs/sdk';
import { database } from './db';
import { fingerprint, open, seal } from './crypto';

/** The SDK's sessions, in the app's database (sdk §9.1): the sign-ins through core still pending. Nothing is returned after its expiry. */
export const sessionStore: SessionStore = {
  async get(id) {
    const { rows } = await (
      await database()
    ).run('SELECT kind, sub, sid, data FROM sv_sessions WHERE id = ? AND expires_at > ?', [
      id,
      Date.now(),
    ]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      kind: row.kind as StoredRecord['kind'],
      ...(row.sub ? { sub: String(row.sub) } : {}),
      ...(row.sid ? { sid: String(row.sid) } : {}),
      data: JSON.parse(String(row.data)) as Record<string, unknown>,
    };
  },

  async set(id, record, expiresAt) {
    const db = await database();
    await db.run(
      `INSERT INTO sv_sessions (id, kind, sub, sid, data, expires_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, sub = EXCLUDED.sub, sid = EXCLUDED.sid, data = EXCLUDED.data,
         expires_at = EXCLUDED.expires_at`,
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
      await db.run('DELETE FROM sv_sessions WHERE expires_at <= ?', [Date.now()]);
  },

  async delete(id) {
    await (await database()).run('DELETE FROM sv_sessions WHERE id = ?', [id]);
  },

  async deleteMatching(match) {
    const db = await database();
    if (match.sub !== undefined) await db.run('DELETE FROM sv_sessions WHERE sub = ?', [match.sub]);
    if (match.sid !== undefined) await db.run('DELETE FROM sv_sessions WHERE sid = ?', [match.sid]);
  },
};

/** How long one copy of the app may hold a person's refresh token while it refreshes it, and how often another looks again. */
const LEASE_MS = 30_000;
const WAIT_MS = 100;

/**
 * A person's refresh token, encrypted. Core rotates it on every use and takes one used twice for theft, so `write` is a conditional
 * update, and `lock` takes a lease on the token's row so that two copies of the app never refresh at once (sdk §5.1). The lease is a
 * column, not a database lock, so it holds the same on a SQLite file, sqld and PostgreSQL, behind a pooler too.
 */
export const tokenStore: TokenStore = {
  async read(sub) {
    const { rows } = await (
      await database()
    ).run('SELECT sealed FROM sv_tokens WHERE sub = ?', [sub]);
    return rows[0] ? open(String(rows[0].sealed)) : undefined;
  },

  async write(sub, next, previous) {
    const db = await database();
    if (previous === undefined) {
      const done = await db.run(
        'INSERT INTO sv_tokens (sub, sealed, fingerprint) VALUES (?, ?, ?) ON CONFLICT (sub) DO NOTHING',
        [sub, seal(next), fingerprint(next)],
      );
      return done.rowsAffected === 1;
    }
    const done = await db.run(
      'UPDATE sv_tokens SET sealed = ?, fingerprint = ? WHERE sub = ? AND fingerprint = ?',
      [seal(next), fingerprint(next), sub, fingerprint(previous)],
    );
    return done.rowsAffected === 1;
  },

  async lock(sub, work) {
    const db = await database();
    const take = async () =>
      (
        await db.run('UPDATE sv_tokens SET lease_until = ? WHERE sub = ? AND lease_until < ?', [
          Date.now() + LEASE_MS,
          sub,
          Date.now(),
        ])
      ).rowsAffected === 1;
    const exists = async () =>
      (await db.run('SELECT 1 AS found FROM sv_tokens WHERE sub = ?', [sub])).rows.length > 0;
    // A token nobody holds yet needs no lease: its first write is conditional. Otherwise wait for the lease, at most as long as one lasts.
    const until = Date.now() + LEASE_MS;
    let held = await take();
    while (!held && (await exists()) && Date.now() <= until) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      held = await take();
    }
    try {
      return await work();
    } finally {
      if (held) await db.run('UPDATE sv_tokens SET lease_until = 0 WHERE sub = ?', [sub]);
    }
  },

  async delete(sub) {
    await (await database()).run('DELETE FROM sv_tokens WHERE sub = ?', [sub]);
  },
};
