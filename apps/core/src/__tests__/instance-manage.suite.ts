/**
 * What operators change about the instance (core-app §3.12, §3.15) against a real database: the picture store,
 * and the manager that holds the rules about who may change what and what is acceptable. One suite, run by
 * `instance-manage.test.ts` on a SQLite file and by `instance-manage.db.test.ts` on whichever dialect the CI
 * leg started.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { BrandingStore, BRANDING_KINDS } from '../branding/store';
import { config } from '../config';
import { migrateCore } from '../db/migrate';
import { ImageError, MAX_IMAGE_SIDE } from '../images/validate';
import { InstanceError, InstanceManager, type SmtpInput } from '../instance/manage';
import { changeCapabilities } from '../roles/configure';
import { SETTINGS } from '../settings/definitions';
import { SettingsStore } from '../settings/store';
import { JPEG_1X1, png } from './image-fixtures';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const BASE = {
  SV_URL: 'http://localhost:3000',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};
const owner = { id: 'owner-1', role: ROLE_OWNER };
const admin = { id: 'admin-1', role: ROLE_ADMIN };
const person = { id: 'person-1', role: ROLE_USER };

const SMTP: SmtpInput = {
  host: 'mail.sovereign.local',
  port: '587',
  user: 'mailer',
  from: 'Sovereign <noreply@sovereign.local>',
  password: 'correct horse battery staple',
};

const SVG_WITH_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
    '<script>alert(2)</script><rect width="10" height="10" fill="#336699" onclick="alert(3)"/></svg>',
);

export function instanceManageSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let clock = 1_761_580_000_000;

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
    for (const table of ['instance_images', 'instance_settings', 'capability_overrides']) {
      await db.run(`delete from ${table}`);
    }
  });

  const branding = () => new BrandingStore(db, { now: () => clock++ });
  const settings = (
    options: { cipher?: FieldCipher | undefined; env?: Record<string, string> } = {},
  ) =>
    new SettingsStore({
      database: db,
      cipher:
        'cipher' in options
          ? options.cipher
          : FieldCipher.fromKeyRing(`k1:${randomBytes(32).toString('base64')}`),
      config: config.load({ ...BASE, ...options.env }),
      cacheMs: 0,
      now: () => clock++,
    });
  const manager = (store = settings()) => new InstanceManager(db, store, branding());

  /** The code of what a call is refused with, or undefined when it went through. */
  const refused = async (call: () => Promise<unknown>) => {
    try {
      await call();
      return undefined;
    } catch (error) {
      if (error instanceof InstanceError || error instanceof ImageError) return error.code;
      throw error;
    }
  };

  describe('the pictures', () => {
    it('keeps a PNG as it is and serves what was kept', async () => {
      const store = branding();
      const bytes = png(32, 32);
      const kept = await store.set('logo-light', bytes, owner.id);
      expect(kept.contentType).toBe('image/png');
      expect(kept.path).toBe(`/api/branding/logo-light?v=${kept.version}`);
      const got = await store.get('logo-light');
      expect(got?.contentType).toBe('image/png');
      expect(got?.bytes.equals(bytes)).toBe(true);
      expect(got?.version).toBe(kept.version);
    });

    it('keeps one picture per kind, and a new one replaces the old at a new version', async () => {
      const store = branding();
      const first = await store.set('favicon', png(16, 16));
      const second = await store.set('favicon', JPEG_1X1);
      expect(second.version).not.toBe(first.version);
      expect(second.contentType).toBe('image/jpeg');
      expect(Number((await db.run('select count(*) as n from instance_images')).rows[0]?.n)).toBe(
        1,
      );
      expect((await store.get('favicon'))?.version).toBe(second.version);
    });

    it('gives the same bytes the same version, so a re-upload changes nothing a browser holds', async () => {
      const store = branding();
      const a = await store.set('logo-dark', png(8, 8));
      const b = await store.set('logo-dark', png(8, 8));
      expect(b.version).toBe(a.version);
    });

    it('keeps the kinds apart', async () => {
      const store = branding();
      for (const kind of BRANDING_KINDS) {
        await store.set(kind, kind.startsWith('app-icon') ? png(512, 512) : png(8, 8));
      }
      await store.remove('logo-dark');
      const described = await store.describe();
      expect(described['logo-light']).toBeDefined();
      expect(described['logo-dark']).toBeUndefined();
      expect(described.favicon).toBeDefined();
    });

    it('keeps an app icon only if it is a square PNG of a size a device can scale down from', async () => {
      const store = branding();
      for (const kind of ['app-icon', 'app-icon-maskable'] as const) {
        await expect(store.set(kind, png(256, 256))).rejects.toMatchObject({ code: 'icon-shape' });
        await expect(store.set(kind, png(512, 1024))).rejects.toMatchObject({ code: 'icon-shape' });
        await expect(store.set(kind, png(MAX_IMAGE_SIDE + 1, 512))).rejects.toMatchObject({
          code: 'too-big',
        });
        expect(await store.get(kind)).toBeUndefined();
        const kept = await store.set(kind, png(512, 512));
        expect(kept.contentType).toBe('image/png');
        expect((await store.get(kind))?.bytes.equals(png(512, 512))).toBe(true);
        expect(kept.path).toBe(`/api/branding/${kind}?v=${kept.version}`);
      }
    });

    it('refuses an SVG for an app icon, though it takes one for a logo', async () => {
      const store = branding();
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512"/></svg>',
      );
      await expect(store.set('app-icon', svg)).rejects.toMatchObject({ code: 'icon-shape' });
      expect((await store.set('logo-light', svg)).contentType).toBe('image/svg+xml');
    });

    it('removes a picture, and says whether there was one', async () => {
      const store = branding();
      await store.set('favicon', png(8, 8));
      expect(await store.remove('favicon')).toBe(true);
      expect(await store.remove('favicon')).toBe(false);
      expect(await store.get('favicon')).toBeUndefined();
    });

    it('describes what is kept without the bytes', async () => {
      const store = branding();
      const kept = await store.set('logo-light', png(8, 8));
      const described = await store.describe();
      expect(described['logo-light']).toEqual({
        contentType: 'image/png',
        version: kept.version,
        size: png(8, 8).length,
        path: kept.path,
      });
      expect(described.favicon).toBeUndefined();
    });

    it('rebuilds an SVG before keeping it: what is served has no script and no handlers', async () => {
      const store = branding();
      const kept = await store.set('logo-light', SVG_WITH_SCRIPT);
      expect(kept.contentType).toBe('image/svg+xml');
      const text = (await store.get('logo-light'))?.bytes.toString('utf8') ?? '';
      expect(text).toContain('<rect');
      expect(text).not.toMatch(/script|onload|onclick|alert/i);
    });

    it.each([
      ['nothing', Buffer.alloc(0), 'empty'],
      ['a text file', Buffer.from('not a picture'), 'unsupported'],
      ['a picture cut short', png(64, 64).subarray(0, 20), 'corrupt'],
      ['more than 1 MB', Buffer.concat([png(8, 8), Buffer.alloc(1024 * 1024)]), 'too-large'],
      [
        'an SVG that is not a picture',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foo'),
        'bad-svg',
      ],
    ])('refuses %s, and keeps nothing', async (_name, bytes, code) => {
      expect(await refused(() => branding().set('logo-light', bytes))).toBe(code);
      expect(Number((await db.run('select count(*) as n from instance_images')).rows[0]?.n)).toBe(
        0,
      );
    });

    it('does not replace a picture with one it refuses', async () => {
      const store = branding();
      const kept = await store.set('favicon', png(8, 8));
      await refused(() => store.set('favicon', Buffer.from('nope')));
      expect((await store.get('favicon'))?.version).toBe(kept.version);
    });
  });

  describe('who may change what', () => {
    it('lets the owner and an admin change the name, the pictures and registration', async () => {
      const m = manager();
      for (const actor of [owner, admin]) {
        expect(await refused(() => m.saveName(actor, 'Acme'))).toBeUndefined();
        expect(await refused(() => m.resetName(actor))).toBeUndefined();
        expect(await refused(() => m.saveInviteOnly(actor, false))).toBeUndefined();
        expect(await refused(() => m.resetInviteOnly(actor))).toBeUndefined();
        expect(await refused(() => m.setImage(actor, 'favicon', png(8, 8)))).toBeUndefined();
        expect(await refused(() => m.removeImage(actor, 'favicon'))).toBeUndefined();
      }
    });

    it('lets an ordinary person change none of it, and nothing is saved', async () => {
      const m = manager();
      const store = settings();
      expect(await refused(() => m.saveName(person, 'Mine'))).toBe('forbidden');
      expect(await refused(() => m.resetName(person))).toBe('forbidden');
      expect(await refused(() => m.saveInviteOnly(person, false))).toBe('forbidden');
      expect(await refused(() => m.resetInviteOnly(person))).toBe('forbidden');
      expect(await refused(() => m.setImage(person, 'favicon', png(8, 8)))).toBe('forbidden');
      expect(await refused(() => m.removeImage(person, 'favicon'))).toBe('forbidden');
      expect(await refused(() => m.saveSmtp(person, SMTP))).toBe('forbidden');
      expect(await refused(() => m.resetSmtp(person))).toBe('forbidden');
      expect(await store.get(SETTINGS.instanceName)).toMatchObject({ source: 'default' });
      expect(Number((await db.run('select count(*) as n from instance_images')).rows[0]?.n)).toBe(
        0,
      );
    });

    it('keeps the mail settings for the owner: an admin can neither change nor reset them', async () => {
      const m = manager();
      expect(await refused(() => m.saveSmtp(admin, SMTP))).toBe('forbidden');
      expect(await refused(() => m.resetSmtp(admin))).toBe('forbidden');
      expect(await refused(() => m.saveSmtp(owner, SMTP))).toBeUndefined();
      expect(
        await refused(() => m.saveSmtp(admin, { ...SMTP, host: 'evil.sovereign.local' })),
      ).toBe('forbidden');
      expect(await settings().get(SETTINGS.smtpHost)).toMatchObject({
        value: 'mail.sovereign.local',
      });
    });

    it('cannot be talked into the mail settings by the matrix: the capability is the owner’s alone', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_ADMIN, capability: 'instance:configure-secrets', granted: true },
      ]).catch(() => undefined);
      expect(await refused(() => manager().saveSmtp(admin, SMTP))).toBe('forbidden');
    });

    it('reads the matrix fresh: taking instance:configure from admins takes effect at once', async () => {
      const m = manager();
      expect(await refused(() => m.saveName(admin, 'First'))).toBeUndefined();
      await changeCapabilities(db, owner, [
        { role: ROLE_ADMIN, capability: 'instance:configure', granted: false },
      ]);
      expect(await refused(() => m.saveName(admin, 'Second'))).toBe('forbidden');
      expect(await refused(() => m.setImage(admin, 'favicon', png(8, 8)))).toBe('forbidden');
      expect(await settings().get(SETTINGS.instanceName)).toMatchObject({ value: 'First' });
    });

    it('lets an ordinary person in once the matrix gives them instance:configure', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'instance:configure', granted: true },
      ]);
      expect(await refused(() => manager().saveName(person, 'Theirs'))).toBeUndefined();
    });
  });

  describe('the name', () => {
    it('saves it trimmed, and clearing returns to the default', async () => {
      const m = manager();
      const store = settings();
      await m.saveName(owner, '  Acme Co  ');
      expect(await store.get(SETTINGS.instanceName)).toMatchObject({
        value: 'Acme Co',
        source: 'saved',
      });
      await m.resetName(owner);
      expect(await store.get(SETTINGS.instanceName)).toMatchObject({
        value: 'Sovereign',
        source: 'default',
      });
    });

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['over 100 characters', 'x'.repeat(101)],
      ['a line break, which would reach an email subject', 'Acme\r\nBcc: spy@sovereign.local'],
    ])('refuses a name that is %s', async (_why, name) => {
      expect(await refused(() => manager().saveName(owner, name))).toBe('invalid');
      expect(await settings().get(SETTINGS.instanceName)).toMatchObject({ source: 'default' });
    });
  });

  describe('registration', () => {
    it('saves over the environment, and clearing returns to it', async () => {
      const m = manager();
      const store = settings({ env: { SV_AUTH_INVITE_ONLY: 'false' } });
      expect(await store.get(SETTINGS.inviteOnly)).toMatchObject({
        value: false,
        source: 'environment',
      });
      await m.saveInviteOnly(owner, true);
      expect(await store.get(SETTINGS.inviteOnly)).toMatchObject({ value: true, source: 'saved' });
      await m.resetInviteOnly(owner);
      expect(await store.get(SETTINGS.inviteOnly)).toMatchObject({
        value: false,
        source: 'environment',
      });
    });
  });

  describe('the mail settings', () => {
    it('saves every field, and the password is stored encrypted and never described', async () => {
      const store = settings();
      await new InstanceManager(db, store, branding()).saveSmtp(owner, SMTP);
      expect(await store.get(SETTINGS.smtpHost)).toMatchObject({ value: 'mail.sovereign.local' });
      expect(await store.get(SETTINGS.smtpPort)).toMatchObject({ value: 587 });
      expect(await store.get(SETTINGS.smtpUser)).toMatchObject({ value: 'mailer' });
      expect(await store.get(SETTINGS.smtpFrom)).toMatchObject({
        value: 'Sovereign <noreply@sovereign.local>',
      });
      expect(await store.get(SETTINGS.smtpPassword)).toMatchObject({ value: SMTP.password });
      const stored = (
        await db.run('select value, encrypted from instance_settings where key = ?', [
          SETTINGS.smtpPassword.key,
        ])
      ).rows[0];
      expect(Number(stored?.encrypted)).toBe(1);
      expect(String(stored?.value)).not.toContain(SMTP.password);
      const described = await store.describe(SETTINGS.smtpPassword);
      expect(described).toMatchObject({ hasValue: true, value: undefined, secret: true });
      expect(JSON.stringify(await store.describeAll())).not.toContain(SMTP.password);
    });

    it('keeps the saved password when the field is left blank, and replaces it when it is not', async () => {
      const store = settings();
      const m = manager(store);
      await m.saveSmtp(owner, SMTP);
      await m.saveSmtp(owner, { ...SMTP, host: 'mail2.sovereign.local', password: '' });
      expect(await store.get(SETTINGS.smtpHost)).toMatchObject({ value: 'mail2.sovereign.local' });
      expect(await store.get(SETTINGS.smtpPassword)).toMatchObject({ value: SMTP.password });
      await m.saveSmtp(owner, { ...SMTP, password: 'a new password' });
      expect(await store.get(SETTINGS.smtpPassword)).toMatchObject({ value: 'a new password' });
    });

    it('forgets the password when asked to, and only then', async () => {
      const store = settings();
      const m = manager(store);
      await m.saveSmtp(owner, SMTP);
      await m.saveSmtp(owner, { ...SMTP, password: 'ignored', clearPassword: true });
      expect(await store.get(SETTINGS.smtpPassword)).toMatchObject({
        source: 'unset',
        value: undefined,
      });
    });

    it('returns a blank field to the environment’s value', async () => {
      const store = settings({ env: { SV_SMTP_HOST: 'env.sovereign.local', SV_SMTP_PORT: '25' } });
      const m = manager(store);
      await m.saveSmtp(owner, SMTP);
      expect(await store.get(SETTINGS.smtpHost)).toMatchObject({
        value: 'mail.sovereign.local',
        source: 'saved',
      });
      await m.saveSmtp(owner, { host: '', port: '', user: '', from: '', password: '' });
      expect(await store.get(SETTINGS.smtpHost)).toMatchObject({
        value: 'env.sovereign.local',
        source: 'environment',
      });
      expect(await store.get(SETTINGS.smtpPort)).toMatchObject({
        value: 25,
        source: 'environment',
      });
      expect(await store.get(SETTINGS.smtpUser)).toMatchObject({ source: 'unset' });
    });

    it('resets everything saved about mail, the password included', async () => {
      const store = settings();
      const m = manager(store);
      await m.saveSmtp(owner, SMTP);
      await m.resetSmtp(owner);
      for (const setting of [
        SETTINGS.smtpHost,
        SETTINGS.smtpPort,
        SETTINGS.smtpUser,
        SETTINGS.smtpFrom,
        SETTINGS.smtpPassword,
      ]) {
        expect(await store.describe(setting)).toMatchObject({ source: 'unset' });
      }
    });

    it.each([
      ['a host with a space', { host: 'mail sovereign.local' }],
      ['a host with a path', { host: 'mail.sovereign.local/x' }],
      ['a host that starts with a dot', { host: '.sovereign.local' }],
      ['a port that is not a number', { port: 'smtp' }],
      ['port 0', { port: '0' }],
      ['port 65536', { port: '65536' }],
      ['a negative port', { port: '-25' }],
      ['a port with a decimal', { port: '25.5' }],
      ['a user name with a line break', { user: 'a\nb' }],
      ['a user name over 255 characters', { user: 'u'.repeat(256) }],
      ['a from address that is not an address', { from: 'not an address' }],
      [
        'a from address with a line break',
        { from: 'noreply@sovereign.local\r\nBcc: x@sovereign.local' },
      ],
      ['a password over 1024 characters', { password: 'p'.repeat(1025) }],
    ])('refuses %s, and saves nothing', async (_why, change) => {
      const m = manager();
      expect(await refused(() => m.saveSmtp(owner, { ...SMTP, ...change }))).toBe('invalid');
      expect(Number((await db.run('select count(*) as n from instance_settings')).rows[0]?.n)).toBe(
        0,
      );
    });

    it('takes a plain address and a named one as the sender', async () => {
      const m = manager();
      expect(
        await refused(() => m.saveSmtp(owner, { ...SMTP, from: 'noreply@sovereign.local' })),
      ).toBeUndefined();
      expect(
        await refused(() => m.saveSmtp(owner, { ...SMTP, from: 'Acme <noreply@sovereign.local>' })),
      ).toBeUndefined();
    });

    it('cannot keep a password without a key to encrypt it, says why, and changes nothing else', async () => {
      const m = manager(settings({ cipher: undefined }));
      expect(await refused(() => m.saveSmtp(owner, SMTP))).toBe('needs-encryption');
      expect(Number((await db.run('select count(*) as n from instance_settings')).rows[0]?.n)).toBe(
        0,
      );
    });

    it('saves the other fields without a key when there is no password to keep', async () => {
      const m = manager(settings({ cipher: undefined }));
      expect(await refused(() => m.saveSmtp(owner, { ...SMTP, password: '' }))).toBeUndefined();
      expect(await settings({ cipher: undefined }).get(SETTINGS.smtpHost)).toMatchObject({
        value: 'mail.sovereign.local',
      });
    });
  });
}
