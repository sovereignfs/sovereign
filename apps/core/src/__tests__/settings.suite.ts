/**
 * The settings store against a real database. It is one suite, run twice: by
 * `settings.test.ts` on a SQLite file (so a plain `pnpm test` covers it), and by
 * `settings.db.test.ts` on whichever dialect the CI leg started.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { getTableConfig as pgConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config, type CoreConfig } from '../config';
import { migrateCore } from '../db/migrate';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { SETTINGS } from '../settings/definitions';
import { SettingsError, SettingsStore } from '../settings/store';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const key = () => randomBytes(32).toString('base64');
const BASE = {
  SV_URL: 'http://localhost:3000',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};

const loadConfig = (env: Record<string, string> = {}): CoreConfig =>
  config.load({ ...BASE, ...env });

export function settingsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  const opened: Database[] = [];
  let now = 1_761_580_000_000;

  const store = (
    options: {
      env?: Record<string, string>;
      cipher?: FieldCipher | undefined;
      database?: Database | undefined;
      cacheMs?: number;
    } = {},
  ) =>
    new SettingsStore({
      database: 'database' in options ? options.database : db,
      cipher: 'cipher' in options ? options.cipher : FieldCipher.fromKeyRing(`k1:${key()}`),
      config: loadConfig(options.env),
      cacheMs: options.cacheMs ?? 0,
      now: () => now,
    });

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    opened.push(db);
    await migrateCore(db, MIGRATIONS);
  });

  afterAll(async () => {
    for (const database of opened) await database.close().catch(() => undefined);
    await target.cleanup();
  });

  beforeEach(async () => {
    await db.run('delete from instance_settings');
  });

  describe('the migrations', () => {
    it('create the table the schemas describe, with the same columns', async () => {
      const expected =
        db.family === 'postgres'
          ? pgConfig(postgresSchema.instanceSettings).columns.map((c) => c.name)
          : sqliteConfig(sqliteSchema.instanceSettings).columns.map((c) => c.name);
      const { rows } = await db.run(
        db.family === 'postgres'
          ? "select column_name as name from information_schema.columns where table_schema = current_schema() and table_name = 'instance_settings'"
          : "select name from pragma_table_info('instance_settings')",
      );
      expect(rows.map((r) => r.name).sort()).toEqual([...expected].sort());
    });

    it('run again with nothing to do', async () => {
      const again = await migrateCore(db, MIGRATIONS);
      expect(again.applied).toEqual([]);
      expect(again.alreadyApplied).toEqual([
        '0000_instance_settings',
        '0001_auth_tables',
        '0002_roles_and_invites',
        '0003_terms_and_timezone',
        '0004_two_factor',
        '0005_passkeys',
        '0006_account_states',
        '0007_avatars',
        '0008_locale',
        '0009_capability_overrides',
        '0010_oidc_provider',
        '0011_instance_images',
        '0012_token_revocations',
        '0013_managed_clients',
        '0014_app_token_revocations',
        '0015_notifications',
        '0016_app_mail',
        '0017_activity',
        '0018_account_deletion_notices',
      ]);
    });
  });

  describe('resolution: saved value, then environment, then the built-in default', () => {
    it('uses the built-in default when nothing is set', async () => {
      expect(await store().get(SETTINGS.instanceName)).toEqual({
        value: 'Sovereign',
        source: 'default',
        unreadable: false,
      });
    });

    it('is off, not guessed, when nothing is set and there is no default', async () => {
      expect(await store().get(SETTINGS.smtpHost)).toEqual({
        value: undefined,
        source: 'unset',
        unreadable: false,
      });
    });

    it('registration is invite-only when nothing says otherwise: a setting left unset never opens access', async () => {
      expect(await store().get(SETTINGS.inviteOnly)).toMatchObject({
        value: true,
        source: 'default',
      });
    });

    it('uses the environment variable over the built-in default', async () => {
      const s = store({
        env: {
          SV_AUTH_INVITE_ONLY: 'false',
          SV_SMTP_HOST: 'smtp.example.com',
          SV_SMTP_PORT: '2525',
        },
      });
      expect(await s.get(SETTINGS.inviteOnly)).toMatchObject({
        value: false,
        source: 'environment',
      });
      expect(await s.get(SETTINGS.smtpHost)).toMatchObject({
        value: 'smtp.example.com',
        source: 'environment',
      });
      expect(await s.get(SETTINGS.smtpPort)).toMatchObject({ value: 2525, source: 'environment' });
    });

    it('uses a saved value over the environment variable', async () => {
      const s = store({ env: { SV_SMTP_HOST: 'from-environment' } });
      await s.set(SETTINGS.smtpHost, 'from-the-console');
      expect(await s.get(SETTINGS.smtpHost)).toEqual({
        value: 'from-the-console',
        source: 'saved',
        unreadable: false,
      });
    });

    it('returns to the environment when the saved value is cleared', async () => {
      const s = store({ env: { SV_SMTP_HOST: 'from-environment', SV_AUTH_INVITE_ONLY: 'false' } });
      await s.set(SETTINGS.smtpHost, 'from-the-console');
      await s.set(SETTINGS.inviteOnly, true);
      expect(await s.clear(SETTINGS.smtpHost)).toBe(true);
      expect(await s.clear(SETTINGS.inviteOnly)).toBe(true);
      expect(await s.get(SETTINGS.smtpHost)).toMatchObject({
        value: 'from-environment',
        source: 'environment',
      });
      expect(await s.get(SETTINGS.inviteOnly)).toMatchObject({
        value: false,
        source: 'environment',
      });
    });

    it('returns to the built-in default when cleared and the environment says nothing', async () => {
      const s = store();
      await s.set(SETTINGS.instanceName, 'Acme Identity');
      await s.clear(SETTINGS.instanceName);
      expect(await s.get(SETTINGS.instanceName)).toMatchObject({
        value: 'Sovereign',
        source: 'default',
      });
    });

    it('says there was nothing to clear', async () => {
      expect(await store().clear(SETTINGS.smtpHost)).toBe(false);
    });

    it('lets a saved false beat an environment true, and a saved zero-like value count as saved', async () => {
      const s = store({ env: { SV_AUTH_INVITE_ONLY: 'true' } });
      await s.set(SETTINGS.inviteOnly, false);
      expect(await s.get(SETTINGS.inviteOnly)).toMatchObject({ value: false, source: 'saved' });
    });
  });

  describe('values', () => {
    it('keeps a boolean, an integer and a string as themselves', async () => {
      const s = store();
      await s.set(SETTINGS.inviteOnly, false);
      await s.set(SETTINGS.smtpPort, 587);
      await s.set(SETTINGS.instanceName, 'Ünïcode 日本語');
      expect((await s.get(SETTINGS.inviteOnly)).value).toBe(false);
      expect((await s.get(SETTINGS.smtpPort)).value).toBe(587);
      expect((await s.get(SETTINGS.instanceName)).value).toBe('Ünïcode 日本語');
    });

    it('overwrites an earlier value, keeping one row', async () => {
      const s = store();
      await s.set(SETTINGS.instanceName, 'First');
      await s.set(SETTINGS.instanceName, 'Second');
      expect((await s.get(SETTINGS.instanceName)).value).toBe('Second');
      const { rows } = await db.run(
        "select count(*) as n from instance_settings where key = 'instance.name'",
      );
      expect(rows[0]?.n).toBe(1);
    });

    it.each([
      [SETTINGS.instanceName, ''],
      [SETTINGS.instanceName, '   '],
      [SETTINGS.instanceName, 'x'.repeat(101)],
      [SETTINGS.instanceName, 'Acme\nBcc: x@example.com'],
      [SETTINGS.instanceName, 'Acme\u0000'],
      [SETTINGS.smtpHost, 'smtp.example.com\r\n'],
      [SETTINGS.smtpPort, 0],
      [SETTINGS.smtpPort, 65536],
      [SETTINGS.smtpPort, 1.5],
      [SETTINGS.smtpPort, Number.NaN],
      [SETTINGS.smtpPort, Number.POSITIVE_INFINITY],
    ])('refuses %j for a setting that cannot hold it', async (setting, value) => {
      const s = store();
      await expect(s.set(setting as never, value as never)).rejects.toMatchObject({
        code: 'invalid-value',
      });
      expect((await s.get(setting as never)).source).not.toBe('saved');
    });

    it('stores a name that happens to read like an internal word as an ordinary value', async () => {
      const s = store();
      await s.set(SETTINGS.instanceName, 'unreadable');
      expect(await s.get(SETTINGS.instanceName)).toEqual({
        value: 'unreadable',
        source: 'saved',
        unreadable: false,
      });
    });

    it('records when, and by whom, a value was saved', async () => {
      const s = store();
      now = 1_761_580_123_456;
      await s.set(SETTINGS.instanceName, 'Acme', 'user-1');
      const described = await s.describe(SETTINGS.instanceName);
      expect(described).toMatchObject({ source: 'saved', value: 'Acme', updatedBy: 'user-1' });
      expect(described.updatedAt).toBe(1_761_580_123_456);
      expect(typeof described.updatedAt).toBe('number');
    });
  });

  describe('changes apply without a restart', () => {
    it("shows this instance's own change at once, even with a cache", async () => {
      const s = store({ cacheMs: 60_000 });
      expect((await s.get(SETTINGS.instanceName)).value).toBe('Sovereign');
      await s.set(SETTINGS.instanceName, 'Changed');
      expect((await s.get(SETTINGS.instanceName)).value).toBe('Changed');
      await s.clear(SETTINGS.instanceName);
      expect((await s.get(SETTINGS.instanceName)).value).toBe('Sovereign');
    });

    it("shows another instance's change within the cache time, and not before", async () => {
      const mine = store({ cacheMs: 5000 });
      const other = store();
      now = 2_000_000_000_000;
      expect((await mine.get(SETTINGS.instanceName)).value).toBe('Sovereign');
      await other.set(SETTINGS.instanceName, 'Set elsewhere');
      now += 4000;
      expect((await mine.get(SETTINGS.instanceName)).value).toBe('Sovereign');
      now += 1500;
      expect((await mine.get(SETTINGS.instanceName)).value).toBe('Set elsewhere');
    });

    it('with no cache, reads every time', async () => {
      const mine = store({ cacheMs: 0 });
      const other = store();
      await mine.get(SETTINGS.instanceName);
      await other.set(SETTINGS.instanceName, 'Immediately');
      expect((await mine.get(SETTINGS.instanceName)).value).toBe('Immediately');
    });
  });

  describe('secrets', () => {
    const PASSWORD = 'correct horse battery staple';

    it('are stored encrypted, bound to their row, and read back', async () => {
      const s = store();
      await s.set(SETTINGS.smtpPassword, PASSWORD, 'user-1');
      const { rows } = await db.run(
        "select value, encrypted from instance_settings where key = 'smtp.password'",
      );
      expect(rows[0]?.encrypted).toBe(1);
      expect(String(rows[0]?.value)).toMatch(/^sv1:k1:/);
      expect(String(rows[0]?.value)).not.toContain('correct');
      expect(await s.get(SETTINGS.smtpPassword)).toEqual({
        value: PASSWORD,
        source: 'saved',
        unreadable: false,
      });
    });

    it('are never shown again: describing one says it is set, not what it is', async () => {
      const s = store();
      await s.set(SETTINGS.smtpPassword, PASSWORD);
      const described = await s.describe(SETTINGS.smtpPassword);
      expect(described).toMatchObject({
        secret: true,
        source: 'saved',
        hasValue: true,
        value: undefined,
      });
      expect(JSON.stringify(await s.describeAll())).not.toContain(PASSWORD);
    });

    it('describe an environment secret as set, without its value', async () => {
      const s = store({ env: { SV_SMTP_PASSWORD: 'from-the-environment' } });
      const described = await s.describe(SETTINGS.smtpPassword);
      expect(described).toMatchObject({ source: 'environment', hasValue: true, value: undefined });
      expect(JSON.stringify(described)).not.toContain('from-the-environment');
    });

    it('fall back to the environment when cleared', async () => {
      const s = store({ env: { SV_SMTP_PASSWORD: 'from-the-environment' } });
      await s.set(SETTINGS.smtpPassword, PASSWORD);
      await s.clear(SETTINGS.smtpPassword);
      expect(await s.get(SETTINGS.smtpPassword)).toMatchObject({
        value: 'from-the-environment',
        source: 'environment',
      });
    });

    it('cannot be saved without a key ring, and nothing is written', async () => {
      const s = store({ cipher: undefined });
      await expect(s.set(SETTINGS.smtpPassword, PASSWORD)).rejects.toMatchObject({
        code: 'encryption-required',
      });
      const { rows } = await db.run(
        "select count(*) as n from instance_settings where key = 'smtp.password'",
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('still read after the keys are rotated, and are the same value', async () => {
      const oldKey = `k1:${key()}`;
      await store({ cipher: FieldCipher.fromKeyRing(oldKey) }).set(SETTINGS.smtpPassword, PASSWORD);
      const rotated = store({ cipher: FieldCipher.fromKeyRing(`k2:${key()},${oldKey}`) });
      expect((await rotated.get(SETTINGS.smtpPassword)).value).toBe(PASSWORD);
    });

    it('are reported unreadable, not replaced by the environment, when their key is gone', async () => {
      await store({ cipher: FieldCipher.fromKeyRing(`k1:${key()}`) }).set(
        SETTINGS.smtpPassword,
        PASSWORD,
      );
      const other = store({
        cipher: FieldCipher.fromKeyRing(`k9:${key()}`),
        env: { SV_SMTP_PASSWORD: 'from-the-environment' },
      });
      expect(await other.get(SETTINGS.smtpPassword)).toEqual({
        value: undefined,
        source: 'saved',
        unreadable: true,
      });
      expect(await other.describe(SETTINGS.smtpPassword)).toMatchObject({
        unreadable: true,
        hasValue: true,
      });
    });

    it('are reported unreadable when the key ring is not configured at all', async () => {
      await store().set(SETTINGS.smtpPassword, PASSWORD);
      expect(await store({ cipher: undefined }).get(SETTINGS.smtpPassword)).toMatchObject({
        value: undefined,
        unreadable: true,
      });
    });

    it('degrade per value: one unreadable secret does not stop the others', async () => {
      const writer = store({ cipher: FieldCipher.fromKeyRing(`k1:${key()}`) });
      await writer.set(SETTINGS.smtpPassword, PASSWORD);
      await writer.set(SETTINGS.instanceName, 'Still readable');
      const reader = store({ cipher: FieldCipher.fromKeyRing(`k9:${key()}`) });
      const all = await reader.describeAll();
      expect(all.find((d) => d.key === 'smtp.password')?.unreadable).toBe(true);
      expect(all.find((d) => d.key === 'instance.name')).toMatchObject({
        value: 'Still readable',
        unreadable: false,
      });
    });

    it('do not open when the ciphertext is copied into another row', async () => {
      const s = store();
      await s.set(SETTINGS.smtpPassword, PASSWORD);
      await db.run("update instance_settings set key = 'smtp.user' where key = 'smtp.password'");
      // Now an encrypted envelope sits under smtp.user, where its context does not match.
      expect(await s.get(SETTINGS.smtpUser)).toMatchObject({ value: undefined, unreadable: true });
    });

    it('treat a tampered stored value as unreadable', async () => {
      const s = store();
      await s.set(SETTINGS.smtpPassword, PASSWORD);
      await db.run(
        "update instance_settings set value = substr(value, 1, length(value) - 4) || 'AAAA' where key = 'smtp.password'",
      );
      expect(await s.get(SETTINGS.smtpPassword)).toMatchObject({
        value: undefined,
        unreadable: true,
      });
    });
  });

  describe('with no database', () => {
    it('reads the environment and the built-in defaults', async () => {
      const s = store({ database: undefined, env: { SV_SMTP_HOST: 'smtp.example.com' } });
      expect(await s.get(SETTINGS.smtpHost)).toMatchObject({
        value: 'smtp.example.com',
        source: 'environment',
      });
      expect(await s.get(SETTINGS.instanceName)).toMatchObject({
        value: 'Sovereign',
        source: 'default',
      });
    });

    it('refuses to save or clear, saying why', async () => {
      const s = store({ database: undefined });
      const error = await s.set(SETTINGS.instanceName, 'x').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SettingsError);
      expect(error).toMatchObject({ code: 'no-database' });
      await expect(s.clear(SETTINGS.instanceName)).rejects.toMatchObject({ code: 'no-database' });
    });
  });

  describe('describeAll', () => {
    it('lists every setting once, with where each comes from', async () => {
      const s = store({ env: { SV_SMTP_HOST: 'smtp.example.com' } });
      await s.set(SETTINGS.instanceName, 'Acme');
      const all = await s.describeAll();
      expect(all.map((d) => d.key).sort()).toEqual([
        'auth.invite_only',
        'instance.name',
        'smtp.from',
        'smtp.host',
        'smtp.password',
        'smtp.port',
        'smtp.user',
      ]);
      expect(all.find((d) => d.key === 'instance.name')?.source).toBe('saved');
      expect(all.find((d) => d.key === 'smtp.host')?.source).toBe('environment');
      expect(all.find((d) => d.key === 'smtp.port')?.source).toBe('unset');
    });
  });
}
