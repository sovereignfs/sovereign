/**
 * What signing in with a derived value needs on the server (core-app §5.2): the instance id, made once and never again; and reset
 * links, whose account the reset page names and which an operator can make when mail cannot be sent.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin, type InstanceOperations } from '../admin/run';
import { parse, UsageError } from '../admin/args';
import { makeResetLink, resetLinkAddress } from '../auth/reset-link';
import { systemActor } from '../clients/system-actor';
import { migrateCore } from '../db/migrate';
import { ensureInstanceId, readInstanceId } from '../instance/instance-id';
import { BASE_URL, call, makeAuth, PASSWORD, signInValueOf, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function signInValuesSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of ['sessions', 'accounts', 'verifications', 'rate_limits', 'users']) {
      await db.run(`delete from ${table}`);
    }
    await db.run("delete from instance_settings where key = 'instance_id'");
  });

  describe('the instance id', () => {
    it('is 32 random bytes, made once and then the same every time', async () => {
      expect(await readInstanceId(db)).toBeUndefined();
      const first = await ensureInstanceId(db);
      expect(Buffer.from(first, 'base64url')).toHaveLength(32);
      expect(await ensureInstanceId(db)).toBe(first);
      expect(await readInstanceId(db)).toBe(first);
    });

    it('is one id when two cores make it at once', async () => {
      const ids = await Promise.all([
        ensureInstanceId(db),
        ensureInstanceId(db),
        ensureInstanceId(db),
      ]);
      expect(new Set(ids).size).toBe(1);
    });

    it('says so when it is made for an instance that already has accounts, and only then', async () => {
      const told: number[] = [];
      await ensureInstanceId(db, (n) => told.push(n));
      expect(told).toEqual([]);
      await db.run("delete from instance_settings where key = 'instance_id'");
      await signUp(makeAuth(db), { password: PASSWORD });
      await ensureInstanceId(db, (n) => told.push(n));
      expect(told).toEqual([1]);
      await ensureInstanceId(db, (n) => told.push(n));
      expect(told).toEqual([1]);
    });

    it('refuses a stored id that is not one, rather than make another', async () => {
      await db.run(
        "insert into instance_settings (key, value, encrypted, updated_at) values ('instance_id', 'short', 0, ?)",
        [Date.now()],
      );
      await expect(ensureInstanceId(db)).rejects.toThrow(/must not be made again/);
    });
  });

  describe('a reset link', () => {
    it('names its account while it works, and nobody once it has run out or for another token', async () => {
      const auth = makeAuth(db);
      const { email } = await signUp(auth, { password: PASSWORD });
      const link = await makeResetLink(auth, email, BASE_URL, 1_000);
      const token = new URL(link as string).searchParams.get('token') as string;
      expect(await resetLinkAddress(auth, token, 1_000 + 60_000)).toBe(email);
      expect(await resetLinkAddress(auth, token, 1_000 + 60 * 60 * 1000 + 1)).toBeUndefined();
      expect(await resetLinkAddress(auth, 'not-a-token')).toBeUndefined();
    });

    it('made by an operator, sets a new password as a mailed one does', async () => {
      const auth = makeAuth(db);
      const { email } = await signUp(auth, { password: PASSWORD });
      const link = (await makeResetLink(auth, email.toUpperCase(), BASE_URL)) as string;
      expect(link.startsWith(`${BASE_URL}/reset-password?token=`)).toBe(true);
      const token = new URL(link).searchParams.get('token') as string;
      const next = signInValueOf('after the reset');
      expect(
        (await call(auth, 'POST', '/reset-password', { body: { token, newPassword: next } }))
          .status,
      ).toBe(200);
      expect(
        (await call(auth, 'POST', '/sign-in/email', { body: { email, password: next } })).status,
      ).toBe(200);
      expect(
        (await call(auth, 'POST', '/sign-in/email', { body: { email, password: PASSWORD } }))
          .status,
      ).toBe(401);
      // It works once.
      expect(
        (await call(auth, 'POST', '/reset-password', { body: { token, newPassword: next } }))
          .status,
      ).toBe(400);
    });

    it('is made for no one when there is no such account', async () => {
      expect(await makeResetLink(makeAuth(db), 'nobody@sovereign.local', BASE_URL)).toBeUndefined();
    });
  });

  describe('sovereign-admin accounts reset-link', () => {
    const operations = (resetLink: InstanceOperations['resetLink']) =>
      ({ resetLink }) as unknown as InstanceOperations;

    it('reads one address, and nothing else', () => {
      expect(parse(['accounts', 'reset-link', 'ada@sovereign.local'])).toEqual({
        name: 'reset-link',
        email: 'ada@sovereign.local',
      });
      expect(() => parse(['accounts', 'reset-link'])).toThrow(UsageError);
      expect(() => parse(['accounts', 'reset-link', 'a@b.c', 'd@e.f'])).toThrow(UsageError);
      expect(() => parse(['accounts', 'delete', 'a@b.c'])).toThrow(UsageError);
    });

    it('answers with the link once, and logs only that one was made', async () => {
      const out: string[] = [];
      const log: string[] = [];
      const code = await runAdmin(
        ['accounts', 'reset-link', 'ada@sovereign.local'],
        {} as never,
        systemActor(),
        { out: (line) => out.push(line), log: (line) => log.push(line) },
        operations(async () => 'https://core.example/reset-password?token=secret'),
      );
      expect(code).toBe(0);
      expect(out).toEqual(['https://core.example/reset-password?token=secret']);
      expect(log.join('\n')).not.toContain('secret');
    });

    it('fails, saying so, when there is no such account', async () => {
      const log: string[] = [];
      const code = await runAdmin(
        ['accounts', 'reset-link', 'nobody@sovereign.local'],
        {} as never,
        systemActor(),
        { out: () => undefined, log: (line) => log.push(line) },
        operations(async () => undefined),
      );
      expect(code).toBe(1);
      expect(log.join('\n')).toContain('no account');
    });
  });
}
