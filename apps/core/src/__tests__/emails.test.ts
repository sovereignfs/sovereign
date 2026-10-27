import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import {
  createMemoryTransport,
  EmailRenderError,
  isMailError,
  type MemoryTransport,
} from '@sovereignfs/mailer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, type CoreConfig } from '../config';
import { migrateCore } from '../db/migrate';
import { emailLink, EmailService } from '../mail/emails';
import { MailService } from '../mail/service';
import { SETTINGS } from '../settings/definitions';
import { SettingsStore } from '../settings/store';

vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-emails.db')}`);

const MIGRATIONS = path.join(path.dirname(new URL(import.meta.url).pathname), '../../migrations');
const BASE = {
  SV_URL: 'https://core.example.com',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};
const SMTP = {
  SV_SMTP_HOST: 'smtp.example.com',
  SV_SMTP_FROM: 'Sovereign <no-reply@core.example.com>',
};

let target: TestDatabase;
let db: Database;

beforeAll(async () => {
  target = await createTestDatabase();
  db = await target.open();
  await migrateCore(db, MIGRATIONS);
});
afterAll(async () => {
  await db.close();
  await target.cleanup();
});
beforeEach(async () => {
  await db.run('delete from instance_settings');
});

function harness(env: Record<string, string> = SMTP, logoUrl?: string) {
  const cfg = config.load({ ...BASE, ...env }) as CoreConfig;
  const store = new SettingsStore({
    database: db,
    cipher: FieldCipher.fromKeyRing(`k1:${randomBytes(32).toString('base64')}`),
    config: cfg,
    cacheMs: 0,
  });
  const transport: MemoryTransport = createMemoryTransport();
  const mail = new MailService(store, { createTransport: () => transport });
  const emails = new EmailService({
    mail,
    settings: store,
    config: cfg,
    logoUrl: () => Promise.resolve(logoUrl),
  });
  return { emails, store, transport, cfg };
}

describe('emailLink', () => {
  const cfg = { url: 'https://core.example.com' };

  it("builds a link on core's public address, with encoded parameters", () => {
    expect(emailLink(cfg, '/reset-password', { token: 'a+b=c&d' })).toBe(
      'https://core.example.com/reset-password?token=a%2Bb%3Dc%26d',
    );
    expect(emailLink(cfg, '/sign-in')).toBe('https://core.example.com/sign-in');
  });

  it.each([
    '//evil.example/x',
    'https://evil.example/x',
    'sign-in',
    '',
    '/\\evil.example',
    '\\\\evil.example',
  ])('refuses the path %j, which could change the host', (pathValue) => {
    expect(() => emailLink(cfg, pathValue)).toThrow(TypeError);
  });
});

describe("core's emails", () => {
  const cases = [
    [
      'invite',
      (e: EmailService) => ({
        template: 'invite' as const,
        link: e.link('/register', { invite: 'tok' }),
      }),
    ],
    [
      'verifyEmail',
      (e: EmailService) => ({
        template: 'verifyEmail' as const,
        link: e.link('/verify-email', { token: 'tok' }),
      }),
    ],
    [
      'passwordReset',
      (e: EmailService) => ({
        template: 'passwordReset' as const,
        link: e.link('/reset-password', { token: 'tok' }),
      }),
    ],
    [
      'accountCreated',
      (e: EmailService) => ({
        template: 'accountCreated' as const,
        link: e.link('/sign-in'),
        name: 'Ada',
      }),
    ],
    [
      'mfaReset',
      (e: EmailService) => ({ template: 'mfaReset' as const, link: e.link('/sign-in') }),
    ],
  ] as const;

  it.each(cases)(
    'sends the %s email with its subject, HTML and plain text, linked to SV_URL',
    async (_name, build) => {
      const h = harness();
      await h.emails.send('person@example.com', build(h.emails));
      expect(h.transport.sent).toHaveLength(1);
      const sent = h.transport.last;
      if (!sent) throw new Error('nothing was sent');
      expect(sent.to).toEqual(['person@example.com']);
      expect(sent.from).toBe('Sovereign <no-reply@core.example.com>');
      expect(sent.subject).toContain('Sovereign');
      expect(sent.html).toContain('https://core.example.com/');
      expect(sent.text).toContain('https://core.example.com/');
      for (const href of (sent.html ?? '').match(/href="[^"]+"/g) ?? []) {
        expect(href.slice(6, -1).startsWith('https://core.example.com')).toBe(true);
      }
    },
  );

  it('is branded with the instance name, from the Console when one is saved', async () => {
    const h = harness();
    expect(
      (await h.emails.render({ template: 'mfaReset', link: h.emails.link('/sign-in') })).subject,
    ).toContain('Sovereign');
    await h.store.set(SETTINGS.instanceName, 'Acme Identity');
    const after = await h.emails.render({ template: 'mfaReset', link: h.emails.link('/sign-in') });
    expect(after.subject).toBe('Two-step verification was reset on your Acme Identity account');
    expect(after.text).toContain('Acme Identity: https://core.example.com');
  });

  it('shows the logo when core has one, and the name as text when it does not', async () => {
    const without = await harness().emails.render({
      template: 'mfaReset',
      link: 'https://core.example.com/sign-in',
    });
    expect(without.html).not.toContain('<img');
    const withLogo = await harness(SMTP, 'https://core.example.com/logo.png').emails.render({
      template: 'mfaReset',
      link: 'https://core.example.com/sign-in',
    });
    expect(withLogo.html).toContain('<img');
    expect(withLogo.html).toContain('src="https://core.example.com/logo.png"');
    expect(withLogo.html).toContain('alt="Sovereign"');
  });

  it('refuses a link that is not on SV_URL, and sends nothing: a forged Host header cannot redirect a token', async () => {
    const h = harness();
    const error = await h.emails
      .send('person@example.com', {
        template: 'passwordReset',
        link: 'https://evil.example/reset-password?token=secret-token',
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(EmailRenderError);
    expect((error as EmailRenderError).code).toBe('link-outside-instance');
    expect((error as EmailRenderError).message).not.toContain('secret-token');
    expect(h.transport.sent).toEqual([]);
  });

  it('fails, saying email is not set up, when there is no SMTP: the flow does not carry on', async () => {
    const h = harness({});
    const error = await h.emails
      .send('person@example.com', {
        template: 'verifyEmail',
        link: h.emails.link('/verify-email', { token: 't' }),
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(isMailError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'not-configured' });
    expect(h.transport.sent).toEqual([]);
  });

  it('cannot be given an instance name with a line break: the setting refuses it', async () => {
    const h = harness();
    await expect(
      h.store.set(SETTINGS.instanceName, 'Acme\nBcc: x@example.com'),
    ).rejects.toMatchObject({ code: 'invalid-value' });
    await expect(h.store.set(SETTINGS.instanceName, 'Acme\u0000')).rejects.toMatchObject({
      code: 'invalid-value',
    });
  });
});
