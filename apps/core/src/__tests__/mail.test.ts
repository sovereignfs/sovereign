import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import {
  createMemoryTransport,
  isMailError,
  MailError,
  type MemoryTransport,
  type SmtpSettings,
} from '@sovereignfs/mailer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, type CoreConfig } from '../config';
import { migrateCore } from '../db/migrate';
import { MailService, mailStartupWarning } from '../mail/service';
import { SETTINGS } from '../settings/definitions';
import { SettingsStore } from '../settings/store';

// A plain `pnpm test` has no database server: the settings live in a SQLite file here. The
// settings store itself is tested on all three databases in settings.suite.ts.
vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-mail.db')}`);

const MIGRATIONS = path.join(path.dirname(new URL(import.meta.url).pathname), '../../migrations');
const BASE = {
  SV_URL: 'http://localhost:3000',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};
const key = () => randomBytes(32).toString('base64');
const message = { to: 'person@sovereign.local', subject: 'Hello', text: 'Hi' };

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

type Harness = {
  service: MailService;
  store: SettingsStore;
  created: SmtpSettings[];
  closed: number[];
  transports: MemoryTransport[];
};

function harness(
  env: Record<string, string> = {},
  cipher: FieldCipher | undefined = FieldCipher.fromKeyRing(`k1:${key()}`),
): Harness {
  const created: SmtpSettings[] = [];
  const closed: number[] = [];
  const transports: MemoryTransport[] = [];
  const store = new SettingsStore({
    database: db,
    cipher,
    config: config.load({ ...BASE, ...env }) as CoreConfig,
    cacheMs: 0,
  });
  const service = new MailService(store, {
    createTransport(settings) {
      created.push(settings);
      const transport = createMemoryTransport();
      const index = transports.push(transport) - 1;
      return { send: (m) => transport.send(m), close: () => void closed.push(index) };
    },
  });
  return { service, store, created, closed, transports };
}

async function failure(promise: Promise<unknown>): Promise<MailError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isMailError(error)) throw new Error(`expected a MailError, got ${String(error)}`);
  return error;
}

const ENV = {
  SV_SMTP_HOST: 'smtp.sovereign.local',
  SV_SMTP_FROM: 'Sovereign <no-reply@sovereign.local>',
};

describe('sending with the environment', () => {
  it('sends through the server SV_SMTP_* describes, from the configured address', async () => {
    const h = harness(ENV);
    const result = await h.service.send(message);
    expect(result.accepted).toEqual(['person@sovereign.local']);
    expect(h.created).toEqual([
      { host: 'smtp.sovereign.local', port: 587, from: 'Sovereign <no-reply@sovereign.local>' },
    ]);
    expect(h.transports[0]?.last).toMatchObject({
      from: 'Sovereign <no-reply@sovereign.local>',
      subject: 'Hello',
    });
  });

  it('uses the port, user and password it is given', async () => {
    const h = harness({
      ...ENV,
      SV_SMTP_PORT: '465',
      SV_SMTP_USER: 'me',
      SV_SMTP_PASSWORD: 'env-password',
    });
    await h.service.send(message);
    expect(h.created[0]).toMatchObject({ port: 465, user: 'me', password: 'env-password' });
  });

  it('reuses one transport while the settings stay the same', async () => {
    const h = harness(ENV);
    await h.service.send(message);
    await h.service.send(message);
    await h.service.send(message);
    expect(h.created).toHaveLength(1);
    expect(h.transports[0]?.sent).toHaveLength(3);
    expect(h.closed).toEqual([]);
  });

  it('lets a failure of the transport reach the caller', async () => {
    const h = harness(ENV);
    await h.service.send(message); // creates the transport
    h.transports[0]?.failNextWith(new Error('boom'));
    expect((await failure(h.service.send(message))).code).toBe('send-failed');
  });
});

describe('when email is not set up', () => {
  it('fails, saying so, and creates no transport: a flow never carries on as if the mail was sent', async () => {
    const h = harness();
    const error = await failure(h.service.send(message));
    expect(error.code).toBe('not-configured');
    expect(error.message).toContain('Email is not set up: no SMTP server is set.');
    expect(error.message).toContain('SV_SMTP_HOST');
    expect(error.message).toContain('Console');
    expect(h.created).toEqual([]);
  });

  it('says what is missing when it is only half set up', async () => {
    const h = harness({ SV_SMTP_HOST: 'smtp.sovereign.local' });
    const error = await failure(h.service.send(message));
    expect(error.code).toBe('not-configured');
    expect(error.message).toContain('the "from" address is missing');
    expect(h.created).toEqual([]);
  });

  it('reports the status without sending', async () => {
    expect((await harness().service.status()).state).toBe('not-configured');
    expect((await harness({ SV_SMTP_HOST: 'x.sovereign.local' }).service.status()).state).toBe(
      'incomplete',
    );
    expect((await harness(ENV).service.status()).state).toBe('configured');
  });
});

