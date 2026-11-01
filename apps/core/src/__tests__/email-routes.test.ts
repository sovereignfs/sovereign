import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryTransport } from '@sovereignfs/mailer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The token checks are tested with a real provider in app-tokens.suite.ts; here the guard only says who is calling, and what the
// route does with the request is what is under test. Mail goes to memory instead of a server.
const mailbox = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@sovereignfs/mailer', async (original) => {
  const real = await original<typeof import('@sovereignfs/mailer')>();
  mailbox.current = real.createMemoryTransport();
  return { ...real, createSmtpTransport: () => mailbox.current };
});
const guard = vi.fn();
vi.mock('../mail/api', async (original) => ({
  ...(await original<typeof import('../mail/api')>()),
  emailGuard: (...args: unknown[]) => guard(...args) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let route: typeof import('../../app/api/v1/email/route');
let instance: typeof import('../../app/.well-known/sovereign-instance/route');
const memory = () => mailbox.current as ReturnType<typeof createMemoryTransport>;

const APP = { clientId: 'app', scopes: ['email:send'] };

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-email-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.stubEnv('SV_SMTP_HOST', 'smtp.sovereign.local');
  vi.stubEnv('SV_SMTP_FROM', 'core@sovereign.local');
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  route = await import('../../app/api/v1/email/route');
  instance = await import('../../app/.well-known/sovereign-instance/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const user = (id: string, verified = 1) =>
  db.run(
    `insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, 'platform:user', 1, 1)`,
    [id, id, `${id}@sovereign.local`, verified],
  );
const app = (id: string, name: string) =>
  db.run(
    `insert into oauth_clients (id, client_id, name, redirect_uris, scopes, created_at, updated_at) values (?, ?, ?, ?, '[]', 1, 1)`,
    [id, id, name, JSON.stringify(['https://reminders.sovereign.local/cb'])],
  );
const consent = (userId: string, clientId: string) =>
  db.run(
    `insert into oauth_consents (id, client_id, user_id, scopes, created_at, updated_at) values (?, ?, ?, '[]', 1, 1)`,
    [`${userId}-${clientId}`, clientId, userId],
  );

beforeEach(async () => {
  for (const table of [
    'app_mail_settings',
    'app_mail_keys',
    'oauth_consents',
    'oauth_clients',
    'rate_limits',
    'users',
  ]) {
    await db.run(`delete from ${table}`);
  }
  memory().clear();
  await user('ada');
  await user('bo');
  await app('app', 'Reminders');
  await consent('ada', 'app');
  guard.mockReset().mockResolvedValue(APP);
});

const send = (body: unknown, raw?: string) =>
  route.POST(
    new Request(`${ORIGIN}/api/v1/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  );
const valid = { to: 'ada', subject: 'Your task is due', body: 'Water the plants.' };
const delivered = async () => {
  // The route answers before the mail server has the message.
  await (await (await import('../mail')).getMailForAppsService()).settled();
  return memory().sent;
};

describe('sending', () => {
  it('accepts a message, answers 202 with an id as the contract says, and sends it from the instance', async () => {
    const reply = await send(valid);
    expect(reply.status).toBe(202);
    const body = (await reply.json()) as { id: string };
    expectMatchesContract('sendEmail', 202, body);
    expect(Object.keys(body)).toEqual(['id']);
    const [mail] = await delivered();
    expect(mail).toMatchObject({
      to: ['ada@sovereign.local'],
      from: 'core@sovereign.local',
      subject: 'Reminders: Your task is due',
    });
    expect(mail?.text).toContain('Water the plants.');
    expect(mail?.unsubscribe).toBe(`${ORIGIN}/preferences`);
    expect(guard).toHaveBeenCalledWith(expect.any(Request));
  });

  it('answers a send to someone who may not receive it the same way, and sends nothing', async () => {
    await user('cy', 0);
    await consent('cy', 'app');
    for (const to of ['bo', 'cy', 'no-such-account']) {
      const reply = await send({ ...valid, to });
      expect(reply.status, to).toBe(202);
      const body = await reply.json();
      expectMatchesContract('sendEmail', 202, body);
      expect(Object.keys(body as object)).toEqual(['id']);
    }
    expect(await delivered()).toHaveLength(0);
  });

  it.each([
    ['a body that is not JSON', undefined, 'not json'],
    ['a list', undefined, '[]'],
    ['a field it does not have', { ...valid, from: 'evil@sovereign.local' }, undefined],
    ['a reply address', { ...valid, replyTo: 'evil@sovereign.local' }, undefined],
    ['HTML it should not have', { ...valid, html: '<b>x</b>' }, undefined],
    ['no subject', { to: 'ada', body: 'x' }, undefined],
    ['no body', { to: 'ada', subject: 'x' }, undefined],
    ['a subject on two lines', { ...valid, subject: 'a\nBcc: evil@sovereign.local' }, undefined],
    ['a body that is too long', { ...valid, body: 'x'.repeat(5001) }, undefined],
    ['a link to another site', { ...valid, link: 'https://evil.sovereign.local/' }, undefined],
  ])('refuses %s with a 400 that matches the contract', async (_name, body, raw) => {
    const reply = await send(body, raw);
    expect(reply.status).toBe(400);
    expectMatchesContract('sendEmail', 400, await reply.json());
    expect(await delivered()).toHaveLength(0);
  });

  it('answers 429 with a time to wait when an app writes to one person too often', async () => {
    for (let i = 0; i < 5; i += 1) expect((await send(valid)).status).toBe(202);
    const reply = await send(valid);
    expect(reply.status).toBe(429);
    expect(Number(reply.headers.get('retry-after'))).toBeGreaterThan(0);
    expectMatchesContract('sendEmail', 429, await reply.json());
  });

  it('is refused as the guard refuses it, and sends nothing', async () => {
    guard.mockRejectedValue(new ApiError(401, 'invalid_token', 'The access token is not valid.'));
    const reply = await send(valid);
    expect(reply.status).toBe(401);
    expectMatchesContract('sendEmail', 401, await reply.json());
    expect(await delivered()).toHaveLength(0);
  });
});

describe('the instance document', () => {
  it('lists email while the instance can send mail', async () => {
    const reply = await instance.GET(new Request(`${ORIGIN}/.well-known/sovereign-instance`));
    const body = (await reply.json()) as { api: { capabilities: string[] } };
    expect(body.api.capabilities).toEqual(['directory', 'notifications', 'activity', 'email']);
    expectMatchesContract('getInstanceBranding', 200, body);
  });
});
