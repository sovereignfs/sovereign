import { describe, expect, it } from 'vitest';
import { looksLikeSecret, suiteProblems } from './rules.js';
import { schemaProblems } from './schema.js';
import type { Suite } from './types.js';

const suite = (extra: Partial<Suite> = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.local',
  core: { version: '0.71.0' },
  database: { version: '18' },
  server: { host: '203.0.113.7' },
  secrets: { recipients: ['age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj'] },
  ...extra,
});

describe('what looks like a secret', () => {
  it.each([
    'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'postgres://app:hunter2@db.sovereign.local/app',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-abcdefghijklmnopqrstuvwxyz0123456789',
    'dGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgdmFsdWUgdGhhdCBsb29rcyBsaWtlIGEga2V5',
    'a'.repeat(40),
  ])('catches %s', (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([
    'smtp.sovereign.local',
    '587',
    'en',
    'true',
    'https://sovereign.local/a/path',
    'postgres://db.sovereign.local/app',
    'a short phrase with spaces that is plainly not a key at all, whatever its length',
    'Europe/Paris',
  ])('lets %s through', (value) => {
    expect(looksLikeSecret(value)).toBe(false);
  });
});

describe('the rules a schema cannot say about suite.yml', () => {
  it('has none to find in a plain one', () => {
    expect(suiteProblems(suite())).toEqual([]);
  });

  it('refuses a core outside what the toolkit deploys, naming the way out', () => {
    const [problem] = suiteProblems(suite({ core: { version: '0.10.0' } }));
    expect(problem?.at).toBe('core.version');
    expect(problem?.message).toContain('sv upgrade');
  });

  it('refuses a secret-looking value in core’s or an app’s environment, and says where it goes', () => {
    const problems = suiteProblems(
      suite({
        core: {
          version: '0.71.0',
          env: { SV_SMTP_HOST: 'smtp.sovereign.local', SV_SMTP_USER: 'postgres://u:pw@h/db' },
        },
        apps: { notes: { image: 'ghcr.io/e/notes:1', env: { NOTES_TOKEN_URL: 'a'.repeat(45) } } },
      }),
    );
    expect(problems.map((p) => p.at)).toEqual([
      'core.env.SV_SMTP_USER',
      'apps.notes.env.NOTES_TOKEN_URL',
    ]);
    expect(problems[0]?.message).toContain('sv secret set');
  });

  it('refuses a name that is purged and still an app', () => {
    const problems = suiteProblems(
      suite({ apps: { notes: { image: 'ghcr.io/e/notes:1' } }, purge: ['notes'] }),
    );
    expect(problems[0]?.message).toContain('notes is purged and is also listed under apps');
  });
});

describe('the schema', () => {
  it('accepts a plain suite and says each thing wrong with one that is not', () => {
    expect(schemaProblems('suite', suite())).toEqual([]);
    const problems = schemaProblems('suite', { ...suite(), domain: 'No Spaces', extra: true });
    expect(problems.map((p) => p.at).sort()).toEqual(['(top level)', 'domain']);
    expect(problems.find((p) => p.at === '(top level)')?.message).toContain('extra is not allowed');
  });

  it.each([
    ['latest', { image: 'ghcr.io/e/notes:latest' }],
    ['no tag', { image: 'ghcr.io/e/notes' }],
    ['a reserved name', undefined],
  ])('refuses an app image with %s', (_name, app) => {
    if (!app) {
      expect(
        schemaProblems('suite', suite({ apps: { core: { image: 'ghcr.io/e/c:1' } } })).length,
      ).toBeGreaterThan(0);
      return;
    }
    expect(schemaProblems('suite', suite({ apps: { notes: app } })).length).toBeGreaterThan(0);
  });

  it('wants an external app that asks for roles to be trusted', () => {
    const external = {
      external: true as const,
      name: 'Wiki',
      redirect: ['https://wiki.sovereign.local/cb'],
      scopes: ['openid', 'roles'],
    };
    expect(schemaProblems('suite', suite({ apps: { wiki: external } })).length).toBeGreaterThan(0);
    expect(
      schemaProblems('suite', suite({ apps: { wiki: { ...external, trusted: true } } })),
    ).toEqual([]);
  });
});

describe('mail settings on a development or staging instance', () => {
  const withEnv = (environment: Suite['environment'], env: Record<string, string>) =>
    suite({ environment, core: { version: '0.71.0', env } });

  it('refuse a mail user with no mail server, since Mailpit takes no login', () => {
    const problems = suiteProblems(withEnv('staging', { SV_SMTP_USER: 'someone' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.at).toBe('core.env.SV_SMTP_USER');
    expect(problems[0]?.message).toContain('Mailpit');
  });

  it('accept a user with a server, and anything on production, where Mailpit is not used', () => {
    expect(
      suiteProblems(
        withEnv('staging', { SV_SMTP_USER: 'someone', SV_SMTP_HOST: 'smtp.sovereign.local' }),
      ),
    ).toEqual([]);
    expect(suiteProblems(withEnv('production', { SV_SMTP_USER: 'someone' }))).toEqual([]);
  });

  it('allow the environment names and no other, in the schema', () => {
    for (const ok of ['development', 'staging', 'production'] as const)
      expect(schemaProblems('suite', { ...suite(), environment: ok })).toEqual([]);
    expect(schemaProblems('suite', { ...suite(), environment: 'testing' })).not.toEqual([]);
  });
});

describe('connection settings in the schema', () => {
  const withDatabase = (database: Record<string, unknown>) =>
    schemaProblems('suite', { ...suite(), database: { version: '18', ...database } });
  const withApp = (app: Record<string, unknown>) =>
    schemaProblems('suite', { ...suite(), apps: { notes: app } });

  it('accepts a server size, a size for core and for every app, and one for an app', () => {
    expect(withDatabase({ maxConnections: 300, connections: { core: 20, app: 6 } })).toEqual([]);
    expect(withApp({ image: 'x/notes:1', connections: 3 })).toEqual([]);
  });

  it.each([19, 1001, 100.5, '100'])('refuses maxConnections %j', (value) => {
    expect(withDatabase({ maxConnections: value })).not.toEqual([]);
  });

  it.each([1, 101, 10.5, '10'])('refuses a pool size of %j', (value) => {
    expect(withDatabase({ connections: { core: value } })).not.toEqual([]);
    expect(withDatabase({ connections: { app: value } })).not.toEqual([]);
    expect(withApp({ image: 'x/notes:1', connections: value })).not.toEqual([]);
  });

  it('refuses a setting it does not know, and a number on an app that runs nothing', () => {
    expect(withDatabase({ connections: { other: 5 } })).not.toEqual([]);
    expect(
      withApp({
        external: true,
        name: 'Wiki',
        redirect: ['https://w.sovereign.local/cb'],
        connections: 5,
      }),
    ).not.toEqual([]);
  });

  it('keeps an app from being called what the deployment uses, mailpit included', () => {
    for (const name of ['core', 'proxy', 'database', 'mailpit', 'www', 'api', 'auth']) {
      expect(
        schemaProblems('suite', { ...suite(), apps: { [name]: { image: 'x/a:1' } } }),
        name,
      ).not.toEqual([]);
    }
  });
});