describe('the Console overrides the environment, without a restart', () => {
  it('uses a saved value instead of the variable, from the next send', async () => {
    const h = harness(ENV);
    await h.service.send(message);
    await h.store.set(SETTINGS.smtpHost, 'smtp.console.example');
    await h.service.send(message);
    expect(h.created.map((s) => s.host)).toEqual(['smtp.sovereign.local', 'smtp.console.example']);
    expect(h.closed, 'the old transport was closed').toEqual([0]);
    expect(h.transports[1]?.sent).toHaveLength(1);
  });

  it('returns to the environment when the saved value is cleared', async () => {
    const h = harness(ENV);
    await h.store.set(SETTINGS.smtpHost, 'smtp.console.example');
    await h.service.send(message);
    await h.store.clear(SETTINGS.smtpHost);
    await h.service.send(message);
    expect(h.created.map((s) => s.host)).toEqual(['smtp.console.example', 'smtp.sovereign.local']);
  });

  it('can set email up entirely from the Console when the environment says nothing', async () => {
    const h = harness();
    await expect(h.service.send(message)).rejects.toMatchObject({ code: 'not-configured' });
    await h.store.set(SETTINGS.smtpHost, 'smtp.console.example');
    await h.store.set(SETTINGS.smtpFrom, 'console@sovereign.local');
    await h.service.send(message);
    expect(h.created).toEqual([
      { host: 'smtp.console.example', port: 587, from: 'console@sovereign.local' },
    ]);
  });

  it('stops sending, and says so, when the Console empties what the environment filled', async () => {
    const h = harness({ SV_SMTP_HOST: 'smtp.sovereign.local' });
    await h.store.set(SETTINGS.smtpFrom, 'console@sovereign.local');
    await h.service.send(message);
    await h.store.clear(SETTINGS.smtpFrom);
    expect((await failure(h.service.send(message))).message).toContain(
      'the "from" address is missing',
    );
    expect(h.closed, 'and the transport is released').toEqual([0]);
  });
});

describe('the SMTP password', () => {
  it('is stored encrypted, and used decrypted, in place of the one in the environment', async () => {
    const h = harness({ ...ENV, SV_SMTP_USER: 'me', SV_SMTP_PASSWORD: 'env-password' });
    await h.store.set(SETTINGS.smtpPassword, 'console-password');
    await h.service.send(message);
    expect(h.created[0]).toMatchObject({ user: 'me', password: 'console-password' });
    const { rows } = await db.run(
      "select value, encrypted from instance_settings where key = 'smtp.password'",
    );
    expect(rows[0]?.encrypted).toBe(1);
    expect(String(rows[0]?.value)).not.toContain('console-password');
  });

  it('is reported as unreadable, not replaced by the environment, when its key is gone', async () => {
    const writer = harness({ ...ENV, SV_SMTP_USER: 'me', SV_SMTP_PASSWORD: 'env-password' });
    await writer.store.set(SETTINGS.smtpPassword, 'console-password');
    const reader = harness(
      { ...ENV, SV_SMTP_USER: 'me', SV_SMTP_PASSWORD: 'env-password' },
      FieldCipher.fromKeyRing(`k9:${key()}`),
    );
    const error = await failure(reader.service.send(message));
    expect(error.code).toBe('not-configured');
    expect(error.message).toContain('the saved SMTP password cannot be decrypted; enter it again');
    expect(reader.created, 'nothing was sent on the environment password').toEqual([]);
  });

  it('is never in an error message', async () => {
    const h = harness({ ...ENV, SV_SMTP_USER: 'me' });
    await h.store.set(SETTINGS.smtpPassword, 'console-password');
    await h.service.send(message);
    h.transports[0]?.failNextWith(new Error('535 bad credentials for me / console-password'));
    const error = await failure(h.service.send(message));
    expect(error.message).not.toContain('console-password');
    expect(JSON.stringify(error)).not.toContain('console-password');
  });
});

describe('the start-up warning', () => {
  it('is none when email can be sent', async () => {
    expect(mailStartupWarning(await harness(ENV).service.status())).toBeUndefined();
  });

  it('says email is not set up, what to do, and that sign-up with email verification cannot be completed', async () => {
    const warning = mailStartupWarning(await harness().service.status());
    expect(warning).toContain('Email is not set up: no SMTP server is set.');
    expect(warning).toContain('SV_SMTP_HOST');
    expect(warning).toContain('Console');
    expect(warning).toContain('invitations, password resets');
    expect(warning).toContain('sign-up that requires email verification');
  });

  it('says what is wrong when it is only half set up', async () => {
    const warning = mailStartupWarning(
      await harness({ SV_SMTP_HOST: 'smtp.sovereign.local' }).service.status(),
    );
    expect(warning).toContain('the "from" address is missing');
  });
});
